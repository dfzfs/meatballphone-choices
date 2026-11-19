import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('..');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }); r.end(d); }); }).listen(8766);
const b = await chromium.launch({ });
for (const q of ['n=6', 'n=6&danger=80&layout=list']) {
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  await p.goto(`http://localhost:8766/tools/demo.html?${q}`); await p.waitForTimeout(1000);
  const r = await p.evaluate(async () => {
    const { buildPrompt } = await import('../src/prompt.js');
    const inj = buildPrompt(2, null);
    const { decorate, lastAIIndex } = await import('../src/panel.js');
    const el = document.querySelector('.mes[mesid="2"]');
    let t = performance.now(); for (let k = 0; k < 50; k++) decorate(el, 2); const same = (performance.now() - t) / 50;
    t = performance.now(); for (let k = 0; k < 20; k++) decorate(el, 2, true); const redraw = (performance.now() - t) / 20;
    // 긴 채팅: 메시지 300개를 화면에 붙이고 전체 한 번
    const d = window.__demo; const base = d.chat[2];
    for (let k = 0; k < 300; k++) { d.chat.push({ is_user: true, name: '나', mes: '간다' }); d.chat.push({ ...base }); }
    d.render();
    t = performance.now(); const last = lastAIIndex(); document.querySelectorAll('#chat .mes').forEach(e => decorate(e, last)); const full = performance.now() - t;
    t = performance.now(); [...document.querySelectorAll('#chat .mes')].slice(-4).forEach(e => decorate(e, last)); const recent = performance.now() - t;
    return { injChars: inj.length, injTok: Math.round(inj.length / 4), same, redraw, full, recent, mes: document.querySelectorAll('#chat .mes').length };
  });
  console.log(q, JSON.stringify(r, (k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v));
  await p.close();
}
await b.close(); srv.close();
