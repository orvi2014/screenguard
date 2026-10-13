import { createServer } from 'node:http';

export async function protectionRegressions({ ctx, sw, extUrl, setSettings, check, describe, shadowClick }) {
  describe('Regression: no browsing-wide host permissions');
  // The promise is that ScreenGuard cannot read the sites you visit. Optional
  // visual checking needs the one Gemini API origin, which is not a browsing
  // permission — so the invariant is the absence of any *web* host access,
  // not the absence of the entry.
  const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
  const hostPermissions = [...(manifest.host_permissions ?? []), ...(manifest.optional_host_permissions ?? [])];
  check('the installed extension can reach no website, only the Gemini API',
    hostPermissions.every((pattern) => pattern === 'https://generativelanguage.googleapis.com/*'));
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  // SafeSearch adds a redirect, but only ever back to the same search page with
  // a strict-mode parameter. A redirect to another origin would be the real
  // regression, because it could carry the address the user typed somewhere else.
  check('network rules block, allow, or tighten a search in place',
    rules.length > 0 && rules.every((r) => ['block', 'allow'].includes(r.action.type) ||
      (r.action.type === 'redirect' && r.action.redirect?.transform?.queryTransform &&
        !r.action.redirect.url && !r.action.redirect.regexSubstitution)));

  describe('Regression: existing private tabs when sharing starts');
  await ctx.route('https://private-demo.test/**', (r) => r.fulfill({
    contentType: 'text/html', body: '<h1>Private account</h1>',
  }));
  await setSettings({ screenShareActive: false, protectionEnabled: true });
  const existing = await ctx.newPage();
  await existing.goto('https://private-demo.test/account');
  await existing.bringToFront();
  await setSettings({ screenShareActive: true });
  await existing.waitForFunction(() => location.href.includes('/warning.html?'));
  check('a private tab opened before sharing is replaced', existing.url().includes('s=screenshare'));
  await existing.close();
  await setSettings({ screenShareActive: false });

  describe('Regression: the destination receives no blocked requests');
  const received = [];
  const server = createServer((req, res) => {
    received.push(req.url);
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: `http://127.0.0.1:${server.address().port}/redirect-target` });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end('<h1>Network reached</h1>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const hostOrigin = `http://localhost:${server.address().port}`;
  try {
    const control = await ctx.newPage();
    await control.goto(origin + '/control');
    check('the real HTTP server is reachable without blocking', received.includes('/control'));
    await control.close();
    await setSettings({ blocklist: ['127.0.0.1'] });
    const blocked = await ctx.newPage();
    await blocked.goto(origin + '/blocked').catch(() => {});
    await blocked.waitForFunction(() => location.href.includes('/warning.html?'));
    check('a blocked top-level navigation never reaches the server', !received.includes('/blocked'));
    const redirected = await ctx.newPage();
    const redirectFailures = [];
    redirected.on('requestfailed', (r) => redirectFailures.push({ url: r.url(), error: r.failure()?.errorText }));
    await redirected.goto(hostOrigin + '/redirect').catch(() => {});
    check('a server redirect is blocked before reaching its destination', received.includes('/redirect') &&
      !received.includes('/redirect-target') && redirectFailures.some((r) =>
        r.error?.includes('ERR_BLOCKED_BY_CLIENT')),
      JSON.stringify({ received, redirectFailures }));
    await redirected.close();
    await ctx.route(hostOrigin + '/network-frame', (r) => r.fulfill({
      contentType: 'text/html', body: `<h1>Outer</h1><iframe src="${origin}/frame?value=a%26b" width="420" height="260"></iframe>`,
    }));
    const host = await ctx.newPage();
    const failedRequests = [];
    host.on('requestfailed', (r) => failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
    await host.goto(hostOrigin + '/network-frame');
    await host.waitForFunction(() => document.querySelector('iframe') !== null);
    await host.waitForTimeout(300);
    check('a blocked embedded navigation never reaches the server', !received.some((url) => url.startsWith('/frame')));
    check('Chrome natively blocks the iframe without host permissions',
      failedRequests.some((r) => r.url.startsWith(origin + '/frame') && r.error?.includes('ERR_BLOCKED_BY_CLIENT')),
      JSON.stringify(failedRequests));
    await setSettings({ allowlist: ['127.0.0.1'] });
    const allowlistedRules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
    check('allowlisting adds a higher-priority native allow rule', allowlistedRules.some((r) =>
      r.action.type === 'allow' && r.condition.requestDomains?.includes('127.0.0.1') && r.priority > 1));
    await host.close();
    await blocked.close();
  } finally {
    await setSettings({ blocklist: [], allowlist: [] });
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  describe('Regression: dynamic and large-page redaction before paint');
  await setSettings({ sensitiveMode: 'always' });
  await ctx.route('https://redaction.example/slow.js', async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await r.fulfill({ contentType: 'text/javascript', body: '' });
  });
  await ctx.route('https://redaction.example/page', (r) => r.fulfill({ contentType: 'text/html', body: `
    <!doctype html><html><head><script>
      window.exposures = 0;
      function sample() {
        const p = document.getElementById('initial-secret');
        if (p && getComputedStyle(document.documentElement).opacity !== '0' &&
          !p.querySelector('.sg-redacted')) window.exposures++;
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    </script></head><body><p id="initial-secret">initial@examplecorp.com</p>
    <p id="changing">Ordinary text</p><div id="large"></div>
    <script src="/slow.js"></script></body></html>`,
  }));
  const p = await ctx.newPage();
  await p.goto('https://redaction.example/page');
  await p.waitForSelector('#initial-secret .sg-redacted');
  check('initial secret never appears unredacted at a sampled frame', await p.evaluate(() => window.exposures === 0));
  const immediate = await p.evaluate(async () => {
    document.querySelector('#changing').firstChild.nodeValue = 'changed@examplecorp.com';
    return await new Promise((resolve) => requestAnimationFrame(() => resolve(
      !!document.querySelector('#changing .sg-redacted') || getComputedStyle(document.documentElement).opacity === '0',
    )));
  });
  check('characterData changes are covered at the next frame', immediate);
  await p.waitForSelector('#changing .sg-redacted');
  check('changed text is actually redacted', await p.locator('#changing .sg-redacted').textContent() === 'changed@examplecorp.com');
  const covered = await p.evaluate(async () => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 6500; i++) {
      const item = document.createElement('p'); item.textContent = 'Ordinary row ' + i; fragment.append(item);
    }
    const secret = document.createElement('p'); secret.id = 'late-secret'; secret.textContent = 'late@examplecorp.com';
    fragment.append(secret); document.querySelector('#large').append(fragment);
    return await new Promise((resolve) => requestAnimationFrame(() => resolve(
      !!document.querySelector('#late-secret .sg-redacted') || getComputedStyle(document.documentElement).opacity === '0',
    )));
  });
  check('unprocessed chunks stay concealed at the next frame', covered);
  await p.waitForSelector('#late-secret .sg-redacted');
  check('content beyond 6000 ordinary text nodes is redacted', await p.locator('#late-secret .sg-redacted').textContent() === 'late@examplecorp.com');
  check('the page is restored after chunked processing', await p.evaluate(() => getComputedStyle(document.documentElement).opacity !== '0'));
  const flowing = await p.evaluate(async () => {
    const timer = setInterval(() => {
      const span = document.createElement('span'); span.textContent = 'stream@examplecorp.com';
      document.querySelector('#large').append(span);
    }, 10);
    await new Promise((resolve) => setTimeout(resolve, 200));
    clearInterval(timer);
    return await new Promise((resolve) => requestAnimationFrame(() => resolve(
      [...document.querySelectorAll('#large > span')].every((el) => el.querySelector('.sg-redacted')) ||
      getComputedStyle(document.documentElement).opacity === '0',
    )));
  });
  check('continuous updates do not postpone protection', flowing);
  await p.close();
  await setSettings({ sensitiveMode: 'screenshare' });

  describe('Regression: new-tab allowances stay in the destination tab');
  const source = await ctx.newPage();
  await source.goto('https://testbed.example/newtab-regression');
  await source.locator('#blank').click();
  const opened = ctx.waitForEvent('page');
  await shadowClick(source, 'Open anyway');
  const destination = await opened;
  await destination.waitForURL('https://adult-demo.test/new');
  await destination.waitForTimeout(300);
  check('Open anyway reaches a target=_blank destination', destination.url() === 'https://adult-demo.test/new');
  const other = await ctx.newPage();
  await other.goto('https://adult-demo.test/other-tab').catch(() => {});
  await other.waitForFunction(() => location.href.includes('/warning.html?'));
  check('a separate tab is still blocked', other.url().includes('warning.html'));
  const temporary = await sw.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  check('every temporary network rule is tab-scoped', temporary.length > 0 && temporary.every((r) => r.condition.tabIds?.length === 1));
  await Promise.all([source.close(), destination.close(), other.close()]);
}
