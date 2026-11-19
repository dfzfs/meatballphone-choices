// 🧭 추천: 진행 추천 · 지금 사실 · 미래 스포 — 누를 때만 AI 1회. 결과는 그 답 extra(스와이프마다)에 저장 → AI에게 안 감
import { settings, ctx, esc, setExtra } from './core.js';
import { sceneLine } from './prompt.js';

export const SECTIONS = {
    route: { name: '진행 추천', icon: '🧭', desc: '이야기가 다음에 갈 만한 방향 · 누르면 OOC 지시로 입력창에', ask: 'route: 2-3 lines "방향 제목 | 왜 재밌는지" — directions the story could take next, clearly different (e.g. calm, dramatic, emotional or romantic, mysterious)' },
    facts: { name: '지금 사실', icon: '🔎', desc: '지금 장면에서 놓치기 쉬운 작은 사실 · 단서 · 약속 · 어긋남', ask: 'facts: 3-5 lines — small but useful facts in the current scene the player may have missed (names, objects, promises, clues, contradictions). Only what the story already established; never invent' },
    spoil: { name: '미래 스포', icon: '🔮', desc: '이렇게 하면 → 이렇게 될 것 · 누르면 그 행동이 입력창에', ask: 'spoil: 2-3 lines "행동 => 그러면 일어날 일 || the same action written in the story\'s language" — plausible predictions consistent with the characters and world' },
};
export const guideOn = () => Object.keys(SECTIONS).filter(k => settings().guide?.[k] !== false);

export function guidePrompt(only) {
    const secs = only ? [only] : guideOn();
    const L = [
        "[TASK] Do NOT continue the story and do not write as any character. You are a guide for the player ({{user}}). Based on the story so far, answer in Korean (except where asked for the story's language).",
        'Write ONLY these blocks, one item per line:',
        ...secs.map(k => `<${k}> ${SECTIONS[k].ask} </${k}>`),
    ];
    const sc = sceneLine(); if (sc) L.push(sc.replace('Ground the options in the current scene', 'Current scene'));
    return L.join('\n');
}
const clean = (s) => s.replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s*/, '').trim();
export function parseGuide(text, secs) {
    const out = {};
    for (const k of secs) {
        const m = String(text).match(new RegExp(`<${k}>([\\s\\S]*?)(?:</${k}>|<(?:route|facts|spoil)>|$)`, 'i'));
        const lines = (m?.[1] ?? '').split('\n').map(clean).filter(Boolean).slice(0, 6);
        if (k === 'route') out.route = lines.map(l => { const [t, w] = l.split('|'); return { title: t.trim(), why: (w ?? '').trim() }; }).filter(x => x.title);
        if (k === 'facts') out.facts = lines.map(l => ({ text: l }));
        if (k === 'spoil') out.spoil = lines.map(l => { const [main, orig] = l.split('||'); const [act, then] = main.split(/=>|→/); return { act: (act ?? '').trim(), then: (then ?? '').trim(), orig: (orig ?? '').trim() || null }; }).filter(x => x.act);
    }
    return out;
}

async function quietGen(prompt) {
    const g = ctx().generateQuietPrompt;
    if (typeof g !== 'function') throw new Error('이 실리태번은 조용한 생성을 못 해요');
    return g.length >= 2 ? await g(prompt, false, true) : await g({ quietPrompt: prompt, skipWIAN: true });
}
export const gst = { busy: null, tab: null }; // 받는 중인 칸 · 펼친 칸
export async function fetchGuide(i, only = null) {
    const m = ctx().chat?.[i]; if (!m || gst.busy) return;
    const secs = only ? [only] : guideOn();
    if (!secs.length) { toastr.info('설정에서 받을 칸을 하나 이상 켜 주세요.', '미트볼 선택지'); return; }
    gst.busy = only ?? 'all';
    try {
        const got = parseGuide(String(await quietGen(guidePrompt(only)) ?? ''), secs);
        if (!Object.values(got).some(a => a?.length)) throw new Error('추천을 못 받았어요');
        setExtra(m, { mbcGuide: { ...(m.extra?.mbcGuide ?? {}), ...got } });
        await ctx().saveChat?.();
        if (!gst.tab || !got[gst.tab]?.length) gst.tab = secs.find(k => got[k]?.length) ?? gst.tab;
    } catch (e) { toastr.error(String(e?.message ?? e), '미트볼 선택지'); }
    finally { gst.busy = null; }
}

// 화면: 칸 탭 + 내용 (지금 고를 수 있는 답에서만)
export function guideHTML(i) {
    const m = ctx().chat?.[i], g = m?.extra?.mbcGuide ?? {};
    const secs = guideOn();
    if (!secs.length) return '';
    const tab = secs.includes(gst.tab) ? gst.tab : secs[0];
    const tabs = `<div class="mbc-gtabs">${secs.map(k => `<button class="mbc-gtab${k === tab ? ' on' : ''}" data-mbc-act="gtab" data-g="${k}">${SECTIONS[k].icon} ${SECTIONS[k].name}${g[k]?.length ? ` <small>${g[k].length}</small>` : ''}</button>`).join('')}</div>`;
    const list = g[tab] ?? [];
    const busy = gst.busy && (gst.busy === 'all' || gst.busy === tab);
    let body;
    if (busy) body = `<div class="mbc-gempty">받는 중…</div>`;
    else if (!list.length) body = `<div class="mbc-gempty"><span>${esc(SECTIONS[tab].desc)}</span><button class="mbc-go sm" data-mbc-act="guideGo" data-g="${g.route || g.facts || g.spoil ? tab : ''}">${g.route || g.facts || g.spoil ? '이 칸 받기' : '추천 받기'}</button></div>`;
    else if (tab === 'route') body = list.map((x, n) => `<button class="mbc-gitem" data-mbc-act="guideUse" data-g="route" data-n="${n}"><b>🧭 ${esc(x.title)}</b>${x.why ? `<small>${esc(x.why)}</small>` : ''}</button>`).join('');
    else if (tab === 'spoil') body = list.map((x, n) => `<button class="mbc-gitem" data-mbc-act="guideUse" data-g="spoil" data-n="${n}"><b>${esc(x.act)}</b>${x.then ? `<small>→ ${esc(x.then)}</small>` : ''}</button>`).join('');
    else body = `<ul class="mbc-facts">${list.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>`;
    const again = list.length && !busy ? `<div class="mbc-gfoot"><small>${esc(SECTIONS[tab].desc)}</small><button class="mbc-chip" data-mbc-act="guideGo" data-g="${tab}">🔄 이 칸 다시</button></div>` : '';
    return `<div class="mbc-guide">${tabs}<div class="mbc-gbody">${body}</div>${again}</div>`;
}
// 누르면 입력창에: 진행 추천 → OOC 지시 · 미래 스포 → 그 행동(원문)
export function guideText(i, sec, n) {
    const x = ctx().chat?.[i]?.extra?.mbcGuide?.[sec]?.[n]; if (!x) return null;
    if (sec === 'route') return `(OOC: 다음 답은 이 방향으로 — ${x.title}${x.why ? ` · ${x.why}` : ''})`;
    if (sec === 'spoil') return settings().input === 'shown' ? x.act : (x.orig ?? x.act);
    return null;
}
