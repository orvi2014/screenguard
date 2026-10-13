import { getDomain as getPublicSuffixDomain } from 'tldts';

export function safeUrl(input: string): URL | null {
  try {
    const u = new URL(input);
    return u;
  } catch {
    return null;
  }
}

export function isWebUrl(input: string): boolean {
  const u = safeUrl(input);
  return !!u && (u.protocol === 'http:' || u.protocol === 'https:');
}

export function getHostname(input: string): string {
  const host = safeUrl(input)?.hostname.toLowerCase() ?? '';
  // Strip the "www." prefix and the fully-qualified trailing dot, so
  // "www.Example.com." and "example.com" are treated as the same site.
  return host.replace(/\.$/, '').replace(/^www\./, '');
}

/** Registrable domain, resolved locally against the bundled public-suffix list. */
export function getDomain(input: string): string {
  const host = getHostname(input);
  if (!host || isIpHost(host)) return host;
  return getPublicSuffixDomain(host, { allowPrivateDomains: true }) ?? host;
}

export function isIpHost(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || (host.startsWith('[') && host.endsWith(']'));
}

/** "example.com" matches itself and any subdomain. */
export function domainMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  const d = domain.toLowerCase().replace(/^www\./, '').replace(/^\*\./, '');
  return h === d || h.endsWith('.' + d);
}

export function listMatches(host: string, list: string[]): string | null {
  for (const entry of list) {
    if (entry && domainMatches(host, entry)) return entry;
  }
  return null;
}

export function normaliseDomainInput(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  if (!/^[a-z]+:\/\//.test(v)) v = 'https://' + v;
  const host = getHostname(v);
  if (!host || !host.includes('.') || /\s/.test(host)) return null;
  return host;
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Truncate a URL for display without ever showing a raw, ugly string. */
export function prettyUrl(input: string, max = 64): string {
  const u = safeUrl(input);
  if (!u) return input.slice(0, max);
  const shown = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  return shown.length > max ? shown.slice(0, max - 1) + '…' : shown;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
