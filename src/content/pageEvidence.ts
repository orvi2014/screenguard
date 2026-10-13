import { classifyPageEvidence, classifyUrl } from '../risk/riskClassifier';
import { evaluateClassification, isScreenShareOn } from '../risk/policy';
import { currentSettings, send } from './state';

const ADULT_MARKER = /\b(?:porn(?:hub)?|xnxx|xvideos|xhamster|redtube|youporn|spankbang|chaturbate|stripchat|onlyfans|hentai|nudes?|sex\s+videos?|adult\s+videos?|live\s+cams?)\b/i;
const MAX_LINKS = 80;

function compact(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function evidence() {
  const metadata = [
    document.title,
    document.querySelector('meta[name="description"]')?.getAttribute('content'),
    document.querySelector('meta[property="og:description"]')?.getAttribute('content'),
    ...Array.from(document.querySelectorAll('h1, h2')).slice(0, 8).map((node) => node.textContent),
  ].map(compact).filter(Boolean).join(' ').slice(0, 1800);

  let adultLinkCount = 0;
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).slice(0, MAX_LINKS)) {
    // The label and path are already available to the page. They remain in the
    // content script and are never stored or transmitted.
    const label = `${compact(link.textContent)} ${link.getAttribute('aria-label') ?? ''} ${link.getAttribute('href') ?? ''}`;
    if (ADULT_MARKER.test(label)) adultLinkCount++;
  }

  const media = Array.from(document.querySelectorAll<HTMLElement>('video, iframe, img')).slice(0, 80);
  let adultMediaCount = 0;
  for (const node of media) {
    const image = node instanceof HTMLImageElement ? `${node.alt} ${node.currentSrc || node.src}` : '';
    const frame = node instanceof HTMLIFrameElement ? node.src : '';
    const label = `${image} ${frame} ${node.getAttribute('aria-label') ?? ''} ${node.getAttribute('title') ?? ''}`;
    if (ADULT_MARKER.test(label)) adultMediaCount++;
  }
  return { text: metadata, adultLinkCount, mediaCount: Math.min(20, media.length), adultMediaCount };
}

let blocked = false;
let visualChecked = false;
let qrChecked = false;
const hiddenQRCodes: Array<{ image: HTMLImageElement; filter: string; filterPriority: string; title: string }> = [];

type BarcodeDetectorLike = {
  detect(source: HTMLImageElement): Promise<Array<{ rawValue?: string }>>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** Blur a QR code that resolves to a risky URL while presenting. This uses
 * Chrome's native detector when available and never uploads image pixels. */
async function inspectVisibleQRCodes(): Promise<void> {
  const settings = currentSettings();
  if (!isScreenShareOn(settings) || settings.sensitiveMode === 'off') {
    for (const saved of hiddenQRCodes.splice(0)) {
      if (saved.filter) saved.image.style.setProperty('filter', saved.filter, saved.filterPriority);
      else saved.image.style.removeProperty('filter');
      saved.image.title = saved.title;
    }
    qrChecked = false;
    return;
  }
  if (qrChecked) return;
  qrChecked = true;
  const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) return;
  let detector: BarcodeDetectorLike;
  try { detector = new Detector({ formats: ['qr_code'] }); } catch { return; }
  const images = Array.from(document.images)
    .filter((image) => image.complete && image.naturalWidth >= 80 && image.naturalHeight >= 80)
    .slice(0, 12);
  for (const image of images) {
    try {
      const codes = await detector.detect(image);
      const code = codes.find((item) => item.rawValue && /^https?:\/\//i.test(item.rawValue));
      if (!code?.rawValue) continue;
      const verdict = evaluateClassification(classifyUrl(code.rawValue), code.rawValue, settings);
      if (verdict.enforcement !== 'block') continue;
      hiddenQRCodes.push({
        image, filter: image.style.getPropertyValue('filter'),
        filterPriority: image.style.getPropertyPriority('filter'), title: image.title,
      });
      image.style.setProperty('filter', 'blur(16px)', 'important');
      image.style.setProperty('user-select', 'none', 'important');
      image.title = 'QR code hidden by ScreenGuard while screen sharing';
    } catch {
      // A malformed, animated, or cross-origin image is simply skipped.
    }
  }
}

async function imagePayload(image: HTMLImageElement): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(image.currentSrc || image.src);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/') || blob.size > 3_000_000) return null;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No image data'));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const base64 = data.slice(data.indexOf(',') + 1);
    return base64 ? { mimeType: blob.type, data: base64 } : null;
  } catch {
    // Cross-origin image servers can refuse page-side reads. Never bypass their
    // CORS policy or capture an entire screen just to classify a thumbnail.
    return null;
  }
}

async function inspectVisibleImages(): Promise<void> {
  const settings = currentSettings();
  if (visualChecked || !settings.geminiVisionEnabled || !settings.geminiApiKey || blocked) return;
  visualChecked = true;
  const candidates = Array.from(document.images)
    .filter((image) => image.complete && image.naturalWidth >= 120 && image.naturalHeight >= 120)
    .slice(0, 3);
  const images = (await Promise.all(candidates.map(imagePayload))).filter((image): image is { mimeType: string; data: string } => image !== null);
  if (!images.length) return;
  const result = await send({ type: 'CHECK_VISUAL_CONTENT', url: location.href, images }) as { adult?: boolean; confidence?: number } | undefined;
  if (!result?.adult || (result.confidence ?? 0) < 0.9) return;
  blocked = true;
  const base = {
    level: 'RISKY' as const, category: 'ADULT' as const, confidence: result.confidence ?? 0.9,
    reason: 'Gemini identified explicit visual content in visible thumbnails', domain: location.hostname.replace(/^www\./, ''),
  };
  const verdict = evaluateClassification(base, location.href, settings);
  if (verdict.enforcement === 'block') void send({ type: 'PAGE_RISK_DETECTED', url: location.href, verdict });
}

/** Whether this page was the far end of a cross-site redirect. Asked once. */
let arrival: Promise<boolean> | null = null;
function arrivedViaRedirect(): Promise<boolean> {
  arrival ??= send({ type: 'CHECK_ARRIVAL' })
    .then((res) => (res as { redirected?: boolean } | undefined)?.redirected === true)
    .catch(() => false);
  return arrival;
}

/** Checks bounded public page evidence locally; no browsing content leaves the device. */
export async function inspectPageEvidence(): Promise<void> {
  if (blocked) return;
  void inspectVisibleImages();
  void inspectVisibleQRCodes();
  const url = location.href;
  const base = classifyPageEvidence(url, evidence(), {
    arrivedViaRedirect: await arrivedViaRedirect(),
  });
  if (blocked || location.href !== url) return;
  const verdict = evaluateClassification(base, url, currentSettings());
  if (base.level !== 'RISKY' || verdict.enforcement !== 'block') return;
  blocked = true;
  void send({ type: 'PAGE_RISK_DETECTED', url, verdict });
}

export function inspectVisualEvidence(): void {
  void inspectVisibleImages();
  void inspectVisibleQRCodes();
}
