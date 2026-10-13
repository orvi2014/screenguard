/** Helpers for reasoning about which frame this content script is running in. */

export function isTopFrame(): boolean {
  try {
    return window.self === window.top;
  } catch {
    // A cross-origin parent means we are definitely not the top frame.
    return false;
  }
}

/**
 * Tracking pixels, analytics beacons and hidden auth frames are everywhere.
 * Scanning them costs time and can never protect anyone, so anything too small
 * to display content is skipped entirely.
 */
export function isDisplayFrame(): boolean {
  if (isTopFrame()) return true;
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Some frames report zero dimensions during document_start and become
  // visible later. Let those frames initialize; only permanently tiny frames
  // such as tracking pixels should be skipped.
  if (w === 0 || h === 0) return true;
  return w >= 80 && h >= 60;
}
