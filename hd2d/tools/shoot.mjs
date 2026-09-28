// Headless screenshots of the village: node hd2d/tools/shoot.mjs shots.json outDir [w h]
// shots.json: [{ "name": "a.png", "opts": { "tod": "golden", "player": [20, 20], "dir": "up", "talk": 0 } }]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0);

const [shotsFile, outDir, w = '1280', h = '720'] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !m.text().includes('ERR_FAILED')) console.log('[page]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.186.1/**', (r) => r.fulfill({ path: path.join(root, 'node_modules/three', r.request().url().split('three@0.186.1/')[1]), contentType: 'text/javascript' }));
await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
const t0 = Date.now();
await page.goto(`http://localhost:${server.address().port}/hd2d/index.html?capture=1`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
console.log('ready', (Date.now() - t0) / 1000);
for (const s of shots) {
  if (s.eval) await page.evaluate(s.eval);
  await page.evaluate((o) => window.__renderAt(o), s.opts || {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, s.name) });
  console.log('shot', s.name, (Date.now() - t0) / 1000);
}
await browser.close();
server.close();
