import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1 });
await p.goto('file://' + process.cwd() + '/tiles.html');
await p.locator('#m').screenshot({ path: 'marquee-1400x560.png' });
await p.locator('#s').screenshot({ path: 'small-tile-440x280.png' });
await b.close();
