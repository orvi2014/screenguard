import type { Settings, Verdict } from '../shared/types';
import { getDomain, isWebUrl } from '../shared/utils';
import { buildWarningUrl } from '../shared/warningUrl';
import { evaluateUrlWithReputation } from './riskEngine';
import { hasBypass } from './bypass';
import { addHistoryEntry, bumpStats, getSettings } from '../storage/storageService';

/**
 * Catches navigations that never pass through a link click: typed addresses,
 * bookmarks, history, redirects and links opened from other applications.
 * Server redirects are only visible once the navigation commits, so both the
 * start and the commit of every top-level navigation are checked.
 *
 * Limitation, documented honestly: MV3 removed blocking webRequest, so this
 * handler cannot cancel a navigation. It replaces the tab's destination the
 * moment the navigation starts, which is why the *known* risky domains are
 * additionally covered by declarativeNetRequest (see dnrRules.ts) — those are
 * stopped before a single byte is requested.
 *
 * Embedded frames are handled elsewhere: there is no API to redirect a single
 * sub-frame from the background, so the content script guards its own frame
 * (see content/frameGuard.ts) and declarativeNetRequest covers listed domains
 * before the frame's first byte arrives.
 */

export function warningUrl(url: string, verdict: Verdict, source: string): string {
  return buildWarningUrl(url, verdict, source);
}

export async function shouldInterrupt(
  url: string,
  tabId: number,
  settings?: Settings,
): Promise<Verdict | null> {
  if (!isWebUrl(url)) return null;

  const s = settings ?? (await getSettings());
  if (!s.protectionEnabled) return null;

  const domain = getDomain(url);
  if (await hasBypass(domain, tabId)) return null;

  const verdict = await evaluateUrlWithReputation(url, s);
  return verdict.enforcement === 'block' ? verdict : null;
}

/** Avoid repeated warning-page updates for the same navigation. Native DNR
 * blocking is independent of this best-effort warning UI. */
const recentlyHandled = new Map<string, number>();

function claim(tabId: number, url: string): boolean {
  const key = `${tabId}|${url}`;
  const now = Date.now();
  for (const [k, ts] of recentlyHandled) {
    if (now - ts > 5000) recentlyHandled.delete(k);
  }
  if (recentlyHandled.has(key)) return false;
  recentlyHandled.set(key, now);
  return true;
}

/**
 * Tabs whose current page was reached by a redirect that crossed to another
 * site. A domain that exists only to bounce visitors elsewhere is the classic
 * doorway shape, so the content script judges what it landed on more strictly.
 */
const redirectArrivals = new Map<number, { url: string; ts: number }>();
const ARRIVAL_TTL_MS = 60_000;

function remember(map: Map<number, { ts: number }>, tabId: number, value: object): void {
  const now = Date.now();
  for (const [id, entry] of map) {
    if (now - entry.ts > ARRIVAL_TTL_MS) map.delete(id);
  }
  map.set(tabId, { ...value, ts: now } as never);
}

/** True when this exact page was the far end of a cross-site redirect. */
export function arrivedViaRedirect(tabId: number | undefined, url: string | undefined): boolean {
  if (tabId === undefined || !url) return false;
  const entry = redirectArrivals.get(tabId);
  if (!entry) return false;
  if (Date.now() - entry.ts > ARRIVAL_TTL_MS) {
    redirectArrivals.delete(tabId);
    return false;
  }
  return entry.url === url;
}

/** Sends the tab to the warning page and records the block. */
async function interrupt(tabId: number, url: string, options: { log?: boolean } = {}): Promise<void> {
  const verdict = await shouldInterrupt(url, tabId);
  if (!verdict) return;

  await chrome.tabs.update(tabId, {
    url: warningUrl(url, verdict, 'navigation'),
  });

  if (options.log === false) return;

  await addHistoryEntry({
    url,
    domain: verdict.domain,
    action: 'blocked',
    level: verdict.level,
    category: verdict.category,
    reason: verdict.reason,
  });
  await bumpStats({ blocked: 1 });
}

export function registerNavigationGuard(): void {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (!isWebUrl(details.url)) return;
    if (!claim(details.tabId, details.url)) return;
    try {
      await interrupt(details.tabId, details.url);
    } catch {
      // A tab closing mid-navigation is routine, not an error worth reporting.
    }
  });

  // onBeforeNavigate fires once, for the address the user asked for. An HTTP
  // redirect (a harmless-looking domain answering 301 → an adult site) never
  // fires it again, so the destination is only visible here, at commit. This
  // is before the new document has run any script or painted meaningfully.
  // claim() keeps an ordinary, non-redirected navigation from being checked
  // twice.
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (!isWebUrl(details.url)) return;

    // Chrome labels the hop itself, which beats inferring one from the address
    // we saw first: that address is missing whenever the worker was asleep, and
    // an interception layer can make a redirect look like a fresh navigation.
    if (details.transitionQualifiers?.some(
      (q) => q === 'server_redirect' || q === 'client_redirect')) {
      remember(redirectArrivals, details.tabId, { url: details.url });
    }

    if (!claim(details.tabId, details.url)) return;
    try {
      await interrupt(details.tabId, details.url);
    } catch {
      // A tab closing mid-navigation is routine, not an error worth reporting.
    }
  });

  // DNR cancels the request outright, which leaves Chrome's own "site can't be
  // reached" error in the tab — no explanation, and no way back. The redirect
  // hop is exactly where that lands, because nothing was typed for the earlier
  // listeners to act on. Replace it with the warning page, which says what was
  // blocked and offers "open anyway". The history entry is written only by
  // whichever listener claimed the navigation, so it is still one line.
  chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (details.error !== 'net::ERR_BLOCKED_BY_CLIENT') return;
    if (!isWebUrl(details.url)) return;
    try {
      await interrupt(details.tabId, details.url, { log: claim(details.tabId, details.url) });
    } catch {
      // A tab can close before Chrome reports the network cancellation.
    }
  });
}
