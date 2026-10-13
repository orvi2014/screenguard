/**
 * The sensitive-content detection engine.
 *
 * Isolated from the DOM on purpose: this is the piece most likely to be
 * replaced by something smarter (a WASM classifier, a richer secret-scanner
 * ruleset), and keeping it pure means that swap never touches the blur/reveal
 * machinery in sensitiveDetector.ts.
 *
 * Everything here runs locally. No text ever leaves the page.
 */

export interface Pattern {
  name: string;
  re: RegExp;
  validate?: (match: string) => boolean;
}

export function luhn(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  return luhnDigits(digits);
}

function luhnDigits(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

/** ISO 13616 MOD-97 validation prevents ordinary grouped numbers from being
 * mistaken for bank details. */
export function iban(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Canadian SINs use Luhn; requiring the label keeps ordinary 9-digit IDs
 * readable. UK NHS numbers have their own MOD-11 check digit. */
export function nhsNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) return false;
  const sum = [...digits.slice(0, 9)].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const check = (11 - (sum % 11)) % 11;
  return check !== 10 && check === Number(digits[9]);
}

function canadianSin(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 9 && luhnDigits(digits);
}

function contextualSecret(value: string): boolean {
  const secret = value.split(/[:=]/).at(-1)?.trim() ?? '';
  return secret.length >= 20 && /[A-Za-z]/.test(secret) && /\d/.test(secret);
}

export const PATTERNS: Pattern[] = [
  { name: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },

  // Card numbers are only accepted when the Luhn checksum passes, which keeps
  // order numbers and long IDs from being blurred.
  { name: 'card', re: /\b(?:\d[ -]?){13,19}\b/g, validate: luhn },

  // Deliberately conservative: a phone number must *look* like one — an
  // international prefix, a parenthesised area code, or the classic 3-3-4
  // grouping. A bare run of digits is not enough.
  {
    name: 'phone',
    re: /(?:\+\d{1,3}[ -]?\(?\d{1,4}\)?[ -]?\d{2,4}[ -]?\d{2,4}(?:[ -]?\d{2,4})?)|(?:\(\d{2,4}\)[ -]?\d{3,4}[ -]?\d{3,4})|(?:\b\d{3}[ -]\d{3}[ -]\d{4}\b)/g,
    validate: (m) => digitCount(m) >= 9 && digitCount(m) <= 15,
  },

  { name: 'stripe-key', re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b/g },
  { name: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { name: 'aws-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'google-key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'iban', re: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/g, validate: iban },
  { name: 'canadian-sin', re: /\b(?:SIN|Social Insurance Number)\s*[:#-]?\s*\d{3}[ -]?\d{3}[ -]?\d{3}\b/gi, validate: canadianSin },
  { name: 'uk-nhs', re: /\b(?:NHS(?: number)?)\s*[:#-]?\s*\d{3}[ -]?\d{3}[ -]?\d{4}\b/gi, validate: nhsNumber },
  { name: 'bearer', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
  { name: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { name: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  { name: 'twilio-key', re: /\bSK[0-9a-fA-F]{32}\b/g },
  { name: 'discord-token', re: /\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,8}\.[A-Za-z0-9_-]{25,}\b/g },
  { name: 'database-url', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+[^\s]*/gi },
  { name: 'context-secret', re: /\b(?:api[_-]?key|secret|access[_-]?token|password)\s*[:=]\s*[A-Za-z0-9._~+/-]{20,}=*/gi, validate: contextualSecret },
];

export interface Match {
  start: number;
  end: number;
  /** User-facing kind, used by the indicator to say what it hid. */
  kind: Kind;
}

export type Kind = 'email' | 'phone' | 'card' | 'id' | 'key' | 'token';

const KIND_OF: Record<string, Kind> = {
  email: 'email', phone: 'phone', card: 'card', ssn: 'id', iban: 'id',
  'canadian-sin': 'id', 'uk-nhs': 'id',
  'stripe-key': 'key', 'openai-key': 'key', 'github-token': 'key',
  'aws-key': 'key', 'google-key': 'key', 'slack-token': 'key',
  'private-key': 'key', jwt: 'token', bearer: 'token', 'gitlab-token': 'key',
  'npm-token': 'key', 'sendgrid-key': 'key', 'twilio-key': 'key',
  'discord-token': 'token', 'database-url': 'key', 'context-secret': 'key',
};

/** Singular and plural, so the indicator reads like a sentence. */
export const KIND_LABELS: Record<Kind, [string, string]> = {
  email: ['email address', 'email addresses'],
  phone: ['phone number', 'phone numbers'],
  card: ['card number', 'card numbers'],
  id: ['ID number', 'ID numbers'],
  key: ['API key', 'API keys'],
  token: ['token', 'tokens'],
};

/**
 * Reads out what was hidden, most alarming first, and stops before the line
 * would need truncating — an ellipsis tells the reader nothing.
 */
export function describeKinds(counts: Partial<Record<Kind, number>>, limit = 3): string {
  const order: Kind[] = ['key', 'token', 'card', 'id', 'email', 'phone'];
  const present = order.filter((k) => (counts[k] ?? 0) > 0);
  const shown = present.slice(0, limit);
  const rest = present.slice(limit).reduce((sum, k) => sum + (counts[k] as number), 0);

  const parts = shown.map((k) => {
    const n = counts[k] as number;
    return `${n} ${KIND_LABELS[k][n === 1 ? 0 : 1]}`;
  });
  if (rest > 0) parts.push(`${rest} more`);
  return parts.join(' · ');
}

/** Non-overlapping, left-to-right ranges of sensitive text within `text`. */
export function findSensitiveRanges(text: string): Match[] {
  const found: Match[] = [];

  for (const { name, re, validate } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = m[0];
      if (re.lastIndex === m.index) re.lastIndex++; // guard against zero-width loops
      if (value.trim().length < 6) continue;
      if (validate && !validate(value)) continue;
      // Trim separators the greedier patterns may have swallowed.
      const lead = value.length - value.trimStart().length;
      const trail = value.length - value.trimEnd().length;
      found.push({
        start: m.index + lead,
        end: m.index + value.length - trail,
        kind: KIND_OF[name] ?? 'key',
      });
    }
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: Match[] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
