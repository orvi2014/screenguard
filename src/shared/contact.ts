/** The single place the support address is defined. */
export const SUPPORT_EMAIL = 'hello@robatdasorvi.com';

function version(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return 'unknown';
  }
}

/**
 * Builds a mailto link with a template already filled in.
 *
 * Nothing is sent automatically: the message opens in the user's own mail
 * client, where they can read and edit every word before deciding to send it.
 * Only what they can see is included — never their history or page content.
 */
function mailto(subject: string, body: string[]): string {
  const lines = [...body, '', '—', `ScreenGuard ${version()}`];
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export function bugReportLink(): string {
  return mailto(`ScreenGuard ${version()} — problem report`, [
    'What happened:',
    '',
    'What you expected instead:',
    '',
    'Where it happened (a page or a step, if you are comfortable sharing it):',
    '',
  ]);
}

/** For a site ScreenGuard flagged that it should not have. */
export function falsePositiveLink(
  domain: string,
  details: { url?: string; category?: string; reason?: string } = {},
): string {
  return mailto(`ScreenGuard ${version()} — ${domain || 'a site'} was flagged by mistake`, [
    `Website: ${domain}`,
    ...(details.url ? [`Full address: ${details.url}`] : []),
    ...(details.category ? [`Detected category: ${details.category}`] : []),
    ...(details.reason ? [`Reason shown: ${details.reason}`] : []),
    '',
    'Why this looks wrong:',
    '',
    'What you expected ScreenGuard to do:',
    '',
    'Steps to reproduce, if applicable:',
    '',
  ]);
}

/** For a risky site ScreenGuard let through. */
export function missedSiteLink(): string {
  return mailto(`ScreenGuard ${version()} — a risky site was not caught`, [
    'Website:',
    '',
    'What it is:',
    '',
  ]);
}
