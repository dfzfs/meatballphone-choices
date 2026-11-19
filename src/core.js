// 설정 · 채팅 기록 · 미트볼 읽기 · 운세 · 주사위
import { KINDS, RISKS, WHISPERS, DCS, LUCK } from './data.js';

export const MODULE = 'mbChoices';
export const LOG = '[미트볼 선택지]';
export const ctx = () => SillyTavern.getContext();
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));

export const DEFAULTS = {
    enabled: true,
    count: 5,            // 2~12 · 0 = AI가 3~5개
    kindMode: 'ai',      // ai: AI가 상황에 맞는 성향을 고름 · plan: 확장이 정함
    layout: 'ring',      // ring(고리 메뉴) · list · cards
    confirm: true,       // 한 번 눌러 자세히 보고 「이걸로」로 고르기
    click: 'fill',       // fill · send
    input: 'raw',        // raw = 원문(번역 전) · shown = 화면에 보이는 글
    past: 'chip',        // chip = 고른 것만 칩으로 · delete = 지우기
    hideOld: true,       // 지난 <choices>는 AI에게 안 보냄
    depth: 1,
    kinds: clone(KINDS).map(k => ({ on: true, heat: 0, fx: [], res: '', check: false, ...k })),
    risks: clone(RISKS).map(r => ({ on: true, show: 'show', fx: [], check: false, ...r })),
    danger: { on: false, decay: 2, th: [25, 50, 75], stages: { 1: ['vignette', 'glitch'], 2: ['vignette', 'pulse', 'crt', 'glitch', 'whisper', 'swap'], 3: ['pulse', 'tear', 'flicker', 'redact', 'dodge', 'static', 'rot', 'glitch', 'timer'] } },
    fx: { scope: 'panel', k: 1, burst: true, whispers: WHISPERS },
    timer: { sec: 25, expire: 'random' }, // random · worst · none
    luck: { on: true },
    dice: { on: true, gaugePenalty: true },
    look: { theme: 'auto', accent: '', radius: 14, size: 100, opacity: 94 },
};

function fill(dst, src) {
    for (const [k, v] of Object.entries(src)) {
        if (dst[k] === undefined) dst[k] = clone(v);
        else if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') fill(dst[k], v);
    }
}
let _ok = null; // 한 번 채운 설정 객체 (매번 채우면 긴 채팅에서 느림)
export function settings() {
    const es = ctx().extensionSettings;
    es[MODULE] ??= {};
    const s = es[MODULE];
    if (_ok === s) return s;
    if (s._v !== 2) { for (const k of Object.keys(s)) delete s[k]; s._v = 2; } // v0.1 설정은 버린다 (구조가 다름)
    fill(s, DEFAULTS);
    // 기본 성향 · 위험이 새로 생기면 붙인다 (지운 기본은 _gone에 남겨 다시 안 붙임)
    s._gone ??= [];
    for (const k of DEFAULTS.kinds) if (!s.kinds.some(x => x.id === k.id) && !s._gone.includes(k.id)) s.kinds.push(clone(k));
    for (const r of DEFAULTS.risks) if (!s.risks.some(x => x.id === r.id)) s.risks.push(clone(r));
    _ok = s;
    return s;
}
export const save = () => ctx().saveSettingsDebounced();
export const kindOf = (id) => settings().kinds.find(k => k.id === id) ?? null;
export const riskOf = (id) => settings().risks.find(r => r.id === id) ?? settings().risks.find(r => r.id === 'none');

export function meta() {
    const md = ctx().chatMetadata;
    if (!md) return { pending: null, reset: -1 };
    md[MODULE] ??= { pending: null, reset: -1 };
    return md[MODULE];
}
export const saveMeta = () => { const c = ctx(); (c.saveMetadataDebounced ?? c.saveMetadata)?.call(c); };

export function rng(seed) {
    let a = 0;
    for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0);
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const pickW = (r, list, wOf) => { const t = list.reduce((a, x) => a + Math.max(0, wOf(x)), 0); if (t <= 0) return list[0]; let x = r() * t; return list.find(it => (x -= Math.max(0, wOf(it))) < 0) ?? list[list.length - 1]; };

// ───── 미트볼 라이트 읽기 통로 (있으면 이걸 먼저) ─────
export function lite() { try { const L = globalThis.MeatballLite; return L && (L.ready?.() ?? true) ? L : null; } catch { return null; } }
let _mb = null, _mbAt = 0;
export function mbClear() { _mb = null; }
// ───── 미트볼 상태: 라이트 통로 → 없으면 dev 미트볼 주입 글에서 ─────
export function mbState() {
    const now = Date.now();
    if (_mb !== null && now - _mbAt < 400) return _mb || null;
    _mbAt = now; _mb = readMb() ?? false;
    return _mb || null;
}
function readMb() {
    const L = lite();
    if (L) {
        let s = null; try { s = L.state?.(); } catch { s = null; }
        if (s) {
            const dz = s.danger ?? [];
            const nameOf = (k) => dz.find(d => d.key === k)?.name ?? k;
            const gauges = Object.entries(s.needs ?? {}).map(([k, v]) => ({ name: nameOf(k), key: k, cur: Math.round(Number(v) || 0), max: 100 }));
            const attrs = Array.isArray(s.attrs) ? s.attrs : Object.entries(s.attrs ?? {}).map(([name, val]) => ({ name, val: Number(val) || 0 }));
            return { lite: true, gauges, attrs, conds: (s.status ?? []).map(x => x.name), money: s.cash != null ? `${s.cash} ${s.currency ?? ''}` : '', date: s.date ?? '', danger: dz };
        }
    }
    const c = ctx();
    const txt = String(c.extensionPrompts?.statussim_state?.value ?? '');
    if (!txt) return null;
    const line = (re) => txt.match(re)?.[1] ?? '';
    const gauges = line(/gauges:\s*([^\n]+)/).split('·').map(s => s.trim().match(/^(.+?)\s+(-?[\d,.]+)\s*\/\s*([\d,.]+)/)).filter(Boolean)
        .map(m => ({ name: m[1].trim(), cur: Number(m[2].replace(/,/g, '')), max: Number(m[3].replace(/,/g, '')) || 100 }));
    const attrs = line(/attributes:\s*([^\n]+)/).split('·').map(s => s.trim().match(/^(.+?)\s+([+-]?\d+)/)).filter(Boolean)
        .map(m => ({ name: m[1].trim(), val: Number(m[2]) }));
    const conds = line(/Conditions:\s*([^\n]+)/).split(',').map(s => s.trim()).filter(Boolean);
    const money = line(/Money:\s*([^·\n]+)/).trim();
    const date = txt.match(/(\d{1,4}년\s*)?\d{1,2}월\s*\d{1,2}일/)?.[0] ?? txt.match(/Day\s*\d+/i)?.[0] ?? '';
    return { gauges, attrs, conds, money, date };
}
// 라이트 오늘 운세: 이 글과 맞으면 1 · 조심할 행동이면 −1
export function liteLuck(label = '') { const L = lite(); if (!L?.luck) return null; try { return L.luck(label); } catch { return null; } }
// 낮은 게이지 (오르는 게이지 — 스트레스 · 공포 등 — 는 높을 때)
const UP_BAD = /스트레스|공포|피로도|오염|지루|stress|fear/i;
export function urgentNeeds(st) {
    if (!st?.gauges?.length) return [];
    return st.gauges.map(g => {
        const p = g.max ? g.cur / g.max : 1;
        const bad = UP_BAD.test(g.name) ? p : 1 - p;
        return { ...g, p, bad };
    }).filter(g => g.bad >= 0.6).sort((a, b) => b.bad - a.bad);
}

// ───── 오늘의 운세: 이야기 날짜(없으면 실제 날짜) + 채팅마다 다름 ─────
export function todayLuck() {
    const set = settings();
    if (!set.luck.on || lite()) return null; // 라이트가 있으면 라이트 운세를 쓴다
    const st = mbState();
    const day = st?.date || new Date().toLocaleDateString('ko-KR');
    const r = rng(`luck:${ctx().chatId ?? ''}:${day}`);
    const lv = pickW(r, LUCK, x => x.w);
    const ks = set.kinds.filter(k => k.on);
    const up = ks.length ? ks[Math.floor(r() * ks.length)] : null;
    let down = ks.length > 1 ? ks[Math.floor(r() * ks.length)] : null;
    if (down && up && down.id === up.id) down = ks[(ks.indexOf(down) + 1) % ks.length];
    return { ...lv, day, up: up?.id, down: down?.id, fromStory: !!st?.date };
}

// ───── 주사위 (d20 · 미트볼 능력치 · 운세 · 바닥난 수치 · 위험도) ─────
export function checkFor(kindId, riskId, seed, stage, label = '') {
    const set = settings();
    const k = kindOf(kindId), rk = riskOf(riskId);
    if (!set.dice.on || !(rk?.check || k?.check)) return null;
    const st = mbState();
    const parts = [];
    let attr = null;
    for (const w of String(k?.attr ?? '').split(',').map(s => s.trim()).filter(Boolean)) { attr = st?.attrs?.find(a => a.name.includes(w)); if (attr) break; }
    const L = lite();
    let liteParts = null;
    if (L?.diceParts) { try { liteParts = L.diceParts(attr?.name ?? ''); } catch { liteParts = null; } }
    if (liteParts) for (const p of liteParts) parts.push([p.why, Number(p.n) || 0]); // 라이트가 능력치 · 욕구 위험 · 딱지 보정을 계산
    else if (attr) parts.push([attr.name, attr.val]);
    if (L) { const f = liteLuck(label)?.fit ?? 0; if (f) parts.push([f > 0 ? '🍀 오늘 운세' : '⚠ 오늘 운세', f * 2]); }
    const lk = todayLuck();
    if (lk) {
        if (lk.mod) parts.push([`오늘 ${lk.name}`, lk.mod]);
        if (lk.up === kindId) parts.push(['오늘 잘 풀림', 2]);
        if (lk.down === kindId) parts.push(['오늘 꼬임', -2]);
        if (kindId === 'fate' && lk.mod) parts.push(['운에 맡김', lk.mod]); // 운에 맡기면 운세가 두 배로
    }
    if (set.dice.gaugePenalty && !liteParts && st?.danger) { // 라이트: 욕구 「위험」 단계 보정
        for (const d of st.danger.filter(d => d.stage === '위험')) parts.push([`${d.name} 위험`, Number(d.dice) || -2]);
    } else if (set.dice.gaugePenalty && !liteParts) {
        const bad = urgentNeeds(st).filter(g => g.bad >= 0.75);
        let pen = 0;
        for (const g of bad) { if (pen <= -3) break; const d = g.bad >= 0.9 ? -2 : -1; parts.push([`${g.name} ${UP_BAD.test(g.name) ? '높음' : '바닥'}`, d]); pen += d; }
    }
    if (stage >= 2) parts.push([`긴장 ${stage}단계`, -(stage - 1)]);
    const r = rng(`dc:${seed}`);
    const di = clamp(Math.floor(r() * 3) + (stage >= 2 ? 1 : 0), 0, DCS.length - 1);
    const [dcName, dc] = DCS[di];
    const mod = parts.reduce((a, p) => a + p[1], 0);
    let ok = 1; for (let n = 2; n <= 19; n++) if (n + mod >= dc) ok++;
    return { attr: attr?.name ?? '', mod, parts, dc, dcName, pct: Math.round(ok / 20 * 100) };
}
export function rollCheck(ch, seed) {
    const roll = 1 + Math.floor(rng(`roll:${seed}`)() * 20);
    const crit = roll === 20, fumble = roll === 1;
    return { ...ch, roll, crit, fumble, ok: crit || (!fumble && roll + ch.mod >= ch.dc) };
}

// ───── 위험도: 채팅 메시지에서 매번 다시 계산 (스와이프 · 삭제에 저절로 맞음) ─────
export function heatAt(end, extra = null) {
    const set = settings();
    const chat = ctx().chat ?? [];
    let h = 0;
    for (let i = Math.max(0, (meta().reset ?? -1) + 1); i < Math.min(end, chat.length); i++) {
        const m = chat[i];
        if (m.is_user && m.extra?.mbc) h = clamp(h + heatOf(m.extra.mbc), 0, 100);
        else if (!m.is_user && !m.is_system) h = clamp(h - (set.danger.decay ?? 2), 0, 100);
    }
    if (extra) h = clamp(h + heatOf(extra), 0, 100);
    return h;
}
export function heatOf(p) {
    let h = (riskOf(p.risk)?.heat ?? 0) + (kindOf(p.kind)?.heat ?? 0);
    if (p.check) h += p.check.ok ? -3 : 6;
    return h;
}
export function stageOf(h) { const t = settings().danger.th; return h >= t[2] ? 3 : h >= t[1] ? 2 : h >= t[0] ? 1 : 0; }
export const curStage = () => settings().danger.on ? stageOf(heatAt(Infinity)) : 0;
let _uc = { chat: null, len: -1, pre: [] };
export function userCount(end = Infinity) {
    const chat = ctx().chat ?? [];
    if (_uc.chat !== chat || _uc.len !== chat.length) { const pre = [0]; for (const m of chat) pre.push(pre[pre.length - 1] + (m.is_user ? 1 : 0)); _uc = { chat, len: chat.length, pre }; }
    return _uc.pre[Math.min(end, chat.length)];
}
export function lastUserPick() {
    const chat = ctx().chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) if (chat[i].is_user) return chat[i].extra?.mbc ?? null;
    return null;
}
