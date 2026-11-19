// 미트볼 선택지 — 답 끝의 선택지를 버튼 창으로 바꾸고, 선택지마다 성격(안전 · 위험 · 함정 · 이질)을 붙인다.
// - 성격은 확장이 정해서 AI에게 알려 준다. 고른 결과(함정 발동 · 위험 성공/실패)도 확장이 정해서 다음 답에 넣는다.
// - 고른 기록은 그 사용자 메시지의 extra에 남는다 → 스와이프 · 삭제 · 브랜치에 저절로 맞는다.
// - 위험 모드: 위험도(0~100)가 쌓이면 함정이 늘고 결과가 독해지고 화면 · 글자가 일그러진다.
// - 글자 일그러짐은 화면에 보이는 글(번역 확장을 쓰면 번역된 글)에만, 저장은 안 한다.
// - 미트볼 상태창 칩(.ss-slot) 위에 자리를 잡는다.

const MODULE = 'mbChoices';
const LOG = '[미트볼 선택지]';
const INJECT_KEY = 'mb_choices';
const IN_CHAT = 1, ROLE_SYSTEM = 0;
const SLOT_SEL = '.ss-slot, .custom-ss-slot, .ml-msg';

const DEFAULTS = Object.freeze({
    enabled: true,
    count: 4,            // 0 = AI가 2~4개
    w: { safe: 2, risk: 1, trap: 1, odd: 1 }, // 0 없음 · 1 가끔 · 2 보통 · 3 자주
    show: 'noTrap',      // all · noTrap(함정은 안전으로 보임) · none
    danger: false,       // 위험 모드
    fx: 'panel',         // chat · panel · off
    glitch: true,        // 글자 일그러짐
    click: 'fill',       // fill · send
    depth: 1,
});

const TRAITS = {
    safe: { ko: '안전', icon: '🛡', tone: 'good' },
    risk: { ko: '위험', icon: '⚠', tone: 'bad' },
    trap: { ko: '함정', icon: '🪤', tone: 'bad' },
    odd: { ko: '이질', icon: '🌀', tone: 'mid' },
};
const CODE_RE = /^\s*[\[(【〔]\s*(safe|risk|trap|odd|안전|위험|함정|이질|安全|危険|罠|異質)\s*[\])】〕]\s*/i;
const CODE_MAP = { 안전: 'safe', 위험: 'risk', 함정: 'trap', 이질: 'odd', 安全: 'safe', 危険: 'risk', 罠: 'trap', 異質: 'odd' };
const HEAT = { safe: -10, risk: 12, trap: 25, odd: 15 };
const STAGE_KO = ['평온', '불안', '위험', '파국'];

const ctx = () => SillyTavern.getContext();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function settings() {
    const es = ctx().extensionSettings;
    es[MODULE] ??= {};
    const s = es[MODULE];
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = typeof v === 'object' ? { ...v } : v;
    for (const k of Object.keys(DEFAULTS.w)) s.w[k] ??= DEFAULTS.w[k];
    return s;
}
const save = () => ctx().saveSettingsDebounced();
function meta() {
    const md = ctx().chatMetadata;
    if (!md) return { pending: null, reset: -1 };
    md[MODULE] ??= { pending: null, reset: -1 };
    return md[MODULE];
}

// ───── 난수 (같은 턴이면 같은 결과) ─────
function rng(seed) {
    let a = 0;
    for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0);
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ───── 위험도: 채팅 메시지에서 매번 다시 계산 ─────
function heatAt(end, extra = null) {
    const chat = ctx().chat ?? [];
    const from = meta().reset ?? -1;
    let h = 0;
    for (let i = Math.max(0, from + 1); i < Math.min(end, chat.length); i++) {
        const m = chat[i];
        if (m.is_user && m.extra?.mbc) h = clamp(h + (HEAT[m.extra.mbc.trait] ?? 0), 0, 100);
        else if (!m.is_user && !m.is_system) h = clamp(h - 2, 0, 100);
    }
    if (extra) h = clamp(h + (HEAT[extra.trait] ?? 0), 0, 100);
    return h;
}
const stageOf = (h) => h >= 75 ? 3 : h >= 50 ? 2 : h >= 25 ? 1 : 0;
const curStage = () => settings().danger ? stageOf(heatAt(Infinity)) : 0;
const userCount = (end = Infinity) => (ctx().chat ?? []).slice(0, end).filter(m => m.is_user).length;

// ───── 이번 턴 선택지 성격 정하기 ─────
function planFor(seed, stage) {
    const set = settings();
    const r = rng(`plan:${ctx().chatId ?? ''}:${seed}`);
    const n = set.count > 0 ? clamp(set.count, 2, 6) : 2 + Math.floor(r() * 3);
    const w = { ...set.w };
    if (set.danger) { w.trap += stage; if (stage >= 2) w.odd += 1; if (stage >= 3) w.safe = Math.max(0, w.safe - 1); }
    const keys = Object.keys(w).filter(k => w[k] > 0);
    if (!keys.length) return Array(n).fill('safe');
    const total = keys.reduce((a, k) => a + w[k], 0);
    const out = [];
    for (let i = 0; i < n; i++) { let x = r() * total; out.push(keys.find(k => (x -= w[k]) < 0) ?? keys[0]); }
    if (w.safe > 0 && stage < 3 && !out.includes('safe')) out[Math.floor(r() * n)] = 'safe';
    return out;
}

// ───── 프롬프트 ─────
const SEV = ['clear but recoverable', 'serious', 'severe and lasting', 'brutal — the world turns against {{user}}'];
function resultLine(p, stage) {
    if (!p) return '';
    const sev = settings().danger ? SEV[stage] : SEV[0];
    const q = `"${p.label}"`;
    if (p.trait === 'trap') return `[CHOICE RESULT] {{user}} picked ${q}. It was a TRAP: its hidden flaw springs NOW. Show a concrete consequence (${sev}): injury, lost money or items, a worse position, someone turning hostile. Do not soften it or let {{user}} escape for free.`;
    if (p.trait === 'risk') return p.ok
        ? `[CHOICE RESULT] {{user}} picked the risky option ${q} and the gamble PAYS OFF: give a clear, tangible gain.`
        : `[CHOICE RESULT] {{user}} picked the risky option ${q} and it GOES WRONG: a real cost (${sev}).`;
    if (p.trait === 'odd') return `[CHOICE RESULT] {{user}} picked ${q}, the strange pull. Something uncanny happens; reality bends slightly around {{user}}. Leave a lingering odd after-effect (${sev}).`;
    return '';
}
function buildPrompt(seed, pending) {
    const set = settings();
    if (!set.enabled) return '';
    const stage = settings().danger ? stageOf(heatAt(Infinity, pending)) : 0;
    const plan = planFor(seed, stage);
    const L = [];
    const res = resultLine(pending, stage);
    if (res) L.push(res + ' If you write a <meatball> status block, record the effect there too as event lines (status: / cash: / item: / act:).');
    L.push(`[CHOICES] End your narration (before any <meatball> block) with exactly ${plan.length} options for {{user}}'s next action, written in the same language as your narration, inside <choices>…</choices>, one per line, each line starting with its code. Codes in this order: ${plan.map(t => `[${t}]`).join(' ')}.`);
    const used = [...new Set(plan)];
    const def = {
        safe: 'safe = cautious, low stakes.',
        risk: 'risk = bold; bigger payoff, real chance of harm or loss.',
        trap: 'trap = reads like a sensible option, but ONE detail quietly contradicts what the story established (wrong door, wrong name, an offer too good). A careful reader can spot it. Never hint that it is a trap.',
        odd: 'odd = strange, tempting, slightly unhinged; something abnormal is pulling {{user}}.',
    };
    L.push(used.map(t => def[t]).join(' ') + ' Each option is one short line, no explanations.');
    if (set.danger && stage) L.push(`Danger level ${stage}/3 (${['', 'uneasy', 'dangerous', 'catastrophic'][stage]}): the world is growing hostile; traps are nastier and safe options cost more.`);
    L.push('Example:\n<choices>\n1. [safe] …\n2. [trap] …\n</choices>');
    return L.join('\n');
}
function setInject(text) {
    try { ctx().setExtensionPrompt(INJECT_KEY, text ?? '', IN_CHAT, clamp(Number(settings().depth) || 0, 0, 10), false, ROLE_SYSTEM); } catch (e) { console.warn(LOG, e); }
}
function lastUserPick() {
    const chat = ctx().chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) if (chat[i].is_user) return chat[i].extra?.mbc ?? null;
    return null;
}
function inputMatches(p) {
    const v = document.getElementById('send_textarea')?.value ?? '';
    return !!p && v.trim() && v.includes(p.label.slice(0, 8));
}
function onBeforeGen(type, _params, dryRun) {
    if (dryRun) return;
    if (!settings().enabled || ['quiet', 'impersonate', 'continue'].includes(type)) { setInject(''); return; }
    const m = meta();
    let pending = null, seed = userCount();
    if (type === 'normal' || !type) {
        const typed = (document.getElementById('send_textarea')?.value ?? '').trim();
        if (typed) { seed += 1; pending = inputMatches(m.pending) ? m.pending : null; }
        else pending = lastUserPick();
    } else pending = lastUserPick(); // 다시 생성 · 스와이프: 마지막 사용자 메시지에 붙은 선택
    setInject(buildPrompt(seed, pending));
}
function onSent(idx) {
    const chat = ctx().chat ?? [];
    const i = Number.isFinite(Number(idx)) ? Number(idx) : chat.length - 1;
    const m = chat[i], md = meta();
    if (!m?.is_user) return;
    if (md.pending && m.mes.includes(md.pending.label.slice(0, 8))) { m.extra = { ...(m.extra ?? {}), mbc: md.pending }; }
    md.pending = null;
    ctx().saveMetadataDebounced?.() ?? ctx().saveMetadata?.();
    if (settings().enabled) setInject(buildPrompt(userCount(), m.extra?.mbc ?? null));
}

// ───── 답에서 선택지 읽기 ─────
const NUM_RE = /^\s*(?:[-*•·]\s*)?(?:\d{1,2}|[①-⑨]|[a-fA-F])\s*[.)．:、]\s*/;
function parseBlock(text) {
    if (!text) return null;
    const mm = String(text).match(/<choices>([\s\S]*?)(?:<\/choices>|$)/i);
    if (!mm) return null;
    const lines = mm[1].split(/\n+/).map(s => s.trim()).filter(Boolean);
    const items = [];
    for (const raw of lines) {
        let t = raw.replace(NUM_RE, '');
        let trait = null;
        const c = t.match(CODE_RE);
        if (c) { trait = CODE_MAP[c[1]] ?? c[1].toLowerCase(); t = t.replace(CODE_RE, ''); }
        t = t.replace(NUM_RE, '').trim();
        if (t) items.push({ trait, label: t, raw });
    }
    return items.length ? items.slice(0, 6) : null;
}
function choicesOf(i) {
    const m = ctx().chat?.[i];
    if (!m || m.is_user || m.is_system) return null;
    const raw = parseBlock(m.mes);
    const shown = parseBlock(m.extra?.display_text) ?? raw; // 번역 확장이 만든 글이 있으면 그걸 보여 준다
    if (!shown) return null;
    const plan = planFor(userCount(i), 0);
    return shown.map((it, k) => ({ ...it, trait: it.trait ?? raw?.[k]?.trait ?? plan[k] ?? 'safe' }));
}

// ───── 화면: 본문 속 선택지 줄 지우고 창 붙이기 ─────
const norm = (s) => String(s ?? '').replace(/<\/?choices>/gi, '').replace(NUM_RE, '').replace(CODE_RE, '').replace(/\s+/g, '').toLowerCase();
function stripRaw(textEl, items) {
    textEl.querySelectorAll('choices, .custom-choices').forEach(e => e.remove());
    const keys = new Set(items.flatMap(it => [norm(it.label), norm(it.raw)]).filter(Boolean));
    const isChoiceLine = (s) => { const n = norm(s); return !n || keys.has(n) || /^<\/?choices>$/i.test(s.trim()); };
    for (const el of [...textEl.querySelectorAll(':scope > p, :scope > ol, :scope > ul, :scope > div:not(.mbc-panel):not(.ss-slot):not(.custom-ss-slot), :scope > pre')]) {
        if (el.closest('.mbc-panel') || el.matches(SLOT_SEL)) continue;
        const c = el.cloneNode(true);
        c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
        c.querySelectorAll('li').forEach(li => li.append('\n'));
        const lines = c.textContent.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length) continue;
        const hits = lines.filter(isChoiceLine).length;
        if (hits === lines.length && lines.some(l => keys.has(norm(l)) || /choices>/i.test(l))) el.remove();
    }
    // 실리태번이 <choices>를 글자로 보여 준 경우
    const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
    const dead = [];
    while (walker.nextNode()) if (/<\/?choices>/i.test(walker.currentNode.nodeValue) && !walker.currentNode.parentElement.closest('.mbc-panel')) dead.push(walker.currentNode);
    dead.forEach(n => { n.nodeValue = n.nodeValue.replace(/<\/?choices>/gi, ''); });
}

function lastAIIndex() {
    const chat = ctx().chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) if (!chat[i].is_user && !chat[i].is_system) return i;
    return -1;
}
function pickedFor(i) { const u = (ctx().chat ?? [])[i + 1]; return u?.is_user ? u.extra?.mbc ?? null : null; }

function badge(trait, revealed) {
    const show = settings().show;
    let t = trait;
    if (!revealed) { if (show === 'none') return ''; if (show === 'noTrap' && t === 'trap') t = 'safe'; }
    const d = TRAITS[t] ?? TRAITS.safe;
    return `<span class="mbc-badge ${d.tone}">${d.icon} ${d.ko}</span>`;
}

// 미트볼 라이트가 켜져 있으면 대가 미리 보기 (「−3골드 · 허기 +20」 · 돈 부족이면 흐리게)
function costHTML(label) {
    try { const p = globalThis.MeatballLite?.preview?.(label); return p ? `<span class="mbc-cost${p.ok ? '' : ' poor'}">${esc(p.text)}</span>` : ''; } catch { return ''; }
}
function panelHTML(i, items, live, picked, pend) {
    const set = settings();
    const h = set.danger ? heatAt(i + 1) : 0, st = stageOf(h);
    const head = set.danger
        ? `<div class="mbc-head"><span class="mbc-title">선택</span><span class="mbc-heat s${st}" title="위험도 ${h}/100"><i style="width:${h}%"></i></span><span class="mbc-stage s${st}">${STAGE_KO[st]}</span></div>`
        : `<div class="mbc-head"><span class="mbc-title">선택</span></div>`;
    const rows = items.map((it, k) => {
        const mine = picked && picked.n === k;
        const reveal = !live; // 지난 선택지는 성격을 다 보여 준다
        const res = mine ? (it.trait === 'trap' ? '함정에 걸림' : it.trait === 'risk' ? (picked.ok ? '성공' : '실패') : it.trait === 'odd' ? '이상한 일' : '') : '';
        const sel = pend && pend.i === i && pend.n === k;
        return `<button class="mbc-opt t-${it.trait}${mine ? ' mine' : ''}${sel ? ' sel' : ''}" data-mbc-i="${i}" data-mbc-n="${k}" ${live ? '' : 'disabled'}>
            <span class="mbc-num">${k + 1}</span><span class="mbc-label">${esc(it.label)}</span>${live ? costHTML(it.label) : ''}${badge(it.trait, reveal)}${res ? `<span class="mbc-res">${res}</span>` : ''}</button>`;
    }).join('');
    return `${head}<div class="mbc-list">${rows}</div>`;
}

function placePanel(mesEl, textEl, panel) {
    const inSlot = textEl.querySelector(SLOT_SEL);
    const outSlot = textEl.parentElement?.querySelector(':scope > .ss-slot.out');
    if (inSlot) { if (panel.nextElementSibling !== inSlot) inSlot.before(panel); }
    else if (outSlot) { if (panel.nextElementSibling !== outSlot) outSlot.before(panel); }
    else if (panel.parentElement !== textEl || panel !== textEl.lastElementChild) textEl.append(panel);
}

let busy = false;
function decorate(mesEl, lastAI) {
    const i = Number(mesEl.getAttribute('mesid'));
    const textEl = mesEl.querySelector('.mes_text');
    if (!textEl || Number.isNaN(i)) return;
    const items = settings().enabled ? choicesOf(i) : null;
    let panel = mesEl.querySelector('.mbc-panel');
    if (!items) { panel?.remove(); return; }
    stripRaw(textEl, items);
    const live = i === lastAI && !ctx().chat?.[i + 1];
    const picked = pickedFor(i), pend = meta().pending;
    const key = JSON.stringify([items.map(x => x.label + x.trait), live, picked?.n, picked?.ok, pend?.i === i ? pend.n : -1, settings().show, settings().danger, settings().danger ? heatAt(i + 1) : 0]);
    if (!panel) { panel = document.createElement('div'); panel.className = 'mbc-panel'; }
    if (panel.dataset.key !== key) { panel.innerHTML = panelHTML(i, items, live, picked, pend); panel.dataset.key = key; panel.dataset.mbcZ = ''; }
    panel.classList.toggle('stale', !live);
    placePanel(mesEl, textEl, panel);
    applyFx(mesEl, textEl, panel, live);
}

function decorateAll(recentOnly = false) {
    if (busy) return;
    busy = true;
    try {
        const lastAI = lastAIIndex();
        const els = [...document.querySelectorAll('#chat .mes')];
        (recentOnly ? els.slice(-4) : els).forEach(el => { try { decorate(el, lastAI); } catch (e) { console.warn(LOG, e); } });
        bodyFx();
    } finally { busy = false; }
}

// ───── 효과: 화면 · 글자 ─────
function bodyFx() {
    const set = settings();
    const st = set.enabled && set.fx === 'chat' ? fxStage() : 0;
    for (let k = 1; k <= 3; k++) document.body.classList.toggle(`mbc-s${k}`, st === k);
}
// 위험 모드면 위험도 단계, 아니면 방금 고른 선택의 성격으로 한 단계
function fxStage() {
    const set = settings();
    if (set.fx === 'off') return 0;
    if (set.danger) return curStage();
    const p = lastUserPick();
    return p && (p.trait === 'trap' || p.trait === 'odd' || (p.trait === 'risk' && !p.ok)) ? 1 : 0;
}
const RATE = [0, 0.02, 0.045, 0.08];
function applyFx(mesEl, textEl, panel, live) {
    const set = settings();
    const st = live ? fxStage() : 0;
    panel.classList.remove('s1', 's2', 's3');
    if (st) panel.classList.add(`s${st}`);
    if (!set.glitch || set.fx === 'off') return;
    if (live && st) {
        // 선택지 창: 이질 선택지는 늘, 단계가 높으면 전부 (그래야 함정이 숨는다)
        panel.querySelectorAll('.mbc-label').forEach(l => {
            const odd = l.closest('.t-odd');
            const rate = odd ? RATE[st] * 2 + 0.03 : st >= 2 ? RATE[st - 1] : 0;
            if (rate && l.dataset.mbcZ !== String(st)) { glitch(l, rate, `${l.textContent}:${st}`); l.dataset.mbcZ = String(st); }
        });
        if (set.fx === 'chat' && (textEl.dataset.mbcZ !== String(st) || ![...textEl.querySelectorAll('.mbc-z')].some(z => !z.closest('.mbc-panel')))) { glitch(textEl, RATE[st], `${mesEl.getAttribute('mesid')}:${st}`); textEl.dataset.mbcZ = String(st); }
    } else if (live) {
        panel.querySelectorAll('.t-odd .mbc-label').forEach(l => { if (l.dataset.mbcZ !== 'o') { glitch(l, 0.04, l.textContent); l.dataset.mbcZ = 'o'; } });
    }
}

// 글자마다 그 글자에 맞는 방식으로 일그러뜨린다 (한글 · 일본어 · 영어 · 한자 · 그 밖)
const JL = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JV = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JT = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const ZALGO = ['̀', '́', '̴', '̵', '̶', '̷', '̸', '̖', '̗', '̩', '͏', '͒'];
const HOMO = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', i: 'і', A: 'Α', B: 'Β', E: 'Ε', H: 'Η', O: 'Ο', T: 'Τ' };
function warp(ch, r) {
    const c = ch.codePointAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) { // 한글
        const s = c - 0xAC00, L = Math.floor(s / 588), V = Math.floor((s % 588) / 28), T = s % 28;
        const k = Math.floor(r() * 4);
        if (k === 0) return { t: JL[L] + JV[V] + JT[T], k: 'split' };
        if (k === 1) return { t: String.fromCharCode(0xAC00 + L * 588 + V * 28 + ((T + 1 + Math.floor(r() * 26)) % 28)), k: 'swap' };
        if (k === 2) return { t: ch + ch, k: 'dup' };
        return { t: ch, k: 'blur' };
    }
    if (c >= 0x3041 && c <= 0x3096) return { t: r() < 0.6 ? String.fromCharCode(c + 0x60) : ch + ch, k: 'swap' }; // ひらがな→カタカナ
    if (c >= 0x30A1 && c <= 0x30F6) return { t: r() < 0.6 ? String.fromCharCode(c - 0x60) : ch, k: r() < 0.5 ? 'swap' : 'blur' };
    if (/[A-Za-z]/.test(ch)) {
        const k = Math.floor(r() * 3);
        if (k === 0 && HOMO[ch]) return { t: HOMO[ch], k: 'swap' };
        if (k === 1) return { t: ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase(), k: 'swap' };
        return { t: ch + ZALGO[Math.floor(r() * ZALGO.length)] + ZALGO[Math.floor(r() * ZALGO.length)], k: 'zalgo' };
    }
    if (c >= 0x4E00 && c <= 0x9FFF) return { t: ch, k: r() < 0.5 ? 'dup' : 'blur' };
    return { t: ch, k: 'blur' };
}
function glitch(root, rate, seed) {
    const r = rng(`g:${seed}`);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => n.parentElement?.closest(`.mbc-z, .mbc-badge, .mbc-num, .mbc-res, .mbc-head, ${SLOT_SEL}, code, pre, script, style`) || (root.classList.contains('mes_text') && n.parentElement?.closest('.mbc-panel')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
        const text = n.nodeValue;
        if (!text.trim()) continue;
        const frag = document.createDocumentFragment();
        let buf = '', hit = false;
        for (const ch of text) {
            if (!ch.trim() || r() >= rate) { buf += ch; continue; }
            if (buf) { frag.append(buf); buf = ''; }
            const w = warp(ch, r);
            const sp = document.createElement('span');
            sp.className = `mbc-z mbc-z-${w.k}`;
            sp.textContent = w.t; sp.dataset.ch = ch;
            frag.append(sp); hit = true;
        }
        if (buf) frag.append(buf);
        if (hit) n.replaceWith(frag);
    }
}

// ───── 누르기 ─────
function insertInput(text, send) {
    const ta = document.getElementById('send_textarea');
    if (!ta) return;
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    if (send) document.getElementById('send_but')?.click();
}
document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.mbc-opt[data-mbc-i]');
    if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    const i = Number(b.dataset.mbcI), n = Number(b.dataset.mbcN);
    const items = choicesOf(i);
    const it = items?.[n];
    if (!it) return;
    const set = settings();
    const st = set.danger ? curStage() : 0;
    const r = rng(`roll:${ctx().chatId ?? ''}:${i}:${n}`)();
    // 🍀 미트볼 라이트의 오늘 운세와 맞으면 +10% · 조심할 행동이면 −10%
    let fit = 0; try { fit = globalThis.MeatballLite?.luck?.(it.label)?.fit ?? 0; } catch { fit = 0; }
    const ok = it.trait === 'risk' ? r < (0.6 - st * 0.1 + fit * 0.1) : true;
    meta().pending = { i, n, trait: it.trait, label: it.label, ok };
    ctx().saveMetadataDebounced?.() ?? ctx().saveMetadata?.();
    insertInput(it.label, set.click === 'send');
    decorateAll(true);
}, true);

// ───── 설정 창 ─────
function renderSettings() {
    const set = settings();
    const opt = (k, v, label, cur = set[k]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;
    const wsel = (k) => `<label class="mbc-row"><span>${TRAITS[k].icon} ${TRAITS[k].ko}</span><select class="text_pole" data-w="${k}">${[0, 1, 2, 3].map(v => opt(null, v, ['없음', '가끔', '보통', '자주'][v], set.w[k])).join('')}</select></label>`;
    const el = document.createElement('div');
    el.className = 'mbc-settings';
    el.innerHTML = `<div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header"><b>미트볼 선택지</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
        <div class="inline-drawer-content">
            <label class="checkbox_label"><input type="checkbox" data-s="enabled" ${set.enabled ? 'checked' : ''}> 사용</label>
            <label class="mbc-row"><span>선택지 개수</span><select class="text_pole" data-s="count">${opt('count', 0, 'AI가 2~4개')}${[2, 3, 4, 5, 6].map(v => opt('count', v, `${v}개`)).join('')}</select></label>
            <div class="mbc-sub">성격이 나오는 정도</div>
            ${wsel('safe')}${wsel('risk')}${wsel('trap')}${wsel('odd')}
            <label class="mbc-row"><span>성격 표시</span><select class="text_pole" data-s="show">${opt('show', 'noTrap', '함정은 숨김 (안전으로 보임)')}${opt('show', 'all', '전부 보임')}${opt('show', 'none', '전부 숨김')}</select></label>
            <label class="checkbox_label"><input type="checkbox" data-s="danger" ${set.danger ? 'checked' : ''}> 위험 모드 — 위험한 걸 고를수록 위험도가 쌓여 함정이 늘고 결과가 독해짐</label>
            <label class="mbc-row"><span>효과 범위</span><select class="text_pole" data-s="fx">${opt('fx', 'panel', '선택지 창만')}${opt('fx', 'chat', '채팅 화면 전체')}${opt('fx', 'off', '없음')}</select></label>
            <label class="checkbox_label"><input type="checkbox" data-s="glitch" ${set.glitch ? 'checked' : ''}> 글자 일그러짐 (보이는 글에만 · 번역을 켜면 번역된 글)</label>
            <label class="mbc-row"><span>누르면</span><select class="text_pole" data-s="click">${opt('click', 'fill', '입력창에 넣기')}${opt('click', 'send', '바로 보내기')}</select></label>
            <label class="mbc-row"><span>주입 깊이</span><input class="text_pole" type="number" min="0" max="10" data-s="depth" value="${set.depth}"></label>
            <div class="mbc-btns"><button class="menu_button" data-act="reset">이 채팅 위험도 0으로</button><button class="menu_button" data-act="peek">주입 글 보기</button></div>
        </div></div>`;
    el.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.w) set.w[t.dataset.w] = Number(t.value);
        else if (t.dataset.s) set[t.dataset.s] = t.type === 'checkbox' ? t.checked : (['count', 'depth'].includes(t.dataset.s) ? Number(t.value) : t.value);
        save();
        document.querySelectorAll('#chat .mes_text').forEach(x => { x.dataset.mbcZ = ''; });
        if (!set.enabled) setInject('');
        rerender();
    });
    el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]')?.dataset.act;
        if (a === 'reset') { meta().reset = (ctx().chat?.length ?? 0) - 1; ctx().saveMetadata?.(); toastr.info('이 채팅의 위험도를 0으로 돌렸어요.', '미트볼 선택지'); rerender(); }
        if (a === 'peek') { const p = buildPrompt(userCount() + 1, meta().pending); ctx().Popup?.show?.text?.('다음 턴에 들어갈 글', `<pre style="white-space:pre-wrap;text-align:left">${esc(p || '(없음)')}</pre>`) ?? alert(p); }
    });
    document.getElementById('extensions_settings2')?.appendChild(el);
}

// 글자 일그러짐은 다시 그려야 풀린다 → 메시지 다시 그리기
function rerender() {
    const c = ctx();
    document.querySelectorAll('#chat .mes').forEach(el => {
        const i = Number(el.getAttribute('mesid'));
        const t = el.querySelector('.mes_text');
        if (t?.querySelector('.mbc-z') && c.chat?.[i]) {
            try { t.innerHTML = c.messageFormatting(c.chat[i].extra?.display_text ?? c.chat[i].mes, c.chat[i].name, c.chat[i].is_system, c.chat[i].is_user, i); } catch { /* 다음 갱신 때 */ }
            t.dataset.mbcZ = '';
        }
        el.querySelector('.mbc-panel')?.remove();
    });
    decorateAll();
}

// ───── 감시: 번역 · 미트볼이 본문을 다시 그리면 다시 붙인다 (최근 메시지만) ─────
let obs = null, timer = 0;
function watch() {
    const chatEl = document.getElementById('chat');
    if (!chatEl || obs?._el === chatEl) return;
    obs?.disconnect();
    obs = new MutationObserver((muts) => {
        if (busy) return;
        for (const m of muts) for (const n of [...m.addedNodes, ...m.removedNodes]) {
            if (n.nodeType !== 1 || n.classList?.contains('mbc-z') || n.classList?.contains('mbc-panel') || n.closest?.('.mbc-panel')) continue;
            clearTimeout(timer); timer = setTimeout(() => decorateAll(true), 120); return;
        }
    });
    obs._el = chatEl;
    obs.observe(chatEl, { childList: true, subtree: true });
}

function refresh() { watch(); decorateAll(); }
function init() {
    const { eventSource, event_types: E } = ctx();
    settings();
    renderSettings();
    const on = (name, fn) => { if (E[name]) eventSource.on(E[name], fn); };
    on('GENERATION_AFTER_COMMANDS', onBeforeGen);
    on('MESSAGE_SENT', onSent);
    on('CHAT_CHANGED', () => { setInject(''); setTimeout(refresh, 50); });
    for (const ev of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'MORE_MESSAGES_LOADED', 'GENERATION_ENDED', 'GENERATION_STOPPED']) on(ev, () => setTimeout(() => decorateAll(ev !== 'MORE_MESSAGES_LOADED' && ev !== 'MESSAGE_DELETED'), 30));
    // 미트볼 라이트 상태가 바뀌면 대가 미리 보기를 다시
    let mlT = 0; document.addEventListener('meatlite:update', () => { clearTimeout(mlT); mlT = setTimeout(() => { document.querySelectorAll('.mbc-panel').forEach(p => { p.dataset.key = ''; }); decorateAll(); }, 120); });
    refresh();
    console.log(LOG, 'loaded');
}
const { eventSource: _es, event_types: _et } = SillyTavern.getContext();
_es.on(_et.APP_READY, init);
