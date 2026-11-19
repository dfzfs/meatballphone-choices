// 가짜 실리태번: 채팅 · 이벤트 · 생성 흐름 · 스와이프 · 분기 · 삭제를 실리태번처럼 흉내 낸다 (시험 · 스크린샷용)
const Q = new URLSearchParams(location.search);
const L = {};
const es = { on: (e, f) => (L[e] ??= []).push(f), emit: async (e, ...a) => { for (const f of L[e] ?? []) await f(...a); } };
const ET = Object.fromEntries(['APP_READY', 'GENERATION_STARTED', 'GENERATION_AFTER_COMMANDS', 'MESSAGE_SENT', 'CHAT_CHANGED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_RECEIVED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_DELETED', 'MORE_MESSAGES_LOADED', 'CHAT_COMPLETION_PROMPT_READY', 'GENERATE_AFTER_COMBINE_PROMPTS'].map(x => [x, x]));
const clone = (o) => JSON.parse(JSON.stringify(o));

const ST = {
    chat: [], chatId: 'c1', chatMetadata: {}, extensionSettings: {}, extensionPrompts: {},
    sent: [], // 실제로 보낸 프롬프트 기록 { type, text }
    mode: Q.get('mode') === 'text' ? 'text' : 'chat',
    reply: null, // (turn, type) => 답 글
};
const ctxObj = {
    get chat() { return ST.chat; }, get chatId() { return ST.chatId; }, get chatMetadata() { return ST.chatMetadata; },
    extensionSettings: ST.extensionSettings, extensionPrompts: ST.extensionPrompts,
    eventSource: es, event_types: ET,
    saveSettingsDebounced() {}, saveMetadata() {}, saveChat: async () => {}, saveChatDebounced() {},
    setExtensionPrompt(k, v) { ST.extensionPrompts[k] = { value: v }; },
    POPUP_TYPE: { TEXT: 1 },
    Popup: class { constructor(el) { this.el = el; } show() { const p = document.getElementById('pop'); p.firstElementChild.replaceChildren(this.el); p.style.display = 'flex'; return new Promise(() => {}); } },
    messageFormatting: (t) => fmt(t),
    updateMessageBlock: (i) => render(),
    executeSlashCommandsWithOptions: async (cmd) => { const m = cmd.match(/branch-create (\d+)/); if (m) await T.branch(Number(m[1])); },
    generateQuietPrompt: async ({ quietPrompt }) => { ST.quiet = quietPrompt; return '<choices>\n[brave|gamble] Kick the door open || 문을 걷어찬다\n[rational|safe] Knock first || 먼저 노크한다\n[tease|none] Whistle loudly || 크게 휘파람을 분다\n</choices>'; },
};
window.SillyTavern = { getContext: () => ctxObj };
window.toastr = { info() {}, success() {}, warning() {}, error(m) { console.warn('toast', m); } };

if (Q.get('lite') === '1') window.MeatballLite = {
    version: 'test', ready: () => true,
    state: () => ({ date: '3월 14일 밤', loc: '연구동', with: ['서하'], cash: 1200, currency: '원', needs: { hunger: 12 }, attrs: { 힘: 1, 지능: 3, 매력: 1 }, status: [], danger: [{ key: 'hunger', name: '허기', icon: '🍞', stage: '위험', dice: -2 }] }),
    diceParts: (a) => [...(a ? [{ why: a, n: { 힘: 1, 지능: 3, 매력: 1 }[a] ?? 0 }] : []), { why: '허기 위험', n: -2 }],
    preview: (l) => /라면|ramen/i.test(l) ? { text: '−1,500원 · 허기 +40', ok: true } : null,
    luck: (l = '') => ({ rolled: true, stars: 4, tier: '', text: '★★★★☆ 먼저 말을 걸면 좋은 날', good: 'talk', bad: 'fight', fit: /말|노크|Knock/.test(l) ? 1 : 0 }),
    scene: () => ({ goods: [{ name: '컵라면', price: 1500 }], people: [{ name: '서하', want: '오늘 밤 안에 연구실을 확인하고 싶다' }] }),
    paused: () => false,
};

function fmt(t) { return String(t ?? '').replace(/<meatball>[\s\S]*?<\/meatball>/g, '').replace(/<\/?choices>/g, '').split(/\n\n+/).map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`).join(''); }
// 실리태번처럼: 바뀐 메시지만 다시 그림 (보낼 때 채팅 전체를 다시 그리지 않음)
function render(full = false) {
    const c = document.getElementById('chat');
    if (full) c.innerHTML = '';
    ST.chat.forEach((m, i) => {
        const txt = m.extra?.display_text ?? m.mes, sig = `${m.name}|${txt}`;
        let el = c.querySelector(`:scope > .mes[mesid="${i}"]`);
        if (el && el.dataset.sig === sig) { el.classList.toggle('last_mes', i === ST.chat.length - 1); return; }
        const chip = !m.is_user ? `<div class="ml-msg"><span class="ml-chip">⚡ 에너지 −10</span><span class="ml-chip">📍 연구동</span></div>` : '';
        const n = document.createElement('div'); n.className = `mes${i === ST.chat.length - 1 ? ' last_mes' : ''}`; n.setAttribute('mesid', i); n.dataset.sig = sig;
        n.innerHTML = `<div class="name">${m.name}</div><div class="mes_text">${fmt(txt)}</div>${chip}`;
        if (el) el.replaceWith(n); else c.append(n);
    });
    c.querySelectorAll(':scope > .mes').forEach(el => { if (Number(el.getAttribute('mesid')) >= ST.chat.length) el.remove(); });
}
const aiMsg = (mes) => ({ is_user: false, name: '서하', mes, swipes: [mes], swipe_id: 0, swipe_info: [{ extra: {} }], extra: {} });

// 프롬프트 만들기 (실리태번처럼: 채팅 글 + 확장 주입)
async function sendPrompt(type, upto) {
    const msgs = ST.chat.slice(0, upto).filter(m => !m.is_system).map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes }));
    const inj = Object.values(ST.extensionPrompts).map(x => x.value).filter(Boolean).join('\n');
    if (inj) msgs.splice(Math.max(0, msgs.length - 1), 0, { role: 'system', content: inj });
    let text;
    if (ST.mode === 'chat') { const d = { chat: msgs, dryRun: false }; await es.emit('CHAT_COMPLETION_PROMPT_READY', d); text = d.chat.map(m => m.content).join('\n---\n'); }
    else { const d = { prompt: msgs.map(m => m.content).join('\n') }; await es.emit('GENERATE_AFTER_COMBINE_PROMPTS', d); text = d.prompt; }
    ST.sent.push({ type, text });
    return text;
}
const T = {
    ST, render, aiMsg, es,
    async start(n = 3) {
        ST.chat.push(aiMsg('비가 그친 캠퍼스는 조용했다.'));
        render(); await es.emit('APP_READY'); await es.emit('CHAT_CHANGED'); await T.wait();
    },
    wait: (ms = 80) => new Promise(r => setTimeout(r, ms)),
    // 내가 보내기 (text 없으면 입력창 글)
    async send(text, turn) {
        const ta = document.getElementById('send_textarea'); if (text != null) ta.value = text;
        await es.emit('GENERATION_STARTED', 'normal', {}, false);
        await es.emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
        if (ta.value.trim()) { ST.chat.push({ is_user: true, name: '나', mes: ta.value, extra: {} }); ta.value = ''; render(); await es.emit('MESSAGE_SENT', ST.chat.length - 1); await es.emit('USER_MESSAGE_RENDERED', ST.chat.length - 1); }
        await sendPrompt('normal', ST.chat.length);
        ST.chat.push(aiMsg(ST.reply(turn, 'normal'))); render();
        await T.after();
    },
    async after() { const i = ST.chat.length - 1; await es.emit('MESSAGE_RECEIVED', i); await es.emit('CHARACTER_MESSAGE_RENDERED', i); await es.emit('GENERATION_ENDED'); await T.wait(); },
    async regenerate(turn) { ST.chat.pop(); render(); await es.emit('GENERATION_STARTED', 'regenerate', {}, false); await es.emit('GENERATION_AFTER_COMMANDS', 'regenerate', {}, false); await sendPrompt('regenerate', ST.chat.length); ST.chat.push(aiMsg(ST.reply(turn, 'regenerate'))); render(); await T.after(); },
    async swipeNew(turn) {
        const m = ST.chat[ST.chat.length - 1];
        await es.emit('GENERATION_STARTED', 'swipe', {}, false); await es.emit('GENERATION_AFTER_COMMANDS', 'swipe', {}, false);
        await sendPrompt('swipe', ST.chat.length - 1);
        const t = ST.reply(turn, 'swipe'); m.swipes.push(t); m.swipe_info.push({ extra: {} }); m.swipe_id = m.swipes.length - 1; m.mes = t; m.extra = {};
        render(); await es.emit('MESSAGE_SWIPED', ST.chat.length - 1); await T.after();
    },
    async swipeTo(k) { const m = ST.chat[ST.chat.length - 1]; m.swipe_id = k; m.mes = m.swipes[k]; m.extra = clone(m.swipe_info[k]?.extra ?? {}); render(); await es.emit('MESSAGE_SWIPED', ST.chat.length - 1); await T.wait(); },
    async cont() { await es.emit('GENERATION_STARTED', 'continue', {}, false); await es.emit('GENERATION_AFTER_COMMANDS', 'continue', {}, false); await sendPrompt('continue', ST.chat.length); const m = ST.chat[ST.chat.length - 1]; m.mes += ' 그리고 조용해졌다.'; m.swipes[m.swipe_id] = m.mes; render(); await T.after(); },
    async del(from) { ST.chat.splice(from); render(); await es.emit('MESSAGE_DELETED', from); await T.wait(); },
    async branch(at) { ST.chat = clone(ST.chat.slice(0, at + 1)); ST.chatId = `${ST.chatId}-b${at}`; ST.chatMetadata = {}; render(true); await es.emit('CHAT_CHANGED'); await T.wait(150); },
    async reopen() { ST.chat = clone(ST.chat); render(true); await es.emit('CHAT_CHANGED'); await T.wait(150); },
};
window.T = T;
