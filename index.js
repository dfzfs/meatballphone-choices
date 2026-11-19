// 미트볼 선택지 — 답 끝의 선택지를 게임 선택지 창으로. 미트볼 상태창 칩 위에 뜬다.
// 성향(18종 · 직접 만들기) × 위험(6종) · 미트볼 능력치 · 수치 · 오늘의 운세로 굴리는 d20 · 위험 모드 · 효과
import { settings, ctx, meta, saveMeta, userCount, LOG, mbClear } from './src/core.js';
import { onBeforeGen, setInject, buildPrompt } from './src/prompt.js';
import { decorate, lastAIIndex, ui, choose, helpSheet } from './src/panel.js';
import { screenFx, wireHover } from './src/fx.js';
import { openEditor, setOnChange } from './src/editor.js';

let busy = false;
function decorateAll(recentOnly = false, force = false) {
    if (busy) return;
    busy = true;
    try {
        const lastAI = lastAIIndex();
        const els = [...document.querySelectorAll('#chat .mes')];
        (recentOnly ? els.slice(-4) : els).forEach(el => { try { decorate(el, lastAI, force); } catch (e) { console.warn(LOG, e); } });
        screenFx();
    } finally { busy = false; }
}

// 사용자가 보낸 메시지에 고른 선택을 붙인다 (스와이프 · 삭제 · 브랜치에 저절로 맞음)
function onSent(idx) {
    const chat = ctx().chat ?? [];
    const i = Number.isFinite(Number(idx)) ? Number(idx) : chat.length - 1;
    const m = chat[i], md = meta();
    if (!m?.is_user) return;
    if (md.pending && m.mes.includes(md.pending.label.slice(0, 8))) m.extra = { ...(m.extra ?? {}), mbc: md.pending };
    md.pending = null;
    saveMeta();
    if (settings().enabled) setInject(buildPrompt(userCount(), m.extra?.mbc ?? null));
}

// 누르기
document.addEventListener('click', (e) => {
    const t = e.target.closest?.('.mbc-panel [data-mbc-act], .mbc-panel .mbc-opt[data-mbc-i]');
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    const panel = t.closest('.mbc-panel');
    const i = Number(panel.closest('.mes')?.getAttribute('mesid'));
    const act = t.dataset.mbcAct;
    if (act === 'help' || act === 'luck' || act === 'heat') { helpSheet(act); return; }
    if (act === 'edit') { openEditor(); return; }
    if (act === 'group') { ui.group = t.dataset.g; ui.sel = null; decorateAll(true); return; }
    if (act === 'back') { ui.group = null; ui.sel = null; decorateAll(true); return; }
    if (act === 'go') { if (ui.sel) choose(ui.sel.i, ui.sel.n).then(() => decorateAll(true)); return; }
    if (t.disabled) return;
    const n = Number(t.dataset.mbcN);
    if (!settings().confirm) { choose(i, n).then(() => decorateAll(true)); return; }
    ui.sel = ui.sel?.i === i && ui.sel?.n === n ? null : { i, n };
    decorateAll(true);
    panel.querySelector('.mbc-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}, true);

// 확장 설정 칸: 한 줄 + 편집기 열기
function renderSettings() {
    const el = document.createElement('div');
    el.className = 'mbc-settings';
    el.innerHTML = `<div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header"><b>미트볼 선택지</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
        <div class="inline-drawer-content">
            <label class="checkbox_label"><input type="checkbox" data-mbc-on ${settings().enabled ? 'checked' : ''}> 사용</label>
            <div class="mbc-btns"><button class="menu_button" data-mbc-open>⚙ 선택지 설정 열기</button><button class="menu_button" data-mbc-help>ⓘ 읽는 법</button></div>
        </div></div>`;
    el.querySelector('[data-mbc-on]').addEventListener('change', (e) => { settings().enabled = e.target.checked; ctx().saveSettingsDebounced(); if (!e.target.checked) setInject(''); decorateAll(false, true); });
    el.querySelector('[data-mbc-open]').addEventListener('click', () => openEditor());
    el.querySelector('[data-mbc-help]').addEventListener('click', () => helpSheet());
    document.getElementById('extensions_settings2')?.appendChild(el);
}

// 번역 · 미트볼이 본문을 다시 그리면 다시 붙인다 (최근 메시지만, 모아서 한 번)
let obs = null, timer = 0;
function watch() {
    const chatEl = document.getElementById('chat');
    if (!chatEl || obs?._el === chatEl) return;
    obs?.disconnect();
    obs = new MutationObserver((muts) => {
        if (busy) return;
        for (const m of muts) for (const n of [...m.addedNodes, ...m.removedNodes]) {
            if (n.nodeType !== 1 || n.closest?.('.mbc-panel') || n.classList?.contains('mbc-panel') || n.classList?.contains('mbc-z') || n.classList?.contains('mbc-redact')) continue;
            clearTimeout(timer); timer = setTimeout(() => decorateAll(true), 120); return;
        }
    });
    obs._el = chatEl;
    obs.observe(chatEl, { childList: true, subtree: true });
}

// 설정이 바뀌면: 일그러진 글자를 풀고 다시 그린다
function rerenderAll() {
    const c = ctx();
    document.querySelectorAll('#chat .mes').forEach(el => {
        const i = Number(el.getAttribute('mesid'));
        const t = el.querySelector('.mes_text');
        if (t && [...t.querySelectorAll('.mbc-z')].some(z => !z.closest('.mbc-panel')) && c.chat?.[i] && c.messageFormatting) {
            try { const m = c.chat[i]; t.innerHTML = c.messageFormatting(m.extra?.display_text ?? m.mes, m.name, m.is_system, m.is_user, i); } catch { /* 다음 갱신 때 */ }
        }
        if (t) t.dataset.mbcZ = '';
    });
    decorateAll(false, true);
}

function init() {
    const { eventSource, event_types: E } = ctx();
    settings();
    renderSettings();
    wireHover();
    setOnChange(rerenderAll);
    const on = (name, fn) => { if (E[name]) eventSource.on(E[name], fn); };
    on('GENERATION_AFTER_COMMANDS', onBeforeGen);
    on('MESSAGE_SENT', onSent);
    on('CHAT_CHANGED', () => { setInject(''); ui.sel = null; ui.group = null; setTimeout(() => { watch(); decorateAll(); }, 50); });
    for (const ev of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'GENERATION_ENDED', 'GENERATION_STOPPED']) on(ev, () => setTimeout(() => decorateAll(true), 30));
    for (const ev of ['MESSAGE_DELETED', 'MORE_MESSAGES_LOADED']) on(ev, () => setTimeout(() => decorateAll(false), 30));
    // 미트볼 라이트 상태가 바뀌면 (대가 미리 보기 · 확률 · 운세) 최근 선택지만 다시
    let mlT = 0;
    document.addEventListener('meatlite:update', () => { clearTimeout(mlT); mlT = setTimeout(() => { mbClear(); decorateAll(true, true); }, 120); });
    watch(); decorateAll();
    console.log(LOG, 'loaded');
}
const { eventSource: _es, event_types: _et } = SillyTavern.getContext();
_es.on(_et.APP_READY, init);
