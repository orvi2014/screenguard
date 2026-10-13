import { findSensitiveRanges, iban, luhn, nhsNumber } from '../src/content/patterns';
import { check, describe, equal, group } from './harness';

const hits = (text: string) => findSensitiveRanges(text).map((r) => text.slice(r.start, r.end));

/**
 * Ordinary page text. Blurring any of this would make the feature unusable,
 * so this list is the important half of the suite.
 */
const MUST_NOT_BLUR = [
  'Revenue grew from 2024 to 2025 across all regions.',
  'Copyright 2026 Example Inc. All rights reserved.',
  'Version 1.2.3 was released on 2026-09-11T14:30:00Z.',
  'The build took 1200 3400 5600 milliseconds across three runs.',
  'Order #100200300 shipped on March 3.',
  'Prices: 1999 2999 3999 for the three tiers.',
  'ISBN 978 0 13 235088 4 is the reference edition.',
  'He scored 100 200 300 points over three games.',
  'The matrix was 1024 2048 4096 elements wide.',
  'Read chapter 12 section 4 before Tuesday.',
  'Commit a1b2c3d4e5f67890abcdef1234567890abcdef12 fixed the bug.',
  'Request id 550e8400-e29b-41d4-a716-446655440000 failed.',
  'Use the colour #4f46e5 for primary actions.',
  'Coordinates 37.7749, -122.4194 mark the office.',
  'Listening on port 3000, proxying to 8080.',
  'Total: $1,234,567.89 including tax.',
  'The race finished at 12:30:45 local time.',
  'Install with npm i @scope/package-name.',
  'Use @media screen and (min-width: 768px).',
  'Set Authorization: Bearer <your-token-here> in the header.',
  'Call us on 555 0142 during office hours.',
  'Serial SN-2024-000123 is under warranty.',
  'Card ending 4242 is on file.',
  'Reference 1234 5678 9012 was rejected.',
  'Between 1990 and 2020 the population doubled.',
  'Ratio was 16 9 and 4 3 respectively.',
  'Room 101 202 303 are on the third floor.',
];

/** Values that must be hidden before they end up on a projector. */
const MUST_BLUR: Array<[string, string]> = [
  ['Contact jordan.avery@examplecorp.com for help', 'jordan.avery@examplecorp.com'],
  ['Email: a.b+tag@sub.domain.co.uk', 'a.b+tag@sub.domain.co.uk'],
  ['Call +1 415 555 0142 now', '+1 415 555 0142'],
  ['Ring +44 20 7946 0958 today', '+44 20 7946 0958'],
  ['Office (415) 555-0142 ext 2', '(415) 555-0142'],
  ['Mobile 415-555-0142', '415-555-0142'],
  ['key sk_live_51MzQxPGh8Kd0LmTnRvB2XcYw here', 'sk_live_51MzQxPGh8Kd0LmTnRvB2XcYw'],
  ['test key pk_test_51AbCdEfGhIjKlMnOp', 'pk_test_51AbCdEfGhIjKlMnOp'],
  ['OPENAI_API_KEY=sk-proj-AbCdEfGh12345678IjKl', 'sk-proj-AbCdEfGh12345678IjKl'],
  ['AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
  ['token ghp_1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ', 'ghp_1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ'],
  ['maps key AIzaSyB1234567890abcdefghijklmnopqrstuv', 'AIzaSyB1234567890abcdefghijklmnopqrstuv'],
  ['slack xoxb-123456789012-abcdefghijkl', 'xoxb-123456789012-abcdefghijkl'],
  ['card 4242 4242 4242 4242 ok', '4242 4242 4242 4242'],
  ['card 4111-1111-1111-1111 declined', '4111-1111-1111-1111'],
  ['SSN 123-45-6789 on file', '123-45-6789'],
  ['Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123', 'Bearer abcdefghijklmnopqrstuvwxyz0123'],
  ['-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----'],
  ['-----BEGIN OPENSSH PRIVATE KEY-----', '-----BEGIN OPENSSH PRIVATE KEY-----'],
  ['IBAN GB82 WEST 1234 5698 7654 32', 'GB82 WEST 1234 5698 7654 32'],
  ['GitLab glpat-abcdefghijklmnopqrstuvwx', 'glpat-abcdefghijklmnopqrstuvwx'],
  ['SendGrid SG.abcdefghijklmnop.qrstuvwxyzABCDEFGHIJKLMN', 'SG.abcdefghijklmnop.qrstuvwxyzABCDEFGHIJKLMN'],
  ['DATABASE_URL=postgres://alice:supersecret@db.example.com/app', 'postgres://alice:supersecret@db.example.com/app'],
  ['API_KEY=Abcdefghijklmnop1234567890', 'API_KEY=Abcdefghijklmnop1234567890'],
  ['SIN: 046 454 286', 'SIN: 046 454 286'],
  ['NHS number: 943 476 5919', 'NHS number: 943 476 5919'],
  [
    'jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  ],
];

describe('Sensitive content — ordinary text must never blur');
{
  let ok = 0;
  for (const text of MUST_NOT_BLUR) {
    const found = hits(text);
    const pass = found.length === 0;
    check(text.slice(0, 52), pass, pass ? '' : `blurred ${JSON.stringify(found)}`);
    if (pass) ok++;
  }
  if (ok === MUST_NOT_BLUR.length) group('every ordinary sentence stays readable', MUST_NOT_BLUR.length);
}

describe('Sensitive content — real secrets must blur');
{
  let ok = 0;
  for (const [text, expected] of MUST_BLUR) {
    const found = hits(text);
    const pass = found.includes(expected);
    check(expected.slice(0, 44), pass, pass ? '' : `got ${JSON.stringify(found)}`);
    if (pass) ok++;
  }
  if (ok === MUST_BLUR.length) group(`${MUST_BLUR.length} secrets detected`, MUST_BLUR.length);
}

describe('Card numbers use a checksum, not just a shape');
{
  check('a valid test card passes Luhn', luhn('4242424242424242'));
  check('a mistyped card fails Luhn', !luhn('4242424242424243'));
  check('too short is rejected', !luhn('4242'));
  check('too long is rejected', !luhn('42424242424242424242'));
  equal('a non-Luhn 16-digit id is not blurred',
    hits('Reference 1234567812345678 here').length, 0);
  group('checksum prevents blurring ordinary long numbers', 5);
}

describe('Financial and contextual secrets are validated before they blur');
{
  check('a valid IBAN passes MOD-97', iban('GB82 WEST 1234 5698 7654 32'));
  check('a mistyped IBAN fails MOD-97', !iban('GB82 WEST 1234 5698 7654 31'));
  check('a valid NHS number passes MOD-11', nhsNumber('943 476 5919'));
  check('a mistyped NHS number fails MOD-11', !nhsNumber('943 476 5918'));
  equal('an ordinary labelled short value stays visible', hits('API_KEY=not-a-real-key').length, 0);
  group('new patterns keep checksum and context safeguards', 3);
}

describe('Ranges are exact and never overlap');
{
  const text = 'Mail a@b.com or c@d.com, card 4242 4242 4242 4242.';
  const ranges = findSensitiveRanges(text);
  check('three values found', ranges.length === 3, JSON.stringify(hits(text)));
  check('ranges are ordered', ranges.every((r, i) => i === 0 || r.start >= ranges[i - 1].end));
  check('ranges do not overlap', ranges.every((r) => r.end > r.start));
  check('slicing reproduces the values',
    JSON.stringify(hits(text)) === JSON.stringify(['a@b.com', 'c@d.com', '4242 4242 4242 4242']),
    JSON.stringify(hits(text)));
  group('range maths is safe for DOM splitting', 4);
}

describe('Detector survives hostile input');
{
  const inputs = ['', ' ', '\n\n', 'a'.repeat(30_000), '💥'.repeat(500), '@'.repeat(200),
    '---'.repeat(200), '1'.repeat(500), 'sk-'.repeat(200)];
  let threw = 0;
  for (const input of inputs) {
    try { findSensitiveRanges(input); } catch { threw++; }
  }
  check(`${inputs.length} hostile strings handled`, threw === 0);
  if (threw === 0) group('no crashes, no catastrophic backtracking', inputs.length);
}
