import type { Message, PopupState, Verdict } from '../shared/types';
import { getDomain, isWebUrl } from '../shared/utils';
import {
  addHistoryEntry, addToList, bumpStats, ensureSettingsInitialised, getSettings, getSession, saveSettings,
  getTodayStats,
} from '../storage/storageService';
import { evaluateUrl, evaluateUrlWithReputation, isScreenShareOn } from './riskEngine';
import { arrivedViaRedirect, registerNavigationGuard, shouldInterrupt, warningUrl } from './navigationGuard';
import { syncRules } from './dnrRules';
import { grantBypass, hasBypass, pruneBypasses } from './bypass';
import { STORAGE_KEYS } from '../shared/constants';

/* ------------------------------------------------------------- lifecycle -- */

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await ensureSettingsInitialised();
  await syncRules(settings);
  await refreshBadge();

  if (details.reason === 'install' && !settings.onboardingComplete) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') }).catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await pruneBypasses();
  const current = await getSettings();
  // This is a transient "right now" control, so never carry it across a
  // browser restart and unexpectedly re-enable screen-share blocking.
  const settings = current.screenShareActive
    ? await saveSettings({ screenShareActive: false })
    : current;
  await syncRules(settings);
  await refreshBadge();
});

registerNavigationGuard();

/* ------------------------------------------------------------ rule sync --- */

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEYS.settings]) return;
  const settings = await getSettings();
  const rulesSynced = await syncRules(settings);
  if (!rulesSynced) {
    // Transient quota and browser-startup failures should not leave protection
    // stale forever. Retry after the browser has settled.
    await chrome.alarms.create('sg:rule-retry', { when: Date.now() + 30_000 });
  }
  await refreshBadge();
  if (isScreenShareOn(settings) && settings.protectionEnabled) {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => tab.id === undefined ? Promise.resolve() : guardExistingTab(tab.id)));
  }
});

chrome.alarms.create('sg:prune', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sg:prune' || alarm.name === 'sg:bypass-expiry') void pruneBypasses();
  if (alarm.name === 'sg:rule-retry') {
    void getSettings().then(async (settings) => {
      const synced = await syncRules(settings);
      if (!synced) await chrome.alarms.create('sg:rule-retry', { when: Date.now() + 5 * 60_000 });
    });
  }
});

/* ---------------------------------------------------------------- badge --- */

async function refreshBadge(): Promise<void> {
  try {
    const settings = await getSettings();
    const sharing = isScreenShareOn(settings);
    await chrome.action.setBadgeText({ text: sharing ? 'ON' : '' });
    if (sharing) {
      await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      await chrome.action.setTitle({ title: 'ScreenGuard — screen-share protection active' });
    } else {
      await chrome.action.setTitle({
        title: settings.protectionEnabled ? 'ScreenGuard — protected' : 'ScreenGuard — protection off',
      });
    }
  } catch {
    /* the action API can be unavailable during shutdown */
  }
}

/* -------------------------------------------------------------- messages -- */

/** The popup asks the active page's content script for its current address. */
async function activeTabVerdict(): Promise<(Verdict & { url: string }) | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return null;

    const res = (await chrome.tabs.sendMessage(
      tab.id, { type: 'GET_FRAME_URL' }, { frameId: 0 },
    ).catch(() => null)) as { url?: string } | null;

    const url = res?.url;
    if (!url || !isWebUrl(url)) return null;

    const settings = await getSettings();
    return { ...evaluateUrl(url, settings), url };
  } catch {
    return null;
  }
}

async function handle(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'LOG_EVENT': {
      await addHistoryEntry(msg.entry);
      if (msg.entry.action === 'blocked') await bumpStats({ blocked: 1 });
      if (msg.entry.action === 'warned') await bumpStats({ warned: 1 });
      return { ok: true };
    }

    case 'LINKS_CHECKED': {
      if (msg.count > 0) await bumpStats({ linksChecked: msg.count });
      return { ok: true };
    }

    case 'CHECK_ARRIVAL':
      return { redirected: arrivedViaRedirect(sender.tab?.id, sender.url) };

    case 'PAGE_RISK_DETECTED': {
      const tabId = sender.tab?.id;
      if (tabId === undefined || msg.verdict.enforcement !== 'block') return { ok: false };
      // Without the "tabs" permission tab.url is always undefined, so compare
      // against the sender's own document instead — it is always populated.
      if (sender.frameId !== 0 || sender.url !== msg.url) return { ok: false };
      const settings = await getSettings();
      if (!settings.protectionEnabled) return { ok: false };
      if (await hasBypass(getDomain(msg.url), tabId)) return { ok: false };
      await chrome.tabs.update(tabId, { url: warningUrl(msg.url, msg.verdict, 'page-evidence') });
      await addHistoryEntry({
        url: msg.url, domain: msg.verdict.domain, action: 'blocked',
        level: msg.verdict.level, category: msg.verdict.category, reason: msg.verdict.reason,
      });
      await bumpStats({ blocked: 1 });
      return { ok: true };
    }

    case 'SITE_FEEDBACK': {
      const domain = getDomain(msg.url);
      if (!domain) return { ok: false };
      await addToList(msg.decision === 'block' ? 'blocklist' : 'allowlist', domain);
      await addHistoryEntry({
        url: msg.url, domain,
        action: msg.decision === 'block' ? 'blocked' : 'allowed',
        level: msg.decision === 'block' ? 'RISKY' : 'SAFE',
        category: msg.decision === 'block' ? 'ADULT' : 'UNKNOWN',
        reason: msg.decision === 'block' ? 'You marked this site as adult content' : 'You marked this site as safe',
      });
      if (msg.decision === 'block') await bumpStats({ blocked: 1 });
      return { ok: true };
    }

    case 'CHECK_VISUAL_CONTENT': {
      const settings = await getSettings();
      if (!settings.geminiVisionEnabled || !settings.geminiApiKey || !msg.images.length) return { adult: false, confidence: 0 };
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.geminiModel)}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`,
          {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [
                { text: 'For a family safety browser filter, classify these thumbnails. Return JSON only: {"adult":boolean,"confidence":number}. adult is true only for clearly explicit sexual nudity or sexual activity; do not flag ordinary people, art, swimwear, health, or education.' },
                ...msg.images.map((image) => ({ inline_data: { mime_type: image.mimeType, data: image.data } })),
              ] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0 },
            }),
          },
        );
        if (!response.ok) return { adult: false, confidence: 0 };
        const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
        const verdict = JSON.parse(text) as { adult?: unknown; confidence?: unknown };
        return { adult: verdict.adult === true, confidence: typeof verdict.confidence === 'number' ? Math.max(0, Math.min(1, verdict.confidence)) : 0 };
      } catch {
        return { adult: false, confidence: 0 };
      }
    }

    case 'CHECK_URL_REPUTATION': {
      if (!isWebUrl(msg.url)) return null;
      return evaluateUrlWithReputation(msg.url, await getSettings());
    }

    case 'ALLOW_DOMAIN': {
      const domain = msg.domain.toLowerCase();
      if (msg.scope === 'always') await addToList('allowlist', domain);
      await grantBypass(domain, msg.tabId ?? sender.tab?.id);
      return { ok: true };
    }

    case 'CHECK_BYPASS':
      return { allowed: await hasBypass(msg.domain, sender.tab?.id) };

    case 'BYPASS_AND_NAVIGATE': {
      const domain = getDomain(msg.url);
      const tabId = msg.newTab
        ? (await chrome.tabs.create({ url: 'about:blank' })).id
        : sender.tab?.id;
      if (msg.scope === 'always') await addToList('allowlist', domain);
      await grantBypass(domain, tabId);
      await addHistoryEntry({
        url: msg.url,
        domain,
        action: 'allowed',
        level: 'SAFE',
        category: 'UNKNOWN',
        reason: msg.scope === 'always' ? 'You chose to always allow this site' : 'You chose to open it anyway',
      });
      if (tabId !== undefined) {
        await chrome.tabs.update(tabId, { url: msg.url });
      }
      return { ok: true };
    }

    case 'GET_POPUP_STATE': {
      const [settings, today, verdict, session] = await Promise.all([
        getSettings(), getTodayStats(), activeTabVerdict(), getSession(),
      ]);
      const state: PopupState = { settings, today, activeTabVerdict: verdict, session };
      return state;
    }

    case 'OPEN_PAGE': {
      const map = {
        settings: 'settings.html',
        history: 'history.html',
        demo: 'demo.html',
        onboarding: 'onboarding.html',
      } as const;
      await chrome.tabs.create({ url: chrome.runtime.getURL(map[msg.page]) });
      return { ok: true };
    }

    /* ---- cross-frame relays ------------------------------------------- */

    case 'RELAY_DIALOG': {
      // An embedded frame is asking the top frame of its tab to show the
      // confirmation, so a small iframe never has to host a dialog.
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { unavailable: true };
      try {
        const res = await chrome.tabs.sendMessage(
          tabId, { type: 'SHOW_DIALOG', payload: msg.payload }, { frameId: 0 },
        );
        return res ?? { unavailable: true };
      } catch {
        // No content script in the top frame (a PDF viewer, an extension page).
        return { unavailable: true };
      }
    }

    case 'REPORT_SENSITIVE_COUNT': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { ok: false };
      try {
        await chrome.tabs.sendMessage(
          tabId,
          { type: 'FRAME_SENSITIVE_COUNT', counts: msg.counts, frameId: sender.frameId ?? -1 },
          { frameId: 0 },
        );
      } catch {
        /* the top frame has gone away */
      }
      return { ok: true };
    }

    case 'REVEAL_ALL_FRAMES': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { ok: false };
      await sendToChildFrames(tabId, { type: 'REVEAL_IN_FRAME' });
      return { ok: true };
    }

    case 'REQUEST_SENSITIVE_COUNTS': {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { ok: false };
      await sendToChildFrames(tabId, { type: 'REQUEST_SENSITIVE_COUNTS' });
      return { ok: true };
    }

    case 'RESYNC_RULES': {
      const synced = await syncRules(await getSettings());
      await refreshBadge();
      return { ok: synced };
    }

    default:
      return { ok: false, error: 'Unknown message' };
  }
}

/** tabs.sendMessage without a frame target reaches only one receiver. Send to
 * each child explicitly so reveal/count requests cover the whole tab. */
async function sendToChildFrames(
  tabId: number,
  message: Extract<Message, { type: 'REVEAL_IN_FRAME' | 'REQUEST_SENSITIVE_COUNTS' }>,
): Promise<void> {
  try {
    const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
    await Promise.all(frames
      .filter((frame) => frame.frameId !== 0)
      .map((frame) => chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }).catch(() => undefined)));
  } catch {
    /* The tab can navigate or close while its frames are enumerated. */
  }
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  handle(msg, sender)
    .then(sendResponse)
    .catch((err) => {
      console.warn('[ScreenGuard] message failed', msg?.type, err);
      sendResponse({ ok: false, error: String(err) });
    });
  return true; // keep the channel open for the async reply
});

// Ask the existing content script, including when sharing is enabled mid-page.
async function guardExistingTab(tabId: number): Promise<void> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_FRAME_URL' }, { frameId: 0 });
    const url = response?.url;
    if (!url || !isWebUrl(url)) return;
    const settings = await getSettings();
    if (!isScreenShareOn(settings)) return;
    const verdict = await shouldInterrupt(url, tabId, settings);
    if (!verdict) return;
    // Do not replace a different page if the user navigated during the check.
    const latest = await chrome.tabs.sendMessage(tabId, { type: 'GET_FRAME_URL' }, { frameId: 0 });
    if (latest?.url === url) await chrome.tabs.update(tabId, { url: warningUrl(url, verdict, 'screenshare') });
  } catch {
    /* Closed tabs and pages without a content script have nothing to check. */
  }
}
chrome.tabs.onActivated.addListener(({ tabId }) => { void guardExistingTab(tabId); });
chrome.tabs.onRemoved.addListener((tabId) => { void pruneBypasses(tabId); });
void pruneBypasses();
void refreshBadge();
