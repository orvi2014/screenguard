import { readFileSync } from 'node:fs';
import { buildRules } from '../src/background/dnrRules';
import { DEFAULT_SETTINGS } from '../src/shared/constants';
import { describe, check } from './harness';

describe('Native network protection without host permissions');
const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
check('Gemini is the only required host access',
  manifest.host_permissions?.length === 1 &&
  manifest.host_permissions[0] === 'https://generativelanguage.googleapis.com/*' &&
  !manifest.optional_host_permissions?.length);
const defaults = buildRules(DEFAULT_SETTINGS);
check('default rules use native blocking, SafeSearch redirects and keyword exceptions', defaults.length > 0 &&
  defaults.every((r) => r.action.type === 'block' || r.action.type === 'redirect' || r.action.type === 'allow'));

/* The heuristic keywords are enforced natively too, so a long-tail adult or
 * gambling address is cancelled before the request leaves the browser. */
const regexRules = defaults.filter((r) => r.condition.regexFilter);
const matches = (url: string, type: 'block' | 'allow') => regexRules.some((r) =>
  r.action.type === type && new RegExp(r.condition.regexFilter as string).test(url));
check('keyword addresses are blocked natively, not just on navigation',
  matches('https://xxxvideoshddownload.blogspot.com/p/x.html', 'block') &&
  matches('https://freeporn-tube.example/', 'block') &&
  matches('https://best-casino-online.example/', 'block'));
check('a keyword block never outranks an explicit allow',
  regexRules.filter((r) => r.action.type === 'block').every((r) => r.priority === 1));
check('help, recovery and education keep a higher-priority exception',
  matches('https://pornaddictionrecovery.org/', 'allow') &&
  matches('https://gamblingtherapy.org/', 'allow') &&
  regexRules.filter((r) => r.action.type === 'allow').every((r) => (r.priority ?? 0) > 1));
check('an ordinary address matches no keyword rule',
  !matches('https://github.com/', 'block') && !matches('https://news.example/casino-report', 'block'));
const vetoWord = buildRules({ ...DEFAULT_SETTINGS, blocklist: ['supportive-casino.example'] });
check('the keyword exception never silently unblocks the user\'s own list',
  vetoWord.some((r) => r.action.type === 'block' &&
    r.condition.requestDomains?.includes('supportive-casino.example') && (r.priority ?? 0) > 2));
const blocks = (rules: typeof defaults, domain: string) => rules.some((r) =>
  r.action.type === 'block' && r.condition.requestDomains?.includes(domain));
check('adult sites remain blocked by default', blocks(defaults, 'adult-demo.test'));
check('well-known adult domains have native block rules',
  blocks(defaults, 'xnxx.com') && blocks(defaults, 'xnxxx.com') && blocks(defaults, 'xhamster.com'));
check('gambling sites remain blocked by default', blocks(defaults, 'casino-demo.test'));
check('blocking rules protect both top-level pages and iframes', defaults.filter((r) => r.action.type === 'block').every((r) =>
  r.condition.resourceTypes?.includes('main_frame' as chrome.declarativeNetRequest.ResourceType) &&
  r.condition.resourceTypes?.includes('sub_frame' as chrome.declarativeNetRequest.ResourceType)));
const noAdult = buildRules({ ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories, adult: false } });
check('adult toggle does not disable gambling protection', !blocks(noAdult, 'adult-demo.test') && blocks(noAdult, 'casino-demo.test'));
const noGambling = buildRules({ ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories, gambling: false } });
check('gambling toggle does not disable adult protection', !blocks(noGambling, 'casino-demo.test') && blocks(noGambling, 'adult-demo.test'));
check('the master switch removes blocking rules', buildRules({ ...DEFAULT_SETTINGS, protectionEnabled: false }).length === 0);
check('custom blocklists use native blocking', blocks(buildRules({ ...DEFAULT_SETTINGS, blocklist: ['custom.example'] }), 'custom.example'));
const allowed = buildRules({ ...DEFAULT_SETTINGS, allowlist: ['adult-demo.test'] });
check('allowlisted domains retain a higher-priority allow rule', !blocks(allowed, 'adult-demo.test') && allowed.some((r) =>
  r.action.type === 'allow' && r.condition.requestDomains?.includes('adult-demo.test') && r.priority === 2));
check('SafeSearch keeps Google and Bing strict by default', defaults.some((r) =>
  r.action.type === 'redirect' && r.action.redirect?.transform?.queryTransform?.addOrReplaceParams?.[0]?.key === 'safe') &&
  defaults.some((r) => r.action.type === 'redirect' &&
    r.action.redirect?.transform?.queryTransform?.addOrReplaceParams?.[0]?.key === 'adlt'));
check('SafeSearch can be turned off independently', !buildRules({ ...DEFAULT_SETTINGS, safeSearchEnabled: false })
  .some((r) => r.action.type === 'redirect'));
