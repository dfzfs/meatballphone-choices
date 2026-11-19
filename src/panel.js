// 선택지 창: 지금 고를 수 있는 답엔 목록 · 지난 답엔 고른 것 하나만 칩
import { settings, ctx, esc, meta, saveMeta, kindOf, riskOf, kindsOn, risksOn, checkFor, rollCheck, userCount, lite, liteLuck, litePreview, setExtra } from './core.js';
import { choicesOf, NUM_RE, TAG_RE, setInject, buildPrompt, rerollPrompt } from './prompt.js';

const SLOT_SEL = '.ss-slot, .custom-ss-slot, .ml-msg';
export const ui = { sel: null, open: new Set(), reroll: false, rerollText: '', rerolling: false, rolling: false, gen: false };

const seedOf = (i, n) => `${ctx().chatId ?? ''}:${i}:${n}`;
const badge = (r) => r.id === 'none' ? '' : `<span class="mbc-badge t-${r.tone}">${r.icon} ${esc(r.name)}</span>`;
export const checkOf = (i, it, n) => checkFor(it.kind, it.risk, seedOf(i, n), it.label);
const resText = (c) => c ? `🎲 ${c.roll}${c.mod ? `${c.mod > 0 ? '+' : '−'}${Math.abs(c.mod)}` : ''} ${c.crit ? '대성공' : c.fumble ? '대실패' : c.ok ? '성공' : '실패'}` : '';

// ───── 지금 고를 수 있는 선택지 ─────
function optHTML(i, it, n) {
    const k = kindOf(it.kind) ?? { icon: '•', name: it.kind };
    const r = riskOf(it.risk), ch = checkOf(i, it, n), cost = litePreview(it.label);
    const fit = liteLuck(it.label)?.fit ?? 0;
    const sel = ui.sel?.i === i && ui.sel?.n === n;
    return `<button class="mbc-opt${sel ? ' sel' : ''}" data-mbc-i="${i}" data-mbc-n="${n}">
        <span class="mbc-kind" title="${esc(k.desc ?? '')}"><span class="ic">${k.icon}</span><span class="nm">${esc(k.name)}</span>${fit > 0 ? '<span class="mbc-lucky" title="오늘 운세와 맞음">🍀</span>' : fit < 0 ? '<span class="mbc-unlucky" title="오늘 조심할 행동">⚠</span>' : ''}</span>
        <span class="mbc-label">${esc(it.label)}${cost ? `<span class="mbc-cost${cost.ok ? '' : ' poor'}">${esc(cost.text)}</span>` : ''}</span>
        <span class="mbc-tags">${badge(r)}${ch ? `<span class="mbc-odds" title="성공 확률">${ch.pct}%</span>` : ''}</span>
    </button>`;
}
function detailHTML(i, it, n) {
    const k = kindOf(it.kind), r = riskOf(it.risk), ch = checkOf(i, it, n), cost = litePreview(it.label);
    const row = (ic, b, s) => `<div class="mbc-d-row"><span class="mbc-d-ic">${ic}</span><div class="mbc-d-txt"><b>${b}</b><small>${s}</small></div></div>`;
    return `<div class="mbc-detail">
        ${k ? row(k.icon, esc(k.name), esc(k.desc)) : ''}
        ${r.id !== 'none' ? row(r.icon, esc(r.name), esc(r.desc)) : ''}
        ${cost ? row('🧾', esc(cost.text), cost.ok ? '미트볼 라이트 예상' : '돈이 모자라요') : ''}
        ${ch ? row('🎲', `${ch.dcName} ${ch.dc} · 성공 ${ch.pct}%`, `d20 ${ch.parts.map(([a, v]) => `<span class="mbc-part ${v >= 0 ? 'good' : 'bad'}">${esc(a)} ${v >= 0 ? '+' : '−'}${Math.abs(v)}</span>`).join('') || '<span class="mbc-part">보정 없음</span>'}`) : ''}
        <div class="mbc-d-go"><span class="mbc-dice" hidden></span><button class="mbc-go" data-mbc-act="go">이걸로 <span aria-hidden="true">›</span></button></div>
    </div>`;
}
function liveHTML(i, items) {
    const set = settings();
    const ll = liteLuck();
    const luck = ll?.rolled ? `<button class="mbc-chip" data-mbc-act="help" title="${esc(ll.text)}">🍀 ${ll.tier || '★'.repeat(ll.stars ?? 0)}</button>` : '';
    const head = `<div class="mbc-head"><span class="mbc-title">무엇을 할까요</span>${luck}<span class="mbc-sp"></span>
        <button class="mbc-chip" data-mbc-act="click" title="고르면 입력창에 넣을지 바로 보낼지 (눌러서 바꾸기)">${set.click === 'send' ? '➤<span class="t"> 바로 보내기</span>' : '↵<span class="t"> 입력창에</span>'}</button>
        <button class="mbc-icon${ui.reroll ? ' on' : ''}" data-mbc-act="reroll" title="선택지만 다시 받기" aria-label="선택지만 다시 받기">🔄</button>
        <button class="mbc-icon" data-mbc-act="help" title="읽는 법" aria-label="읽는 법">ⓘ</button>
        <button class="mbc-icon" data-mbc-act="edit" title="설정" aria-label="설정">⚙</button></div>`;
    const rr = ui.reroll ? `<div class="mbc-reroll"><input type="text" class="mbc-rr-in" placeholder="추가 지시 (비워도 돼요) · 예: 더 과감하게" value="${esc(ui.rerollText)}"><button class="mbc-go sm" data-mbc-act="rerollGo" ${ui.rerolling ? 'disabled' : ''}>${ui.rerolling ? '받는 중…' : '다시 받기'}</button></div>` : '';
    const det = set.confirm && ui.sel?.i === i && items[ui.sel.n] ? detailHTML(i, items[ui.sel.n], ui.sel.n) : '';
    return `${head}${rr}<div class="mbc-list">${items.map((it, n) => optHTML(i, it, n)).join('')}</div>${det}`;
}

// ───── 지난 답: 고른 것 하나만 칩 (누르면 그때 선택지 전체 · 「여기서 다른 선택」) ─────
function chipHTML(i, items, picked) {
    const it = items[picked.n] ?? { label: picked.shown ?? picked.label, kind: picked.kind };
    const k = kindOf(it.kind ?? picked.kind);
    const open = ui.open.has(i);
    const all = open ? `<div class="mbc-past">${items.map((x, n) => { const kk = kindOf(x.kind); const r = riskOf(x.risk); return `<div class="mbc-past-row${n === picked.n ? ' mine' : ''}"><span>${n === picked.n ? '✔' : '·'}</span><span class="nm">${kk?.icon ?? ''} ${esc(kk?.name ?? '')}</span><span class="tx">${esc(x.label)}</span>${badge(r)}</div>`; }).join('')}<div class="mbc-past-go"><button class="mbc-chip" data-mbc-act="branch" title="이 답에서 새 분기를 만들고 선택지를 다시 열어요">↪ 여기서 다른 선택</button></div></div>` : '';
    return `<button class="mbc-pick" data-mbc-act="past" aria-expanded="${open}"><span class="nm">✔ ${k?.icon ?? ''} ${esc(k?.name ?? '')}</span><span class="tx">${esc(it.label)}</span>${picked.check ? `<span class="mbc-res ${picked.check.ok ? 'good' : 'bad'}">${resText(picked.check)}</span>` : ''}${picked.risk === 'price' ? '<span class="mbc-res">💸 대가</span>' : ''}<span class="mbc-more">${open ? '접기' : `선택지 ${items.length}개`}</span></button>${all}`;
}

// ───── 메시지에 붙이기 ─────
const norm = (s) => String(s ?? '').replace(/<\/?choices>/gi, '').replace(NUM_RE, '').replace(TAG_RE, '').replace(/\s+/g, '').toLowerCase();
function stripRaw(textEl, items) {
    textEl.querySelectorAll('choices, .custom-choices').forEach(e => e.remove());
    const keys = new Set(items.flatMap(it => [norm(it.label), norm(it.raw), norm(it.orig), norm(it.origRaw)]).filter(Boolean));
    const isLine = (s) => { const n = norm(s); return !n || keys.has(n); };
    for (const el of [...textEl.querySelectorAll(':scope > p, :scope > ol, :scope > ul, :scope > div:not(.mbc-panel):not(.ss-slot):not(.custom-ss-slot), :scope > pre')]) {
        if (el.closest('.mbc-panel') || el.matches(SLOT_SEL)) continue;
        const c = el.cloneNode(true);
        c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
        c.querySelectorAll('li').forEach(li => li.append('\n'));
        const lines = c.textContent.split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length && lines.every(isLine) && lines.some(l => keys.has(norm(l)))) el.remove();
    }
    const w = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT), dead = [];
    while (w.nextNode()) if (/<\/?choices>/i.test(w.currentNode.nodeValue) && !w.currentNode.parentElement.closest('.mbc-panel')) dead.push(w.currentNode);
    dead.forEach(n => { n.nodeValue = n.nodeValue.replace(/<\/?choices>/gi, ''); });
}
function place(textEl, panel) {
    const inSlot = textEl.querySelector(SLOT_SEL);
    const outSlot = textEl.parentElement?.querySelector(':scope > .ss-slot.out, :scope > .ml-msg');
    if (inSlot) { if (panel.nextElementSibling !== inSlot) inSlot.before(panel); }
    else if (outSlot) { if (panel.nextElementSibling !== outSlot) outSlot.before(panel); }
    else if (panel.parentElement !== textEl || panel !== textEl.lastElementChild) textEl.append(panel);
}
export function lastAIIndex() {
    const chat = ctx().chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) if (!chat[i].is_user && !chat[i].is_system) return i;
    return -1;
}
const pickedFor = (i) => { const u = (ctx().chat ?? [])[i + 1]; return u?.is_user ? u.extra?.mbc ?? null : null; };

export function decorate(mesEl, lastAI, force = false) {
    const i = Number(mesEl.getAttribute('mesid'));
    const textEl = mesEl.querySelector('.mes_text');
    if (!textEl || Number.isNaN(i)) return;
    const items = settings().enabled ? choicesOf(i) : null;
    let panel = mesEl.querySelector('.mbc-panel');
    if (!items) { panel?.remove(); return; }
    stripRaw(textEl, items);
    const live = i === lastAI && !ctx().chat?.[i + 1];
    if (live && ui.gen) { panel?.remove(); return; } // 받는 중엔 그리지 않음
    const picked = live ? null : pickedFor(i);
    if (!live && !picked) { panel?.remove(); return; } // 고르지 않고 직접 쓴 답이면 칩도 없음
    const typing = panel?.contains(document.activeElement) && document.activeElement.classList.contains('mbc-rr-in');
    const key = JSON.stringify(live ? [items.map(x => x.label + x.kind + x.risk), ui.sel, ui.reroll, ui.rerolling, settings().click, settings().confirm, liteLuck()?.stars ?? 0, settings()._rev] : [items.length, picked.n, picked.check?.roll, ui.open.has(i)]);
    if (!panel) panel = document.createElement('div');
    if (!typing && (force || panel.dataset.key !== key)) { panel.innerHTML = live ? liveHTML(i, items) : chipHTML(i, items, picked); panel.dataset.key = key; }
    panel.className = `mbc-panel ${live ? 'live' : 'done'}`;
    place(textEl, panel);
}

// ───── 고르기 ─────
export async function choose(i, n) {
    const items = choicesOf(i), it = items?.[n];
    if (!it || ui.rolling) return;
    const set = settings();
    const panel = document.querySelector(`#chat .mes[mesid="${i}"] .mbc-panel`);
    const ch = checkOf(i, it, n);
    const check = ch ? rollCheck(ch, `${seedOf(i, n)}:${userCount()}`) : null;
    if (check && panel) await rollAnim(panel, check);
    const label = set.input === 'shown' ? it.label : (it.orig ?? it.label);
    const p = { n, kind: it.kind, risk: it.risk, label, shown: it.label, check };
    meta().pending = p; saveMeta();
    ui.sel = null; ui.reroll = false;
    insertInput(label, set.click === 'send');
    setInject(buildPrompt(userCount() + 1, p));
}
function rollAnim(panel, c) {
    ui.rolling = true;
    const box = panel.querySelector('.mbc-dice') ?? (() => { const d = document.createElement('div'); d.className = 'mbc-dice solo'; panel.append(d); return d; })();
    box.hidden = false;
    return new Promise(res => {
        let k = 0;
        const t = setInterval(() => {
            box.textContent = `🎲 ${1 + Math.floor(Math.random() * 20)}`;
            if (++k < 10) return;
            clearInterval(t);
            box.innerHTML = `🎲 <b>${c.roll}</b>${c.mod ? ` ${c.mod > 0 ? '+' : '−'} ${Math.abs(c.mod)}` : ''} = ${c.roll + c.mod} <small>/ ${c.dc}</small> · ${c.crit ? '대성공' : c.fumble ? '대실패' : c.ok ? '성공' : '실패'}`;
            box.classList.add(c.ok ? 'good' : 'bad');
            ui.rolling = false;
            setTimeout(res, 700);
        }, 55);
    });
}
function insertInput(text, send) {
    const ta = document.getElementById('send_textarea');
    if (!ta) return;
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    if (send) document.getElementById('send_but')?.click();
}

// ───── 「여기서 다른 선택」: 실리태번 기본 분기 ─────
export async function branchHere(i) {
    const c = ctx();
    const btn = document.querySelector(`#chat .mes[mesid="${i}"] .mes_create_branch`);
    if (btn) { btn.click(); return; }
    try { await (c.executeSlashCommandsWithOptions ?? c.executeSlashCommands)?.(`/branch-create ${i}`); }
    catch (e) { toastr.error('분기를 만들지 못했어요. 메시지 ⋯ › 분기 만들기를 써 주세요.', '미트볼 선택지'); }
}

// ───── 🔄 선택지만 다시 받기 ─────
async function quietGen(prompt) {
    const g = ctx().generateQuietPrompt;
    if (typeof g !== 'function') throw new Error('이 실리태번은 조용한 생성을 못 해요');
    return g.length >= 2 ? await g(prompt, false, true) : await g({ quietPrompt: prompt, skipWIAN: true });
}
const swap = (text, block) => /<choices>/i.test(text ?? '') ? text.replace(/<choices>[\s\S]*?(?:<\/choices>|$)/i, block) : null;
export async function reroll(i, extra) {
    const c = ctx(), m = c.chat?.[i];
    if (!m || ui.rerolling) return;
    const items = choicesOf(i) ?? [];
    const gloss = !!(m.extra?.display_text || m.extra?.mbcShown);
    ui.rerolling = true;
    try {
        const out = String(await quietGen(rerollPrompt(i, items.map(x => x.orig ?? x.label), extra, gloss)) ?? '');
        const body = out.match(/<choices>([\s\S]*?)(?:<\/choices>|$)/i)?.[1] ?? out;
        const lines = body.split('\n').map(x => x.trim()).filter(x => /^\s*(?:\d+[.)]\s*)?[\[【〔]/.test(x));
        if (!lines.length) throw new Error('선택지를 못 받았어요');
        const orig = `<choices>\n${lines.map(x => x.split('||')[0].trim()).join('\n')}\n</choices>`;
        const shown = `<choices>\n${lines.map(x => { const [a, b] = x.split('||'); const tag = a.match(/^\s*(?:\d+[.)]\s*)?[\[【〔][^\]】〕]*[\]】〕]/)?.[0] ?? ''; return b ? `${tag} ${b.trim()}` : a.trim(); }).join('\n')}\n</choices>`;
        const inMes = swap(m.mes, orig);
        if (inMes !== null) { m.mes = inMes; if (Array.isArray(m.swipes) && Number.isInteger(m.swipe_id)) m.swipes[m.swipe_id] = m.mes; }
        const patch = { mbcRe: (m.extra?.mbcRe ?? 0) + 1 };
        if (inMes === null) patch.mbcBlock = orig; // 이미 본문에서 옮겨 둔 답(분기 · 삭제로 다시 살아난 답)
        if (gloss) { const d = swap(m.extra?.display_text, shown); if (d !== null) patch.display_text = d; else patch.mbcShown = shown; }
        setExtra(m, patch);
        await c.saveChat?.();
        if (typeof c.updateMessageBlock === 'function') c.updateMessageBlock(i, m);
        ui.sel = null; ui.reroll = false; ui.rerollText = '';
    } catch (e) { toastr.error(String(e?.message ?? e), '미트볼 선택지'); }
    finally { ui.rerolling = false; }
}

// ───── 읽는 법 ─────
export async function helpSheet() {
    const ll = liteLuck();
    const row = (ic, b, s) => `<div class="mbc-row"><span class="ic">${ic}</span><div class="tx"><b>${b}</b><small>${s}</small></div></div>`;
    const html = `<div class="mbc-sheet">
        <div class="mbc-sec">성향 — 어떤 마음으로 하는 행동인지</div><div class="mbc-card">${kindsOn().map(k => row(k.icon, esc(k.name), esc(k.desc))).join('')}</div>
        <div class="mbc-sec">위험</div><div class="mbc-card">${risksOn().map(r => row(r.icon || '·', esc(r.name), esc(r.desc))).join('')}</div>
        <div class="mbc-sec">주사위</div><div class="mbc-card">${row('🎲', 'd20 + 보정 ≥ 난이도면 성공', '20은 늘 성공(대성공), 1은 늘 실패(대실패). 고르는 순간 굴려요.')}${row('🧮', '보정', lite() ? '미트볼 라이트의 능력치 · 욕구 위험 · 상태 딱지 · 장비 + 오늘 운세(🍀 +2 · ⚠ −2, 운에 맡기기는 두 배)' : '미트볼 라이트를 켜면 능력치 · 상태 · 운세가 들어가요. 지금은 보정 없음')}</div>
        ${lite() ? `<div class="mbc-sec">오늘 운세 · 미트볼 라이트</div><div class="mbc-card">${row('🍀', ll?.rolled ? esc(ll.text) : '아직 안 굴림', ll?.rolled ? '운세와 맞는 선택지 🍀 · 조심할 행동 ⚠' : '라이트 › 주사위에서 「오늘 운세 굴리기」를 하면 선택지에 🍀 · ⚠가 붙어요')}</div>` : ''}
        <div class="mbc-sec">지난 선택지</div><div class="mbc-card">${row('✔', '고른 것만 칩으로 남아요', '칩을 누르면 그때 선택지 전체를 볼 수 있고, 「여기서 다른 선택」으로 그 답에서 분기해 다시 고를 수 있어요. 지난 선택지는 AI에게 가지 않아요.')}</div>
    </div>`;
    const c = ctx(), el = document.createElement('div');
    el.innerHTML = `<h3 class="mbc-sheet-title">선택지 읽는 법</h3>${html}`;
    if (c.Popup && c.POPUP_TYPE) await new c.Popup(el, c.POPUP_TYPE.TEXT, '', { wide: false, allowVerticalScrolling: true, okButton: '닫기' }).show();
}
