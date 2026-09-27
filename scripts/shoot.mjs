// Renders the scene headlessly and saves screenshots: node scripts/shoot.mjs out.png 17.4 [camJSON]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p.endsWith('/') ? p + 'index.html' : p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0);
const port = server.address().port;

const [out = 'shot.png', hours = '17.4', cam, w = '1280', h = '720', q = 'high'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.186.1/**', (route) => {
  const rel = route.request().url().split('three@0.186.1/')[1];
  route.fulfill({ path: path.join(root, 'node_modules/three', rel), contentType: 'text/javascript' });
});
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
const t0 = Date.now();
await page.goto(`http://localhost:${port}/index.html?capture=1&t=${hours.endsWith('.json') ? 12 : hours}${q === 'low' ? '&q=low' : ''}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 600000 });
console.log('ready in', (Date.now() - t0) / 1000, 's');
// hours may be a path to a JSON list of shots: [{ "name": "a.png", "hours": 12, "cam": {...} }]
const shots = hours.endsWith('.json')
  ? JSON.parse(fs.readFileSync(hours, 'utf8'))
  : [{ name: out, hours: parseFloat(hours), cam: cam && cam !== '-' ? JSON.parse(cam) : null }];
for (const s of shots) {
  if (s.eval) console.log('eval:', JSON.stringify(await page.evaluate(s.eval)));
  await page.evaluate(([h, c]) => window.__renderAt(h, 4, c), [s.hours, s.cam || null]);
  if (s.after) console.log('after:', JSON.stringify(await page.evaluate(s.after)));
  await page.waitForTimeout(800);
  const file = hours.endsWith('.json') ? path.join(path.dirname(out), s.name) : out;
  await page.screenshot({ path: file });
  console.log('shot', file, (Date.now() - t0) / 1000, 's');
}
await browser.close();
server.close();
