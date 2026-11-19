// 본편 주입 · 답에서 선택지 읽기
import { settings, ctx, rng, pickW, kindOf, riskOf, clamp, heatAt, stageOf, mbState, urgentNeeds, meta, userCount, lastUserPick, lite } from './core.js';
import { RESULT, SEV } from './data.js';

export const INJECT_KEY = 'mb_choices';

// 이번 턴의 위험 순서 (+ plan 모드면 성향도)
export function planFor(seed, stage) {
    const set = settings();
    const r = rng(`plan:${ctx().chatId ?? ''}:${seed}`);
    const n = set.count > 0 ? clamp(set.count, 2, 12) : 3 + Math.floor(r() * 3);
    const danger = set.danger.on;
    const risks = set.risks.filter(x => x.on);
    const rw = (x) => x.w + (danger ? ({ trap: stage, cursed: stage >= 2 ? 1 : 0, safe: stage >= 3 ? -1 : 0 }[x.id] ?? 0) : 0);
    const R = Array.from({ length: n }, () => pickW(r, risks.length ? risks : [riskOf('none')], rw).id);
    if (R.every(x => x !== 'none' && x !== 'safe') && stage < 3) R[Math.floor(r() * n)] = 'none';
    // 성향: 겹치지 않게 (모자라면 겹침)
    const pool = set.kinds.filter(k => k.on && k.w > 0);
    const K = [];
    let left = pool.slice();
    for (let i = 0; i < n; i++) { if (!left.length) left = pool.slice(); if (!left.length) break; const k = pickW(r, left, x => x.w); K.push(k.id); left = left.filter(x => x !== k); }
    return { n, risks: R, kinds: K };
}

function needHint() {
    const u = urgentNeeds(mbState()).slice(0, 3);
    return u.length ? ` (now most urgent: ${u.map(g => `${g.name} ${g.cur}/${g.max}`).join(', ')})` : '';
}
function resultText(p, stage) {
    if (!p) return '';
    const set = settings();
    const sev = SEV[set.danger.on ? stage : 0];
    const k = kindOf(p.kind), rk = riskOf(p.risk);
    const L = [`[CHOICE RESULT] {{user}} chose "${p.label}"${k ? ` (${k.ai.replace('{{user}}', '{{user}}')})` : ''}.`];
    if (p.check) {
        const c = p.check;
        L.push(`Dice: d20 ${c.roll} ${c.mod >= 0 ? '+' : '−'}${Math.abs(c.mod)} vs DC ${c.dc} → ${c.crit ? 'CRITICAL SUCCESS' : c.fumble ? 'CRITICAL FAILURE' : c.ok ? 'SUCCESS' : 'FAILURE'}. The outcome MUST follow this result.`);
        L.push(c.crit ? RESULT.crit() : c.fumble ? RESULT.fumble(sev) : c.ok ? RESULT.win() : RESULT.lose(sev));
    }
    if (RESULT[rk?.id]) L.push(RESULT[rk.id](sev));
    if (k?.res) L.push(k.res);
    if (L.length > 1 || p.check) L.push(lite()
        ? 'Record what actually happens as event lines in your <meatball> block (status: / cash: / item: / act: …) — events, not numbers.'
        : 'If you write a <meatball> status block, record the effects there (stat / cash / item / cond / aff lines).');
    return L.join(' ');
}

export function buildPrompt(seed, pending) {
    const set = settings();
    if (!set.enabled) return '';
    const stage = set.danger.on ? stageOf(heatAt(Infinity, pending)) : 0;
    const plan = planFor(seed, stage);
    const L = [];
    const res = resultText(pending, stage);
    if (res) L.push(res);
    const fmt = 'one per line, formatted exactly: [kind|risk] option text';
    L.push(`[CHOICES] End your narration (before any <meatball> block) with exactly ${plan.n} options for {{user}}'s next action, written in the same language as your narration, inside <choices>…</choices>, ${fmt}.`);
    const usedK = set.kindMode === 'plan' ? [...new Set(plan.kinds)].map(kindOf).filter(Boolean) : set.kinds.filter(k => k.on && k.w > 0);
    if (set.kindMode === 'plan') L.push(`Slots in this order: ${plan.kinds.map((k, i) => `[${k}|${plan.risks[i]}]`).join(' ')}.`);
    else L.push(`Risks in this order: ${plan.risks.map(r => `[${r}]`).join(' ')}. For each line choose the kind that best fits the moment (each kind at most once, all options clearly different).`);
    L.push('Kinds: ' + usedK.map(k => `${k.id} = ${k.ai}${k.id === 'need' ? needHint() : ''}`).join('; ') + '.');
    const usedR = [...new Set(plan.risks)].map(riskOf).filter(r => r && r.id !== 'none');
    if (usedR.length) L.push('Risks: ' + usedR.map(r => `${r.id} = ${r.ai}`).join('; ') + '; none = ordinary stakes.');
    L.push('Each option: one short, concrete action (under ~50 characters). No explanations, no numbering outside the brackets.');
    if (set.danger.on && stage) L.push(`Danger ${stage}/3 (${['', 'uneasy', 'dangerous', 'catastrophic'][stage]}): the world is growing hostile; traps are nastier and safe options cost more.`);
    L.push(`Example:\n<choices>\n[${plan.kinds[0] ?? 'rational'}|${plan.risks[0]}] …\n[${plan.kinds[1] ?? 'careful'}|${plan.risks[1] ?? 'none'}] …\n</choices>`);
    return L.join('\n');
}

export function setInject(text) {
    try { ctx().setExtensionPrompt(INJECT_KEY, text ?? '', 1, clamp(Number(settings().depth) || 0, 0, 10), false, 0); } catch (e) { console.warn('[미트볼 선택지]', e); }
}
const inputHas = (p) => { const v = document.getElementById('send_textarea')?.value ?? ''; return !!p && !!v.trim() && v.includes(p.label.slice(0, 8)); };
export function onBeforeGen(type, _params, dryRun) {
    if (dryRun) return;
    if (!settings().enabled || ['quiet', 'impersonate', 'continue'].includes(type)) { setInject(''); return; }
    let pending = null, seed = userCount();
    if (type === 'normal' || !type) {
        const typed = (document.getElementById('send_textarea')?.value ?? '').trim();
        if (typed) { seed += 1; pending = inputHas(meta().pending) ? meta().pending : null; } else pending = lastUserPick();
    } else pending = lastUserPick();
    setInject(buildPrompt(seed, pending));
}

// ───── 답에서 선택지 읽기 ─────
const NUM_RE = /^\s*(?:[-*•·]\s*)?(?:\d{1,2}|[①-⑫]|[a-fA-F])\s*[.)．:、]\s*/;
const TAG_RE = /^\s*[\[【〔]\s*([^\]】〕|｜/]{1,24})\s*(?:[|｜/]\s*([^\]】〕]{1,24}))?\s*[\]】〕]\s*/;
function idFor(word, list) {
    const w = String(word ?? '').trim().toLowerCase();
    if (!w) return null;
    return list.find(x => x.id.toLowerCase() === w || x.name.toLowerCase() === w)?.id ?? null;
}
export function parseBlock(text) {
    if (!text) return null;
    const mm = String(text).match(/<choices>([\s\S]*?)(?:<\/choices>|$)/i);
    if (!mm) return null;
    const set = settings();
    const items = [];
    for (const raw of mm[1].split(/\n+/).map(s => s.trim()).filter(Boolean)) {
        let t = raw.replace(NUM_RE, '');
        let kind = null, risk = null;
        const tg = t.match(TAG_RE);
        if (tg) {
            const a = tg[1], b = tg[2];
            kind = idFor(a, set.kinds) ?? idFor(b, set.kinds);
            risk = idFor(b, set.risks) ?? idFor(a, set.risks);
            if (kind || risk) t = t.replace(TAG_RE, '');
        }
        t = t.replace(NUM_RE, '').trim();
        if (t) items.push({ kind, risk, label: t, raw });
    }
    return items.length ? items.slice(0, 12) : null;
}
export function choicesOf(i) {
    const m = ctx().chat?.[i];
    if (!m || m.is_user || m.is_system) return null;
    const raw = parseBlock(m.mes);
    const shown = parseBlock(m.extra?.display_text) ?? raw; // 번역 확장이 만든 글(한국어)이 있으면 그걸 보여 준다
    if (!shown) return null;
    const need = shown.some((it, k) => !(it.kind ?? raw?.[k]?.kind) || !(it.risk ?? raw?.[k]?.risk));
    const plan = need ? planFor(userCount(i), 0) : { kinds: [], risks: [] };
    return shown.map((it, k) => ({
        ...it,
        kind: it.kind ?? raw?.[k]?.kind ?? plan.kinds[k] ?? 'rational',
        risk: it.risk ?? raw?.[k]?.risk ?? plan.risks[k] ?? 'none',
    }));
}
export { NUM_RE, TAG_RE };
