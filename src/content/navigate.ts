import type { Verdict } from '../shared/types';
import { send } from './state';

/**
 * Performs a navigation the user explicitly asked for after a warning.
 * The bypass grant has to be registered *before* we navigate, otherwise the
 * background guard would simply intercept the same URL again.
 */
export async function openAllowed(
  anchor: HTMLAnchorElement | null,
  url: string,
  verdict: Verdict,
  scope: 'once' | 'always',
): Promise<void> {
  if (anchor?.target === '_blank') {
    await send({ type: 'BYPASS_AND_NAVIGATE', url, scope, newTab: true });
    return;
  }
  const result = await send({ type: 'ALLOW_DOMAIN', domain: verdict.domain, scope }) as { ok?: boolean };
  if (!result?.ok) return;
  await send({
    type: 'LOG_EVENT',
    entry: {
      url, domain: verdict.domain, action: 'allowed', level: verdict.level,
      category: verdict.category,
      reason: scope === 'always' ? 'You chose to always allow this site' : 'You chose to open it anyway',
    },
  });
  window.location.assign(url);
}
