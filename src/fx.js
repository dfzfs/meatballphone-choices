// 효과: 글자 깨짐(언어별) · 창 효과 · 화면 효과 · 고를 때 도장 · 시간 제한
import { settings, rng, curStage, lastUserPick, kindOf, riskOf } from './core.js';
import { FX } from './data.js';

const SLOT_SEL = '.ss-slot, .custom-ss-slot';
const JL = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JV = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JT = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const ZALGO = ['̀', '́', '̴', '̵', '̶', '̷', '̸', '̖', '̗', '̩', '͒'];
const HOMO = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', i: 'і', A: 'Α', B: 'Β', E: 'Ε', H: 'Η', O: 'Ο', T: 'Τ' };

function warp(ch, r) {
    const c = ch.codePointAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) { // 한글: 자모로 풀기 · 받침 바뀜 · 겹침 · 흐림
        const s = c - 0xAC00, L = Math.floor(s / 588), V = Math.floor((s % 588) / 28), T = s % 28;
        const k = Math.floor(r() * 4);
        if (k === 0) return [JL[L] + JV[V] + JT[T], 'split'];
        if (k === 1) return [String.fromCharCode(0xAC00 + L * 588 + V * 28 + ((T + 1 + Math.floor(r() * 26)) % 28)), 'swap'];
        if (k === 2) return [ch + ch, 'dup'];
        return [ch, 'blur'];
    }
    if (c >= 0x3041 && c <= 0x3096) return r() < 0.6 ? [String.fromCharCode(c + 0x60), 'swap'] : [ch + ch, 'dup']; // ひらがな → カタカナ
    if (c >= 0x30A1 && c <= 0x30F6) return r() < 0.6 ? [String.fromCharCode(c - 0x60), 'swap'] : [ch, 'blur'];
    if (/[A-Za-z]/.test(ch)) {
        const k = Math.floor(r() * 3);
        if (k === 0 && HOMO[ch]) return [HOMO[ch], 'swap'];
        if (k === 1) return [ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase(), 'swap'];
        return [ch + ZALGO[Math.floor(r() * ZALGO.length)] + ZALGO[Math.floor(r() * ZALGO.length)], 'zalgo'];
    }
    if (c >= 0x4E00 && c <= 0x9FFF) return [ch, r() < 0.5 ? 'dup' : 'blur'];
    return [ch, 'blur'];
}
export function glitch(root, rate, seed) {
    const r = rng(`g:${seed}`);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => n.parentElement?.closest(`.mbc-z, .mbc-redact, .mbc-badge, .mbc-num, .mbc-head, .mbc-detail, ${SLOT_SEL}, code, pre, script, style`) || (root.classList.contains('mes_text') && n.parentElement?.closest('.mbc-panel')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
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
            const [t, k] = warp(ch, r);
            const sp = document.createElement('span');
            sp.className = `mbc-z mbc-z-${k}`; sp.textContent = t; sp.dataset.ch = ch;
            frag.append(sp); hit = true;
        }
        if (buf) frag.append(buf);
        if (hit) n.replaceWith(frag);
    }
}

// 지금 켜야 할 효과 목록
export function activeFx(live) {
    const set = settings();
    if (set.fx.scope === 'off' || !live) return { stage: 0, list: [] };
    let stage = 0, list = [];
    if (set.danger.on) { stage = curStage(); list = stage ? set.danger.stages[stage] ?? [] : []; }
    else { // 위험 모드가 아니면: 방금 고른 선택이 함정 · 금단 · 실패였으면 한 턴 동안 가볍게
        const p = lastUserPick();
        const bad = p && (p.risk === 'trap' || p.risk === 'cursed' || (p.check && !p.check.ok));
        if (bad) { stage = 1; list = set.danger.stages[1] ?? []; }
        if (p) list = [...list, ...(riskOf(p.risk)?.fx ?? [])];
    }
    if (set.fx.scope === 'panel') list = list.filter(id => FX[id]?.where === 'panel');
    return { stage, list: [...new Set(list)] };
}
const RATE = [0, 0.025, 0.05, 0.09];

// 창 · 선택지 하나하나에 효과 걸기
export function panelFx(panel, live, mesEl) {
    const set = settings();
    const { stage, list } = activeFx(live);
    const k = Number(set.fx.k) || 1;
    panel.style.setProperty('--mbc-k', k);
    for (const id of Object.keys(FX)) panel.classList.toggle(`fx-${id}`, list.includes(id) && FX[id].where === 'panel');
    panel.classList.remove('s1', 's2', 's3'); if (stage) panel.classList.add(`s${stage}`);
    if (set.fx.scope === 'off') return;
    // 선택지마다 그 성향 · 위험에 붙은 효과 + 지금 켜진 효과
    panel.querySelectorAll('.mbc-opt[data-kind]').forEach(b => {
        const own = live ? [...(kindOf(b.dataset.kind)?.fx ?? []), ...(b.dataset.risk === 'trap' ? [] : riskOf(b.dataset.risk)?.fx ?? [])] : [];
        const fx = new Set([...own, ...list]);
        const lab = b.querySelector('.mbc-label');
        if (!lab) return;
        const rate = (fx.has('glitch') ? (own.includes('glitch') ? 0.05 : 0) + RATE[stage] : 0) * k;
        const key = `${rate.toFixed(3)}|${fx.has('redact')}`;
        if (lab.dataset.fx !== key) {
            if (lab.dataset.fx) lab.textContent = lab.dataset.orig ?? lab.textContent;
            lab.dataset.orig ??= lab.textContent;
            if (rate > 0) glitch(lab, Math.min(rate, 0.3), lab.dataset.orig);
            if (fx.has('redact')) redact(lab, lab.dataset.orig);
            lab.dataset.fx = key;
        }
        b.classList.toggle('fx-bleed', fx.has('bleed'));
        b.classList.toggle('fx-dodge', fx.has('dodge'));
        b.classList.toggle('fx-swap', fx.has('swap'));
    });
    whisperLayer(panel, list.includes('whisper') && live);
    if (set.fx.scope === 'chat' && list.includes('rot') && mesEl) {
        const t = mesEl.querySelector('.mes_text');
        if (t && (t.dataset.mbcZ !== String(stage) || ![...t.querySelectorAll('.mbc-z')].some(z => !z.closest('.mbc-panel')))) { glitch(t, RATE[stage] * k, `${mesEl.getAttribute('mesid')}:${stage}`); t.dataset.mbcZ = String(stage); }
    }
}
function redact(lab, seed) {
    const words = [];
    const walker = document.createTreeWalker(lab, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) words.push(walker.currentNode);
    const n = words.find(w => w.nodeValue.trim().length > 1 && !w.parentElement.closest('.mbc-z'));
    if (!n) return;
    const parts = n.nodeValue.split(/(\s+)/);
    const cand = parts.map((p, i) => [p, i]).filter(([p]) => p.trim().length >= 2);
    if (!cand.length) return;
    const [w, idx] = cand[Math.floor(rng(`r:${seed}`)() * cand.length)];
    const frag = document.createDocumentFragment();
    parts.forEach((p, i) => { if (i === idx) { const s = document.createElement('span'); s.className = 'mbc-redact'; s.textContent = w; frag.append(s); } else frag.append(p); });
    n.replaceWith(frag);
}
function whisperLayer(panel, on) {
    let layer = panel.querySelector(':scope > .mbc-whispers');
    if (!on) { layer?.remove(); return; }
    if (layer) return;
    const words = String(settings().fx.whispers ?? '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!words.length) return;
    layer = document.createElement('div');
    layer.className = 'mbc-whispers';
    const r = rng(`w:${Date.now() >> 14}`);
    for (let i = 0; i < 4; i++) {
        const s = document.createElement('span');
        s.textContent = words[Math.floor(r() * words.length)];
        s.style.top = `${10 + r() * 75}%`; s.style.animationDelay = `${-r() * 14}s`; s.style.animationDuration = `${12 + r() * 8}s`;
        layer.append(s);
    }
    panel.prepend(layer);
}

// 화면 전체 효과
const SCREEN = Object.keys(FX).filter(id => FX[id].where === 'screen');
export function screenFx() {
    const set = settings();
    const on = set.enabled && set.fx.scope === 'chat';
    const { stage, list } = on ? activeFx(true) : { stage: 0, list: [] };
    for (const id of SCREEN) document.body.classList.toggle(`mbc-fx-${id}`, list.includes(id));
    for (let k = 1; k <= 3; k++) document.body.classList.toggle(`mbc-s${k}`, on && stage === k);
    document.body.style.setProperty('--mbc-k', Number(set.fx.k) || 1);
}

// 바꿔치기 · 도망치는 버튼 (한 번 붙이면 됨)
let wired = false;
export function wireHover() {
    if (wired) return; wired = true;
    document.addEventListener('mouseover', (e) => {
        const b = e.target.closest?.('.mbc-opt');
        if (!b || b.disabled) return;
        if (b.classList.contains('fx-dodge') && !b.dataset.dodged) {
            b.dataset.dodged = '1';
            b.style.transform = `translateX(${(Math.random() < 0.5 ? -1 : 1) * (24 + Math.random() * 30)}px)`;
            setTimeout(() => { b.style.transform = ''; }, 900);
        }
        if (b.classList.contains('fx-swap') && !b._swapT) {
            const lab = b.querySelector('.mbc-label');
            const words = String(settings().fx.whispers ?? '').split('\n').map(s => s.trim()).filter(Boolean);
            if (!lab || !words.length) return;
            const keep = lab.innerHTML;
            lab.textContent = words[Math.floor(Math.random() * words.length)];
            lab.classList.add('swapped');
            b._swapT = setTimeout(() => { lab.innerHTML = keep; lab.classList.remove('swapped'); setTimeout(() => { b._swapT = 0; }, 1500); }, 380);
        }
    }, true);
}

// 고를 때 도장 (성공 · 실패 · 함정 …)
export function stamp(panel, text, tone) {
    if (!settings().fx.burst || settings().fx.scope === 'off') return;
    const s = document.createElement('div');
    s.className = `mbc-stamp ${tone}`;
    s.textContent = text;
    panel.append(s);
    if (tone === 'bad' || tone === 'curse') { panel.classList.add('mbc-hit'); setTimeout(() => panel.classList.remove('mbc-hit'), 600); }
    setTimeout(() => s.remove(), 2200);
}

// 시간 제한
let timerT = 0;
export function timerFx(panel, live, onExpire) {
    const set = settings();
    const on = live && activeFx(true).list.includes('timer') && !panel.dataset.timerDone;
    let bar = panel.querySelector('.mbc-timer');
    if (!on) { bar?.remove(); return; }
    if (bar) return;
    bar = document.createElement('div');
    bar.className = 'mbc-timer';
    bar.innerHTML = '<i></i>';
    const sec = Math.max(5, Number(set.timer.sec) || 25);
    bar.firstChild.style.animationDuration = `${sec}s`;
    const head = panel.querySelector('.mbc-head'); if (head) head.after(bar); else panel.append(bar);
    clearTimeout(timerT);
    timerT = setTimeout(() => { if (bar.isConnected) { panel.dataset.timerDone = '1'; bar.remove(); onExpire?.(); } }, sec * 1000);
}
