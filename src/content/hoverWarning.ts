import type { Verdict } from '../shared/types';
import { CATEGORY_LABELS } from '../shared/constants';
import { el, getLayer, SHIELD_SVG } from './ui';
import { hrefOf, verdictForAnchor } from './linkScanner';
import { currentSettings, send } from './state';
import { openAllowed } from './navigate';

/**
 * A small popover, shown only for links the engine actually flagged.
 * Safe links never produce any UI at all — that is the whole point.
 */

const SHOW_DELAY = 320;
const HIDE_DELAY = 220;

let popover: HTMLDivElement | null = null;
let showTimer: number | undefined;
let hideTimer: number | undefined;
let currentAnchor: HTMLAnchorElement | null = null;
/** Links the user already decided about on this page. */
const dismissed = new WeakSet<HTMLAnchorElement>();

function hide(immediate = false): void {
  window.clearTimeout(showTimer);
  showTimer = undefined;
  const run = () => {
    popover?.remove();
    popover = null;
    currentAnchor = null;
  };
  if (immediate) return run();
  popover?.classList.remove('sg-in');
  window.setTimeout(run, 160);
}

function position(node: HTMLElement, anchor: HTMLAnchorElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = 288;
  const height = node.offsetHeight || 180;
  const gap = 10;

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));

  const below = rect.bottom + gap;
  const top = below + height > window.innerHeight - 12 ? Math.max(12, rect.top - height - gap) : below;

  node.style.left = `${Math.round(left)}px`;
  node.style.top = `${Math.round(top)}px`;
}

function build(anchor: HTMLAnchorElement, verdict: Verdict, url: string): HTMLDivElement {
  const node = el('div', 'sg-pop sg-card');

  const head = el('div', 'sg-pop-head');
  const icon = el('span');
  icon.style.color = verdict.enforcement === 'block' ? '#c8123f' : '#8c5200';
  icon.style.display = 'inline-flex';
  icon.innerHTML = SHIELD_SVG;
  head.append(icon, el('div', 'sg-pop-title',
    verdict.enforcement === 'block' ? 'Risky link' : 'Potentially sensitive'));

  const body = el('p', 'sg-pop-body', `${CATEGORY_LABELS[verdict.category] ?? 'Flagged'} — ${verdict.reason}.`);
  const host = el('code', 'sg-host', verdict.domain || new URL(url).hostname);

  const row = el('div', 'sg-row');
  const back = el('button', 'sg-btn ghost', 'Go back');
  const open = el('button', 'sg-btn primary', 'Open anyway');

  back.addEventListener('click', () => {
    dismissed.add(anchor);
    hide();
  });
  open.addEventListener('click', async () => {
    dismissed.add(anchor);
    hide(true);
    await openAllowed(anchor, url, verdict, 'once');
  });

  row.append(back, open);
  node.append(head, body, host, row);

  node.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  node.addEventListener('mouseleave', () => {
    hideTimer = window.setTimeout(() => hide(), HIDE_DELAY);
  });

  return node;
}

function onOver(event: MouseEvent): void {
  const settings = currentSettings();
  if (!settings.protectionEnabled || !settings.warnBeforeRisky) return;

  const target = event.target as Element | null;
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor === currentAnchor) return;
  if (dismissed.has(anchor)) return;

  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);

  const url = hrefOf(anchor);
  if (!url) return;
  const verdict = verdictForAnchor(anchor);
  if (!verdict || verdict.enforcement === 'allow') return;

  showTimer = window.setTimeout(() => {
    hide(true);
    currentAnchor = anchor;
    popover = build(anchor, verdict, url);
    getLayer().appendChild(popover);
    position(popover, anchor);
    requestAnimationFrame(() => popover?.classList.add('sg-in'));
    void send({
      type: 'LOG_EVENT',
      entry: {
        url, domain: verdict.domain, action: 'warned',
        level: verdict.level, category: verdict.category, reason: verdict.reason,
      },
    });
  }, SHOW_DELAY);
}

function onOut(event: MouseEvent): void {
  const related = event.relatedTarget as Node | null;
  if (related && currentAnchor?.contains(related)) return;
  window.clearTimeout(showTimer);
  hideTimer = window.setTimeout(() => hide(), HIDE_DELAY);
}

export function startHoverWarning(): void {
  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);
  window.addEventListener('scroll', () => hide(true), { passive: true, capture: true });
  window.addEventListener('blur', () => hide(true));
}
