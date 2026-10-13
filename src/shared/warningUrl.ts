import type { Verdict } from './types';

/**
 * Builds the URL of the block page. Shared by the background worker (which
 * redirects whole tabs) and the content script (which redirects an embedded
 * frame into the compact variant), so both always agree on the parameters.
 *
 * `u` is always last and percent-encoded: the page reads everything after it
 * as the original address, which keeps URLs containing "&" or "#" intact.
 */
export function buildWarningUrl(
  url: string,
  verdict: Pick<Verdict, 'category' | 'level' | 'reason'>,
  source: string,
  inFrame = false,
): string {
  const params = new URLSearchParams({
    c: verdict.category,
    l: verdict.level,
    r: verdict.reason,
    s: source,
  });
  if (inFrame) params.set('f', '1');
  return `${chrome.runtime.getURL('warning.html')}?${params.toString()}&u=${encodeURIComponent(url)}`;
}
