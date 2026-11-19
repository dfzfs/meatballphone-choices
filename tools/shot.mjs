import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2]);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }); r.end(d); }); }).listen(8765);
const shots = JSON.parse(process.argv[3]);
const b = await chromium.launch({ });
for (const [name, q, w, h] of shots) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.text()); });
  await p.goto(`http://localhost:8765/tools/demo.html?${q}`); await p.waitForTimeout(1200);
  await p.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
  await p.waitForTimeout(200);
  await p.screenshot({ path: `tools/shots/${name}.png` });
  if (errs.length) console.log(name, errs.join(' | '));
  await p.close();
}
await b.close(); srv.close();
