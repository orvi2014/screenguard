import { getDomain as getIcannDomain } from 'tldts';
import type { RiskResult, RiskCategory } from '../shared/types';
import { getDomain, getHostname, isIpHost, safeUrl, domainMatches } from '../shared/utils';
import {
  DOMAIN_LIST, KNOWN_SAFE_DOMAINS, PRIVATE_DOMAINS, STRONG_KEYWORDS, MEDIUM_KEYWORDS,
  WEAK_KEYWORDS, SAFE_CONTEXT, ADULT_CONTEXT, GAMBLING_CONTEXT, MALWARE_CONTEXT,
  RISKY_TLDS, DOWNLOAD_EXTENSIONS, TRUSTED_DOWNLOAD_HOSTS, IMPERSONATED_BRANDS,
  BRAND_SAFE_DOMAINS, BRAND_TLDS, BRAND_LURE_WORDS, BRAND_UNTRUSTED_CCTLDS, LOOKALIKE_SWAPS, PHISHING_WORDS, RECOVERY_HINTS,
} from './data';

const domainIndex = new Map<string, RiskCategory>(
  DOMAIN_LIST.map((e) => [e.domain, e.category]),
);

const cache = new Map<string, RiskResult>();
const CACHE_LIMIT = 2000;

/** Product names and terms that are unambiguous adult bait in a URL or link title. */
const ADULT_BAIT_TERMS = [
  'pornhub', 'onlyfans', 'xnxx', 'xvideos', 'xhamster', 'redtube', 'youporn',
  'spankbang', 'chaturbate', 'stripchat', 'hentai', 'porn', 'sex video', 'nudes',
];
const ADULT_BAIT_HINTS = ['porn', 'onlyfans', 'xnxx', 'xvideos', 'xhamster', 'redtube', 'youporn', 'spankbang', 'chaturbate', 'stripchat', 'hentai', 'nudes'];
const GAMBLING_BAIT_TERMS = [
  'bet365', 'draftkings', 'fanduel', 'pokerstars', 'sportsbook', 'casino',
  'online betting', 'free spins', 'jackpot', 'roulette',
];
const SHORTENER_DOMAINS = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'is.gd', 'buff.ly', 'cutt.ly',
  'rebrand.ly', 'shorturl.at', 'rb.gy',
]);

/**
 * Adult sites frequently avoid a recognisable domain, but their pages still
 * need to label videos, categories, and outbound cards. These are deliberately
 * specific phrases: a lone mention of sex or pornography is often journalism,
 * health information, or education and must not be enough to block a page.
 */
const ADULT_PAGE_PHRASES = [
  'watch porn', 'free porn', 'porn videos', 'sex videos', 'nude videos',
  'live cams', 'live cam', 'cam show', 'adult videos', 'explicit videos',
];

export interface PageEvidence {
  /** Bounded, public-facing text from page metadata and headings. */
  text: string;
  /** Cards or links that independently carry an adult marker. */
  adultLinkCount?: number;
  /** Visible video, iframe, or image cards sampled from the page. */
  mediaCount?: number;
  /** Images or players whose accessible label or source carries an adult marker. */
  adultMediaCount?: number;
}

function safe(domain: string, reason = 'No risk signals found'): RiskResult {
  return { level: 'SAFE', category: 'UNKNOWN', confidence: 0.9, reason, domain };
}

/** Hostname split into words: "free-xxx-tube.example" → [free, xxx, tube, example] */
function words(host: string): string[] {
  return host.split(/[.\-_]/).filter(Boolean);
}

/** The registrable name without its suffix: "amazon.co.uk" → "amazon". */
function registrableName(domain: string): string {
  return domain.split('.')[0] ?? '';
}

function contextFor(category: RiskCategory): Set<string> {
  if (category === 'ADULT') return ADULT_CONTEXT;
  if (category === 'GAMBLING') return GAMBLING_CONTEXT;
  return MALWARE_CONTEXT;
}

function matchStrong(host: string) {
  for (const { token, category } of STRONG_KEYWORDS) {
    if (host.includes(token)) return { token, category };
  }
  return null;
}

/** Decode URL components defensively; a compromised site often percent-encodes bait. */
function readableUrlText(url: URL): string {
  let text = `${url.pathname} ${url.search} ${url.hash}`.replace(/[+_\-/]/g, ' ');
  if (text.includes('%')) {
    for (let i = 0; i < 2; i++) {
      try { text = decodeURIComponent(text); } catch { break; }
    }
  }
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Decode a single punycode label without a runtime dependency. The URL API
 * deliberately keeps hostnames in ASCII, so this lets us inspect an IDN for
 * dangerous script mixing locally. */
function decodePunycode(label: string): string {
  if (!label.startsWith('xn--')) return label;
  const input = label.slice(4);
  const output: number[] = [];
  const dash = input.lastIndexOf('-');
  if (dash >= 0) for (const char of input.slice(0, dash)) output.push(char.codePointAt(0) ?? 0);
  let n = 128; let i = 0; let bias = 72;
  const adapt = (delta: number, count: number, first: boolean) => {
    let value = first ? Math.floor(delta / 700) : Math.floor(delta / 2);
    value += Math.floor(value / count);
    let k = 0;
    while (value > 455) { value = Math.floor(value / 35); k += 36; }
    return k + Math.floor((36 * value) / (value + 38));
  };
  for (let index = dash + 1; index < input.length;) {
    const oldI = i; let weight = 1;
    for (let k = 36;; k += 36) {
      const code = input.charCodeAt(index++);
      const digit = code >= 48 && code <= 57 ? code - 22 : code >= 65 && code <= 90 ? code - 65 : code - 97;
      if (digit < 0 || digit >= 36) return label;
      i += digit * weight;
      const threshold = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < threshold) break;
      weight *= 36 - threshold;
    }
    bias = adapt(i - oldI, output.length + 1, oldI === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 0x10ffff) return label;
    output.splice(i++, 0, n);
  }
  try { return String.fromCodePoint(...output); } catch { return label; }
}

/** A mixed-script IDN is a strong lookalike signal (for example Cyrillic “а”
 * beside Latin “pple”). A single-script international domain remains safe. */
function hasMixedScriptIdn(host: string): boolean {
  // The overwhelmingly common ASCII hostname needs no Unicode work on the
  // hover/click hot path.
  if (!host.includes('xn--')) return false;
  return host.split('.').map(decodePunycode).some((label) => {
    const latin = /[a-z]/i.test(label);
    const cyrillic = /[\u0400-\u052f]/.test(label);
    const greek = /[\u0370-\u03ff]/.test(label);
    return (latin && (cyrillic || greek)) || (cyrillic && greek);
  });
}

function adultBait(text: string): string | null {
  const lower = text.toLowerCase();
  if (!/(porn|onlyfans|xnxx|xvideos|xhamster|redtube|youporn|spankbang|chaturbate|stripchat|hentai|nudes)/.test(lower)) return null;
  const normalised = lower.replace(/[^a-z0-9]+/g, ' ').trim();
  return ADULT_BAIT_TERMS.find((term) => normalised.includes(term)) ?? null;
}

function adultBaitInUrl(url: URL): string | null {
  const raw = `${url.pathname} ${url.search} ${url.hash}`;
  const lower = raw.toLowerCase();
  // Most links have an ordinary path. Avoid decoding and normalising those on
  // every hover; encoded paths still go through the full inspection.
  if (!raw.includes('%') && !ADULT_BAIT_HINTS.some((hint) => lower.includes(hint))) return null;
  return adultBait(readableUrlText(url));
}

function adultBaitResult(domain: string, token: string, source: 'address' | 'link text'): RiskResult {
  return {
    level: 'RISKY', category: 'ADULT', confidence: 0.88,
    reason: `This ${source} contains adult-content marker "${token}"`, domain,
  };
}

function pageBaitResult(
  domain: string,
  category: Extract<RiskCategory, 'ADULT' | 'GAMBLING'>,
  markers: string[],
): RiskResult {
  return {
    level: 'RISKY', category, confidence: 0.84,
    reason: `This page presents multiple ${category.toLowerCase()} markers: ${markers.join(', ')}`,
    domain,
  };
}

function matchMedium(parts: string[]) {
  for (const { token, category } of MEDIUM_KEYWORDS) {
    if (parts.includes(token)) return { token, category };
  }
  return null;
}

/**
 * An ambiguous word only counts when it IS the registrable name, or when a
 * supporting word from the same category sits beside it in the hostname.
 */
function matchWeak(parts: string[], name: string) {
  for (const { token, category } of WEAK_KEYWORDS) {
    if (!parts.includes(token)) continue;
    if (name === token) return { token, category, strength: 'name' as const };
    const context = contextFor(category);
    const supporting = parts.find((p) => p !== token && context.has(p));
    if (supporting) return { token, category, strength: 'context' as const };
  }
  return null;
}

/** The lure word glued to the start or end of a brand ("paypallogin" → "login"). */
function brandLure(name: string, brand: string): string | null {
  if (name === brand) return null;
  const rest = name.startsWith(brand) ? name.slice(brand.length)
    : name.endsWith(brand) ? name.slice(0, -brand.length) : null;
  if (!rest) return null;
  return BRAND_LURE_WORDS.find((w) => rest.startsWith(w) || rest.endsWith(w)) ?? null;
}

/**
 * The brand's exact name on a genuine country ending (google.lk, amazon.com.au).
 * Private suffixes are excluded: anyone can create paypal.blogspot.co.uk.
 */
function isBrandCountryDomain(host: string, domain: string, name: string): boolean {
  if (!IMPERSONATED_BRANDS.includes(name)) return false;
  if (getIcannDomain(host) !== domain) return false;
  const tld = domain.split('.').pop() ?? '';
  return /^[a-z]{2}$/.test(tld) && !BRAND_UNTRUSTED_CCTLDS.has(tld);
}

/** Spellings a hostname word could be mistaken for: "paypa1" → paypal, paypai. */
function lookalikeSpellings(word: string): string[] {
  let swapped = word;
  for (const [pattern, letter] of LOOKALIKE_SWAPS) swapped = swapped.replace(pattern, letter);
  if (!swapped.includes('1')) return swapped === word ? [] : [swapped];
  return [swapped.replace(/1/g, 'l'), swapped.replace(/1/g, 'i')];
}

/** A hostname word that becomes a brand once look-alike characters are read as letters. */
function lookalikeBrand(host: string): { brand: string; word: string } | null {
  for (const word of words(host)) {
    if (!/[0-9]|rn|vv/.test(word)) continue;
    for (const spelling of lookalikeSpellings(word)) {
      for (const brand of IMPERSONATED_BRANDS) {
        if (spelling === brand || (spelling.includes(brand) && brandLure(spelling, brand))) {
          return { brand, word };
        }
      }
    }
  }
  return null;
}

/** Brand exceptions are explicit domains, never inferred from a brand label. */
function brandImpersonation(host: string, domain: string): string | null {
  if (BRAND_SAFE_DOMAINS.has(domain)) return null;
  if (BRAND_TLDS.has(domain.split('.').pop() ?? '')) return null;

  const name = registrableName(domain);
  if (isBrandCountryDomain(host, domain, name)) return null;

  const lookalike = lookalikeBrand(host);
  if (lookalike) {
    return `"${lookalike.word}" is spelled to look like "${lookalike.brand}", but the site is actually ${domain}`;
  }

  const condensedName = name.replace(/[^a-z0-9]/g, '');
  const nameParts = words(name);
  const hostParts = words(host);

  for (const brand of IMPERSONATED_BRANDS) {
    if (name !== condensedName && condensedName.includes(brand) && !nameParts.includes(brand)) {
      return `"${brand}" is disguised with punctuation in this address, but the site is actually ${domain}`;
    }
    const lure = name === condensedName ? brandLure(name, brand) : null;
    if (lure) {
      return `"${brand}" is joined to "${lure}" in this address, but the site is actually ${domain}`;
    }
    if (!hostParts.includes(brand)) continue;
    if (nameParts.includes(brand)) {
      return `"${brand}" appears in this address, but it is not on ScreenGuard's reviewed ${brand} domain list`;
    }
    return `"${brand}" appears in the address, but the site is actually ${domain}`;
  }
  return null;
}

/** A long, hyphen-heavy hostname stuffed with credential words. */
function credentialHarvestShape(host: string): boolean {
  const dots = host.split('.').length - 1;
  const hyphens = (host.match(/-/g) ?? []).length;
  if (dots < 4 || hyphens < 3) return false;
  return words(host).some((w) => PHISHING_WORDS.has(w));
}

/** Loopback and private/link-local addresses are local development, not suspicious. */
function isPrivateIp(host: string): boolean {
  const ipv6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1).toLowerCase() : null;
  if (ipv6) {
    return ipv6 === '::1' || ipv6 === '::' || ipv6.startsWith('fc') ||
      ipv6.startsWith('fd') || ipv6.startsWith('fe8') || ipv6.startsWith('fe9') ||
      ipv6.startsWith('fea') || ipv6.startsWith('feb');
  }
  if (host === '0.0.0.0') return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 169 && b === 254);
}

/**
 * The single entry point for risk classification.
 * Pure, synchronous and offline — no network calls, no page content, no history.
 */
export function classifyUrl(input: string): RiskResult {
  const cached = cache.get(input);
  if (cached) return cached;
  const result = classifyUncached(input);
  if (cache.size > CACHE_LIMIT) cache.clear();
  cache.set(input, result);
  return result;
}

function classifyUncached(input: string): RiskResult {
  const url = safeUrl(input);
  if (!url) return safe('', 'Not a valid web address');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return safe('', 'Not a web page');
  }

  const host = getHostname(input);
  const domain = getDomain(input);
  if (!host) return safe('', 'No website address');

  if (/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(input)) {
    return {
      level: 'SENSITIVE', category: 'PHISHING', confidence: 0.78,
      reason: 'This address contains invisible or direction-changing text', domain,
    };
  }

  // 1. Known domains — the highest-confidence signal we have.
  for (const [d, category] of domainIndex) {
    if (domainMatches(host, d)) {
      return {
        level: 'RISKY', category, confidence: 0.97,
        reason: `${d} is on ScreenGuard's list of ${categoryWord(category)} sites`,
        domain,
      };
    }
  }

  // 2. Credentials hidden in the URL — unambiguous, and worth catching early.
  if (url.username || url.password) {
    return {
      level: 'RISKY', category: 'PHISHING', confidence: 0.8,
      reason: 'This link hides a username and password inside the address', domain,
    };
  }

  // 2b. Do not penalise international domains generally. Only mixed scripts
  // are suspicious, because that is the usual visual-confusable attack shape.
  if (hasMixedScriptIdn(host)) {
    return {
      level: 'SENSITIVE', category: 'PHISHING', confidence: 0.74,
      reason: 'This internationalised address mixes writing systems and may imitate another site', domain,
    };
  }

  if (SHORTENER_DOMAINS.has(domain)) {
    return {
      level: 'SENSITIVE', category: 'PHISHING', confidence: 0.68,
      reason: 'This shortened address hides its final destination', domain,
    };
  }

  // A legitimate domain can be compromised and host SEO-spam or a malicious
  // download. Inspect paths and query text too, including percent-encoded bait.
  const pathBait = adultBaitInUrl(url);
  if (pathBait) return adultBaitResult(domain, pathBait, 'address');

  // 3. Well-known sites that heuristics would otherwise trip over.
  if (KNOWN_SAFE_DOMAINS.has(domain)) return safe(domain, 'A well-known website');

  // 4. Risky top-level domains.
  const tld = host.split('.').pop() ?? '';
  const tldHit = RISKY_TLDS.find((t) => t.tld === tld);
  if (tldHit) {
    return {
      level: 'RISKY', category: tldHit.category, confidence: 0.92,
      reason: `.${tld} addresses are reserved for ${categoryWord(tldHit.category)} sites`,
      domain,
    };
  }

  const parts = words(host);
  const name = registrableName(domain);
  // Help services and innocent contexts switch every keyword rule off.
  const isRecovery = RECOVERY_HINTS.some((hint) => host.includes(hint));
  const vetoed = isRecovery || parts.some((p) => SAFE_CONTEXT.has(p));

  // 5. Unambiguous keywords anywhere in the hostname.
  const strong = vetoed ? null : matchStrong(host);
  if (strong) {
    return {
      level: 'RISKY', category: strong.category, confidence: 0.8,
      reason: `The address contains "${strong.token}"`, domain,
    };
  }

  // 6. Brand impersonation.
  const brand = brandImpersonation(host, domain);
  if (brand) {
    return { level: 'RISKY', category: 'PHISHING', confidence: 0.72, reason: brand, domain };
  }

  if (credentialHarvestShape(host)) {
    return {
      level: 'RISKY', category: 'PHISHING', confidence: 0.65,
      reason: 'This address is built to look like a sign-in page', domain,
    };
  }

  // 7. Direct downloads of programs, unless the host is a normal software source.
  const path = url.pathname.toLowerCase();
  if (
    DOWNLOAD_EXTENSIONS.some((ext) => path.endsWith(ext)) &&
    !TRUSTED_DOWNLOAD_HOSTS.some((h) => domainMatches(host, h))
  ) {
    return {
      level: 'SENSITIVE', category: 'MALWARE', confidence: 0.75,
      reason: 'This link downloads a program instead of opening a page', domain,
    };
  }

  // 8. Raw public IP addresses. Local development addresses are left alone.
  if (isIpHost(host)) {
    if (isPrivateIp(host)) return safe(host, 'A local network address');
    return {
      level: 'SENSITIVE', category: 'SUSPICIOUS', confidence: 0.6,
      reason: 'This link points at a raw IP address rather than a website name',
      domain: host,
    };
  }

  // 9. Self-sufficient words, unless an innocent context word vetoes them.
  if (!vetoed) {
    const medium = matchMedium(parts);
    if (medium) {
      return {
        level: 'SENSITIVE', category: medium.category, confidence: 0.65,
        reason: `The address contains "${medium.token}"`, domain,
      };
    }

    // 10. Ambiguous words — only with supporting evidence. When that evidence
    //     is there, an adult or gambling name is as good as a listed one; the
    //     weaker malware signals stay at "warn".
    const weak = matchWeak(parts, name);
    if (weak) {
      const exposure = weak.category === 'ADULT' || weak.category === 'GAMBLING';
      return {
        level: exposure ? 'RISKY' : 'SENSITIVE',
        category: weak.category,
        confidence: exposure ? 0.7 : 0.55,
        reason: weak.strength === 'name'
          ? `This site is named "${weak.token}"`
          : `The address combines "${weak.token}" with other ${categoryWord(weak.category)} words`,
        domain,
      };
    }
  }

  // 11. Personal/private services. Harmless to browse, awkward to screen-share.
  for (const p of PRIVATE_DOMAINS) {
    const [pHost, pPath] = p.split('/');
    if (domainMatches(host, pHost) && (!pPath || path.startsWith('/' + pPath))) {
      return {
        level: 'SENSITIVE', category: 'PRIVATE', confidence: 0.85,
        reason: 'This is a personal account page — easy to expose while screen sharing',
        domain,
      };
    }
  }

  return safe(domain);
}

/**
 * Search results often put the harmful terms in the visible title while the
 * href belongs to a compromised school, government, or business domain. This
 * stays local and is used only for that one link before the user clicks it.
 */
export function classifyLinkContext(input: string, visibleText: string): RiskResult {
  const base = classifyUrl(input);
  if (base.level !== 'SAFE') return base;
  const token = adultBait(visibleText);
  return token ? adultBaitResult(base.domain || getDomain(input), token, 'link text') : base;
}

/**
 * Classifies bounded evidence collected locally by the content script. Text
 * alone needs corroboration; a repeated adult-labelled link/media pattern is
 * that corroboration on unfamiliar streaming/gallery sites. A page reached by
 * a cross-site redirect is held to a lower bar — see below. The string form is
 * retained for link and unit-test callers.
 */
export function classifyPageEvidence(
  input: string,
  inputEvidence: string | PageEvidence,
  options: { arrivedViaRedirect?: boolean } = {},
): RiskResult {
  const base = classifyUrl(input);
  if (base.level !== 'SAFE') return base;
  const evidence = typeof inputEvidence === 'string' ? { text: inputEvidence } : inputEvidence;
  const visibleText = evidence.text;
  const text = ` ${visibleText.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const hits = (terms: string[]) => terms.filter((term) => text.includes(` ${term} `));
  const adult = hits(ADULT_BAIT_TERMS);
  if (adult.length >= 2) return pageBaitResult(base.domain || getDomain(input), 'ADULT', adult);

  const adultPhrases = hits(ADULT_PAGE_PHRASES);
  const adultLinks = Math.min(evidence.adultLinkCount ?? 0, 8);
  const adultMedia = Math.min(evidence.adultMediaCount ?? 0, 8);
  const named = adult.length + adultPhrases.length;

  // A phrase plus several separately-labelled cards is much less likely to be
  // an article *about* adult content. Requiring the cards also keeps a single
  // news headline, search result, or educational page from being interrupted.
  // Five labelled links need no media alongside them: a page listing that many
  // is an index of adult content whether or not it rendered its thumbnails.
  const ordinary =
    (named >= 1 && adultLinks >= 3) ||
    adultLinks >= 5 ||
    adultMedia >= 3 ||
    (adultMedia >= 2 && adultLinks >= 2);

  // A domain that only forwards visitors to another site is a doorway, and the
  // page it lands on has not been chosen by the user in any meaningful sense.
  // Judging it on less evidence is the difference between blocking the
  // destination and letting it paint. Still never on wording alone: an article
  // reached through a shortener has to stay readable.
  const viaRedirect = options.arrivedViaRedirect === true &&
    (named >= 1 || adultLinks >= 3 || adultMedia >= 2);

  if (ordinary || viaRedirect) {
    const markers = [...adult, ...adultPhrases,
      ...(adultLinks ? [`${adultLinks} labelled links`] : []),
      ...(adultMedia ? [`${adultMedia} labelled media cards`] : [])];
    return pageBaitResult(base.domain || getDomain(input), 'ADULT', markers);
  }
  const gambling = hits(GAMBLING_BAIT_TERMS);
  if (gambling.length >= 2) return pageBaitResult(base.domain || getDomain(input), 'GAMBLING', gambling);
  return base;
}

function categoryWord(category: RiskCategory): string {
  switch (category) {
    case 'ADULT': return 'adult';
    case 'GAMBLING': return 'gambling';
    case 'PHISHING': return 'phishing';
    case 'MALWARE': return 'malware-hosting';
    case 'SUSPICIOUS': return 'suspicious';
    case 'PRIVATE': return 'private';
    default: return 'flagged';
  }
}

export function clearClassifierCache(): void {
  cache.clear();
}
