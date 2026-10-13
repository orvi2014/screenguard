/**
 * All in-page UI lives inside one shadow root so ScreenGuard can never inherit
 * — or leak — a website's styles. Nothing here touches the host page's DOM
 * beyond appending a single positioned container.
 */

export const HOST_ID = 'screenguard-root';

const CSS = `
:host, * { box-sizing: border-box; }
.sg-layer {
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px; line-height: 1.45; color: #0f1222;
  -webkit-font-smoothing: antialiased;
}
.sg-card {
  background: #fff; border: 1px solid #e6e8ef; border-radius: 14px;
  box-shadow: 0 1px 2px rgba(16,18,34,.05), 0 12px 32px -8px rgba(16,18,34,.18);
}

/* ---------------------------------------------------------- hover popover */
.sg-pop {
  position: absolute; width: 288px; padding: 14px; pointer-events: auto;
  opacity: 0; transform: translateY(-4px);
  transition: opacity 160ms cubic-bezier(.2,.8,.3,1), transform 160ms cubic-bezier(.2,.8,.3,1);
}
.sg-pop.sg-in { opacity: 1; transform: translateY(0); }
.sg-pop-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.sg-pop-title { font-weight: 600; font-size: 13.5px; letter-spacing: -.01em; }
.sg-pop-body { color: #5f6675; font-size: 13px; margin: 0 0 10px; }
.sg-host {
  display: block; font-size: 12.5px; color: #0f1222; background: #f7f8fb;
  border: 1px solid #e6e8ef; border-radius: 8px; padding: 7px 9px; margin-bottom: 12px;
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.sg-row { display: flex; gap: 8px; }

/* ------------------------------------------------------------ click modal */
.sg-scrim {
  position: absolute; inset: 0; background: rgba(12,14,26,.42);
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
  pointer-events: auto; opacity: 0; transition: opacity 180ms cubic-bezier(.2,.8,.3,1);
}
.sg-scrim.sg-in { opacity: 1; }
.sg-modal {
  width: 100%; max-width: 420px; padding: 24px; text-align: left;
  transform: scale(.97); transition: transform 180ms cubic-bezier(.2,.8,.3,1);
}
.sg-scrim.sg-in .sg-modal { transform: scale(1); }
.sg-badge {
  display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px;
  border-radius: 999px; font-size: 12px; font-weight: 560; margin-bottom: 14px;
}
.sg-badge.warn { background: #fcf2e0; color: #8c5200; }
.sg-badge.risk { background: #fdeef2; color: #c8123f; }
.sg-modal h2 { margin: 0 0 8px; font-size: 18px; font-weight: 620; letter-spacing: -.02em; }
.sg-modal p { margin: 0 0 14px; color: #4b5164; font-size: 13.5px; }
.sg-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }

/* ----------------------------------------------------------------- button */
.sg-btn {
  appearance: none; border: 1px solid transparent; border-radius: 10px;
  padding: 9px 14px; font: inherit; font-size: 13.5px; font-weight: 550;
  cursor: pointer;
  transition: background 140ms cubic-bezier(.2,.8,.3,1), border-color 140ms cubic-bezier(.2,.8,.3,1), color 140ms cubic-bezier(.2,.8,.3,1);
  flex: 1; text-align: center; white-space: nowrap;
}
.sg-btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
.sg-btn.primary { background: #4f46e5; color: #fff; }
.sg-btn.primary:hover { background: #4338ca; }
.sg-btn.ghost { background: #fff; border-color: #868ea5; color: #4b5164; }
.sg-btn.ghost:hover { background: #f7f8fb; color: #0f1222; }
.sg-btn.quiet { background: transparent; color: #5f6675; font-weight: 500; }
.sg-btn.quiet:hover { color: #0f1222; }

/* -------------------------------------------------------- blur indicator */
.sg-chip {
  position: absolute; right: 18px; bottom: 18px; pointer-events: auto;
  display: flex; align-items: center; gap: 11px; padding: 9px 10px 9px 13px;
  border-radius: 14px; font-size: 13px; max-width: min(420px, calc(100vw - 36px));
  opacity: 0; transform: translateY(6px);
  transition: opacity 180ms cubic-bezier(.2,.8,.3,1), transform 180ms cubic-bezier(.2,.8,.3,1);
}
.sg-chip.sg-in { opacity: 1; transform: translateY(0); }
.sg-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: #4f46e5; flex: 0 0 7px; }
.sg-chip-text { min-width: 0; display: flex; flex-direction: column; }
.sg-chip-title { font-size: 13px; font-weight: 560; letter-spacing: -.01em; }
.sg-chip-detail {
  font-size: 12px; color: #5f6675; margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sg-chip .sg-btn { flex: 0 0 auto; padding: 6px 12px; font-size: 12.5px; }

@media (prefers-reduced-motion: reduce) {
  .sg-pop, .sg-scrim, .sg-modal, .sg-chip, .sg-btn { transition-duration: .01ms !important; }
}
`;

let shadow: ShadowRoot | null = null;
let layer: HTMLDivElement | null = null;

export function getLayer(): HTMLDivElement {
  if (layer && layer.isConnected) return layer;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0;';
  (document.body ?? document.documentElement).appendChild(host);

  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  layer = document.createElement('div');
  layer.className = 'sg-layer';
  shadow.appendChild(layer);
  return layer;
}

export const SHIELD_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
<path d="M12 2.5 4.5 5.5v6.2c0 4.6 3.1 8.5 7.5 9.8 4.4-1.3 7.5-5.2 7.5-9.8V5.5L12 2.5Z" fill="currentColor" opacity=".16"/>
<path d="M12 2.5 4.5 5.5v6.2c0 4.6 3.1 8.5 7.5 9.8 4.4-1.3 7.5-5.2 7.5-9.8V5.5L12 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
<path d="m8.8 11.9 2.2 2.2 4.2-4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
