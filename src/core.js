// 설정 · 채팅 기록 · 미트볼폰 읽기 · 주사위
import { KINDS, RISKS, DCS } from './data.js';

export const MODULE = 'mbChoices';
export const LOG = '[미트볼폰 선택지]';
export const ctx = () => SillyTavern.getContext();
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SET_V = 3;
export const DEFAULTS = Object.freeze({
    enabled: true,
    count: 4,            // 3~6
    confirm: true,       // 한 번 눌러 설명 · 확률을 보고 「이걸로」
    click: 'fill',       // fill · send
    input: 'raw',        // raw = 원문(번역 전) · shown = 화면 글
    depth: 1,
    gen: 'ask',          // ask = 눌러야 받음 (본편에 선택지 지시를 안 넣음 · 누를 때 AI 1회) · auto = 매 답마다 본편이 같이 씀
    sideX: 'auto',       // 옆 동그라미 가로 자리: auto · right · left
    sideY: 'msg',        // 세로 자리: msg(마지막 답 옆) · top · middle · bottom
    view: 'list',        // list = 답 밑 목록 · side = 채팅 옆 「?」 동그라미 → 올리면 부채꼴 (좁은 화면은 목록)
    kinds: Object.fromEntries(KINDS.map(k => [k.id, true])),
    risks: Object.fromEntries(RISKS.map(r => [r.id, !r.off])), // 함정은 기본 끔
    guide: { route: true, facts: true, spoil: true }, // 🧭 추천에서 받을 칸
});

let _ok = null;
export function settings() {
    const es = ctx().extensionSettings;
    es[MODULE] ??= {};
    const s = es[MODULE];
    if (_ok === s) return s;
    if (s._v !== SET_V) migrate(s);
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = typeof v === 'object' ? { ...v } : v;
    for (const k of KINDS) s.kinds[k.id] ??= true;
    for (const r of RISKS) s.risks[r.id] ??= !r.off;
    s.guide = { ...DEFAULTS.guide, ...(s.guide ?? {}) };
    s.count = clamp(Number(s.count) || 4, 3, 6);
    _ok = s;
    return s;
}
// 옛 설정(v0.1 · v0.2~0.3.6)에서 남길 것만 옮기고 나머지 키는 지운다
function migrate(s) {
    const keep = {};
    for (const k of ['enabled', 'confirm', 'click', 'input', 'depth']) if (s[k] !== undefined) keep[k] = s[k];
    if (s.layout === 'ring') keep.view = 'side'; // 옛 판에서 고리 메뉴를 쓰던 사람
    if (s.count !== undefined) keep.count = clamp(Number(s.count) || 4, 3, 6);
    if (Array.isArray(s.kinds)) keep.kinds = Object.fromEntries(KINDS.map(k => [k.id, s.kinds.find(x => x.id === k.id)?.on !== false]));
    if (Array.isArray(s.risks)) keep.risks = Object.fromEntries(RISKS.map(r => [r.id, r.off ? false : s.risks.find(x => x.id === r.id)?.on !== false]));
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, keep, { _v: SET_V });
    ctx().saveSettingsDebounced?.();
}
export const save = () => ctx().saveSettingsDebounced();
export const kindOf = (id) => KINDS.find(k => k.id === id) ?? null;
export const riskOf = (id) => RISKS.find(r => r.id === id) ?? RISKS[0];
export const kindsOn = () => KINDS.filter(k => settings().kinds[k.id] !== false);
export const risksOn = () => RISKS.filter(r => r.off ? settings().risks[r.id] === true : settings().risks[r.id] !== false);

// 고르는 중인 선택 (보내기 전) — 보내면 그 사용자 메시지 extra로 옮겨진다
export function meta() {
    const md = ctx().chatMetadata;
    if (!md) return { pending: null };
    if (!md[MODULE] || Object.keys(md[MODULE]).some(k => k !== 'pending')) md[MODULE] = { pending: md[MODULE]?.pending ?? null }; // 옛 키(reset 등) 정리
    return md[MODULE];
}
// ───── 저장: 한 군데서만 (윈도우에서 실리태번 저장과 겹치면 EPERM rename 실패) ─────
// 1. 답을 받는 중엔 절대 저장 안 함  2. saveChat() 직접 X → saveChatDebounced()만
// 3. 답이 끝나면 1초 뒤(실리태번 자체 저장이 끝난 뒤) 한 번만  4. 본문(mes) 고치기도 그때 한 번에
const SV = { gen: false, want: false, t: 0, jobs: [] };
const SETTLE_MS = 1000;
export const isGenerating = () => SV.gen;
function flush() {
    if (SV.gen) return;
    for (const job of SV.jobs.splice(0)) { try { if (job()) SV.want = true; } catch (e) { console.warn(LOG, e); } }
    if (!SV.want) return;
    SV.want = false;
    const c = ctx(); c.saveChatDebounced?.call(c);
}
const schedule = () => { clearTimeout(SV.t); SV.t = setTimeout(flush, SETTLE_MS); };
export function requestSave() { SV.want = true; if (!SV.gen) schedule(); }
// 본문을 고치는 일: 답이 끝난 뒤 1초에 한 번에 (job이 true를 돌려주면 저장)
export function afterReply(job) { SV.jobs.push(job); if (!SV.gen) schedule(); }
export function genStarted() { SV.gen = true; clearTimeout(SV.t); }
export function genEnded() { if (!SV.gen && !SV.jobs.length && !SV.want) return; SV.gen = false; schedule(); }
export const saveMeta = requestSave; // chatMetadata는 채팅과 함께 저장됨 (saveMetadata를 따로 부르지 않음)

// 메시지 extra 고치기 — 지금 스와이프의 swipe_info에도 같이 (스와이프를 넘겨도 맞게)
export function setExtra(m, patch) {
    m.extra = { ...(m.extra ?? {}), ...patch };
    const si = Number.isInteger(m.swipe_id) ? m.swipe_info?.[m.swipe_id] : null;
    if (si) si.extra = { ...(si.extra ?? {}), ...patch };
}

export function rng(seed) {
    let a = 0;
    for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0);
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const pickW = (r, list, wOf) => { const t = list.reduce((a, x) => a + Math.max(0, wOf(x)), 0); if (t <= 0) return list[0]; let x = r() * t; return list.find(it => (x -= Math.max(0, wOf(it))) < 0) ?? list[list.length - 1]; };

// ───── 미트볼폰 (읽기만) ─────
export function lite() { try { const L = globalThis.MeatballPhone ?? globalThis.MeatballLite; return L && (L.ready?.() ?? true) ? L : null; } catch { return null; } }
const call = (fn, ...a) => { try { return fn?.(...a) ?? null; } catch { return null; } };
let _st = null, _stAt = 0;
export function liteState() {
    const L = lite(); if (!L) return null;
    const now = Date.now();
    if (now - _stAt > 300) { _st = call(L.state); _stAt = now; }
    return _st;
}
export const liteClear = () => { _stAt = 0; };
export const liteLuck = (label = '') => call(lite()?.luck, label);
export const litePreview = (label) => call(lite()?.preview, label);
export const liteScene = () => call(lite()?.scene);
// 라이트 모드: A = 본편 AI가 <meatball> 사건 줄을 씀 · B = 분류 모델이 사건을 고름 (mode()가 없으면 A)
export const liteMode = () => { const L = lite(); if (!L) return null; const m = String(call(L.mode) ?? 'A').toUpperCase(); return m.startsWith('B') ? 'B' : 'A'; }; // 라이트가 열면: { goods: [{ name, price }], people: [{ name, want }] }

// ───── 주사위: d20 + 라이트 diceParts() + 오늘 운세 ─────
export function checkFor(kindId, riskId, seed, label = '') {
    const k = kindOf(kindId), rk = riskOf(riskId);
    if (!(rk?.check || k?.check)) return null;
    const L = lite(), st = liteState();
    const parts = [];
    let attr = '';
    if (st?.attrs) for (const w of String(k?.attr ?? '').split(',').map(s => s.trim()).filter(Boolean)) { attr = Object.keys(st.attrs).find(a => a.includes(w)) ?? ''; if (attr) break; }
    for (const p of call(L?.diceParts, attr) ?? []) if (Number(p.n)) parts.push([p.why, Number(p.n)]);
    const f = liteLuck(label)?.fit ?? 0;
    if (f) parts.push([f > 0 ? '🍀 오늘 운세' : '⚠ 오늘 운세', f * (kindId === 'fate' ? 4 : 2)]); // 운에 맡기면 운세가 두 배
    const [dcName, dc] = DCS[Math.floor(rng(`dc:${seed}`)() * DCS.length)];
    const mod = parts.reduce((a, p) => a + p[1], 0);
    let ok = 1; for (let n = 2; n <= 19; n++) if (n + mod >= dc) ok++;
    return { mod, parts, dc, dcName, pct: Math.round(ok / 20 * 100) };
}
export function rollCheck(ch, seed) {
    const roll = 1 + Math.floor(rng(`roll:${seed}`)() * 20);
    const crit = roll === 20, fumble = roll === 1;
    return { ...ch, roll, crit, fumble, ok: crit || (!fumble && roll + ch.mod >= ch.dc) };
}

let _uc = { chat: null, len: -1, pre: [] };
export function userCount(end = Infinity) {
    const chat = ctx().chat ?? [];
    if (_uc.chat !== chat || _uc.len !== chat.length) { const pre = [0]; for (const m of chat) pre.push(pre[pre.length - 1] + (m.is_user ? 1 : 0)); _uc = { chat, len: chat.length, pre }; }
    return _uc.pre[Math.min(end, chat.length)];
}
