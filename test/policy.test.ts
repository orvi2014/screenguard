import { evaluateUrl, isScreenShareOn } from '../src/risk/policy';
import { DEFAULT_SETTINGS } from '../src/shared/constants';
import type { Settings } from '../src/shared/types';
import { check, describe, equal, group } from './harness';

const base = DEFAULT_SETTINGS;
const at = (url: string, patch: Partial<Settings> = {}) =>
  evaluateUrl(url, { ...base, ...patch }).enforcement;

describe('The master switch');
{
  equal('protection off allows a known adult site', at('https://pornhub.com/', { protectionEnabled: false }), 'allow');
  equal('protection off allows a blocklisted site',
    at('https://github.com/', { protectionEnabled: false, blocklist: ['github.com'] }), 'allow');
  group('protection off means genuinely off', 2);
}

describe('Allowlist and blocklist');
{
  equal('allowlist beats the built-in list', at('https://pornhub.com/', { allowlist: ['pornhub.com'] }), 'allow');
  equal('allowlist covers subdomains', at('https://m.pornhub.com/x', { allowlist: ['pornhub.com'] }), 'allow');
  equal('allowlisting one site does not allow another',
    at('https://xvideos.com/', { allowlist: ['pornhub.com'] }), 'block');
  equal('blocklist stops an otherwise safe site', at('https://github.com/', { blocklist: ['github.com'] }), 'block');
  equal('blocklist covers subdomains', at('https://gist.github.com/', { blocklist: ['github.com'] }), 'block');
  equal('blocklist does not catch a similarly named site',
    at('https://github.community/', { blocklist: ['github.com'] }), 'allow');
  equal('allowlist wins when a domain is on both lists',
    at('https://example.com/', { allowlist: ['example.com'], blocklist: ['example.com'] }), 'allow');
  group('list matching is exact about domain boundaries', 7);
}

describe('Category switches');
{
  equal('adult off allows adult sites', at('https://pornhub.com/', {
    categories: { ...base.categories, adult: false },
  }), 'allow');
  equal('gambling off allows gambling sites', at('https://bet365.com/', {
    categories: { ...base.categories, gambling: false },
  }), 'allow');
  equal('adult off does not disable gambling', at('https://bet365.com/', {
    categories: { ...base.categories, adult: false },
  }), 'block');
  equal('private off keeps personal pages quiet while sharing', at('https://mail.google.com/', {
    screenShareActive: true, categories: { ...base.categories, private: false },
  }), 'allow');
  group('each category toggle is independent', 4);
}

describe('Warning switch');
{
  equal('warnings off silences a borderline site',
    at('https://cdn.unknown-host.example/setup.exe', { warnBeforeRisky: false }), 'allow');
  equal('warnings off still blocks a genuinely risky site',
    at('https://pornhub.com/', { warnBeforeRisky: false }), 'block');
  group('turning off warnings never turns off blocking', 2);
}

describe('Screen-share mode');
{
  check('inactive unless both switches are on',
    !isScreenShareOn({ ...base, screenShareActive: true, screenShareProtection: false }));
  check('active when both switches are on',
    isScreenShareOn({ ...base, screenShareActive: true }));
  equal('the feature switch alone changes nothing',
    at('https://mail.google.com/', { screenShareProtection: true }), 'allow');
  group('screen-share mode needs an explicit opt-in', 3);
}

describe('Verdicts always carry usable information');
{
  const v = evaluateUrl('https://pornhub.com/', base);
  check('a domain is present', v.domain === 'pornhub.com');
  check('a human-readable reason is present', v.reason.length > 10);
  check('confidence is a sensible number', v.confidence > 0 && v.confidence <= 1);
  check('the UI can always render a level', ['SAFE', 'SENSITIVE', 'RISKY'].includes(v.level));
  group('verdicts are renderable without extra lookups', 4);
}
