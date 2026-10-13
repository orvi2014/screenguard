import { initState, onSettings } from './state';
import { rescanAll, startLinkScanner } from './linkScanner';
import { startHoverWarning } from './hoverWarning';
import { startClickInterceptor } from './clickInterceptor';
import { concealPage, uncoverPage, startSensitiveDetector } from './sensitiveDetector';
import { startRelay } from './relay';
import { guardOwnFrame } from './frameGuard';
import { isDisplayFrame, isTopFrame } from './frame';
import { inspectPageEvidence, inspectVisualEvidence } from './pageEvidence';

/**
 * ScreenGuard content script. Runs in every frame, at document_start.
 *
 * Order matters. In an embedded frame the very first job is to check the
 * frame's *own* address, before the document has had a chance to paint —
 * everything else waits until the DOM exists.
 */
async function main(): Promise<void> {
  // Guard against double injection (SPA reloads, the demo page's own <script>).
  const w = window as unknown as { __screenguard__?: boolean };
  if (w.__screenguard__) return;
  w.__screenguard__ = true;

  concealPage();
  try {
    await initState();
  } catch (err) {
    console.warn('[ScreenGuard] could not load settings; staying out of the way', err);
    uncoverPage();
    return;
  }

  // Invisible frames — tracking pixels, auth handshakes — can never show
  // anything to anyone, so they get no further work.
  if (!isDisplayFrame()) { uncoverPage(); return; }

  // An embedded frame pointing somewhere risky replaces itself and stops here.
  if (await guardOwnFrame()) return;

  startRelay();
  startSensitiveDetector();

  const begin = () => {
    if (isTopFrame()) {
      void inspectPageEvidence();
      // Many gallery sites render their card labels after the initial shell.
      // Recheck once after hydration, still using only bounded local evidence.
      window.setTimeout(() => void inspectPageEvidence(), 1500);
      window.setTimeout(inspectVisualEvidence, 2000);
    }
    startLinkScanner();
    startClickInterceptor();
    // Hover popovers are a top-frame feature: positioned against the viewport,
    // they would be clipped by a small iframe. Clicks are protected everywhere.
    if (isTopFrame()) startHoverWarning();
    onSettings(() => {
      rescanAll();
      if (isTopFrame()) inspectVisualEvidence();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else {
    begin();
  }
}

void main();
