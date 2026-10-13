import type { DialogChoice, Verdict } from '../shared/types';
import { CATEGORY_LABELS } from '../shared/constants';
import { el, getLayer } from './ui';
import { hrefOf, verdictForAnchor } from './linkScanner';
import { currentSettings, send } from './state';
import { openAllowed } from './navigate';
import { isTopFrame } from './frame';

/**
 * The pre-click guarantee: the click is stopped in the capture phase, before
 * the page's own handlers and before the browser starts the navigation.
 */

let scrim: HTMLDivElement | null = null;
let dismiss: (() => void) | null = null;

/** Names the risk the user actually faces, not a generic one. */
function consequenceOf(verdict: Verdict): string {
  switch (verdict.category) {
    case 'ADULT':
    case 'GAMBLING':
      return 'Opening it is awkward if anyone else can see your screen.';
    case 'PRIVATE':
      return 'Anyone watching your screen would see it too.';
    case 'PHISHING':
      return 'Pages like this exist to collect passwords and card details.';
    case 'MALWARE':
      return 'Downloads from here can install software you did not ask for.';
    default:
      return 'Continue only if you know where this leads.';
  }
}

function close(): void {
  dismiss?.();
}

/**
 * Shows the confirmation and resolves with what the user chose.
 * Exported so an embedded frame can have the top frame show it instead —
 * a 300×200 advertising iframe is no place for a dialog.
 */
export function showConfirmDialog(url: string, verdict: Verdict): Promise<DialogChoice> {
  close();

  return new Promise<DialogChoice>((resolve) => {
    let settled = false;
    const finish = (choice: DialogChoice) => {
      if (settled) return;
      settled = true;
      node.classList.remove('sg-in');
      window.setTimeout(() => node.remove(), 180);
      document.removeEventListener('keydown', onKey, true);
      if (scrim === node) scrim = null;
      dismiss = null;
      resolve(choice);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish('back');
      }
    };

    const node = el('div', 'sg-scrim');
    const modal = el('div', 'sg-modal sg-card');
    const risky = verdict.enforcement === 'block';

    const badge = el('div', `sg-badge ${risky ? 'risk' : 'warn'}`,
      CATEGORY_LABELS[verdict.category] ?? 'Flagged');
    const title = el('h2', undefined,
      risky ? 'This site looks risky' : 'Potentially sensitive website');
    const lead = el('p', undefined, "You're about to open:");
    const host = el('code', 'sg-host', verdict.domain || url);
    const why = el('p', undefined, `${verdict.reason}. ${consequenceOf(verdict)}`);

    const actions = el('div', 'sg-actions');
    const row = el('div', 'sg-row');
    const back = el('button', 'sg-btn ghost', 'Go back');
    const open = el('button', 'sg-btn primary', 'Open anyway');
    const always = el('button', 'sg-btn quiet', 'Always allow this site');

    back.addEventListener('click', () => finish('back'));
    open.addEventListener('click', () => finish('once'));
    always.addEventListener('click', () => finish('always'));

    row.append(back, open);
    actions.append(row, always);
    modal.append(badge, title, lead, host, why, actions);
    node.appendChild(modal);
    node.addEventListener('click', (e) => {
      if (e.target === node) finish('back');
    });

    getLayer().appendChild(node);
    scrim = node;
    dismiss = () => finish('back');
    requestAnimationFrame(() => {
      node.classList.add('sg-in');
      back.focus();
    });
    document.addEventListener('keydown', onKey, true);
  });
}

/**
 * In an embedded frame the dialog is relayed to the top frame of the same tab,
 * so it is never clipped by a small iframe. If that frame cannot show it (a PDF
 * viewer, an extension page), we fall back to showing it here.
 */
async function askUser(url: string, verdict: Verdict): Promise<DialogChoice> {
  if (isTopFrame()) return showConfirmDialog(url, verdict);

  // The top-frame relay may still be attaching while a child frame becomes
  // interactive. Retry briefly before falling back to an in-frame dialog.
  let res: { choice?: DialogChoice; unavailable?: boolean } | undefined;
  for (let attempt = 0; attempt < 3 && !res?.choice; attempt++) {
    res = (await send({ type: 'RELAY_DIALOG', payload: { url, verdict } })) as
      { choice?: DialogChoice; unavailable?: boolean } | undefined;
    if (!res?.choice && attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  if (!res || res.unavailable || !res.choice) return showConfirmDialog(url, verdict);
  return res.choice;
}

function handle(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  if (event.button !== 0 && event.type === 'click') return;

  const settings = currentSettings();
  if (!settings.protectionEnabled) return;

  const target = event.target as Element | null;
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;

  const url = hrefOf(anchor);
  if (!url) return;

  const verdict = verdictForAnchor(anchor);
  if (!verdict || verdict.enforcement === 'allow') return;
  if (verdict.enforcement === 'warn' && !settings.warnBeforeRisky) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  void send({
    type: 'LOG_EVENT',
    entry: {
      url, domain: verdict.domain,
      action: verdict.enforcement === 'block' ? 'blocked' : 'warned',
      level: verdict.level, category: verdict.category, reason: verdict.reason,
    },
  });

  void askUser(url, verdict).then((choice) => {
    if (choice === 'back') return;
    return openAllowed(anchor, url, verdict, choice);
  });
}

export function startClickInterceptor(): void {
  document.addEventListener('click', handle, true);
  document.addEventListener('auxclick', handle, true);
}

export { close as closeConfirmDialog };
