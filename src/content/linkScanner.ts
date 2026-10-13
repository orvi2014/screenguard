import type { Verdict } from '../shared/types';
import { isWebUrl } from '../shared/utils';
import { countLinkChecked, send, verdictFor } from './state';

/**
 * Finds anchors, classifies the ones that actually become visible, and keeps
 * the verdict cached on the element. Handles SPA rerenders and lazily inserted
 * content through a MutationObserver.
 */

const verdicts = new WeakMap<HTMLAnchorElement, Verdict>();
const MARK = 'data-screenguard';

let observer: IntersectionObserver | null = null;
let mutations: MutationObserver | null = null;

function resolveHref(a: HTMLAnchorElement): string | null {
  const raw = a.getAttribute('href');
  if (!raw) return null;
  if (raw.startsWith('#') || raw.startsWith('javascript:')) return null;
  try {
    const url = new URL(a.href, location.href).toString();
    return isWebUrl(url) ? url : null;
  } catch {
    return null;
  }
}

/** Only use text attached to this link; never inspect unrelated page content. */
function linkEvidence(a: HTMLAnchorElement): string {
  return [a.textContent, a.getAttribute('aria-label'), a.getAttribute('title')]
    .filter(Boolean)
    .join(' ')
    .slice(0, 1200);
}

function classify(a: HTMLAnchorElement): void {
  const url = resolveHref(a);
  if (!url) return;
  const verdict = verdictFor(url, linkEvidence(a));
  verdicts.set(a, verdict);
  countLinkChecked();
  if (verdict.enforcement === 'allow') {
    a.removeAttribute(MARK);
    // Hover feedback stays instant, but the worker can then enrich an
    // apparently-safe visible link from the packaged reputation feed.
    void enrichWithReputation(a, url);
  } else {
    a.setAttribute(MARK, verdict.enforcement === 'block' ? 'risky' : 'sensitive');
  }
}

async function enrichWithReputation(a: HTMLAnchorElement, url: string): Promise<void> {
  const result = await send({ type: 'CHECK_URL_REPUTATION', url });
  if (!a.isConnected || resolveHref(a) !== url || !result || typeof result !== 'object' || !('enforcement' in result)) return;
  const verdict = result as Verdict;
  verdicts.set(a, verdict);
  if (verdict.enforcement === 'allow') return;
  a.setAttribute(MARK, verdict.enforcement === 'block' ? 'risky' : 'sensitive');
}

/** Verdict for an anchor, computed on demand if it was never in the viewport. */
export function verdictForAnchor(a: HTMLAnchorElement): Verdict | null {
  const cached = verdicts.get(a);
  if (cached) return cached;
  if (!resolveHref(a)) return null;
  classify(a);
  return verdicts.get(a) ?? null;
}

export function hrefOf(a: HTMLAnchorElement): string | null {
  return resolveHref(a);
}

function observe(root: ParentNode): void {
  const anchors = root.querySelectorAll?.('a[href]');
  if (!anchors) return;
  for (const node of anchors) {
    const a = node as HTMLAnchorElement;
    observer?.observe(a);
  }
}

export function startLinkScanner(): void {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const a = entry.target as HTMLAnchorElement;
        classify(a);
        observer?.unobserve(a);
      }
    },
    { rootMargin: '120px' },
  );

  observe(document);

  mutations = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        if (el.tagName === 'A' && el.hasAttribute('href')) {
          const a = el as HTMLAnchorElement;
          // Re-observe reinserted anchors. Virtualized lists often reuse the
          // same node for a different visible row.
          observer?.observe(a);
        } else {
          observe(el);
        }
      }
      // An SPA swapping an href in place must invalidate the cached verdict.
      if (record.type === 'attributes' && record.target instanceof HTMLAnchorElement) {
        verdicts.delete(record.target);
        classify(record.target);
      }
    }
  });

  mutations.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  });
}

export function rescanAll(): void {
  // Settings changed — every cached verdict is stale.
  document.querySelectorAll('a[href]').forEach((node) => {
    const a = node as HTMLAnchorElement;
    verdicts.delete(a);
    a.removeAttribute(MARK);
  });
  document.querySelectorAll('a[href]').forEach((node) => classify(node as HTMLAnchorElement));
}

export function stopLinkScanner(): void {
  observer?.disconnect();
  mutations?.disconnect();
}
