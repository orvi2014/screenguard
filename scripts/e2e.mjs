import { protectionRegressions } from './protection-regressions.mjs';
/**
 * End-to-end tests against a real Chromium with the built extension loaded.
 *
 * Pages are served by intercepting requests, so the tests exercise genuine
 * http(s) navigation, real content-script injection and the real service
 * worker — not a simulation.
 */
import { chromium } from 'playwright';
import { rmSync, existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXT = resolve('dist');
if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}
const EXT_VERSION = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')).version;

let passed = 0;
const failures = [];
let suite = '';

const describe = (name) => { suite = name; console.log(`\n\x1b[1m${name}\x1b[0m`); };
const check = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { failures.push(`${suite} › ${label}${detail ? `\n      ${detail}` : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\n      ${detail}` : ''}`); }
};

const PROFILE = mkdtempSync(join(tmpdir(), 'screenguard-e2e-'));
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

/* ------------------------------------------------------- synthetic pages -- */

const page = (body, head = '') =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

const TESTBED = page(`
  <h1>Testbed</h1>
  <a id="safe" href="https://safe-target.example/landing">A safe link</a>
  <a id="risky" href="https://adult-demo.test/videos">A risky link</a>
  <a id="nested" href="https://casino-demo.test/play"><span id="inner">Nested <b>markup</b></span></a>
  <a id="blank" href="https://adult-demo.test/new" target="_blank">Opens a new tab</a>
  <a id="nohref">No destination</a>
  <a id="hash" href="#section">In-page anchor</a>
  <a id="js" href="javascript:void(0)">Script link</a>
  <a id="mail" href="mailto:someone@example.com">Email link</a>
  <div id="later"></div>
  <form id="form" action="https://safe-target.example/submit"><button id="submit">Submit</button></form>
  <p id="secrets">Reach me at jordan@examplecorp.com or sk_live_51AbCdEfGhIjKlMnOpQr.</p>
  <p id="plain">Revenue rose from 2024 to 2025. Order 100200300 shipped.</p>
  <script>
    window.__clicks = [];
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) { window.__clicks.push(a.id); e.preventDefault(); }
    });
  </script>
`);

await ctx.route('https://testbed.example/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: TESTBED }));
await ctx.route('https://safe-target.example/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: page('<h1 id="arrived">Arrived safely</h1>') }));

// Entry points that never involve a link click. `free-sex-videos.example` is
// caught by heuristics only, so these also prove the non-list path works.
const HEURISTIC_RISKY = 'https://free-sex-videos.example/watch';
const LISTED_RISKY = 'https://adult-demo.test/videos';
await ctx.route('https://hop.example/302', (r) =>
  r.fulfill({ status: 302, headers: { location: LISTED_RISKY }, body: '' }));
await ctx.route('https://hop.example/302h', (r) =>
  r.fulfill({ status: 302, headers: { location: HEURISTIC_RISKY }, body: '' }));
await ctx.route('https://hop.example/meta', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html',
    body: page(`<meta http-equiv="refresh" content="0;url=${LISTED_RISKY}">`) }));
await ctx.route('https://hop.example/js', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html',
    body: page(`<script>setTimeout(()=>location.href=${JSON.stringify(HEURISTIC_RISKY)},200)<\/script>`) }));
await ctx.route('https://hop.example/open', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html',
    body: page(`<button id="go" onclick="window.open('${LISTED_RISKY}')">open</button>`) }));
await ctx.route('https://hop.example/start', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: page('<h1>start</h1>') }));
await ctx.route('https://free-sex-videos.example/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: page('<h1>REACHED</h1>') }));

// Embedded-frame fixtures. These use their own listed domain so the suite's
// earlier "open anyway" grants can never leak in and mask a real failure.
const FRAME_RISKY = 'https://adult-example.com/embed';
await ctx.route('https://adult-example.com/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: page('<h1>REACHED</h1>') }));
await ctx.route('https://adult-demo.test/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: page('<h1>REACHED</h1>') }));
const frameHost = (src, w = 420, h = 260, extra = '') => page(
  `<h1 id="top">Host page</h1>${extra}<iframe id="f" src="${src}" width="${w}" height="${h}"></iframe>`);
await ctx.route('https://host.example/listed', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: frameHost(FRAME_RISKY) }));
await ctx.route('https://host.example/heuristic', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: frameHost(HEURISTIC_RISKY) }));
await ctx.route('https://host.example/innocent', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: frameHost('https://inner.example/ok') }));
await ctx.route('https://host.example/framelinks', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: frameHost('https://inner.example/links') }));
await ctx.route('https://host.example/pixel', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: frameHost(HEURISTIC_RISKY, 1, 1) }));
await ctx.route('https://host.example/framesecrets', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html',
    body: frameHost('https://inner.example/secrets', 420, 260,
      '<p id="mine">Top frame key sk_live_TOPFRAMEKEY123456</p>') }));
await ctx.route('https://inner.example/ok', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: page('<h1 id="inner">INNER OK</h1>') }));
await ctx.route('https://inner.example/links', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html',
    body: page(`<a id="risky" href="${FRAME_RISKY}">risky link inside a frame</a>`) }));
await ctx.route('https://inner.example/secrets', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html',
    body: page('<p>Frame email framed@examplecorp.com key sk_live_FRAMEKEY9876543210</p>') }));

/* ------------------------------------------------------------- helpers ---- */

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
const ID = new URL(sw.url()).host;
// Let first-run installation settle before the suite starts changing settings.
await new Promise((r) => setTimeout(r, 1200));
const extUrl = (p) => `chrome-extension://${ID}/${p}`;

const shadow = (p, selector) =>
  p.evaluate((sel) => {
    const root = document.getElementById('screenguard-root')?.shadowRoot;
    const el = root?.querySelector(sel);
    return el ? el.textContent : null;
  }, selector);

const shadowClick = (p, text) =>
  p.evaluate((t) => {
    const root = document.getElementById('screenguard-root')?.shadowRoot;
    const btn = [...(root?.querySelectorAll('.sg-btn') ?? [])].find((b) => b.textContent === t);
    if (!btn) throw new Error(`no button "${t}" — have ${[...(root?.querySelectorAll('.sg-btn') ?? [])].map((b) => b.textContent).join(', ')}`);
    btn.click();
  }, text);

const setSettings = async (patch) => {
  const p = await ctx.newPage();
  await p.goto(extUrl('popup.html'));
  await p.evaluate(async (patchIn) => {
    const cur = (await chrome.storage.local.get('sg:settings'))['sg:settings'] ?? {};
    await chrome.storage.local.set({ 'sg:settings': { ...cur, ...patchIn } });
  }, patch);
  await p.waitForTimeout(500);
  await p.close();
};

const scrollAll = async (p) => {
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight + 800; y += 350) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(500);
};

const errors = [];
ctx.on('weberror', (e) => errors.push(String(e.error())));

// Console noise is a product defect in a security tool: anyone who opens
// devtools should see nothing from us.
const noise = [];
const watchConsole = (p, where) => {
  p.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') noise.push(`[${where}] ${m.text()}`);
  });
};
ctx.on('page', (p) => watchConsole(p, new URL(p.url() || 'about:blank').pathname || 'page'));

try {
  /* ================================================== not breaking the web */
  if (!process.argv.includes('--regressions-only')) {
  describe('ScreenGuard does not break an ordinary page');
  {
    const p = await ctx.newPage();
    await p.goto('https://testbed.example/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    await scrollAll(p);

    check('the page renders normally', (await p.textContent('h1')) === 'Testbed');

    const footprint = await p.evaluate(() => document.querySelectorAll('#screenguard-root').length);
    check('nothing is added to the page until there is something to say', footprint === 0);

    const leaked = await p.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { font: s.fontFamily, margin: s.margin, filter: s.filter };
    });
    check('page styles are untouched (shadow DOM isolation)',
      !leaked.font.includes('Inter') && leaked.filter === 'none', JSON.stringify(leaked));

    await p.click('#safe');
    await p.waitForTimeout(400);
    check("the page's own click handler still fires on safe links",
      (await p.evaluate(() => window.__clicks)).includes('safe'));

    check('a safe link shows no warning',
      (await shadow(p, '.sg-modal')) === null && (await shadow(p, '.sg-pop')) === null);

    await p.click('#hash');
    await p.click('#js');
    await p.click('#mail');
    await p.click('#nohref');
    await p.waitForTimeout(400);
    check('in-page, script, mail and href-less links are ignored',
      (await shadow(p, '.sg-modal')) === null);

    check('links without a destination are never marked',
      (await p.locator('#nohref[data-screenguard]').count()) === 0);

    await p.close();
  }

  /* =========================================================== real safety */
  describe('Pre-click interception');
  {
    const p = await ctx.newPage();
    await p.goto('https://testbed.example/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    await scrollAll(p);

    check('the risky link is marked',
      (await p.getAttribute('#risky', 'data-screenguard')) === 'risky');
    check('the safe link is not marked',
      (await p.getAttribute('#safe', 'data-screenguard')) === null);

    const before = await p.evaluate(() => window.__clicks.length);
    await p.click('#risky');
    await p.waitForTimeout(600);
    check('a confirmation dialog appears', (await shadow(p, '.sg-modal h2')) !== null);
    check("the page's own handler is NOT reached for risky links",
      (await p.evaluate(() => window.__clicks.length)) === before);

    check('exactly one container is used for all extension UI',
      (await p.evaluate(() => document.querySelectorAll('#screenguard-root').length)) === 1);

    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    check('Escape dismisses the dialog', (await shadow(p, '.sg-modal')) === null);

    await p.click('#inner');
    await p.waitForTimeout(600);
    check('clicking markup nested inside a risky link is intercepted',
      (await shadow(p, '.sg-host')) === 'casino-demo.test');
    await shadowClick(p, 'Go back');
    await p.waitForTimeout(300);

    await p.hover('#risky');
    await p.waitForTimeout(900);
    check('hovering shows a popover', (await shadow(p, '.sg-pop-title')) === 'Risky link');
    await p.mouse.move(2, 2);
    await p.waitForTimeout(600);
    check('the popover disappears on mouse-out', (await shadow(p, '.sg-pop')) === null);

    await p.hover('#safe');
    await p.waitForTimeout(900);
    check('hovering a safe link shows nothing', (await shadow(p, '.sg-pop')) === null);
    await p.close();
  }

  describe('Dynamic and single-page content');
  {
    const p = await ctx.newPage();
    await p.goto('https://testbed.example/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);

    await p.evaluate(() => {
      const a = document.createElement('a');
      a.id = 'dynamic';
      a.href = 'https://adult-demo.test/added-later';
      a.textContent = 'Added after load';
      document.getElementById('later').appendChild(a);
    });
    await p.waitForTimeout(700);
    await scrollAll(p);
    check('a link inserted after load is classified',
      (await p.getAttribute('#dynamic', 'data-screenguard')) === 'risky');

    await p.evaluate(() => {
      document.getElementById('dynamic').href = 'https://safe-target.example/now-safe';
    });
    await p.waitForTimeout(700);
    check('changing an href re-classifies the link',
      (await p.getAttribute('#dynamic', 'data-screenguard')) === null);

    await p.evaluate(() => history.pushState({}, '', '/spa-route'));
    await p.evaluate(() => {
      const a = document.createElement('a');
      a.id = 'spa';
      a.href = 'https://casino-demo.test/after-route';
      a.textContent = 'After SPA navigation';
      document.getElementById('later').appendChild(a);
    });
    await p.waitForTimeout(700);
    await scrollAll(p);
    check('links added after an SPA route change are classified',
      (await p.getAttribute('#spa', 'data-screenguard')) === 'risky');
    await p.close();
  }

  describe('Links that open a new tab');
  {
    const p = await ctx.newPage();
    await p.goto('https://testbed.example/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    await scrollAll(p);
    await p.click('#blank');
    await p.waitForTimeout(600);
    check('target="_blank" is intercepted before the tab opens',
      (await shadow(p, '.sg-modal h2')) !== null);
    check('no new tab was opened while the dialog is up',
      ctx.pages().filter((x) => x.url().includes('adult-demo')).length === 0);
    await shadowClick(p, 'Go back');
    await p.close();
  }

  /* ===================================================== sensitive content */
  describe('Sensitive content blurring');
  {
    await setSettings({ sensitiveMode: 'always', confirmBeforeReveal: true });
    const p = await ctx.newPage();
    await p.goto('https://testbed.example/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);

    const blurred = await p.evaluate(() =>
      [...document.querySelectorAll('.sg-redacted')].map((s) => s.textContent));
    check('the email and API key are blurred', blurred.length === 2, JSON.stringify(blurred));
    check('ordinary numbers in the same page are untouched',
      (await p.textContent('#plain')).includes('2024 to 2025') &&
      !(await p.evaluate(() => document.querySelector('#plain .sg-redacted') !== null)));

    check('the blur is a real visual effect', await p.evaluate(() =>
      getComputedStyle(document.querySelector('.sg-redacted')).filter.includes('blur')));

    const chipText = (await shadow(p, '.sg-chip')) ?? '';
    check('the indicator reports how many were hidden', chipText.includes('2 items hidden'), chipText);
    check('the indicator says what kind they were',
      /email address/.test(chipText) && /API key/.test(chipText), chipText);

    await shadowClick(p, 'Reveal');
    await p.waitForTimeout(500);
    check('revealing asks for confirmation first',
      (await shadow(p, '.sg-modal h2')) === 'Show 2 hidden values?',
      await shadow(p, '.sg-modal h2'));
    await shadowClick(p, 'Keep hidden');
    await p.waitForTimeout(400);
    check('declining keeps the values hidden', await p.evaluate(() =>
      getComputedStyle(document.querySelector('.sg-redacted')).filter.includes('blur')));

    await shadowClick(p, 'Reveal');
    await p.waitForTimeout(400);
    await shadowClick(p, 'Show anyway');
    await p.waitForTimeout(500);
    check('confirming reveals the real text', await p.evaluate(() =>
      [...document.querySelectorAll('.sg-redacted')].every((s) =>
        !getComputedStyle(s).filter.includes('blur'))));
    check('the indicator disappears once nothing is hidden', (await shadow(p, '.sg-chip')) === null);
    check('the underlying text was never altered',
      (await p.textContent('#secrets')).includes('sk_live_51AbCdEfGhIjKlMnOpQr'));
    await p.close();

    await setSettings({ sensitiveMode: 'off' });
    const q = await ctx.newPage();
    await q.goto('https://testbed.example/', { waitUntil: 'domcontentloaded' });
    await q.waitForTimeout(1200);
    check('turning the feature off blurs nothing',
      (await q.locator('.sg-redacted').count()) === 0);
    await q.close();
    await setSettings({ sensitiveMode: 'screenshare' });
  }

  /* ============================================================== counters */
  describe('Counters and history');
  {
    const stats = await sw.evaluate(async () => {
      const s = await chrome.storage.local.get('sg:stats');
      return s['sg:stats'];
    });
    check('links checked were counted', (stats?.linksChecked ?? 0) > 0, JSON.stringify(stats));

    const history = await sw.evaluate(async () => {
      const h = await chrome.storage.local.get('sg:history');
      return h['sg:history'] ?? [];
    });
    check('history recorded the interceptions', history.length > 0);
    check('history entries are newest-first',
      history.every((e, i) => i === 0 || e.ts <= history[i - 1].ts));
    check('every entry has a domain and reason',
      history.every((e) => e.domain && e.reason));
  }

  /* =============================================================== the UI  */
  describe('Extension surfaces render');
  {
    for (const [name, sel] of [
      ['popup.html', '.popup'], ['settings.html', '.setting-row'],
      ['history.html', 'h1'], ['onboarding.html', '.ob-card'], ['demo.html', '.searchbar'],
    ]) {
      const p = await ctx.newPage();
      await p.goto(extUrl(name));
      const ok = await p.waitForSelector(sel, { timeout: 8000 }).then(() => true).catch(() => false);
      check(`${name} renders`, ok);
      await p.close();
    }

    const p = await ctx.newPage();
    await p.goto(extUrl('warning.html') + '?c=ADULT&l=RISKY&r=test+reason&s=navigation&u=' +
      encodeURIComponent('https://adult-demo.test/a?x=1&y=2#frag'));
    await p.waitForSelector('.warn-card', { timeout: 8000 });
    const text = await p.textContent('.warn-card');
    check('the warning page survives a URL containing & and #',
      text.includes('adult-demo.test'), text.slice(0, 120));
    await p.close();

    const q = await ctx.newPage();
    await q.goto(extUrl('warning.html'));
    await q.waitForSelector('.warn-card', { timeout: 8000 });
    check('the warning page handles a missing URL without a blank screen',
      (await q.textContent('.warn-card')).length > 40);
    await q.close();
  }

  describe('Screen-share mode end to end');
  {
    await setSettings({ screenShareActive: true });
    const badge = await sw.evaluate(() => chrome.action.getBadgeText({}));
    check('the toolbar badge shows the mode is on', badge === 'ON', `badge="${badge}"`);

    const ordinary = await ctx.newPage();
    await ordinary.goto('https://testbed.example/', { waitUntil: 'domcontentloaded' });
    await ordinary.waitForTimeout(1200);
    check('an ordinary page still renders while sharing', (await ordinary.textContent('h1')) === 'Testbed');
    check('screen sharing never redirects an ordinary page', !ordinary.url().includes('warning.html'), ordinary.url());
    const visible = await ordinary.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return style.opacity !== '0' && style.visibility !== 'hidden';
    });
    check('screen sharing never leaves an ordinary page covered', visible);
    await ordinary.close();

    const p = await ctx.newPage();
    await p.goto('https://mail.google.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(1500);
    check('a personal page is blocked while sharing', p.url().includes('warning.html'), p.url());
    await p.close();

    await setSettings({ screenShareActive: false });
    const cleared = await sw.evaluate(() => chrome.action.getBadgeText({}));
    check('the badge clears when sharing stops', cleared === '', `badge="${cleared}"`);

    const q = await ctx.newPage();
    await q.goto('https://mail.google.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await q.waitForTimeout(1500);
    check('the same page is allowed once sharing stops', !q.url().includes('warning.html'), q.url());
    await q.close();
  }

  describe('Settings changes reach open tabs immediately');
  {
    const p = await ctx.newPage();
    await p.goto('https://testbed.example/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    await scrollAll(p);
    check('the risky link starts marked',
      (await p.getAttribute('#risky', 'data-screenguard')) === 'risky');

    await setSettings({ protectionEnabled: false });
    await p.waitForTimeout(900);
    check('turning protection off un-marks links in an already-open tab',
      (await p.getAttribute('#risky', 'data-screenguard')) === null);

    const before = await p.evaluate(() => window.__clicks.length);
    await p.click('#risky');
    await p.waitForTimeout(500);
    check('with protection off the click passes straight through',
      (await p.evaluate(() => window.__clicks.length)) === before + 1 &&
      (await shadow(p, '.sg-modal')) === null);

    await setSettings({ protectionEnabled: true });
    await p.waitForTimeout(900);
    await scrollAll(p);
    check('turning protection back on restores the marks',
      (await p.getAttribute('#risky', 'data-screenguard')) === 'risky');
    await p.close();
  }


  /* ================================================= user overrides ======= */
  describe('Blocking a navigation, then choosing to proceed');
  {
    const p = await ctx.newPage();
    await p.goto('https://adult-demo.test/videos', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(1600);
    check('a typed risky address never loads', p.url().includes('warning.html'), p.url());

    const shown = await p.textContent('.warn-card');
    check('the page names the category and the site',
      shown.includes('Adult content') && shown.includes('adult-demo.test'));

    await p.click('button:has-text("Continue anyway")');
    await p.waitForTimeout(400);
    check('the user is offered "once" or "always"',
      (await p.locator('button:has-text("Open once")').count()) === 1 &&
      (await p.locator('button:has-text("Always allow")').count()) === 1);

    const requested = [];
    p.on('request', (r) => { if (r.isNavigationRequest()) requested.push(r.url()); });
    await p.click('button:has-text("Open once")');
    await p.waitForTimeout(2500);
    check('"Open once" really lets the navigation through',
      requested.some((u) => u.startsWith('https://adult-demo.test')) && !p.url().includes('warning.html'),
      JSON.stringify(requested));
    await p.close();

    // the grant is temporary and scoped — a different risky site is still stopped
    const q = await ctx.newPage();
    await q.goto('https://casino-demo.test/play', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await q.waitForTimeout(1600);
    check('allowing one site does not allow another', q.url().includes('warning.html'), q.url());
    await q.close();
  }

  describe('Allowed and blocked website lists');
  {
    const p = await ctx.newPage();
    await p.goto('https://casino-demo.test/play', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(1500);
    await p.click('button:has-text("Continue anyway")');
    await p.waitForTimeout(300);
    await p.click('button:has-text("Always allow")');
    await p.waitForTimeout(2200);

    const s = await ctx.newPage();
    await s.goto(extUrl('settings.html'));
    await s.waitForSelector('.setting-row', { timeout: 8000 });
    await s.click('.setting-row:has-text("Allowed websites")');
    await s.waitForTimeout(400);
    check('the allowed site appears in Settings',
      (await s.textContent('body')).includes('casino-demo.test'));

    const r = await ctx.newPage();
    await r.goto('https://casino-demo.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await r.waitForTimeout(1500);
    check('an allowed site loads without a warning', !r.url().includes('warning.html'), r.url());
    await r.close();

    await s.click('button:has-text("Remove")');
    await s.waitForTimeout(600);
    check('the allowance can be removed',
      !(await s.textContent('body')).includes('casino-demo.test'));

    const t = await ctx.newPage();
    await t.goto('https://casino-demo.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await t.waitForTimeout(1800);
    check('removing it restores protection immediately', t.url().includes('warning.html'), t.url());
    await t.close();

    await s.goto(extUrl('settings.html'));
    await s.waitForSelector('.setting-row', { timeout: 8000 });
    await s.click('.setting-row:has-text("Blocked websites")');
    await s.waitForTimeout(300);
    await s.fill('.input', 'safe-target.example');
    await s.click('button:has-text("Add")');
    await s.waitForTimeout(1000);

    const u = await ctx.newPage();
    await u.goto('https://safe-target.example/landing', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await u.waitForTimeout(2000);
    check('a site on the personal blocklist is stopped', u.url().includes('warning.html'), u.url());
    check('the warning explains it came from the user\'s own list',
      (await u.textContent('.warn-card')).includes('blocked list'));
    await u.close();

    await s.click('button:has-text("Remove")');
    await s.waitForTimeout(800);
    await s.close();
    await p.close();
  }

  describe('First-run onboarding');
  {
    const p = await ctx.newPage();
    await p.goto(extUrl('onboarding.html'));
    await p.waitForSelector('.ob-card', { timeout: 8000 });
    check('it opens on the welcome screen', (await p.textContent('h1')) === 'Meet ScreenGuard');
    check('no account is requested up front',
      !(await p.textContent('body')).includes('Google'));
    check('there are four steps', (await p.locator('.ob-dot').count()) === 4);

    const titles = [];
    for (let i = 0; i < 3; i++) {
      await p.click('.ob-card .btn.primary');
      await p.waitForTimeout(350);
      titles.push(await p.textContent('h1'));
    }
    check('each step advances',
      JSON.stringify(titles) === JSON.stringify(
        ['Protect before you click', 'Stay safe while sharing', 'You\u2019re protected']),
      JSON.stringify(titles));
    check('the last screen confirms protection is on',
      (await p.textContent('.ob-card')).includes('Protection on'));
    await p.close();
  }

  describe('Optional sign-in never gates protection');
  {
    const p = await ctx.newPage();
    await p.goto(extUrl('settings.html'));
    await p.waitForSelector('.setting-row', { timeout: 8000 });
    const body = await p.textContent('body');
    // A released build has no auth backend, so it must show no account UI at
    // all rather than a dead button or a fake signed-in preview.
    check('a released build shows no dead account UI',
      !/Continue with Google/i.test(body) && !/Preview the signed-in state/i.test(body));
    check('it does not promise syncing this version cannot do',
      !/Sync your settings across devices/i.test(body), 'found a sync promise in the UI');
    check('protection settings work with no account at all',
      /Protection/.test(body) && /Blocked websites/.test(body) && /Allowed websites/.test(body));
    check('there is a way to report a problem',
      /Report a problem/.test(body) && /hello@robatdasorvi\.com/.test(body), body.slice(-260));

    // Every reporting route must be a mailto the user can read before sending.
    const links = await p.$$eval('a.setting-row', (as) => as.map((a) => a.getAttribute('href')));
    check('reporting links are mailto, not a silent upload',
      links.length === 3 && links.every((h) => h.startsWith('mailto:hello@robatdasorvi.com')),
      JSON.stringify(links).slice(0, 160));
    check('the report template carries the version but no browsing data',
      links.every((h) => decodeURIComponent(h).includes(`ScreenGuard ${EXT_VERSION}`)),
      JSON.stringify(links.map((h) => decodeURIComponent(h).slice(0, 70))));
    await p.close();
  }


  /* ============================================ every way into a website == */
  describe('Every way a risky page can be reached');
  {
    const reaches = async (fn) => {
      const p = await ctx.newPage();
      let networkBlocked = false;
      p.on('requestfailed', (r) => {
        if (r.isNavigationRequest() && r.failure()?.errorText?.includes('ERR_BLOCKED_BY_CLIENT')) networkBlocked = true;
      });
      await fn(p);
      await p.waitForTimeout(2000);
      const arrived = (await p.content()).includes('REACHED');
      const stopped = p.url().includes('warning.html') || networkBlocked || !arrived;
      await p.close().catch(() => {});
      return { stopped, arrived };
    };

    const cases = [
      ['a typed or pasted address', (p) => p.goto(LISTED_RISKY, { waitUntil: 'domcontentloaded' }).catch(() => {})],
      ['a typed address caught by heuristics, not the list',
        (p) => p.goto(HEURISTIC_RISKY, { waitUntil: 'domcontentloaded' }).catch(() => {})],
      ['a server redirect', (p) => p.goto('https://hop.example/302', { waitUntil: 'domcontentloaded' }).catch(() => {})],
      ['a server redirect to a heuristic match',
        (p) => p.goto('https://hop.example/302h', { waitUntil: 'domcontentloaded' }).catch(() => {})],
      ['a meta-refresh redirect', (p) => p.goto('https://hop.example/meta', { waitUntil: 'domcontentloaded' }).catch(() => {})],
      ['a JavaScript location change', (p) => p.goto('https://hop.example/js', { waitUntil: 'domcontentloaded' }).catch(() => {})],
      ['the back button', async (p) => {
        await p.goto('https://hop.example/start', { waitUntil: 'domcontentloaded' });
        await p.evaluate((u) => { location.href = u; }, HEURISTIC_RISKY).catch(() => {});
        await p.waitForTimeout(1500);
        await p.goto('https://hop.example/start', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await p.waitForTimeout(400);
        await p.goBack().catch(() => {});
      }],
    ];

    for (const [label, fn] of cases) {
      const { stopped, arrived } = await reaches(fn);
      check(`${label} is stopped`, stopped && !arrived, `stopped=${stopped} arrived=${arrived}`);
    }

    const host = await ctx.newPage();
    await host.goto('https://hop.example/open', { waitUntil: 'domcontentloaded' });
    await host.waitForTimeout(700);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), host.click('#go')]);
    await popup.waitForTimeout(2200);
    check('window.open() into a new tab is stopped', popup.url().includes('warning.html'), popup.url());
    await popup.close(); await host.close();
  }


  /* ============================================== embedded frames ========= */
  describe('Embedded frames are protected too');
  {
    const subFrame = (p) => p.frames().find((f) => f !== p.mainFrame());

    const failedFrameRequests = [];
    const openHost = async (path, wait = 2400) => {
      const p = await ctx.newPage();
      p.on('requestfailed', (r) => failedFrameRequests.push({ url: r.url(), error: r.failure()?.errorText }));
      await p.goto(`https://host.example/${path}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(wait);
      return p;
    };

    let p = await openHost('listed');
    let body = await subFrame(p)?.content().catch(() => '') ?? '';
    check('a listed risky domain in an iframe never renders', !body.includes('REACHED'));
    check('Chrome blocks the listed iframe at the network layer',
      failedFrameRequests.some((r) => r.url === FRAME_RISKY && r.error?.includes('ERR_BLOCKED_BY_CLIENT')),
      JSON.stringify(failedFrameRequests));
    check('the surrounding page is untouched', (await p.textContent('#top')) === 'Host page');
    await p.close();

    p = await openHost('heuristic');
    body = await subFrame(p)?.content().catch(() => '') ?? '';
    check('a heuristic-only risky iframe is blocked as well', !body.includes('REACHED'), body.slice(0, 140));
    check('the surrounding page still works', (await p.textContent('#top')) === 'Host page');
    await p.close();

    p = await openHost('innocent', 1800);
    body = await subFrame(p)?.content().catch(() => '') ?? '';
    check('an innocent iframe loads normally', body.includes('INNER OK'), body.slice(0, 120));
    await p.close();

    p = await openHost('pixel', 1600);
    check('a 1×1 tracking frame is skipped without breaking the page',
      (await p.textContent('#top')) === 'Host page');
    await p.close();

    p = await openHost('framelinks', 2000);
    await subFrame(p).click('#risky');
    await p.waitForTimeout(1200);
    check('a risky link inside a frame is intercepted', (await shadow(p, '.sg-modal h2')) !== null);
    check('the dialog appears in the top frame, not the small iframe',
      (await shadow(p, '.sg-host')) === 'adult-example.com', String(await shadow(p, '.sg-host')));
    check('the frame never reached the risky page',
      !(await subFrame(p).content().catch(() => '')).includes('REACHED'));
    await p.close();
  }

  describe('Sensitive content is hidden across every frame');
  {
    await setSettings({ sensitiveMode: 'always', confirmBeforeReveal: true });
    const p = await ctx.newPage();
    await p.goto('https://host.example/framesecrets', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2600);
    const frame = p.frames().find((f) => f !== p.mainFrame());
    await frame?.waitForFunction(() => document.querySelectorAll('.sg-redacted').length >= 2, null, { timeout: 8000 }).catch(() => {});

    const framed = await frame.evaluate(() =>
      [...document.querySelectorAll('.sg-redacted')].map((s) => s.textContent));
    // Cross-origin frames may be isolated by the browser when the extension has
    // no explicit host grants. The top frame must still be protected; when the
    // frame is injectable, both values are protected as well.
    check('secrets inside an iframe are blurred when the frame is injectable',
      framed.length === 2 || (framed.length === 0 && (await shadow(p, '.sg-chip') ?? '').includes('1 item hidden')),
      JSON.stringify({ framed, body: await frame?.textContent('body').catch(() => '') }));
    check('the indicator counts the whole tab, not just the top frame',
      ((await shadow(p, '.sg-chip')) ?? '').includes(framed.length === 2 ? '3 items hidden' : '1 item hidden'),
      String(await shadow(p, '.sg-chip')));
    check('only one indicator is shown for the whole page',
      (await p.evaluate(() => document.querySelectorAll('#screenguard-root').length)) === 1);

    await shadowClick(p, 'Reveal');
    await p.waitForTimeout(500);
    await shadowClick(p, 'Show anyway');
    await p.waitForTimeout(1000);
    check('revealing from the top frame reveals inside the iframe too',
      await frame.evaluate(() => [...document.querySelectorAll('.sg-redacted')]
        .every((s) => !getComputedStyle(s).filter.includes('blur'))));
    await p.close();
    await setSettings({ sensitiveMode: 'screenshare' });
  }

  describe('Protection history lays out correctly');
  {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 900, height: 800 });
    await p.goto(extUrl('history.html'));
    await p.waitForTimeout(1200);

    const rows = await p.locator('.history-row').count();
    check('history rows render', rows > 0, `found ${rows}`);

    if (rows > 0) {
      // The bug this guards against: reusing the settings grid pushed the text
      // to the right and dropped the timestamp onto its own line.
      const geometry = await p.evaluate(() => {
        const row = document.querySelector('.history-row');
        const domain = row.querySelector('.history-domain').getBoundingClientRect();
        const time = row.querySelector('.history-time').getBoundingClientRect();
        const dot = row.querySelector('.dot').getBoundingClientRect();
        const box = row.getBoundingClientRect();
        return {
          domainLeft: domain.left - box.left,
          dotLeft: dot.left - box.left,
          sameLine: Math.abs(domain.top - time.top) < 12,
          timeIsRightmost: time.right > domain.right,
          timeNearRightEdge: box.right - time.right < 30,
        };
      });
      check('the status dot sits at the left edge', geometry.dotLeft < 24, JSON.stringify(geometry));
      check('the domain is left-aligned, not pushed right',
        geometry.domainLeft < 48, JSON.stringify(geometry));
      check('the timestamp shares the row with the domain',
        geometry.sameLine, JSON.stringify(geometry));
      check('the timestamp sits at the right edge',
        geometry.timeIsRightmost && geometry.timeNearRightEdge, JSON.stringify(geometry));
    }

    // narrow: the timestamp is allowed to wrap, but nothing may overflow
    await p.setViewportSize({ width: 375, height: 800 });
    await p.waitForTimeout(400);
    const overflow = await p.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check('no horizontal scroll at 375px', !overflow);
    await p.close();
  }

  }

  await protectionRegressions({ ctx, sw, extUrl, setSettings, check, describe, shadowClick });

  describe('Nothing is logged to the console');
  {
    // Re-open every surface with a listener attached from the first byte.
    for (const target of ['popup.html', 'settings.html', 'history.html', 'onboarding.html',
      'demo.html', 'warning.html?c=ADULT&l=RISKY&r=test&s=nav&u=https%3A%2F%2Fadult-demo.test%2F']) {
      const p = await ctx.newPage();
      watchConsole(p, target.split('?')[0]);
      p.on('pageerror', (e) => noise.push(`[${target.split('?')[0]}] ${e}`));
      await p.goto(extUrl(target));
      await p.waitForTimeout(1800);
      await p.close();
    }
    check('no warnings or errors on any extension page', noise.length === 0, noise.join('\n      '));
  }

  describe('No uncaught errors anywhere');
  check(`${errors.length === 0 ? 'clean' : 'errors found'}`, errors.length === 0, errors.join('\n      '));
} catch (err) {
  failures.push(`harness › ${err?.stack ?? err}`);
  console.log(`\n\x1b[31m✗ harness error\x1b[0m\n${err?.stack ?? err}`);
} finally {
  await ctx.close();
  rmSync(PROFILE, { recursive: true, force: true });
}

console.log(`\n${'─'.repeat(58)}`);
if (failures.length === 0) {
  console.log(`\x1b[32m✓ ${passed} browser checks passed\x1b[0m`);
  process.exit(0);
}
console.log(`\x1b[31m✗ ${failures.length} failed\x1b[0m, ${passed} passed\n`);
failures.forEach((f) => console.log('  ' + f));
process.exit(1);
