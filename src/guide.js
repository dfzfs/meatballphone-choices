// 🧭 추천: 진행 추천 · 지금 사실 · 미래 스포 — 누를 때만 AI 1회. 결과는 그 답 extra(스와이프마다)에 저장 → AI에게 안 감
import { settings, ctx, esc, setExtra, requestSave, isGenerating } from './core.js';
import { sceneLine } from './prompt.js';

export const SECTIONS = {
    route: { name: '진행', icon: '🧭', desc: '이야기가 다음에 갈 만한 방향', ask: 'route: 2-3 lines "방향 제목 | 왜 재밌는지" — directions the story could take next, clearly different (e.g. calm, dramatic, emotional or romantic, mysterious)' },
    facts: { name: '숨은 사실', icon: '🔎', desc: '이야기에 쓸 만한데 아직 조명을 못 받은 작은 정보', ask: 'facts: 3-5 lines — small, specific hidden details about the people, objects or place in the current scene that the story has not spotlighted yet but could become useful hooks (e.g. "레온의 주머니에는 그동안 찾던 이어폰이 들어 있다", "이 산에는 귀신이 나온다는 소문이 있다"). They may be new, but must fit the world and never contradict what is established. One factual sentence each' },
    spoil: { name: '스포', icon: '🔮', desc: '이렇게 하면 → 이렇게 될 것', ask: 'spoil: 2-3 lines "행동 => 그러면 일어날 일" — plausible predictions consistent with the characters and world' },
};
export const guideOn = () => Object.keys(SECTIONS).filter(k => settings().guide?.[k] !== false);

export function guidePrompt(only, extra = '') {
    const secs = only ? [only] : guideOn();
    const L = [
        "[TASK] Do NOT continue the story and do not write as any character. You are a guide for the player ({{user}}). Based on the story so far, answer in Korean (except where asked for the story's language).",
        'Write ONLY these blocks, one item per line:',
        ...secs.map(k => `<${k}> ${SECTIONS[k].ask} </${k}>`),
    ];
    const sc = sceneLine(); if (sc) L.push(sc.replace('Ground the options in the current scene', 'Current scene'));
    if (extra) L.push(`Player's extra direction: ${extra}`);
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
export async function fetchGuide(i, only = null, extra = '') {
    const m = ctx().chat?.[i]; if (!m || gst.busy) return;
    if (isGenerating()) { toastr.info('답을 받는 중이에요. 끝난 뒤에 받아 주세요.', '미트볼폰 선택지'); return; }
    const secs = only ? [only] : guideOn();
    if (!secs.length) { toastr.info('설정에서 받을 칸을 하나 이상 켜 주세요.', '미트볼폰 선택지'); return; }
    gst.busy = only ?? 'all';
    try {
        const got = parseGuide(String(await quietGen(guidePrompt(only, extra)) ?? ''), secs);
        if (!Object.values(got).some(a => a?.length)) throw new Error('추천을 못 받았어요');
        setExtra(m, { mbcGuide: { ...(m.extra?.mbcGuide ?? {}), ...got } });
        requestSave();
    } catch (e) { toastr.error(String(e?.message ?? e), '미트볼폰 선택지'); }
    finally { gst.busy = null; }
}

// 탭 본문: 선택지와 같은 목록 모양 (지금 고를 수 있는 답에서만)
export const guideItems = (i, sec) => ctx().chat?.[i]?.extra?.mbcGuide?.[sec] ?? [];
export function guideRows(i, sec) {
    const list = guideItems(i, sec);
    const busy = gst.busy && (gst.busy === 'all' || gst.busy === sec);
    if (busy) return `<div class="mbc-gempty">받는 중…</div>`;
    if (!list.length) return `<div class="mbc-gempty"><span>${esc(SECTIONS[sec].desc)}</span><button class="mbc-go sm" data-mbc-act="guideGo" data-g="${sec}">받기 <small>(AI 1회)</small></button></div>`;
    return `<div class="mbc-list">${list.map((x, n) => `<div class="mbc-opt g ro"><span class="mbc-kind"><span class="ic">${SECTIONS[sec].icon}</span></span><span class="mbc-label">${esc(sec === 'route' ? x.title : sec === 'spoil' ? x.act : x.text)}${sec === 'route' && x.why ? `<span class="mbc-cost">${esc(x.why)}</span>` : sec === 'spoil' && x.then ? `<span class="mbc-cost">→ ${esc(x.then)}</span>` : ''}</span></div>`).join('')}</div>`;
}
// 옆 동그라미용 (알약 글)
export const guideLabel = (sec, x) => sec === 'route' ? x.title : sec === 'spoil' ? `${x.act}${x.then ? ` → ${x.then}` : ''}` : x.text;
