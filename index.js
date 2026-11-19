// 미트볼폰 선택지 — 답 끝의 선택지를 고르기 쉬운 목록으로. 미트볼폰 칩 위에 붙는다.
// 저장: 선택지 블록은 그 AI 메시지(스와이프마다) extra · 고른 기록은 그다음 사용자 메시지 extra. 따로 쌓는 기록 없음.
import { settings, ctx, meta, userCount, LOG, liteClear, setExtra, lite, requestSave, afterReply, genStarted, genEnded, isGenerating } from './src/core.js';
import { onBeforeGen, setInject, buildPrompt, stripOld, tuck } from './src/prompt.js';
import { decorate, lastAIIndex, ui, choose, helpSheet, reroll, branchHere, dropSide, placeSide } from './src/panel.js';
import { fetchGuide, guideItems, gst } from './src/guide.js';
import { openEditor, setOnChange, placeEditDock } from './src/editor.js';

let busy = false;
function decorateAll(recentOnly = false, force = false) {
    if (busy) return;
    busy = true;
    try {
        const lastAI = lastAIIndex();
        const els = [...document.querySelectorAll('#chat .mes')];
        ui.side = false;
        (recentOnly ? els.slice(-4) : els).forEach(el => { try { decorate(el, lastAI, force); } catch (e) { console.warn(LOG, e); } });
        if (!ui.side) dropSide(); // 옆 동그라미를 안 쓰면
    } finally { busy = false; }
}

// 지난 선택지는 본문에서 빼서 그 메시지 extra로 (end 앞의 모든 AI 답 · 모든 스와이프)
function tuckBefore(end) {
    const chat = ctx().chat ?? [];
    let n = 0; for (let k = 0; k < Math.min(end, chat.length); k++) if (tuck(chat[k])) n++;
    return n;
}

// 내가 보냄: 고른 기록을 이 메시지에 붙이고, 앞의 모든 답의 선택지를 정리
function onSent(idx) {
    if (!settings().enabled) return;
    const chat = ctx().chat ?? [];
    const i = Number.isFinite(Number(idx)) ? Number(idx) : chat.length - 1;
    const m = chat[i], md = meta();
    if (!m?.is_user) return;
    const p = md.pending;
    const txt = `${m.mes}\n${m.extra?.display_text ?? ''}`;
    if (p && (txt.includes(p.label.slice(0, 8)) || (p.shown && txt.includes(p.shown.slice(0, 8))))) {
        setExtra(m, { mbc: p }); // 늘 남김 (칩 · 분기 · 라이트 분류 모델이 읽음)
        const L = lite(); if (typeof L?.pendingChoice === 'function') { try { L.pendingChoice(i, p); } catch (e) { console.warn(LOG, e); } } // 라이트에 받는 자리가 있으면 거기에도
    }
    md.pending = null;
    // 앞 답들의 선택지 블록 떼기는 이 답을 다 받은 뒤 1초에 (이번 프롬프트에선 stripOld가 빼 줌) · 저장도 그때 한 번
    afterReply(() => tuckBefore(i) > 0);
    requestSave();
    setInject(buildPrompt(userCount(), m.extra?.mbc ?? null));
}

// 누르기
document.addEventListener('click', (e) => {
    const t = e.target.closest?.('.mbc-panel [data-mbc-act], .mbc-panel .mbc-opt[data-mbc-i]');
    if (!t) { if ((ui.open || ui.sel || ui.reroll) && document.getElementById('mbc-side') && !e.target.closest?.('#mbc-side, #mbc-editdock, .popup')) { ui.open = false; ui.sel = null; ui.reroll = false; decorateAll(true); } return; }
    e.preventDefault(); e.stopPropagation();
    const panel = t.closest('.mbc-panel');
    const i = Number(panel.closest('.mes')?.getAttribute('mesid') ?? panel.dataset.i);
    const act = t.dataset.mbcAct;
    if (act === 'dock') { // 옆 동그라미: 펼친 채 다시 누르면 닫기
        if (panel.classList.contains('open')) { ui.open = false; ui.hover = false; ui.sel = null; ui.reroll = false; ui.hoverBlock = true; panel.classList.remove('open'); }
        else { ui.open = true; ui.hoverBlock = false; }
        decorateAll(true); return;
    }
    if (act === 'tab') { // 탭: 처음 여는 추천 탭은 켠 칸을 AI 1회로 한꺼번에
        ui.tab = t.dataset.g; ui.sel = null; ui.reroll = false; ui.open = true;
        if (ui.tab !== 'choices' && !guideItems(i, ui.tab).length && !gst.busy) { const p = fetchGuide(i, null); p.then(() => decorateAll(true, true)); }
        decorateAll(true); return;
    }
    if (act === 'guideGo') { const p = fetchGuide(i, null); decorateAll(true); p.then(() => decorateAll(true, true)); return; }
    if (act === 'ask') { ui.tab = 'choices'; ui.open = true; const p = reroll(i, ''); decorateAll(true); p.then(() => decorateAll(true, true)); return; } // 🎯 눌러야 받는 선택지
    if (act === 'help') { helpSheet(); return; }
    if (act === 'edit') { openEditor(); return; }
    if (act === 'click') { const s = settings(); s.click = s.click === 'send' ? 'fill' : 'send'; ctx().saveSettingsDebounced(); decorateAll(true); return; }
    if (act === 'reroll') { ui.reroll = !ui.reroll; if (ui.reroll) ui.open = true; decorateAll(true); if (ui.reroll) setTimeout(() => document.querySelector('.mbc-rr-in')?.focus(), 30); return; }
    if (act === 'rerollGo') { ui.rerollText = panel.querySelector('.mbc-rr-in')?.value ?? ui.rerollText; const tab = ui.tab ?? 'choices'; const p = tab === 'choices' ? reroll(i, ui.rerollText.trim()) : fetchGuide(i, tab, ui.rerollText.trim()).then(() => { ui.reroll = false; ui.rerollText = ''; }); decorateAll(true); p.then(() => decorateAll(true, true)); return; }
    if (act === 'past') { ui.past.has(i) ? ui.past.delete(i) : ui.past.add(i); decorateAll(); return; }
    if (act === 'branch') { branchHere(i); return; }
    if (act === 'go') { if (ui.sel) choose(ui.sel.i, ui.sel.n).then(() => decorateAll(true)); return; }
    const n = Number(t.dataset.mbcN);
    if (!settings().confirm) { choose(i, n).then(() => decorateAll(true)); return; }
    ui.sel = ui.sel?.i === i && ui.sel?.n === n ? null : { i, n };
    decorateAll(true);
}, true);

// 추가 지시 칸: 적은 글 기억 · Enter로 받기 · 키가 실리태번 단축키로 새지 않게
document.addEventListener('input', (e) => { if (e.target.classList?.contains('mbc-rr-in')) ui.rerollText = e.target.value; }, true);
for (const ev of ['keydown', 'keyup', 'keypress']) document.addEventListener(ev, (e) => {
    if (!e.target.classList?.contains('mbc-rr-in') && !e.target.closest?.('#mbc-editdock')) return;
    if (ev === 'keydown' && e.key === 'Enter' && e.target.classList.contains('mbc-rr-in')) { e.preventDefault(); e.target.closest('.mbc-panel')?.querySelector('[data-mbc-act="rerollGo"]')?.click(); }
    e.stopPropagation();
}, true);

// 확장 설정 칸
function renderSettings() {
    const el = document.createElement('div');
    el.className = 'mbc-settings';
    el.innerHTML = `<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>미트볼폰 선택지</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
        <div class="inline-drawer-content"><label class="checkbox_label"><input type="checkbox" data-mbc-on ${settings().enabled ? 'checked' : ''}> 사용</label>
        <div class="mbc-btns"><button class="menu_button" data-mbc-open>⚙ 선택지 설정</button><button class="menu_button" data-mbc-help>ⓘ 읽는 법</button></div></div></div>`;
    el.querySelector('[data-mbc-on]').addEventListener('change', (e) => { settings().enabled = e.target.checked; ctx().saveSettingsDebounced(); if (!e.target.checked) setInject(''); decorateAll(false, true); });
    el.querySelector('[data-mbc-open]').addEventListener('click', () => openEditor());
    el.querySelector('[data-mbc-help]').addEventListener('click', () => helpSheet());
    document.getElementById('extensions_settings2')?.appendChild(el);
}

// 번역 · 라이트가 본문을 다시 그리면 최근 메시지만 다시 붙이기
let obs = null, obsT = 0;
function watch() {
    const chatEl = document.getElementById('chat');
    if (!chatEl || obs?._el === chatEl) return;
    obs?.disconnect();
    obs = new MutationObserver((muts) => {
        if (busy) return;
        for (const m of muts) for (const n of [...m.addedNodes, ...m.removedNodes]) {
            if (n.nodeType !== 1 || n.closest?.('.mbc-panel') || n.classList?.contains('mbc-panel')) continue;
            clearTimeout(obsT); obsT = setTimeout(() => decorateAll(true), 120); return;
        }
    });
    obs._el = chatEl;
    obs.observe(chatEl, { childList: true, subtree: true });
}

function init() {
    const { eventSource, event_types: E } = ctx();
    settings(); meta();
    renderSettings();
    setOnChange(() => decorateAll(false, true));
    const on = (name, fn) => { if (E[name]) eventSource.on(E[name], fn); };
    on('GENERATION_AFTER_COMMANDS', onBeforeGen);
    on('MESSAGE_SENT', onSent);
    // 지난 선택지는 어떤 경로로도 AI에게 안 감: 본문에서 옮기기 + 보내는 글에서 한 번 더 빼기
    on('CHAT_COMPLETION_PROMPT_READY', (d) => {
        if (!settings().enabled || !Array.isArray(d?.chat)) return;
        for (const m of d.chat) { if (typeof m.content === 'string') m.content = stripOld(m.content); else if (Array.isArray(m.content)) for (const p of m.content) if (p?.type === 'text') p.text = stripOld(p.text); }
    });
    on('GENERATE_AFTER_COMBINE_PROMPTS', (d) => { if (settings().enabled && typeof d?.prompt === 'string') d.prompt = stripOld(d.prompt); });
    on('GENERATION_STARTED', (type, _o, dry) => { if (!dry && type !== 'quiet') { genStarted(); ui.gen = true; ui.sel = null; ui.reroll = false; ui.open = false; ui.tab = 'choices'; } });
    for (const ev of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_RECEIVED', 'CHARACTER_MESSAGE_RENDERED']) on(ev, () => { ui.gen = false; genEnded(); });
    // 답이 끝나면 결과 지시는 지움 (다시 생성하면 GENERATION_AFTER_COMMANDS가 같은 지시를 다시 씀)
    on('MESSAGE_RECEIVED', () => { if (settings().enabled) setInject(buildPrompt(userCount() + 1, null)); });
    for (const ev of ['MESSAGE_SWIPED', 'MESSAGE_DELETED']) on(ev, () => { ui.sel = null; });
    on('CHAT_CHANGED', () => {
        setInject(''); ui.sel = null; ui.reroll = false; ui.open = false; ui.tab = 'choices'; ui.past.clear(); ui.gen = false; liteClear();
        // 채팅을 열면: 마지막 답(아직 고를 수 있는 것)을 뺀 옛 답 정리
        if (settings().enabled) { const last = lastAIIndex(); const chat = ctx().chat ?? []; const end = last >= 0 && !chat[last + 1] ? last : chat.length; if (isGenerating()) afterReply(() => tuckBefore(end) > 0); else if (tuckBefore(end)) requestSave(); }
        setTimeout(() => { watch(); decorateAll(); }, 50);
    });
    for (const ev of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'GENERATION_ENDED', 'GENERATION_STOPPED']) on(ev, () => setTimeout(() => decorateAll(true), 30));
    for (const ev of ['MESSAGE_DELETED', 'MORE_MESSAGES_LOADED']) on(ev, () => setTimeout(() => decorateAll(false), 30));
    // 라이트가 바뀌면 지금 고를 수 있는 선택지만
    let mlT = 0;
    document.addEventListener('meatlite:update', () => { clearTimeout(mlT); mlT = setTimeout(() => { liteClear(); const last = lastAIIndex(); const el = document.querySelector(`#chat .mes[mesid="${last}"]`); if (el) decorate(el, last, true); }, 120); });
    window.addEventListener('resize', () => placeEditDock(), { passive: true });
    watch(); decorateAll();
    console.log(LOG, 'loaded');
}
const { eventSource: _es, event_types: _et } = SillyTavern.getContext();
_es.on(_et.APP_READY, init);
