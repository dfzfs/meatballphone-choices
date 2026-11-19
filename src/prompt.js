// 본편 주입 · 답에서 선택지 읽기 · 지난 선택지 옮기기 · 다시 받기 글
import { settings, ctx, rng, pickW, kindOf, riskOf, kindsOn, risksOn, clamp, meta, userCount, lite, liteState, liteLuck, liteScene, liteMode, setExtra } from './core.js';
import { RESULT } from './data.js';
import * as DATA from './data.js';

export const INJECT_KEY = 'mb_choices';

// 이번 턴 위험 순서 (같은 턴이면 같은 결과)
export function riskPlan(seed) {
    const n = settings().count;
    const r = rng(`plan:${ctx().chatId ?? ''}:${seed}`);
    const list = risksOn().length ? risksOn() : [riskOf('none')];
    const R = Array.from({ length: n }, () => pickW(r, list, x => x.w).id);
    if (R.every(x => x === 'gamble' || x === 'price') && list.some(x => x.id === 'none')) R[Math.floor(r() * n)] = 'none';
    return R;
}

// 라이트가 있으면 지금 장면 한 줄 (같이 있는 사람 · 장소 · 살 수 있는 것 · 급한 욕구 · 원하는 것 · 오늘 운세)
export function sceneLine() {
    if (!lite()) return '';
    const st = liteState(); if (!st) return '';
    const P = [];
    if (st.loc) P.push(`at ${st.loc}`);
    if (st.with?.length) P.push(`with ${st.with.join(', ')}`);
    const urgent = (st.danger ?? []).filter(d => d.stage === '위험' || d.stage === '주의').slice(0, 2).map(d => `${d.name} ${d.stage === '위험' ? 'critical' : 'low'}`);
    if (urgent.length) P.push(`urgent: ${urgent.join(', ')}`);
    const sc = liteScene();
    if (sc?.goods?.length) P.push(`can buy here: ${sc.goods.slice(0, 4).map(g => g.name).join(', ')}`);
    const wants = (sc?.people ?? []).filter(p => p.want && st.with?.includes(p.name)).slice(0, 2);
    if (wants.length) P.push(`wants: ${wants.map(p => `${p.name} — ${p.want}`).join('; ')}`);
    const lk = liteLuck();
    if (lk?.rolled && lk.good) P.push(`today's luck favors: ${lk.good}${lk.bad ? `, avoid: ${lk.bad}` : ''}`);
    return P.length ? `Ground the options in the current scene (${P.join(' · ')}).` : '';
}

function resultText(p) {
    if (!p) return '';
    const k = kindOf(p.kind), rk = riskOf(p.risk);
    const L = [`[CHOICE RESULT] {{user}}'s message above is the option they chose${k ? ` (${k.ai})` : ''}.`];
    if (p.check) {
        const c = p.check;
        L.push(`Dice: d20 ${c.roll} ${c.mod >= 0 ? '+' : '−'}${Math.abs(c.mod)} vs DC ${c.dc} → ${c.crit ? 'CRITICAL SUCCESS' : c.fumble ? 'CRITICAL FAILURE' : c.ok ? 'SUCCESS' : 'FAILURE'}. The outcome MUST follow this result.`);
        L.push(c.crit ? RESULT.crit : c.fumble ? RESULT.fumble : c.ok ? RESULT.win : RESULT.lose);
    }
    if (rk.id === 'price') L.push(RESULT.price);
    if (rk.id === 'trap') L.push(RESULT.trap);
    const B = liteMode() === 'B';
    if (k?.res && !B) L.push(k.res);
    if (L.length === 1) return '';
    // A: 본편이 사건 줄을 씀 · B: 분류 모델이 고른 기록(mbc)을 읽어 사건을 고름 → 이야기로만 보여 주게
    L.push(B ? 'Show the outcome clearly in the story itself.' : lite() ? 'Record what actually happens as event lines in your <meatball> block — events, not numbers.' : '');
    return L.filter(Boolean).join(' ');
}

export function buildPrompt(seed, pending) {
    const set = settings();
    if (!set.enabled) return '';
    const plan = riskPlan(seed);
    const L = [];
    const res = resultText(pending);
    if (res) L.push(res);
    L.push(`[CHOICES] End your reply${liteMode() === 'B' ? '' : ' (before any <meatball> block)'} with exactly ${plan.length} options for {{user}}'s next action inside <choices>…</choices>, written in the same language as the story, one per line: [kind|risk] option text.`);
    L.push(`Risks in this order: ${plan.map(r => `[${r}]`).join(' ')}. For each line pick the kind that best fits the moment.`);
    L.push('Kinds: ' + kindsOn().map(k => `${k.id} = ${k.ai}`).join('; ') + '.');
    const usedR = [...new Set(plan)].map(riskOf).filter(r => r.id !== 'none');
    if (usedR.length) L.push('Risks: ' + usedR.map(r => `${r.id} = ${r.ai}`).join('; ') + '; none = ordinary stakes.');
    L.push('Each option: one concrete action {{user}} can take right now, under 50 characters, clearly different from the others (not the same action in another tone). No explanations, no numbering.');
    const sc = sceneLine(); if (sc) L.push(sc);
    return L.join('\n');
}
export function setInject(text) {
    try { ctx().setExtensionPrompt(INJECT_KEY, text ?? '', 1, clamp(Number(settings().depth) || 0, 0, 10), false, 0); } catch (e) { console.warn('[미트볼 선택지]', e); }
}
export const injectTokens = () => Math.round(buildPrompt(userCount() + 1, null).length / 3.2);
export const sceneTokens = () => Math.round(sceneLine().length / 3.2);

// 결과 지시는 「고른 바로 다음 답」 한 번에만: 만들 답 바로 앞 메시지가 고른 기록이 있는 내 메시지일 때
const inputHas = (p) => { const v = document.getElementById('send_textarea')?.value ?? ''; return !!p && !!v.trim() && v.includes(p.label.slice(0, 8)); };
export function pickBefore(type) {
    const chat = ctx().chat ?? [];
    const prev = type === 'swipe' ? chat[chat.length - 2] : chat[chat.length - 1];
    return prev?.is_user ? prev.extra?.mbc ?? null : null;
}
export function onBeforeGen(type, _params, dryRun) {
    if (dryRun) return;
    if (!settings().enabled || ['quiet', 'impersonate', 'continue'].includes(type)) { setInject(''); return; }
    const typed = (type === 'normal' || !type) && !!(document.getElementById('send_textarea')?.value ?? '').trim();
    const pending = typed ? (inputHas(meta().pending) ? meta().pending : null) : pickBefore(type);
    setInject(buildPrompt(userCount() + (typed ? 1 : 0), pending));
}

// ───── 답에서 선택지 읽기 ─────
export const NUM_RE = /^\s*(?:[-*•·]\s*)?(?:\d{1,2}|[①-⑫]|[a-fA-F])\s*[.)．:、]\s*/;
export const TAG_RE = /^\s*[\[【〔]\s*([^\]】〕|｜/]{1,24})\s*(?:[|｜/]\s*([^\]】〕]{1,24}))?\s*[\]】〕]\s*/;
const idIn = (w, list) => { const x = String(w ?? '').trim().toLowerCase(); return x ? list.find(it => it.id === x || it.name === x)?.id ?? null : null; };
export function parseBlock(text) {
    if (!text) return null;
    const mm = String(text).match(/<choices>([\s\S]*?)(?:<\/choices>|<meatball>|<status>|$)/i);
    if (!mm) return null;
    const { KINDS, RISKS } = DATA;
    const items = [];
    for (const raw of mm[1].split(/\n+/).map(s => s.trim()).filter(Boolean)) {
        let t = raw.replace(NUM_RE, ''), kind = null, risk = null;
        const tg = t.match(TAG_RE);
        if (tg) { kind = idIn(tg[1], KINDS) ?? idIn(tg[2], KINDS); risk = idIn(tg[2], RISKS) ?? idIn(tg[1], RISKS); if (kind || risk) t = t.replace(TAG_RE, ''); }
        t = t.replace(NUM_RE, '').replace(/\s*[(（]\s*대가\s*[:：][^)）]*[)）]\s*$/, '').trim(); // 대가는 배지로만
        let gloss = null; const gi = t.indexOf('||'); if (gi >= 0) { gloss = t.slice(gi + 2).trim() || null; t = t.slice(0, gi).trim(); }
        if (t) items.push({ kind, risk, label: t, gloss, raw });
    }
    return items.length ? items.slice(0, 6) : null;
}
// 지금 스와이프의 선택지 (본문에 있으면 본문, 옮겨 뒀으면 extra)
export function choicesOf(i) {
    const m = ctx().chat?.[i];
    if (!m || m.is_user || m.is_system) return null;
    const raw = parseBlock(m.mes) ?? parseBlock(m.extra?.mbcBlock);
    const shown = parseBlock(m.extra?.display_text) ?? parseBlock(m.extra?.mbcShown) ?? raw;
    if (!shown) return null;
    const plan = riskPlan(userCount(i));
    return shown.map((it, k) => ({
        ...it,
        label: it.gloss ?? it.label,
        orig: raw?.[k]?.label ?? it.label, // 입력창에 넣을 원문 (번역 전)
        origRaw: raw?.[k]?.raw ?? null,
        kind: it.kind ?? raw?.[k]?.kind ?? 'rational',
        risk: it.risk ?? raw?.[k]?.risk ?? plan[k] ?? 'none',
    }));
}

// ───── 지난 선택지를 본문에서 빼서 그 메시지(스와이프마다) extra로 옮기기 ─────
const BLOCK = /\s*<choices>[\s\S]*?(?:<\/choices>|(?=<meatball>|<status>)|$)/i;
const cut = (t) => { if (typeof t !== 'string' || !/<choices>/i.test(t)) return null; const b = t.match(BLOCK)?.[0]; return b ? { block: b.trim(), rest: t.replace(BLOCK, '').trimEnd() } : null; };
export function tuck(m) {
    if (!m || m.is_user || typeof m.mes !== 'string') return false;
    let changed = false;
    // 다른 스와이프들
    if (Array.isArray(m.swipes)) m.swipes.forEach((sw, k) => {
        if (k === m.swipe_id) return;
        const c = cut(sw); if (!c) return;
        m.swipes[k] = c.rest;
        m.swipe_info ??= []; m.swipe_info[k] ??= {}; const ex = (m.swipe_info[k].extra ??= {});
        ex.mbcBlock = c.block;
        const d = cut(ex.display_text); if (d) { ex.mbcShown = d.block; ex.display_text = d.rest; }
        changed = true;
    });
    // 지금 스와이프
    const c = cut(m.mes);
    if (c) {
        m.mes = c.rest;
        if (Array.isArray(m.swipes) && Number.isInteger(m.swipe_id)) m.swipes[m.swipe_id] = m.mes;
        const patch = { mbcBlock: c.block };
        const d = cut(m.extra?.display_text); if (d) { patch.mbcShown = d.block; patch.display_text = d.rest; }
        setExtra(m, patch);
        changed = true;
    }
    return changed;
}
// AI에게 가는 글에서도 한 번 더 빼기 (이어쓰기 등 본문에 남은 경우 · 이 확장 안내의 「<choices>…</choices>」는 남김)
export function stripOld(text) {
    return String(text ?? '').replace(/<choices>([\s\S]*?)(?:<\/choices>|(?=<meatball>|<status>)|$)/gi, (m, body) => { const b = body.trim(); return b.length < 3 || b === '…' ? m : ''; });
}

// ───── 🔄 선택지만 다시 받기 (추가 지시 · 바로 전 선택지만 피하게) ─────
export function rerollPrompt(i, prev, extra, gloss) {
    const k = (ctx().chat?.[i]?.extra?.mbcRe ?? 0) + 1;
    const plan = riskPlan(`${userCount(i)}:r${k}`);
    const L = [
        "[TASK] Do NOT continue the story. Write fresh options for {{user}}'s next action at this exact moment (right after the last reply).",
        `Output ONLY a <choices>…</choices> block with exactly ${plan.length} lines, each: [kind|risk] option text — in the same language as the story.`,
        `Risks in this order: ${plan.map(r => `[${r}]`).join(' ')}. Kinds: ${kindsOn().map(x => `${x.id} = ${x.ai}`).join('; ')}.`,
    ];
    const usedR = [...new Set(plan)].map(riskOf).filter(r => r.id !== 'none');
    if (usedR.length) L.push('Risks: ' + usedR.map(r => `${r.id} = ${r.ai}`).join('; ') + '.');
    if (prev?.length) L.push(`Do not repeat these options: ${prev.map(x => `"${x}"`).join(', ')}.`);
    if (extra) L.push(`Player's extra direction: ${extra}`);
    const sc = sceneLine(); if (sc) L.push(sc);
    if (gloss) L.push('After each option add " || " and a natural Korean translation of it.');
    L.push('Each option: one concrete action under 50 characters, clearly different from the others.');
    return L.join('\n');
}
