import { classifyLinkContext, classifyPageEvidence, classifyUrl } from '../src/risk/riskClassifier';
import { evaluateUrl } from '../src/risk/policy';
import { DEFAULT_SETTINGS } from '../src/shared/constants';
import { LEGITIMATE, RISKY, SENSITIVE, PRIVATE_PAGES, TRAPS } from './corpus';
import { check, describe, equal, group } from './harness';

const settings = DEFAULT_SETTINGS;

describe('False positives — legitimate sites must be left alone');
{
  let ok = 0;
  for (const host of LEGITIMATE) {
    const v = evaluateUrl(`https://${host}/`, settings);
    const pass = v.enforcement === 'allow';
    check(host, pass, pass ? '' : `flagged ${v.enforcement}/${v.category}: ${v.reason}`);
    if (pass) ok++;
  }
  if (ok === LEGITIMATE.length) group('every legitimate site stays silent', LEGITIMATE.length);
}

describe('False positives — tricky names that look risky but are not');
{
  const cases: Array<[string, string]> = [
    ['https://essex.gov.uk/', 'contains "sex"'],
    ['https://middlesex.edu/', 'contains "sex"'],
    ['https://sex-education.org/', '"sex" with an educational context'],
    ['https://adult-education.org/', '"adult" with an educational context'],
    ['https://adultswim.com/', 'adult as part of a longer word'],
    ['https://bet.com/', 'a broadcaster, not a bookmaker'],
    ['https://alphabet.com/', 'contains "bet"'],
    ['https://bethesda.net/', 'starts with "bet"'],
    ['https://betterhelp.com/', 'starts with "bet"'],
    ['https://camera.com/', 'contains "cam"'],
    ['https://torrentfreak.com/', 'news about torrents'],
    ['https://amazon.co.uk/', 'a real Amazon country domain'],
    ['https://google.de/', 'a real Google country domain'],
    ['https://paypal.me/someone', 'a real PayPal product domain'],
    ['https://google-analytics.com/collect', 'a real Google service'],
    ['https://blog.google/technology/ai/', "Google's own .google brand TLD"],
    ['https://facebook.net/sdk.js', 'a real Meta CDN'],
    ['https://login.yahoo.com/', 'a real sign-in page'],
    ['https://secure.bankofamerica.com/login', 'a real bank sign-in'],
    ['https://signin.aws.amazon.com/console', 'a real AWS sign-in'],
    ['https://my-app.us-east-1.elb.amazonaws.com/', 'long AWS infrastructure hostname'],
    ['https://github.com/cli/cli/releases/download/v2/gh.pkg', 'a normal software download'],
    ['https://raw.githubusercontent.com/o/r/main/install.ps1', 'a normal install script'],
    ['http://localhost:3000/app', 'local development'],
    ['http://127.0.0.1:8080/', 'loopback'],
    ['http://192.168.1.1/', 'home router'],
    ['http://10.0.0.5:5173/', 'private network'],
    ['https://example.xn--p1ai/', 'a legitimate internationalised TLD'],
  ];
  let ok = 0;
  for (const [url, why] of cases) {
    const v = evaluateUrl(url, settings);
    const pass = v.enforcement === 'allow';
    check(`${url} — ${why}`, pass, pass ? '' : `flagged as ${v.category}: ${v.reason}`);
    if (pass) ok++;
  }
  if (ok === cases.length) group('tricky-but-legitimate names stay clean', cases.length);
}

describe('False positives — names that merely resemble risky ones');
{
  let ok = 0;
  for (const host of TRAPS) {
    const v = evaluateUrl(`https://${host}/`, settings);
    const pass = v.enforcement === 'allow';
    check(host, pass, pass ? '' : `flagged ${v.enforcement}/${v.category}: ${v.reason}`);
    if (pass) ok++;
  }
  if (ok === TRAPS.length) group('every look-alike name stays clean', TRAPS.length);
}

describe('Help and recovery services are never blocked');
{
  const helpSites = [
    'https://gamblingtherapy.org/', 'https://begambleaware.org/', 'https://gamcare.org.uk/',
    'https://gamblersanonymous.org/', 'https://ncpgambling.org/',
    'https://gambling-addiction-help.org/', 'https://pornaddictionrecovery.org/',
    'https://porn-addiction-counselling.org/', 'https://sex-addiction-therapy.co.uk/',
    'https://stopitnow.org/',
  ];
  let ok = 0;
  for (const url of helpSites) {
    const v = evaluateUrl(url, settings);
    const pass = v.enforcement === 'allow';
    check(url, pass, pass ? '' : `blocked as ${v.category}: ${v.reason}`);
    if (pass) ok++;
  }
  if (ok === helpSites.length) group('support services reach the people who need them', helpSites.length);
}

describe('True positives — risky sites must be blocked');
{
  let ok = 0;
  for (const url of RISKY) {
    const v = evaluateUrl(url, settings);
    const pass = v.enforcement === 'block';
    check(url, pass, pass ? '' : `only ${v.enforcement} (${v.level})`);
    if (pass) ok++;
  }
  if (ok === RISKY.length) group('every risky URL is blocked', RISKY.length);
}

describe('Compromised-domain SEO spam is caught before a link is opened');
{
  equal('adult bait in an encoded file path is blocked',
    evaluateUrl('https://example.gov/files/%7ExXx-Pornhub%21-video.pdf', settings).enforcement, 'block');
  equal('adult bait in a search-result title is blocked',
    classifyLinkContext('https://chaucerfoods.com/wp-content/uploads/file.pdf',
      '~!xXx-Pornhub! Indian sex video Xxxxxxx OnlyFans Porn Videos').category, 'ADULT');
  equal('an ordinary PDF title remains safe',
    classifyLinkContext('https://chaucerfoods.com/files/report.pdf', 'Annual food safety report').level, 'SAFE');
  group('compromised hosts cannot hide adult bait in a path or link title', 3);
}

describe('Unknown pages need multiple local content signals');
{
  equal('a single news mention does not block a page',
    classifyPageEvidence('https://news.example.org/article', 'Regulator investigates Pornhub').level, 'SAFE');
  equal('multiple adult markers on an unknown page are blocked',
    classifyPageEvidence('https://compromised.example.org/page', 'Pornhub Indian sex videos and OnlyFans').category, 'ADULT');
  equal('multiple gambling markers on an unknown page are blocked',
    classifyPageEvidence('https://compromised.example.org/page', 'Casino free spins and jackpot bonus').category, 'GAMBLING');
  equal('an unknown adult video gallery is blocked from local page structure',
    classifyPageEvidence('https://unfamiliar.example.org/', {
      text: 'Watch free videos from featured creators', adultLinkCount: 6, mediaCount: 12,
    }).category, 'ADULT');
  equal('a news page mentioning adult content remains safe without gallery evidence',
    classifyPageEvidence('https://news.example.org/article', {
      text: 'Regulator investigates porn videos and online adult content', adultLinkCount: 0, mediaCount: 2,
    }).level, 'SAFE');
  equal('a generic video gallery remains safe without adult labels',
    classifyPageEvidence('https://video.example.org/', {
      text: 'Featured travel videos', adultLinkCount: 0, mediaCount: 15,
    }).level, 'SAFE');
  equal('adult-labelled thumbnails are blocked even without visible page text',
    classifyPageEvidence('https://gallery.example.org/', {
      text: 'Featured videos', adultLinkCount: 0, mediaCount: 8, adultMediaCount: 4,
    }).category, 'ADULT');
  group('unknown pages are classified only with corroborating local evidence', 7);
}

describe('Middle ground — warn without blocking');
{
  let ok = 0;
  for (const url of SENSITIVE) {
    const v = evaluateUrl(url, settings);
    const pass = v.enforcement === 'warn';
    check(url, pass, pass ? '' : `got ${v.enforcement}`);
    if (pass) ok++;
  }
  if (ok === SENSITIVE.length) group('every borderline URL only warns', SENSITIVE.length);
}

describe('Private pages — silent normally, blocked while screen sharing');
{
  const sharing = { ...settings, screenShareActive: true };
  let ok = 0;
  for (const url of PRIVATE_PAGES) {
    const quiet = evaluateUrl(url, settings);
    const strict = evaluateUrl(url, sharing);
    const pass = quiet.enforcement === 'allow' && strict.enforcement === 'block';
    check(url, pass, `normal=${quiet.enforcement} sharing=${strict.enforcement}`);
    if (pass) ok++;
  }
  if (ok === PRIVATE_PAGES.length) group('private pages behave correctly in both modes', PRIVATE_PAGES.length);
}

describe('Screen sharing tightens exposure risks only');
{
  const sharing = { ...settings, screenShareActive: true };
  equal('a suspicious download still only warns while sharing',
    evaluateUrl('https://cdn.unknown-host.example/setup.exe', sharing).enforcement, 'warn');
  equal('a raw IP still only warns while sharing',
    evaluateUrl('https://203.0.113.55/admin', sharing).enforcement, 'warn');
  equal('an adult site is blocked while sharing',
    evaluateUrl('https://sex.com/', sharing).enforcement, 'block');
  group('screen sharing targets what is visible, not what is unsafe', 3);
}

describe('Public IPv6 addresses are not mistaken for local development');
{
  equal('a public IPv6 address is warned about',
    evaluateUrl('https://[2001:4860:4860::8888]/', settings).enforcement, 'warn');
  equal('loopback IPv6 remains safe', evaluateUrl('https://[::1]/', settings).enforcement, 'allow');
  group('IPv6 handling distinguishes public and local addresses', 2);
}

describe('Malformed and exotic input never throws');
{
  const inputs = [
    '', ' ', 'not a url', 'http://', 'https://', '//example.com', 'javascript:alert(1)',
    'data:text/html,<h1>hi</h1>', 'about:blank', 'chrome://settings',
    'file:///etc/passwd', 'mailto:a@b.com', 'tel:+15550142', 'ftp://files.example.com/',
    'https://', 'https://.', 'https://..', 'https://example..com/', 'https://-.com/',
    'https://example.com:99999/', 'https://[::1]/', 'https://[2001:db8::1]/',
    'https://EXAMPLE.COM/PATH', 'https://example.com.', 'https://www.example.com./',
    'https://example.com/' + 'a'.repeat(5000),
    'https://xn--80ak6aa92e.com/', 'https://例え.jp/', 'https://пример.рф/',
  ];
  let threw = 0;
  for (const input of inputs) {
    try {
      const r = classifyUrl(input);
      const v = evaluateUrl(input, settings);
      if (!r.level || !v.enforcement) threw++;
    } catch (err) {
      threw++;
      check(`throws on ${JSON.stringify(input)}`, false, String(err));
    }
  }
  check(`${inputs.length} malformed inputs handled`, threw === 0);
  if (threw === 0) group(`${inputs.length} malformed / exotic inputs handled safely`, inputs.length);

  equal('non-web schemes are never flagged',
    classifyUrl('javascript:alert(1)').level, 'SAFE');
  equal('a trailing dot resolves to the same site',
    classifyUrl('https://pornhub.com./').level, 'RISKY');
  equal('uppercase hostnames are matched',
    classifyUrl('https://PORNHUB.COM/').level, 'RISKY');
}

describe('Classification is stable and cached');
{
  const a = classifyUrl('https://example.com/page');
  const b = classifyUrl('https://example.com/page');
  check('repeat calls return an identical verdict', a === b);
  check('different paths on one host are judged separately',
    classifyUrl('https://files.example.org/tool.dmg').level === 'SENSITIVE' &&
    classifyUrl('https://files.example.org/readme.txt').level === 'SAFE');
  group('caching does not leak between URLs', 2);
}

describe('Brand ownership requires a reviewed domain or a genuine country ending');
{
  for (const host of ['paypal.example', 'google.test', 'amazon.example', 'apple.example', 'google.com.attacker.test']) {
    equal(host + ' is not trusted just for its brand label', classifyUrl('https://' + host).category, 'PHISHING');
  }
  for (const host of ['google.de', 'amazon.co.uk', 'paypal.me', 'accounts.google.com', 'google.fr', 'amazon.in', 'dhl.de']) {
    check(host + ' retains its reviewed exception', classifyUrl('https://' + host).category !== 'PHISHING');
  }
  for (const host of ['google.lk', 'instagram.fr', 'fedex.ca', 'amazon.com.au', 'paypal.co.za']) {
    check(host + ' is the brand on a genuine country ending', classifyUrl('https://' + host).category !== 'PHISHING');
  }
  for (const host of ['paypal.co', 'google.cm', 'amazon.tk', 'apple.io', 'paypal.blogspot.co.uk', 'netflix.github.io']) {
    equal(host + ' is a brand on a squattable or shared ending', classifyUrl('https://' + host).category, 'PHISHING');
  }
  for (const host of ['g00gle.com', 'paypa1.com', 'rnicrosoft.com', 'app1e-id.example', 'amaz0nsupport.com', 'netf1ix.com', 'login.g00gle.example']) {
    equal(host + ' swaps look-alike characters into a brand', classifyUrl('https://' + host).category, 'PHISHING');
  }
  for (const host of ['paypallogin.example', 'applesupport.example', 'secureamazon.example', 'appleidverify.example', 'microsoftaccount.example']) {
    equal(host + ' glues a lure word to a brand', classifyUrl('https://' + host).category, 'PHISHING');
  }
  for (const host of ['applebees.com', 'pineapple.com', 'snapple.com', 'purchase.com', 'appleinsider.com', 'outlookindia.com', 'googleplex.com']) {
    check(host + ' merely contains a brand inside another name', classifyUrl('https://' + host).category !== 'PHISHING');
  }
}

describe('Internationalised lookalikes are handled without blocking whole languages');
{
  equal('a mixed Cyrillic/Latin Apple lookalike is warned about',
    evaluateUrl('https://xn--pple-43d.com/', settings).enforcement, 'warn');
  equal('a single-script Cyrillic IDN remains safe',
    evaluateUrl('https://xn--e1afmkfd.xn--p1ai/', settings).enforcement, 'allow');
  group('IDN checks target script mixing, not international domains', 2);
}

describe('Address-deception signals are warnings, not blanket blocks');
{
  equal('a shortened URL warns before it opens', evaluateUrl('https://bit.ly/example', settings).enforcement, 'warn');
  equal('punctuation hiding a brand warns before it opens', evaluateUrl('https://pay-pal.example/', settings).category, 'PHISHING');
  equal('bidirectional text in an address warns before it opens',
    evaluateUrl('https://example.com/\u202Efdp.exe', settings).category, 'PHISHING');
  group('shorteners, hidden direction changes and punctuation lookalikes are covered', 3);
}
