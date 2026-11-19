// 시험: node tools/harness/test.mjs  (playwright 필요 · PW=playwright 경로 · CHROME=크롬 경로)
// 정리 · 프롬프트 · 분기 · 삭제 · 스와이프 · 이어쓰기 · 재생성 · 다시 열기 · 다시 받기 · 라이트 있음/없음 · 채팅 완성/글 완성 · 휴대폰 폭
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PW ?? 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }); r.end(d); }); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}${info ? ` — ${info}` : ''}`); } };

async function page(q, w = 1000) {
    const p = await browser.newPage({ viewport: { width: w, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://localhost:${port}/tools/harness/page.html?${q}`);
    await p.waitForFunction(() => window.__ready);
    await p.evaluate(() => {
        T.ST.reply = (n, type) => { const s = type === 'swipe' ? 'S' : 'T'; return `장면 ${n}.\n\n<choices>\n[rational|safe] ${s}${n}-a 출입증을 보여 준다\n[persona|none] ${s}${n}-b 다은를 안심시킨다\n[brave|gamble] ${s}${n}-c 문을 밀어 연다\n[need|price] ${s}${n}-d 컵라면부터 산다 (대가: 돈 −1,500)\n</choices>\n\n<meatball>\nloc: 연구동\n</meatball>`; };
        T.ST.chat.push(T.aiMsg(T.ST.reply(0, 'normal')));
    });
    await p.evaluate(async () => { T.render(); await T.es.emit('APP_READY'); await T.es.emit('CHAT_CHANGED'); await T.wait(150); });
    p.errs = errs;
    return p;
}
// 지금 선택지에서 n번을 골라(두 번 누르기) 입력창에 들어올 때까지
async function pick(p, n) {
    await p.click(`.mbc-panel.live .mbc-opt[data-mbc-n="${n}"]`);
    await p.click('.mbc-panel.live [data-mbc-act="go"]');
    await p.waitForFunction(() => document.getElementById('send_textarea').value.length > 0, null, { timeout: 4000 });
    return p.evaluate(() => document.getElementById('send_textarea').value);
}
const last = (p) => p.evaluate(() => T.ST.sent[T.ST.sent.length - 1]);
const blocks = (t) => (t.match(/<choices>\s*\[/g) ?? []).length + (t.match(/\[(rational|persona|need|tease|brave|fate)\|/g) ?? []).length;
const visibleText = (p) => p.evaluate(() => [...document.querySelectorAll('#chat .mes_text')].filter(t => !T.ST.chat[Number(t.closest('.mes').getAttribute('mesid'))]?.is_user).map(t => { const c = t.cloneNode(true); c.querySelectorAll('.mbc-panel').forEach(x => x.remove()); return c.textContent; }).join('\n'));

for (const [lite, mode, lm] of [['0', 'chat', ''], ['1', 'chat', ''], ['1', 'text', ''], ['1', 'chat', 'B']]) {
    console.log(`▶ 라이트 ${lite === '1' ? `있음(${lm || 'A'} 모드)` : '없음'} · ${mode === 'chat' ? '채팅 완성' : '글 완성'}`);
    const p = await page(`lite=${lite}&mode=${mode}${lm ? `&lmode=${lm}&pend=1` : ''}`);
    // ① 10턴: 매 턴 고르고 보내기
    const unchosen = [];
    if (lite === '1') ok('라이트: 대가는 배지에만 (선택지 글엔 없음)', await p.evaluate(() => { const o = document.querySelector('.mbc-panel.live .mbc-opt[data-mbc-n="3"]'); return /−1,500원/.test(o.querySelector('.mbc-cost')?.textContent ?? '') && !/대가:/.test(o.querySelector('.mbc-label').childNodes[0].textContent); }));
    else ok('라이트 없음: 대가 배지 없음 · 글에도 없음', await p.evaluate(() => !document.querySelector('.mbc-cost') && ![...document.querySelectorAll('.mbc-label')].some(x => /대가:/.test(x.textContent))));
    for (let t = 1; t <= 10; t++) {
        const k = t % 4;
        const label = await pick(p, k);
        ok(`T${t} 입력창엔 원문 · 대가 글 없음`, !/대가:/.test(label), label);
        for (const x of ['a', 'b', 'c', 'd']) if (x !== 'abcd'[k]) unchosen.push(`T${t - 1}-${x}`);
        await p.evaluate((t) => T.send(null, t), t);
        const s = await last(p);
        ok(`T${t} 보낸 프롬프트에 선택지 블록 0개`, blocks(s.text) === 0, String(blocks(s.text)));
        const leak = unchosen.filter(u => s.text.includes(u));
        ok(`T${t} 안 고른 선택지 글 0개`, leak.length === 0, leak.join(','));
        const need = await p.evaluate(() => { const m = T.ST.chat[T.ST.chat.length - 2]; const x = m.extra?.mbc; return !!(x && (x.check || x.risk === 'price' || x.kind === 'need')); });
        ok(`T${t} 결과 지시: 주사위 · 대가가 있을 때만 1번`, (s.text.match(/\[CHOICE RESULT\]/g) ?? []).length === (need ? 1 : 0));
        const res = s.text.match(/\[CHOICE RESULT\][^\n]*/)?.[0] ?? '';
        if (lm === 'B') {
            ok(`T${t} B 모드: 결과 지시 · 선택지 안내에 <meatball> 없음`, !/<meatball>/.test(res) && !/<meatball>/.test(s.text.match(/\[CHOICES\][^\n]*/)?.[0] ?? '') && (!need || /Show the outcome clearly in the story/.test(res)));
        } else if (lite === '1' && need) ok(`T${t} A 모드: 결과를 <meatball> 사건 줄로`, /<meatball>/.test(res));
        const rec = await p.evaluate(() => T.ST.chat[T.ST.chat.length - 2].extra?.mbc);
        const full = rec && rec.v === 1 && Number.isInteger(rec.n) && rec.kind && rec.risk && rec.label && 'outcome' in rec && 'trap' in rec && 'price' in rec && (rec.risk !== 'gamble' || (rec.check && Number.isInteger(rec.check.roll) && Number.isInteger(rec.check.dc) && typeof rec.check.ok === 'boolean' && rec.outcome));
        ok(`T${t} 고른 기록(mbc)에 결과가 빠짐없이`, !!full, JSON.stringify(rec));
        ok(`T${t} 고른 기록(extra)은 프롬프트에 없음`, !/"mbc"|mbcBlock/.test(s.text));
        const dom = await p.evaluate(() => ({ live: document.querySelectorAll('.mbc-panel.live').length, done: document.querySelectorAll('.mbc-panel.done').length, oldOpts: document.querySelectorAll('.mbc-panel.done .mbc-opt').length }));
        ok(`T${t} 화면: 지금 선택지 1개 · 지난 칩 ${t}개 · 지난 목록 0`, dom.live === 1 && dom.done === t && dom.oldOpts === 0, JSON.stringify(dom));
        const vis = await visibleText(p);
        ok(`T${t} 본문에 선택지 줄 안 보임`, !/T\d+-[abcd]/.test(vis));
    }
    // ② 직접 쓴 답 → 결과 지시 없음 · 칩 없음
    await p.evaluate(() => T.send('그냥 복도를 걷는다', 11));
    ok('직접 쓴 답: 결과 지시 없음', !/\[CHOICE RESULT\]/.test((await last(p)).text));
    ok('직접 쓴 답: 칩 없음', await p.evaluate(() => !document.querySelector(`.mes[mesid="${T.ST.chat.length - 3}"] .mbc-panel`)));
    // ③ 고르고 보내기 → 재생성하면 같은 결과 지시 · 그다음 직접 쓰면 없음 · 빈 입력 생성도 없음
    await pick(p, 2); await p.evaluate(() => T.send(null, 12)); // 모험(주사위)
    const r1 = (await last(p)).text.match(/\[CHOICE RESULT\][^\n]*/)?.[0];
    await p.evaluate(() => T.regenerate(12));
    const r2 = (await last(p)).text.match(/\[CHOICE RESULT\][^\n]*/)?.[0];
    ok('재생성: 같은 결과 지시를 다시 씀', !!r1 && r1 === r2);
    await p.evaluate(() => T.send('', 13));
    ok('빈 입력으로 한 번 더: 결과 지시 없음', !/\[CHOICE RESULT\]/.test((await last(p)).text));
    await p.evaluate(() => T.send('문을 닫는다', 14));
    ok('그다음 직접 쓴 답: 결과 지시 없음', !/\[CHOICE RESULT\]/.test((await last(p)).text));
    // ④ 이어쓰기: 선택지 블록 · 안내 없음
    await p.evaluate(() => T.cont());
    const c = (await last(p)).text;
    ok('이어쓰기: 선택지 블록 0 · 안내 없음', blocks(c) === 0 && !/\[CHOICES\]/.test(c));
    // ⑤ 다시 열기
    await p.waitForTimeout(1200);
    const before = await p.evaluate(() => [document.querySelectorAll('.mbc-panel.live .mbc-opt').length, document.querySelectorAll('.mbc-panel.done').length]);
    await p.evaluate(() => T.reopen());
    const after = await p.evaluate(() => [document.querySelectorAll('.mbc-panel.live .mbc-opt').length, document.querySelectorAll('.mbc-panel.done').length]);
    ok('다시 열기: 지금 선택지 · 지난 칩 그대로', JSON.stringify(before) === JSON.stringify(after), `${before} → ${after}`);
    ok('다시 열기: 지난 답 본문엔 <choices> 없음', await p.evaluate(() => T.ST.chat.slice(0, -1).every(m => m.is_user || !/<choices>/.test(m.mes) && (m.swipes ?? []).every(s => !/<choices>/.test(s)))));
    // ⑥ 칩 누르면 그때 선택지 전체 (읽기 전용)
    await p.click('.mbc-panel.done .mbc-pick >> nth=2');
    ok('칩: 그때 선택지 4개 펼침 · 고른 것 ✔', await p.evaluate(() => { const r = document.querySelectorAll('.mbc-past-row'); return r.length === 4 && document.querySelectorAll('.mbc-past-row.mine').length === 1; }));
    // ⑦ 분기: 8번째 답(mesid 8)에서 「여기서 다른 선택」
    await p.waitForTimeout(1200);
    const at = await p.evaluate(() => { const ch = T.ST.chat; for (let i = 8; i < ch.length; i++) if (!ch[i].is_user && ch[i + 1]?.extra?.mbc) return i; return -1; });
    const want = await p.evaluate((at) => T.ST.chat[at].extra.mbcBlock.match(/T\d+-[abcd]/g).join(','), at);
    await p.evaluate((at) => { document.querySelectorAll('.mbc-past').forEach(x => x.remove()); }, at);
    await p.click(`.mes[mesid="${at}"] .mbc-pick`); await p.click(`.mes[mesid="${at}"] [data-mbc-act="branch"]`); await p.waitForTimeout(300);
    const br = await p.evaluate(() => ({ n: T.ST.chat.length, opts: [...document.querySelectorAll('.mbc-panel.live .mbc-label')].map(x => x.textContent.match(/T\d+-[abcd]/)?.[0]).join(','), chips: document.querySelectorAll('.mbc-panel.done').length }));
    ok('분기: 그 답의 선택지가 다시 고를 수 있게 뜸', br.n === at + 1 && br.opts === want, `${JSON.stringify(br)} want ${want}`);
    // 분기에서 고르고 보내기 → 프롬프트 깨끗
    await pick(p, 1); await p.evaluate((t) => T.send(null, 99), 0);
    ok('분기 뒤 보낸 프롬프트: 선택지 블록 0', blocks((await last(p)).text) === 0);
    if (lm === 'B') ok('B 모드: 라이트 pendingChoice()에도 넘김', await p.evaluate(() => (T.ST.pending ?? []).length >= 10 && T.ST.pending.every(x => x.v === 1 && Number.isInteger(x.mesId))));
    console.log(`  page errors: ${p.errs.length ? p.errs.join(' | ') : '없음'}`); ok('페이지 오류 없음', p.errs.length === 0);
    await p.close();
}

// ⑧ 삭제 · 스와이프
{
    console.log('▶ 삭제 · 스와이프 (라이트 있음)');
    const p = await page('lite=1');
    for (let t = 1; t <= 5; t++) { await pick(p, t % 4); await p.evaluate((t) => T.send(null, t), t); }
    await p.waitForTimeout(1200);
    const at = 6; // T3 답 (0:T0 1:u 2:T1 3:u 4:T2 5:u 6:T3)
    const want = await p.evaluate((at) => T.ST.chat[at].extra.mbcBlock.match(/T\d+-[abcd]/g).join(','), at);
    await p.evaluate((at) => T.del(at + 1), at);
    const got = await p.evaluate(() => [...document.querySelectorAll('.mbc-panel.live .mbc-label')].map(x => x.textContent.match(/T\d+-[abcd]/)?.[0]).join(','));
    ok('삭제: 그 뒤를 지우면 그 답 선택지가 다시 삶', got === want, `${got} want ${want}`);
    // 새 스와이프 → 옛 스와이프로
    await p.evaluate(() => T.swipeNew(77));
    const s1 = await p.evaluate(() => [...document.querySelectorAll('.mbc-panel.live .mbc-label')].map(x => x.textContent.match(/[TS]\d+-[abcd]/)?.[0]).join(','));
    ok('스와이프: 새 스와이프 선택지', /^S77-a/.test(s1), s1);
    await p.evaluate(() => T.swipeTo(0));
    const s0 = await p.evaluate(() => [...document.querySelectorAll('.mbc-panel.live .mbc-label')].map(x => x.textContent.match(/[TS]\d+-[abcd]/)?.[0]).join(','));
    ok('스와이프: 옛 스와이프로 넘기면 그 선택지', s0 === want, `${s0} want ${want}`);
    // 옛 스와이프에서 고르고 보내기 → 모든 스와이프에서 블록이 빠지고 스와이프마다 보관
    await pick(p, 0); await p.evaluate(() => T.send(null, 8)); await p.waitForTimeout(1200);
    const tk = await p.evaluate((at) => { const m = T.ST.chat[at]; return { mes: /<choices>/.test(m.mes), sw: m.swipes.some(s => /<choices>/.test(s)), keep: m.swipe_info.map(x => !!x.extra?.mbcBlock) }; }, at);
    ok('보낸 뒤: 모든 스와이프에서 빠지고 스와이프마다 보관', !tk.mes && !tk.sw && tk.keep.every(Boolean), JSON.stringify(tk));
    // 내 메시지를 지우고 스와이프 1로 → 그 스와이프 선택지
    await p.evaluate((at) => T.del(at + 1), at); await p.evaluate(() => T.swipeTo(1));
    const s1b = await p.evaluate(() => [...document.querySelectorAll('.mbc-panel.live .mbc-label')].map(x => x.textContent.match(/[TS]\d+-[abcd]/)?.[0]).join(','));
    ok('보관된 스와이프로 넘겨도 그 선택지', /^S77-a/.test(s1b), s1b);
    // 🔄 다시 받기 (추가 지시 · 번역 받기)
    await p.evaluate(() => { const m = T.ST.chat[T.ST.chat.length - 1]; m.extra.display_text = m.mes; });
    await p.click('.mbc-panel.live [data-mbc-act="reroll"]'); await p.fill('.mbc-rr-in', '더 과감하게'); await p.click('.mbc-panel.live [data-mbc-act="rerollGo"]'); await p.waitForTimeout(400);
    const rr = await p.evaluate(() => ({ shown: [...document.querySelectorAll('.mbc-panel.live .mbc-label')].map(x => x.childNodes[0].textContent).join(','), q: T.ST.quiet }));
    ok('다시 받기: 새 선택지(번역) · 추가 지시 전달 · 바로 전 선택지만 피하기', /문을 걷어찬다/.test(rr.shown) && /더 과감하게/.test(rr.q) && /S77-a/.test(rr.q) && !/T\d+-/.test(rr.q), rr.shown);
    const inp = await pick(p, 0);
    ok('다시 받기 뒤 고르면 원문(영어)이 입력창에', inp === 'Kick the door open', inp);
    ok('페이지 오류 없음', p.errs.length === 0, p.errs.join(' | '));
    if (process.env.SHOTS) {
        await p.evaluate(() => T.swipeTo(0)); await p.click('.mbc-panel.live .mbc-opt[data-mbc-n="2"]');
        await p.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
        await p.screenshot({ path: `${process.env.SHOTS}/pc.png` });
        await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
        await p.evaluate(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight; });
        await p.screenshot({ path: `${process.env.SHOTS}/mobile.png` });
    }
    await p.close();
}
// ⑩ 함정 (기본 끔 → 켜면 「안전」으로 위장 · 고르면 결과 · 칩에서 공개)
{
    console.log('▶ 함정');
    const p = await page('lite=0');
    ok('함정: 기본 끔 → 안내에 trap 없음', !/trap/.test(await p.evaluate(() => T.ST.extensionPrompts.mb_choices?.value ?? (async () => '')())) && await p.evaluate(async () => { const { buildPrompt } = await import('../../src/prompt.js'); return !/trap/.test(buildPrompt(1, null)); }));
    await p.evaluate(async () => { const { settings } = await import('../../src/core.js'); settings().risks.trap = true; for (const k of ['none', 'safe', 'gamble', 'price']) settings().risks[k] = false; });
    ok('함정: 켜면 안내에 trap', await p.evaluate(async () => { const { buildPrompt } = await import('../../src/prompt.js'); return /\[trap\]/.test(buildPrompt(1, null)); }));
    await p.evaluate(async () => { T.ST.reply = (n) => `장면 ${n}.\n\n<choices>\n[rational|trap] T${n}-a 왼쪽 문으로 간다\n[persona|safe] T${n}-b 기다린다\n</choices>`; await T.send('간다', 1); });
    ok('함정: 「안전」 딱지로 보임 · 함정 글자 없음', await p.evaluate(() => { const o = document.querySelector('.mbc-panel.live .mbc-opt[data-mbc-n="0"]'); return /안전/.test(o.textContent) && !/함정/.test(o.textContent); }));
    await pick(p, 0); await p.evaluate(() => T.send(null, 2));
    ok('함정: 고르면 다음 답에 함정 발동 지시', /TRAP/.test((await last(p)).text));
    ok('함정: 지난 칩에 「함정이었다」', await p.evaluate(() => /함정이었다/.test(document.querySelector('.mbc-panel.done')?.textContent ?? '')));
    await p.close();
}
// ⑪ 옆 동그라미 (넓은 화면) · 좁으면 목록
{
    console.log('▶ 옆 동그라미');
    const p = await page('lite=1', 1280);
    await p.evaluate(async () => { const { settings } = await import('../../src/core.js'); settings().view = 'side'; settings()._rev = 9; await T.es.emit('MESSAGE_UPDATED'); await T.wait(100); });
    ok('옆: 「?」 동그라미 · 답 밑 목록 없음', await p.evaluate(() => !!document.getElementById('mbc-side') && !document.querySelector('.mes .mbc-panel.live')));
    await p.hover('.mbc-sidehub'); await p.waitForTimeout(500);
    ok('옆: 올리면 펼침', await p.evaluate(() => document.getElementById('mbc-side').classList.contains('open')));
    await p.click('#mbc-side .mbc-opt[data-mbc-n="1"]'); await p.click('#mbc-side [data-mbc-act="go"]');
    await p.waitForFunction(() => document.getElementById('send_textarea').value.length > 0, null, { timeout: 4000 });
    ok('옆: 고르면 입력창에', /T0-b/.test(await p.evaluate(() => document.getElementById('send_textarea').value)));
    if (process.env.SHOTS) { await p.evaluate(() => document.getElementById('send_textarea').value = ''); await p.hover('.mbc-sidehub'); await p.waitForTimeout(500); await p.screenshot({ path: `${process.env.SHOTS}/side.png` }); }
    await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(async () => { await T.es.emit('MESSAGE_UPDATED'); await T.wait(100); });
    ok('옆: 좁은 화면은 목록', await p.evaluate(() => !document.getElementById('mbc-side') && !!document.querySelector('.mes .mbc-panel.live')));
    ok('페이지 오류 없음', p.errs.length === 0, p.errs.join(' | '));
    await p.close();
}
// ⑫ 탭: 진행 · 숨은 사실 · 스포 — 선택지와 같은 자리 · 처음 누를 때 AI 1회 · 답 extra에 저장 · AI에게 안 감
{
    console.log('▶ 탭 (진행 · 숨은 사실 · 스포)');
    const p = await page('lite=1');
    ok('탭: 선택지 · 진행 · 숨은 사실 · 스포', (await p.evaluate(() => [...document.querySelectorAll('.mbc-panel.live .mbc-tab')].map(x => x.textContent.trim()).join('/'))).replace(/\s+/g, ' ') === '🎯 선택지/🧭 진행/🔎 숨은 사실/🔮 스포');
    ok('탭: 누르기 전엔 AI 호출 0', await p.evaluate(() => (T.ST.quietN ?? 0) === 0));
    await p.click('.mbc-panel.live [data-mbc-act="tab"][data-g="facts"]'); await p.waitForTimeout(300);
    const g = await p.evaluate(() => ({ n: T.ST.quietN, ex: T.ST.chat[0].extra.mbcGuide, mes: T.ST.chat[0].mes, swi: T.ST.chat[0].swipe_info[0].extra.mbcGuide, rows: document.querySelectorAll('.mbc-panel.live .mbc-opt.g').length, choices: document.querySelectorAll('.mbc-panel.live .mbc-opt[data-mbc-i]').length }));
    ok('탭: 처음 누르면 AI 1회로 세 칸 · 그 자리에 숨은 사실 목록 (선택지 대신)', g.n === 1 && g.ex?.route?.length === 2 && g.ex?.facts?.length === 2 && g.ex?.spoil?.length === 2 && g.rows === 2 && g.choices === 0, JSON.stringify(g));
    ok('탭: 본문엔 없고 extra(스와이프)에만', !/다은와 비밀|우산/.test(g.mes) && !!g.swi);
    ok('숨은 사실 요청: 조명 못 받은 작은 정보 · 예시 · 설정과 안 어긋나게', await p.evaluate(() => /not spotlighted/.test(T.ST.quiet) && /이어폰/.test(T.ST.quiet) && /never contradict/.test(T.ST.quiet)));
    const noPick = async (sec) => { await p.click(`.mbc-panel.live [data-mbc-act="tab"][data-g="${sec}"]`); await p.click('.mbc-panel.live .mbc-opt.g >> nth=0'); return p.evaluate(() => document.getElementById('send_textarea').value === '' && !document.querySelector('.mbc-panel.live .mbc-opt.g[data-mbc-act], .mbc-panel.live button.mbc-opt.g')); };
    ok('숨은 사실: 보여 주기만 (눌러도 입력 없음)', await noPick('facts'));
    ok('스포: 다른 탭은 AI 다시 안 부름 · 보여 주기만', await noPick('spoil') && await p.evaluate(() => T.ST.quietN) === 1);
    ok('진행: 보여 주기만', await noPick('route'));
    await p.click('.mbc-panel.live [data-mbc-act="tab"][data-g="facts"]');
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/tabs.png` });
    await p.click('.mbc-panel.live [data-mbc-act="reroll"]'); await p.fill('.mbc-rr-in', '인물 비밀 위주로'); await p.click('.mbc-panel.live [data-mbc-act="rerollGo"]'); await p.waitForTimeout(300);
    ok('🔄 이 탭만 다시 · 추가 지시 = AI 1회 더', await p.evaluate(() => T.ST.quietN === 2 && /<facts>/.test(T.ST.quiet) && !/<route>/.test(T.ST.quiet) && /인물 비밀 위주로/.test(T.ST.quiet)));
    await p.click('.mbc-panel.live [data-mbc-act="tab"][data-g="choices"]');
    ok('선택지 탭으로 돌아가면 선택지', await p.evaluate(() => document.querySelectorAll('.mbc-panel.live .mbc-opt[data-mbc-i]').length === 4));
    await pick(p, 1); await p.evaluate(() => T.send(null, 1));
    ok('다음 프롬프트에 탭 글 없음', !/다은와 비밀|우산을 두고|푸른 빛의 정체/.test((await last(p)).text));
    ok('새 답이 오면 선택지 탭부터', await p.evaluate(() => document.querySelector('.mbc-panel.live .mbc-tab.on')?.dataset.g === 'choices'));
    // 옆 동그라미에서도 탭
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.evaluate(async () => { const { settings } = await import('../../src/core.js'); settings().view = 'side'; settings()._rev = 99; await T.es.emit('MESSAGE_UPDATED'); await T.wait(100); });
    await p.hover('.mbc-sidehub'); await p.waitForTimeout(300);
    await p.click('#mbc-side [data-mbc-act="tab"][data-g="spoil"]'); await p.waitForTimeout(300);
    ok('옆 동그라미: 탭 바꾸면 부채꼴에 그 항목', await p.evaluate(() => [...document.querySelectorAll('#mbc-side .mbc-fan .mbc-opt')].some(x => /문을 연다/.test(x.textContent))));
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/side_tabs.png` });
    ok('페이지 오류 없음', p.errs.length === 0, p.errs.join(' | '));
    await p.close();
}
// ⑬ 저장: 받는 중 0회 · saveChat 직접 0회 · saveMetadata 0회 · 답 하나에 1번 · 답이 끝나고 1초 뒤 · 받는 중엔 본문 안 고침
for (const lite of ['0', '1']) {
    console.log(`▶ 저장 (라이트 ${lite === '1' ? '있음' : '없음'})`);
    const p = await page(`lite=${lite}`);
    await p.waitForTimeout(1300); await p.evaluate(() => { T.ST.saves = []; T.ST.marks = []; });
    for (let t = 1; t <= 6; t++) {
        if (t !== 4) await pick(p, t % 4); // 4턴은 직접 쓰기
        await p.evaluate((t) => T.send(t === 4 ? '그냥 걷는다' : null, t), t);
        ok(`저장 T${t}: 받는 중엔 앞 답 본문을 안 고침`, await p.evaluate(() => !T.ST.changedDuring));
        await p.waitForTimeout(1300);
        ok(`저장 T${t}: 끝난 뒤엔 앞 답 선택지 블록이 빠짐`, await p.evaluate(() => T.ST.chat.slice(0, -1).every(m => m.is_user || !/<choices>/.test(m.mes))));
    }
    await p.evaluate(() => T.regenerate(7)); await p.waitForTimeout(1300);
    await p.evaluate(() => T.cont()); await p.waitForTimeout(1300);
    // 다시 받기 · 추천 (조용한 생성) 뒤에도 1초 뒤 한 번
    const act = () => p.evaluate(() => T.ST.marks.push({ ev: 'recv', t: performance.now() })); // 동작마다 칸 나누기
    await act(); await p.click('.mbc-panel.live [data-mbc-act="reroll"]'); await p.click('.mbc-panel.live [data-mbc-act="rerollGo"]'); await p.waitForTimeout(1400);
    await act(); await p.click('.mbc-panel.live [data-mbc-act="tab"][data-g="facts"]'); await p.waitForTimeout(1400);
    const r = await p.evaluate(() => {
        const S = T.ST.saves, M = T.ST.marks;
        const recv = M.filter(x => x.ev === 'recv').map(x => x.t), start = M.filter(x => x.ev === 'start').map(x => x.t);
        const all = M.map(x => x.t).sort((a, b) => a - b); const per = recv.map(t0 => { const t1 = all.find(x => x > t0) ?? Infinity; return S.filter(x => x.t >= t0 && x.t < t1 && x.kind === 'deb'); });
        return { streaming: S.filter(x => x.streaming).length, direct: S.filter(x => x.kind === 'direct').length, meta: S.filter(x => x.kind === 'meta').length,
            perReply: per.map(a => a.length), late: per.slice(0, -2).every((a, k) => a.every(x => x.t - recv[k] >= 900)), total: S.length, quietSaves: S.filter(x => x.t > (M[M.length - 1]?.t ?? 0) + 1500).length };
    });
    ok('저장: 받는 중 저장 0회', r.streaming === 0, JSON.stringify(r));
    ok('저장: saveChat 직접 0회 · saveMetadata 0회', r.direct === 0 && r.meta === 0, JSON.stringify(r));
    ok('저장: 답 하나에 저장 요청 1번 이하 (겹치지 않음)', r.perReply.every(n => n <= 1), JSON.stringify(r.perReply));
    ok('저장: 답이 끝나고 1초쯤 뒤에', r.late, JSON.stringify(r));
    ok('페이지 오류 없음', p.errs.length === 0, p.errs.join(' | '));
    await p.close();
}
// ⑨ 휴대폰 폭에서도 고르기
{
    console.log('▶ 휴대폰 폭');
    const p = await page('lite=0', 390);
    const v = await pick(p, 1);
    ok('휴대폰: 고르기', /T0-b/.test(v), v);
    const w = await p.evaluate(() => document.querySelector('.mbc-panel.live').scrollWidth <= document.querySelector('.mes_text').clientWidth + 1);
    ok('휴대폰: 옆으로 넘치지 않음', w);
    await p.close();
}

// ⑭ 눌러야 받는 선택지(gen=ask): 본편 지시 없음 · 🎯 누르면 AI 1회 · 고른 결과는 다음 답 1번 · 옆 동그라미 자리
{
    console.log('▶ 눌러야 받는 선택지 · 옆 동그라미 자리');
    const p = await page('lite=0&mode=chat&gen=ask');
    await p.evaluate(() => { T.ST.reply = (n) => `장면 ${n}. 문 앞에 섰다.`; });
    await p.evaluate(() => T.send('연구동으로 간다', 1)); await p.waitForTimeout(400);
    const s1 = await last(p);
    ok('눌러서: 본편에 선택지 지시 없음', !/\[CHOICES\]/.test(s1.text), s1.text.slice(0, 200));
    ok('눌러서: 답 밑에 「🎯 선택지 받기」', await p.evaluate(() => !!document.querySelector('.mbc-panel.live [data-mbc-act="ask"]') && !(T.ST.quietN ?? 0)));
    await p.click('.mbc-panel.live [data-mbc-act="ask"]'); await p.waitForTimeout(500);
    ok('누르면 AI 1회로 선택지가 뜸', await p.evaluate(() => T.ST.quietN === 1 && document.querySelectorAll('.mbc-panel.live .mbc-opt').length === 3));
    const lbl = await pick(p, 0);
    await p.evaluate(() => T.send(null, 2)); await p.waitForTimeout(300);
    const s2 = await last(p);
    ok('고른 결과 지시는 다음 답 1번 · 선택지 지시는 여전히 없음', /\[CHOICE RESULT\]/.test(s2.text) && !/\[CHOICES\]/.test(s2.text), lbl);
    ok('보낸 프롬프트에 선택지 블록 0', blocks(s2.text) === 0);
    // 옆 동그라미 자리: 왼쪽 · 위
    await p.evaluate(async () => { const { settings } = await import('../../src/core.js'); const s = settings(); s.view = 'side'; s.sideX = 'left'; s.sideY = 'top'; s._rev = 77; await T.es.emit('MESSAGE_UPDATED'); await T.wait(150); });
    const pos = await p.evaluate(() => { const el = document.getElementById('mbc-side'), c = document.getElementById('chat').getBoundingClientRect(); return el ? { x: parseFloat(el.style.left), y: parseFloat(el.style.top), cl: c.left, ct: c.top, ask: !!el.querySelector('[data-mbc-act="ask"]') } : null; });
    ok('옆 동그라미: 왼쪽 · 위로 고를 수 있음', !!pos && pos.x <= pos.cl + 45 && pos.y <= pos.ct + 70, JSON.stringify(pos));
    ok('옆 동그라미에서도 「선택지 받기」', !!pos?.ask);
    ok('페이지 오류 없음', p.errs.length === 0, p.errs.join(' | '));
    await p.close();
}
// ⑮ 📱 폰 안에서만: 채팅에는 아무것도 없고 폰 🎯 앱 안에서 받고 고름 · 폰 없으면 목록
{
    console.log('▶ 폰 안에서만');
    const p = await page('lite=1&mode=chat&gen=ask');
    await p.evaluate(() => { T.ST.reply = (n) => `장면 ${n}. 문 앞에 섰다.`; });
    await p.evaluate(async () => { const { settings } = await import('../../src/core.js'); settings().view = 'phone'; });
    await p.evaluate(() => T.send('연구동으로 간다', 1)); await p.waitForTimeout(400);
    ok('채팅에는 목록 · 동그라미 · 칩 없음', await p.evaluate(() => !document.querySelector('#chat .mbc-panel') && !document.getElementById('mbc-side')));
    // 폰이 앱을 여는 것처럼: 줄 선 앱의 render를 부름
    await p.evaluate(() => { const app = (globalThis.MeatballPhoneApps ?? []).find(a => a.id === 'choices'); const el = document.createElement('div'); el.id = 'phone-app'; document.body.append(el); window.__closed = 0; app.render(el, { close: () => { window.__closed++; }, redraw() {}, toast() {} }); });
    ok('폰 🎯 앱 안에 「선택지 받기」', await p.evaluate(() => !!document.querySelector('#phone-app .mbc-panel.inphone [data-mbc-act="ask"]')));
    await p.click('#phone-app [data-mbc-act="ask"]'); await p.waitForTimeout(500);
    ok('누르면 AI 1회 · 폰 안에 선택지 3개', await p.evaluate(() => T.ST.quietN === 1 && document.querySelectorAll('#phone-app .mbc-opt').length === 3 && !document.querySelector('#chat .mbc-panel')));
    await p.click('#phone-app .mbc-opt[data-mbc-n="1"]'); await p.click('#phone-app [data-mbc-act="go"]');
    await p.waitForFunction(() => document.getElementById('send_textarea').value.length > 0, null, { timeout: 4000 });
    ok('폰 안에서 고르면 입력창에 들어감', /노크|Knock/.test(await p.evaluate(() => document.getElementById('send_textarea').value)));
    await p.evaluate(() => T.send(null, 2)); await p.waitForTimeout(400);
    ok('지난 선택 칩은 기본으로 채팅에 남음 · 지금 선택지는 폰 안에만', await p.evaluate(() => !!document.querySelector('#chat .mbc-panel.done') && !document.querySelector('#chat .mbc-panel.live')));
    await p.evaluate(async () => { const { settings } = await import('../../src/core.js'); settings().pastChip = false; settings()._rev = 91; await T.es.emit('MESSAGE_UPDATED'); await T.wait(150); });
    ok('「폰 안에만」이면 칩도 없음', await p.evaluate(() => !document.querySelector('#chat .mbc-panel')));
    await p.evaluate(() => { const app = globalThis.MeatballPhoneApps.find(a => a.id === 'choices'); const el = document.getElementById('phone-app'); el.innerHTML = ''; app.render(el, { close() {}, redraw() {}, toast() {} }); });
    ok('폰 앱 아래에 「지난 선택」', await p.evaluate(() => /노크|Knock/.test(document.querySelector('#phone-app .mbc-ph-pasts')?.textContent ?? '')));
    // 폰이 없으면 목록으로
    await p.evaluate(async () => { delete window.MeatballLite; delete globalThis.MeatballPhone; const { liteClear } = await import('../../src/core.js'); liteClear(); await T.es.emit('MESSAGE_UPDATED'); await T.wait(150); });
    ok('폰이 없으면 답 밑 목록으로', await p.evaluate(() => !!document.querySelector('#chat .mbc-panel.live')));
    ok('페이지 오류 없음', p.errs.length === 0, p.errs.join(' | '));
    await p.close();
}
// ⑯ 🔌 이 채팅에서만 끄기: 지시 · 목록 없음 · 마지막 답 본문의 블록도 extra로 (글에 흔적 없음) · 다시 켜면 그대로
{
    console.log('▶ 이 채팅에서만 끄기');
    const p = await page('lite=0&mode=chat&gen=auto');
    ok('켜져 있으면 목록', await p.evaluate(() => !!document.querySelector('.mbc-panel.live .mbc-opt')));
    await p.evaluate(async () => { const cb = document.querySelector('[data-mbc-chatoff]'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); await T.wait(200); });
    const r = await p.evaluate(() => { const m = T.ST.chat.at(-1); return { panel: !!document.querySelector('.mbc-panel'), inText: /<choices>/.test(m.mes), kept: /<choices>/.test(m.extra?.mbcBlock ?? '') }; });
    ok('끄면 목록 없음 · 마지막 답 글에서 선택지 블록 빠짐(extra에 보관)', !r.panel && !r.inText && r.kept, JSON.stringify(r));
    await p.evaluate(() => T.send('간다', 9)); await p.waitForTimeout(300);
    const s1 = await last(p);
    ok('끈 채팅: 본편에 선택지 지시 없음', !/\[CHOICES\]/.test(s1.text));
    await p.evaluate(async () => { const cb = document.querySelector('[data-mbc-chatoff]'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); await T.wait(200); });
    ok('다시 켜면 목록', await p.evaluate(() => !!document.querySelector('.mbc-panel.live')));
    ok('페이지 오류 없음', p.errs.length === 0, p.errs.join(' | '));
    await p.close();
}
console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
