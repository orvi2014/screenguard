import type { Verdict } from '../shared/types';
import { buildWarningUrl } from '../shared/warningUrl';
import { isWebUrl } from '../shared/utils';
import { isTopFrame } from './frame';
import { currentSettings, send, verdictFor } from './state';
import { uncoverPage } from './sensitiveDetector';

/**
 * Protection for embedded frames.
 *
 * There is no Chrome API to redirect a single sub-frame from the background,
 * and `chrome.tabs.update` would navigate the whole tab — throwing away the
 * page the user actually wanted. So a frame guards itself: the content script
 * runs at document_start in every frame, checks its own address before the
 * document has rendered, and replaces itself with the compact block page.
 *
 * Listed domains never get this far — declarativeNetRequest stops those before
 * the first byte. This closes the gap for heuristic matches, which the network
 * rules cannot know about in advance.
 */
/** How long the top frame stays blank waiting for the background to take over. */
const BACKGROUND_GRACE_MS = 2500;

/**
 * The background guard replaces a risky top-level page, but it only learns the
 * address once the navigation commits — and a server redirect is exactly the
 * case where that is the first sighting. Its verdict then takes a moment to
 * arrive, during which the page is free to paint. A redirect chain that ends on
 * an adult site must not flash up on a shared screen, so the top frame keeps
 * itself concealed (the document is already at opacity 0 from document_start)
 * and lets the background navigate. If no verdict arrives, it replaces itself.
 */
async function guardTopFrame(verdict: Verdict): Promise<boolean> {
  const bypass = await send({ type: 'CHECK_BYPASS', domain: verdict.domain }) as { allowed?: boolean };
  if (bypass?.allowed) return false;

  // Blocking is the background's job, including the history entry, so this
  // fires only when that never happened — an asleep or failed worker.
  window.setTimeout(() => {
    if (verdictFor(window.location.href).enforcement !== 'block') {
      uncoverPage();
      return;
    }
    window.location.replace(buildWarningUrl(window.location.href, verdict, 'navigation'));
  }, BACKGROUND_GRACE_MS);
  return true;
}

export async function guardOwnFrame(): Promise<boolean> {
  const url = window.location.href;
  if (!isWebUrl(url)) return false;

  const settings = currentSettings();
  if (!settings.protectionEnabled) return false;

  const verdict = verdictFor(url);
  if (verdict.enforcement !== 'block') return false;

  if (isTopFrame()) return guardTopFrame(verdict);

  const bypass = await send({ type: 'CHECK_BYPASS', domain: verdict.domain }) as { allowed?: boolean };
  if (bypass?.allowed) return false;

  void send({
    type: 'LOG_EVENT',
    entry: {
      url,
      domain: verdict.domain,
      action: 'blocked',
      level: verdict.level,
      category: verdict.category,
      reason: verdict.reason,
    },
  });

  // `replace` rather than `assign`: a blocked frame should never become a
  // history entry the user can accidentally step back into.
  window.location.replace(buildWarningUrl(url, verdict, 'frame', true));
  return true;
}
