import { isScreenShareOn } from '../risk/policy';
import { currentSettings, onSettings, send } from './state';
import { isTopFrame } from './frame';
import { el, getLayer, HOST_ID } from './ui';
import { describeKinds, findSensitiveRanges, type Kind } from './patterns';

/**
 * Local-only sensitive-content prototype.
 *
 * Everything happens in this file, on this machine: no page text is ever sent
 * to the background worker, to a server, or to an AI API. The detector is
 * deliberately simple and pattern based — the architecture (scan → mark → blur
 * → reveal) is what matters, so a stronger engine can drop into `PATTERNS`
 * and `looksReal()` without touching anything else.
 */

const STYLE_ID = 'screenguard-redact-style';
const REDACT_CLASS = 'sg-redacted';
const NODES_PER_CHUNK = 400;

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
  'SVG', 'CANVAS', 'IFRAME', 'TITLE', 'HEAD',
]);

function ensureStyle(root: Document | ShadowRoot = document): void {
  if (root.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.${REDACT_CLASS} {
  filter: blur(5px);
  background: rgba(79,70,229,.10);
  border-radius: 4px;
  cursor: pointer;

  -webkit-user-select: none; user-select: none;
}
.${REDACT_CLASS}.sg-shown { filter: none; background: rgba(79,70,229,.06); }`;
  if (root instanceof ShadowRoot) root.appendChild(style);
  else (document.head ?? document.documentElement).appendChild(style);
}

let active = false;
let hits: HTMLElement[] = [];
let chip: HTMLDivElement | null = null;
let mutations: MutationObserver | null = null;
let scanTimer: number | undefined;
let concealed: { node: HTMLElement; opacity: string; priority: string } | null = null;
const boundFields = new WeakSet<HTMLElement>();
const FIELD_SELECTOR = 'input:not([type="hidden"]), textarea';

/** Keep unscanned content out of the next paint, including during chunked work. */
export function concealPage(): void {
  const node = document.documentElement;
  if (concealed || !node) return;
  concealed = { node, opacity: node.style.getPropertyValue('opacity'), priority: node.style.getPropertyPriority('opacity') };
  node.style.setProperty('opacity', '0', 'important');
}
export function uncoverPage(): void {
  if (!concealed) return;
  const { node, opacity, priority } = concealed;
  if (opacity) node.style.setProperty('opacity', opacity, priority);
  else node.style.removeProperty('opacity');
  if (node.getAttribute('style') === '') node.removeAttribute('style');
  concealed = null;
}

interface ScanJob { root: Node; walker: TreeWalker | null; next: Node | null }
const jobs: ScanJob[] = [];
function enqueue(root: Node): void {
  if (!root.isConnected) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!shouldSkip(root)) jobs.push({ root, walker: null, next: root });
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => shouldSkip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  jobs.push({ root, walker, next: walker.nextNode() });
}

function observe(root: Document | ShadowRoot = document): void {
  mutations?.observe(root, { childList: true, characterData: true, subtree: true });
}

function discoverShadowRoots(root: ParentNode): void {
  const elements = root.querySelectorAll?.('*');
  if (!elements) return;
  for (const element of elements) {
    // Never descend into our own UI. Scanning it re-queues work every pass, so
    // the queue never drains and the page is never uncovered again; observing
    // it turns the indicator's own re-render into a "a frame disappeared"
    // signal. The page is invisible until this loop ends, so this is the
    // difference between protection and a blank screen.
    if (element.id === HOST_ID) continue;
    const shadow = (element as HTMLElement).shadowRoot;
    if (!shadow) continue;
    ensureStyle(shadow);
    observe(shadow);
    enqueue(shadow);
    scanFields(shadow);
    discoverShadowRoots(shadow);
  }
}

function shouldSkip(node: Node): boolean {
  let el: Node | null = node.parentNode;
  while (el && el !== document.documentElement) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      const element = el as Element;
      if (SKIP_TAGS.has(element.tagName)) return true;
      if (element.id === HOST_ID) return true;
      if (element.classList.contains(REDACT_CLASS)) return true;
      if ((element as HTMLElement).isContentEditable) return true;
    }
    // A shadow root's parentNode is null, so step out through its host or the
    // walk ends early and everything inside looks like ordinary page content.
    el = el.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? (el as ShadowRoot).host ?? null
      : el.parentNode;
  }
  return false;
}

/** Did this removal take an iframe with it, directly or nested inside? */
function removedAFrame(record: MutationRecord): boolean {
  for (const node of record.removedNodes) {
    if (node.nodeName === 'IFRAME' || node.nodeName === 'FRAME') return true;
    if (node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).querySelector?.('iframe, frame')) return true;
  }
  return false;
}

function redactNode(node: Text): number {
  const text = node.nodeValue ?? '';
  if (text.length < 6) return 0;
  const ranges = findSensitiveRanges(text);
  if (!ranges.length) return 0;

  const root = node.getRootNode();
  if (root instanceof ShadowRoot) ensureStyle(root);
  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const { start, end, kind } of ranges) {
    if (start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, start)));
    const span = document.createElement('span');
    span.className = REDACT_CLASS;
    span.textContent = text.slice(start, end);
    span.dataset.sgKind = kind;
    span.title = 'Hidden by ScreenGuard — click to show';
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      void reveal([span]);
    });
    frag.appendChild(span);
    hits.push(span);
    cursor = end;
  }
  if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
  node.parentNode?.replaceChild(frag, node);
  return ranges.length;
}

/** Form values are not text nodes, but can expose the same data on a shared
 * screen. Blur the field itself and preserve its value and edit behaviour. */
function scanField(field: HTMLInputElement | HTMLTextAreaElement): void {
  if (!active || field.type === 'hidden' || field.isContentEditable) return;
  const ranges = findSensitiveRanges(field.value);
  if (!ranges.length) {
    field.classList.remove(REDACT_CLASS, 'sg-shown');
    hits = hits.filter((hit) => hit !== field);
    return;
  }
  if (field.classList.contains('sg-shown')) return;
  ensureStyle(field.getRootNode() instanceof ShadowRoot ? field.getRootNode() as ShadowRoot : document);
  field.classList.add(REDACT_CLASS);
  field.dataset.sgKind = ranges[0].kind;
  field.title = 'Hidden by ScreenGuard — click to show';
  if (!hits.includes(field)) hits.push(field);
  if (!boundFields.has(field)) {
    boundFields.add(field);
    field.addEventListener('click', (event) => {
      if (!field.classList.contains(REDACT_CLASS) || field.classList.contains('sg-shown')) return;
      event.preventDefault();
      event.stopPropagation();
      void reveal([field]);
    });
  }
}

function scanFields(root: ParentNode): void {
  const fields = root.querySelectorAll?.(FIELD_SELECTOR);
  if (!fields) return;
  for (const field of fields) scanField(field as HTMLInputElement | HTMLTextAreaElement);
}

function onFieldInput(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) scanField(target);
}

/** Advance each walker before rewriting its batch, so removed text nodes do not
 * strand traversal. The page remains concealed until every job is complete. */
function flush(): void {
  window.clearTimeout(scanTimer);
  scanTimer = undefined;
  if (!active) return;
  concealPage();
  mutations?.disconnect();
  ensureStyle();
  const targets: Text[] = [];
  while (jobs.length && targets.length < NODES_PER_CHUNK) {
    const job = jobs[0];
    if (!job.next) { jobs.shift(); continue; }
    const node = job.next;
    if (!node.isConnected && job.walker && job.root.isConnected) {
      // A page update removed our cursor while this chunk was waiting. Restart
      // this subtree rather than silently losing the remaining siblings.
      job.walker.currentNode = job.root;
      job.next = job.walker.nextNode();
      continue;
    }
    job.next = job.walker?.nextNode() ?? null;
    if (node.isConnected && !shouldSkip(node)) targets.push(node as Text);
  }
  for (const node of targets) {
    if (node.isConnected && !shouldSkip(node)) redactNode(node);
  }
  if (!jobs.length) renderChip();
  observe();
  discoverShadowRoots(document);
  scanFields(document);
  if (jobs.length) scanTimer = window.setTimeout(flush, 0);
  else uncoverPage();
}

function changed(records: MutationRecord[]): void {
  // Mutations generated by redaction itself happen with the observer disconnected.
  // Page mutations are checked in this microtask, before the browser paints.
  for (const record of records) {
    if (record.type === 'characterData') enqueue(record.target);
    else for (const node of record.addedNodes) {
      enqueue(node);
      if (node.nodeType === Node.ELEMENT_NODE) {
        discoverShadowRoots(node as ParentNode);
        scanFields(node as ParentNode);
      }
    }
    if (record.type === 'childList' && isTopFrame() && removedAFrame(record)) {
      // A removed frame cannot send its final zero-count message. Rebuild the
      // frame total from a fresh report from every live child frame. Only a
      // removal that actually took a frame with it counts: an ordinary render
      // elsewhere on the page must not wipe what the live frames reported.
      foreignCounts.clear();
      renderChip();
      void send({ type: 'REQUEST_SENSITIVE_COUNTS' });
    }
  }
  if (jobs.length) flush();
}

/** Breakdowns reported by embedded frames, so the indicator covers the tab. */
const foreignCounts = new Map<number, Record<string, number>>();

function tally(spans: HTMLElement[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const span of spans) {
    const kind = span.dataset.sgKind ?? 'key';
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  for (const record of foreignCounts.values()) {
    for (const [kind, n] of Object.entries(record)) counts[kind] = (counts[kind] ?? 0) + n;
  }
  return counts;
}

function foreignTotal(): number {
  let total = 0;
  for (const record of foreignCounts.values()) {
    for (const n of Object.values(record)) total += n;
  }
  return total;
}

export function setForeignSensitiveCounts(frameId: number, counts: Record<string, number>): void {
  if (counts && Object.keys(counts).length > 0) foreignCounts.set(frameId, counts);
  else foreignCounts.delete(frameId);
  renderChip();
}

export function reportSensitiveCount(): void {
  reportedSignature = '';
  renderChip();
}

/** Reveals without asking — the top frame has already confirmed on our behalf. */
export function revealAllLocally(): void {
  for (const span of hits) span.classList.add('sg-shown');
  hits = [];
  renderChip();
}

async function reveal(targets: HTMLElement[]): Promise<void> {
  if (currentSettings().confirmBeforeReveal && !(await confirmReveal(targets.length))) return;
  for (const t of targets) t.classList.add('sg-shown');
  hits = hits.filter((h) => !h.classList.contains('sg-shown'));
  renderChip();
}

/** The indicator covers the whole tab, so revealing does too. */
async function revealEverything(local: HTMLElement[]): Promise<void> {
  const total = local.length + foreignTotal();
  if (currentSettings().confirmBeforeReveal && !(await confirmReveal(total))) return;
  for (const t of local) t.classList.add('sg-shown');
  hits = [];
  if (foreignCounts.size > 0) {
    foreignCounts.clear();
    void send({ type: 'REVEAL_ALL_FRAMES' });
  }
  renderChip();
}

function confirmReveal(count: number): Promise<boolean> {
  return new Promise((resolve) => {
    const scrim = el('div', 'sg-scrim');
    const modal = el('div', 'sg-modal sg-card');
    modal.append(
      el('div', 'sg-badge warn', 'Sensitive content'),
      el('h2', undefined, count === 1 ? 'Show this hidden value?' : `Show ${count} hidden values?`),
      el('p', undefined, 'If you are sharing your screen right now, everyone watching will see it.'),
    );
    const row = el('div', 'sg-row');
    const cancel = el('button', 'sg-btn ghost', 'Keep hidden');
    const show = el('button', 'sg-btn primary', 'Show anyway');
    const done = (value: boolean) => {
      scrim.classList.remove('sg-in');
      window.setTimeout(() => scrim.remove(), 180);
      resolve(value);
    };
    cancel.addEventListener('click', () => done(false));
    show.addEventListener('click', () => done(true));
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) done(false);
    });
    row.append(cancel, show);
    const actions = el('div', 'sg-actions');
    actions.appendChild(row);
    modal.appendChild(actions);
    scrim.appendChild(modal);
    getLayer().appendChild(scrim);
    requestAnimationFrame(() => scrim.classList.add('sg-in'));
  });
}

let reportedSignature = '';

function renderChip(): void {
  const hidden = hits.filter((h) => h.isConnected && !h.classList.contains('sg-shown'));
  hits = hidden;

  // An embedded frame has no room for an indicator and would stack several of
  // them up the corner of the page. It reports its count instead, and the top
  // frame shows one total for the whole tab.
  if (!isTopFrame()) {
    const counts: Record<string, number> = {};
    for (const span of hidden) {
      const kind = span.dataset.sgKind ?? 'key';
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    const signature = JSON.stringify(counts);
    if (signature !== reportedSignature) {
      reportedSignature = signature;
      void send({ type: 'REPORT_SENSITIVE_COUNT', counts });
    }
    return;
  }

  const total = hidden.length + foreignTotal();

  if (!active && hidden.length === 0 && total === 0) {
    removeChip();
    return;
  }
  if (total === 0) {
    removeChip();
    return;
  }

  if (!chip) {
    chip = el('div', 'sg-chip sg-card');
    getLayer().appendChild(chip);
    requestAnimationFrame(() => chip?.classList.add('sg-in'));
  }
  chip.textContent = '';
  const dot = el('span', 'sg-chip-dot');

  const text = el('span', 'sg-chip-text');
  text.append(
    el('span', 'sg-chip-title', `${total} item${total === 1 ? '' : 's'} hidden`),
    el('span', 'sg-chip-detail',
      describeKinds(tally(hidden) as Partial<Record<Kind, number>>)),
  );

  const button = el('button', 'sg-btn ghost', 'Reveal');
  button.setAttribute('aria-label', `Reveal ${total} hidden item${total === 1 ? '' : 's'}`);
  button.addEventListener('click', () => void revealEverything([...hidden]));
  chip.append(dot, text, button);
}

function removeChip(): void {
  chip?.classList.remove('sg-in');
  const node = chip;
  chip = null;
  window.setTimeout(() => node?.remove(), 180);
}

function teardown(): void {
  for (const span of document.querySelectorAll<HTMLSpanElement>(`span.${REDACT_CLASS}`)) {
    const text = document.createTextNode(span.textContent ?? '');
    span.parentNode?.replaceChild(text, span);
  }
  for (const hit of hits) {
    if (hit instanceof HTMLInputElement || hit instanceof HTMLTextAreaElement) {
      hit.classList.remove(REDACT_CLASS, 'sg-shown');
      hit.removeAttribute('data-sg-kind');
      hit.removeAttribute('title');
    }
  }
  hits = [];
  renderChip();
}

function shouldBeActive(): boolean {
  const settings = currentSettings();
  if (!settings.protectionEnabled) return false;
  // Personal-page protection is the user's master switch for exposure
  // safeguards, including local masking of email addresses and phone numbers.
  // Keep this aligned with the "Personal pages" setting in Settings so
  // turning that category off tears down existing redactions immediately.
  if (!settings.categories.private) return false;
  if (settings.sensitiveMode === 'off') return false;
  if (settings.sensitiveMode === 'always') return true;
  return isScreenShareOn(settings);
}

function apply(): void {
  const next = shouldBeActive();
  if (next === active) return;
  active = next;
  if (active) {
    mutations = new MutationObserver(changed);
    document.addEventListener('input', onFieldInput, true);
    enqueue(document);
    flush();
  } else {
    window.clearTimeout(scanTimer);
    jobs.length = 0;
    mutations?.disconnect();
    mutations = null;
    document.removeEventListener('input', onFieldInput, true);
    foreignCounts.clear();
    teardown();
    uncoverPage();
  }
}

export function startSensitiveDetector(): void {
  apply();
  if (!active) uncoverPage();
  onSettings(() => apply());
}
