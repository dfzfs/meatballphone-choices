// 선택지 창: 지금 고를 수 있는 답엔 목록 · 지난 답엔 고른 것 하나만 칩
import { settings, ctx, esc, meta, saveMeta, kindOf, riskOf, kindsOn, risksOn, checkFor, rollCheck, userCount, lite, liteLuck, litePreview, setExtra } from './core.js';
import { choicesOf, NUM_RE, TAG_RE, setInject, buildPrompt, rerollPrompt } from './prompt.js';
import { gst, guideOn, guideRows, guideItems, guideLabel, SECTIONS } from './guide.js';

const SLOT_SEL = '.ss-slot, .custom-ss-slot, .ml-msg';
export const ui = { sel: null, past: new Set(), open: false, reroll: false, rerollText: '', rerolling: false, rolling: false, gen: false, tab: 'choices', hover: false, hoverBlock: false, side: false };

const seedOf = (i, n) => `${ctx().chatId ?? ''}:${i}:${n}`;
const badge = (r) => r.id === 'none' ? '' : `<span class="mbc-badge t-${r.tone}">${r.icon} ${esc(r.name)}</span>`;
const shownRisk = (id) => { const r = riskOf(id); return r.disguise ? riskOf(r.disguise) : r; }; // 함정은 「안전」으로 보임
export const checkOf = (i, it, n) => checkFor(it.kind, shownRisk(it.risk).id, seedOf(i, n), it.label);
const resText = (c) => c ? `🎲 ${c.roll}${c.mod ? `${c.mod > 0 ? '+' : '−'}${Math.abs(c.mod)}` : ''} ${c.crit ? '대성공' : c.fumble ? '대실패' : c.ok ? '성공' : '실패'}` : '';

// ───── 지금 고를 수 있는 선택지 ─────
function optHTML(i, it, n) {
    const k = kindOf(it.kind) ?? { icon: '•', name: it.kind };
    const r = shownRisk(it.risk), ch = checkOf(i, it, n), cost = litePreview(it.label);
    const fit = liteLuck(it.label)?.fit ?? 0;
    const sel = ui.sel?.i === i && ui.sel?.n === n;
    return `<button class="mbc-opt${sel ? ' sel' : ''}" data-mbc-i="${i}" data-mbc-n="${n}">
        <span class="mbc-kind" title="${esc(k.desc ?? '')}"><span class="ic">${k.icon}</span><span class="nm">${esc(k.name)}</span>${fit > 0 ? '<span class="mbc-lucky" title="오늘 운세와 맞음">🍀</span>' : fit < 0 ? '<span class="mbc-unlucky" title="오늘 조심할 행동">⚠</span>' : ''}</span>
        <span class="mbc-label">${esc(it.label)}${cost ? `<span class="mbc-cost${cost.ok ? '' : ' poor'}">${esc(cost.text)}</span>` : ''}</span>
        <span class="mbc-tags">${badge(r)}${ch ? `<span class="mbc-odds" title="성공 확률">${ch.pct}%</span>` : ''}</span>
    </button>`;
}
function detailHTML(i, it, n) {
    const k = kindOf(it.kind), r = shownRisk(it.risk), ch = checkOf(i, it, n), cost = litePreview(it.label);
    const row = (ic, b, s) => `<div class="mbc-d-row"><span class="mbc-d-ic">${ic}</span><div class="mbc-d-txt"><b>${b}</b><small>${s}</small></div></div>`;
    return `<div class="mbc-detail">
        ${k ? row(k.icon, esc(k.name), esc(k.desc)) : ''}
        ${r.id !== 'none' ? row(r.icon, esc(r.name), esc(r.desc)) : ''}
        ${cost ? row('🧾', esc(cost.text), cost.ok ? '미트볼 라이트 예상' : '돈이 모자라요') : ''}
        ${ch ? row('🎲', `${ch.dcName} ${ch.dc} · 성공 ${ch.pct}%`, `d20 ${ch.parts.map(([a, v]) => `<span class="mbc-part ${v >= 0 ? 'good' : 'bad'}">${esc(a)} ${v >= 0 ? '+' : '−'}${Math.abs(v)}</span>`).join('') || '<span class="mbc-part">보정 없음</span>'}`) : ''}
        <div class="mbc-d-go"><span class="mbc-dice" hidden></span><button class="mbc-go" data-mbc-act="go">이걸로 <span aria-hidden="true">›</span></button></div>
    </div>`;
}
// 탭: 🎯 선택지 · 🧭 진행 · 🔎 숨은 사실 · 🔮 스포 — 같은 자리, 같은 목록 모양
export const TABS = () => [['choices', '🎯', '선택지'], ...guideOn().map(k => [k, SECTIONS[k].icon, SECTIONS[k].name])];
const curTab = () => TABS().some(t => t[0] === ui.tab) ? ui.tab : 'choices';
function liveHTML(i, items) {
    const set = settings(), tab = curTab();
    const ll = liteLuck();
    const luck = ll?.rolled ? `<button class="mbc-chip" data-mbc-act="help" title="${esc(ll.text)}">🍀<span class="t"> ${ll.tier || '★'.repeat(ll.stars ?? 0)}</span></button>` : '';
    const tabs = TABS().length > 1 ? `<div class="mbc-tabs">${TABS().map(([id, ic, nm]) => `<button class="mbc-tab${id === tab ? ' on' : ''}" data-mbc-act="tab" data-g="${id}">${ic}<span class="t"> ${nm}</span>${id !== 'choices' && guideItems(i, id).length ? ` <small>${guideItems(i, id).length}</small>` : ''}</button>`).join('')}</div>` : '<span class="mbc-title">무엇을 할까요</span>';
    const head = `<div class="mbc-head">${tabs}<span class="mbc-sp"></span>${luck}
        <button class="mbc-chip" data-mbc-act="click" title="고르면 입력창에 넣을지 바로 보낼지 (눌러서 바꾸기)">${set.click === 'send' ? '➤<span class="t"> 바로 보내기</span>' : '↵<span class="t"> 입력창에</span>'}</button>
        <button class="mbc-icon${ui.reroll ? ' on' : ''}" data-mbc-act="reroll" title="이 탭 다시 받기 (추가 지시 가능)" aria-label="다시 받기">🔄</button>
        <button class="mbc-icon" data-mbc-act="help" title="읽는 법" aria-label="읽는 법">ⓘ</button>
        <button class="mbc-icon" data-mbc-act="edit" title="설정" aria-label="설정">⚙</button></div>`;
    const busy = tab === 'choices' ? ui.rerolling : !!gst.busy;
    const rr = ui.reroll ? `<div class="mbc-reroll"><input type="text" class="mbc-rr-in" placeholder="추가 지시 (비워도 돼요) · 예: ${tab === 'facts' ? '인물 비밀 위주로' : tab === 'route' ? '로맨스 쪽으로' : '더 과감하게'}" value="${esc(ui.rerollText)}"><button class="mbc-go sm" data-mbc-act="rerollGo" ${busy ? 'disabled' : ''}>${busy ? '받는 중…' : '다시 받기'}</button></div>` : '';
    if (tab !== 'choices') return `${head}${rr}${guideRows(i, tab)}`;
    const det = set.confirm && ui.sel?.i === i && items[ui.sel.n] ? detailHTML(i, items[ui.sel.n], ui.sel.n) : '';
    const list = items.length ? `<div class="mbc-list">${items.map((it, n) => optHTML(i, it, n)).join('')}</div>` : '<div class="mbc-gempty"><span>이 답엔 선택지가 없어요</span><button class="mbc-chip" data-mbc-act="reroll">🔄 선택지 받기</button></div>';
    return `${head}${rr}${list}${det}`;
}

// ───── 지난 답: 고른 것 하나만 칩 (누르면 그때 선택지 전체 · 「여기서 다른 선택」) ─────
function chipHTML(i, items, picked) {
    const it = items[picked.n] ?? { label: picked.shown ?? picked.label, kind: picked.kind };
    const k = kindOf(it.kind ?? picked.kind);
    const open = ui.past.has(i);
    const all = open ? `<div class="mbc-past">${items.map((x, n) => { const kk = kindOf(x.kind); const r = riskOf(x.risk); return `<div class="mbc-past-row${n === picked.n ? ' mine' : ''}"><span>${n === picked.n ? '✔' : '·'}</span><span class="nm">${kk?.icon ?? ''} ${esc(kk?.name ?? '')}</span><span class="tx">${esc(x.label)}</span>${badge(r)}</div>`; }).join('')}<div class="mbc-past-go"><button class="mbc-chip" data-mbc-act="branch" title="이 답에서 새 분기를 만들고 선택지를 다시 열어요">↪ 여기서 다른 선택</button></div></div>` : '';
    return `<button class="mbc-pick" data-mbc-act="past" aria-expanded="${open}"><span class="nm">✔ ${k?.icon ?? ''} ${esc(k?.name ?? '')}</span><span class="tx">${esc(it.label)}</span>${picked.check ? `<span class="mbc-res ${picked.check.ok ? 'good' : 'bad'}">${resText(picked.check)}</span>` : ''}${picked.risk === 'price' ? '<span class="mbc-res">💸 대가</span>' : ''}${picked.risk === 'trap' ? '<span class="mbc-res bad">🪤 함정이었다</span>' : ''}<span class="mbc-more">${open ? '접기' : `선택지 ${items.length}개`}</span></button>${all}`;
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
    const set = settings();
    const live = i === lastAI && !ctx().chat?.[i + 1];
    let items = set.enabled ? choicesOf(i) : null;
    let panel = mesEl.querySelector('.mbc-panel');
    if (!items && !(live && set.enabled)) { panel?.remove(); return; }
    if (items) stripRaw(textEl, items);
    if (live && ui.gen) { panel?.remove(); return; } // 받는 중엔 그리지 않음
    items ??= [];
    if (live && set.view === 'side' && window.innerWidth >= 700 && items.length) { panel?.remove(); renderSide(i, items); return; }
    const picked = live ? null : pickedFor(i);
    if (!live && (!picked || !items.length)) { panel?.remove(); return; } // 고르지 않고 직접 쓴 답이면 칩도 없음
    const typing = panel?.contains(document.activeElement) && document.activeElement.classList.contains('mbc-rr-in');
    const key = JSON.stringify(live ? [items.map(x => x.label + x.kind + x.risk), ui.sel, ui.reroll, ui.rerolling, ui.tab, gst.busy, JSON.stringify(ctx().chat?.[i]?.extra?.mbcGuide ?? 0).length, settings().click, settings().confirm, liteLuck()?.stars ?? 0, settings()._rev] : [items.length, picked.n, picked.check?.roll, ui.past.has(i)]);
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
    // 고른 기록 (mbc) — 미트볼 라이트 분류 모델이 읽는 약속. 필드는 README 표 참고
    const outcome = check ? (check.crit ? 'crit' : check.fumble ? 'fumble' : check.ok ? 'success' : 'fail') : null;
    const p = { v: 1, n, kind: it.kind, risk: it.risk, label, shown: it.label, check, outcome, trap: it.risk === 'trap', price: it.risk === 'price' };
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
        <div class="mbc-sec">탭</div><div class="mbc-card">${row('🎯', '선택지', '매 턴 답과 함께 와요')}${guideOn().map(k => row(SECTIONS[k].icon, esc(SECTIONS[k].name), esc(SECTIONS[k].desc) + ' · 처음 누를 때 AI 1회')).join('')}</div>
        <div class="mbc-sec">지난 선택지</div><div class="mbc-card">${row('✔', '고른 것만 칩으로 남아요', '칩을 누르면 그때 선택지 전체를 볼 수 있고, 「여기서 다른 선택」으로 그 답에서 분기해 다시 고를 수 있어요. 지난 선택지는 AI에게 가지 않아요.')}</div>
    </div>`;
    const c = ctx(), el = document.createElement('div');
    el.innerHTML = `<h3 class="mbc-sheet-title">선택지 읽는 법</h3>${html}`;
    if (c.Popup && c.POPUP_TYPE) await new c.Popup(el, c.POPUP_TYPE.TEXT, '', { wide: false, allowVerticalScrolling: true, okButton: '닫기' }).show();
}

// ───── 옆 「?」 동그라미 → 올리면 부채꼴 (보는 방식 「옆 동그라미」 · 넓은 화면만) ─────
const sideOpen = () => ui.open || !!ui.sel || ui.reroll || ui.hover;
export function dropSide() { document.getElementById('mbc-side')?.remove(); }
function sidePill(i, it, n) {
    const k = kindOf(it.kind) ?? { icon: '•', name: it.kind }, r = shownRisk(it.risk), ch = checkOf(i, it, n);
    const sel = ui.sel?.i === i && ui.sel?.n === n;
    return `<button class="mbc-opt ring${sel ? ' sel' : ''}" style="--k:${n}" title="${esc(it.label)}" data-mbc-i="${i}" data-mbc-n="${n}"><span class="mbc-kind"><span class="ic">${k.icon}</span></span><span class="mbc-ring-txt"><span class="mbc-ring-k">${esc(k.name)}${r.id !== 'none' ? ` · ${r.icon} ${esc(r.name)}` : ''}${ch ? ` · ${ch.pct}%` : ''}</span><span class="mbc-label">${esc(it.label)}</span></span></button>`;
}
function sideHTML(i, items) {
    const set = settings(), tab = curTab();
    const sel = tab === 'choices' && ui.sel?.i === i ? items[ui.sel.n] : null;
    const ll = liteLuck();
    const modes = TABS().length > 1 ? TABS().map(([id, ic, nm]) => `<button class="mbc-tool${id === tab ? ' on' : ''}" data-mbc-act="tab" data-g="${id}" title="${nm}">${ic}</button>`).join('') + '<i class="mbc-tsep"></i>' : '';
    const tools = `<div class="mbc-tools">${modes}${ll?.rolled ? `<button class="mbc-tool" data-mbc-act="help" title="${esc(ll.text)}">🍀</button>` : ''}<button class="mbc-tool" data-mbc-act="click" title="${set.click === 'send' ? '고르면 바로 보내기' : '고르면 입력창에'} (눌러서 바꾸기)">${set.click === 'send' ? '➤' : '↵'}</button><button class="mbc-tool${ui.reroll ? ' on' : ''}" data-mbc-act="reroll" title="이 탭 다시 받기">🔄</button><button class="mbc-tool" data-mbc-act="help" title="읽는 법">ⓘ</button><button class="mbc-tool" data-mbc-act="edit" title="설정">⚙</button></div>`;
    const busy = tab === 'choices' ? ui.rerolling : !!gst.busy;
    const card = ui.reroll ? `<div class="mbc-sidecard"><div class="mbc-reroll"><input type="text" class="mbc-rr-in" placeholder="추가 지시 (비워도 돼요)" value="${esc(ui.rerollText)}"><button class="mbc-go sm" data-mbc-act="rerollGo" ${busy ? 'disabled' : ''}>${busy ? '받는 중…' : '다시 받기'}</button></div></div>`
        : sel && set.confirm ? `<div class="mbc-sidecard">${detailHTML(i, sel, ui.sel.n)}</div>` : '';
    let pills;
    if (tab === 'choices') pills = items.map((it, n) => sidePill(i, it, n));
    else {
        const list = guideItems(i, tab), S = SECTIONS[tab];
        pills = gst.busy ? [`<button class="mbc-opt ring" style="--k:0" disabled><span class="mbc-kind"><span class="ic">${S.icon}</span></span><span class="mbc-ring-txt"><span class="mbc-label">받는 중…</span></span></button>`]
            : list.length ? list.map((x, n) => `<div class="mbc-opt ring ro" style="--k:${n}" title="${esc(guideLabel(tab, x))}"><span class="mbc-kind"><span class="ic">${S.icon}</span></span><span class="mbc-ring-txt"><span class="mbc-ring-k">${S.name}</span><span class="mbc-label">${esc(guideLabel(tab, x))}</span></span></div>`)
            : [`<button class="mbc-opt ring" style="--k:0" data-mbc-act="guideGo" data-g="${tab}"><span class="mbc-kind"><span class="ic">${S.icon}</span></span><span class="mbc-ring-txt"><span class="mbc-ring-k">${S.name}</span><span class="mbc-label">받기 (AI 1회)</span></span></button>`];
    }
    const tabIc = TABS().find(t => t[0] === tab)?.[1] ?? '?';
    const hub = `<button class="mbc-sidehub" data-mbc-act="dock" title="${tab === 'choices' ? `선택지 ${items.length}개` : SECTIONS[tab].name}"><b>${sel ? kindOf(sel.kind)?.icon ?? '?' : tab === 'choices' ? '?' : tabIc}</b><small>${tab === 'choices' ? items.length : guideItems(i, tab).length || ''}</small></button>`;
    return `<div class="mbc-scrim"></div>${tools}<div class="mbc-fan">${pills.join('')}</div>${hub}${card}`;
}
function renderSide(i, items) {
    ui.side = true;
    let el = document.getElementById('mbc-side');
    if (!el) { el = document.createElement('div'); el.id = 'mbc-side'; document.body.append(el); wireSide(el); }
    const typing = el.contains(document.activeElement) && document.activeElement.classList.contains('mbc-rr-in');
    const key = JSON.stringify([i, items.map(x => x.label + x.kind + x.risk), ui.sel, ui.reroll, ui.rerolling, ui.tab, gst.busy, JSON.stringify(ctx().chat?.[i]?.extra?.mbcGuide ?? 0).length, settings().click, settings()._rev]);
    if (!typing && el.dataset.key !== key) { el.innerHTML = sideHTML(i, items); el.dataset.key = key; }
    el.dataset.i = String(i);
    el.className = `mbc-panel mbc-side${sideOpen() ? ' open' : ''}${ui.sel?.i === i ? ' has-sel' : ''}`;
    placeSide();
}
export function placeSide() {
    const el = document.getElementById('mbc-side'); if (!el) return;
    const chatEl = document.getElementById('chat'); if (!chatEl) return;
    const c = chatEl.getBoundingClientRect();
    el.style.display = c.width < 50 || c.height < 50 || chatEl.offsetParent === null ? 'none' : '';
    const mes = document.querySelector(`#chat .mes[mesid="${el.dataset.i}"]`)?.getBoundingClientRect();
    const roomR = window.innerWidth - c.right, roomL = c.left;
    let x, dir = 'left';
    if (roomR >= 64) x = c.right + Math.min(roomR / 2, 48);
    else if (roomL >= 64) { x = c.left - Math.min(roomL / 2, 48); dir = 'right'; }
    else x = c.right - 40;
    const y = Math.max(c.top + 48, Math.min((mes ? mes.bottom : c.bottom) - 48, c.bottom - 48));
    el.style.left = `${Math.round(x)}px`; el.style.top = `${Math.round(y)}px`; el.dataset.dir = dir; el.dataset.cardUp = window.innerHeight - y < 330 ? '1' : ''; el.dataset.toolsDown = y - c.top < el.querySelectorAll('.mbc-tools > *').length * 32 + 40 ? '1' : ''; // 위가 좁으면 단추 줄을 아래로
    if (!el.dataset.solid) { // 반투명 테마여도 알약은 불투명
        const v = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor').trim().match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
        if (v) el.style.setProperty('--solid', `rgb(${v[1]}, ${v[2]}, ${v[3]})`);
        el.dataset.solid = '1';
    }
    // 알약 높이를 재서 활 모양으로 위에서 아래로 (안 겹침 · 채팅 안에서만)
    const opts = [...el.querySelectorAll('.mbc-fan > .mbc-opt')];
    const n = opts.length; if (!n) return;
    const gap = 6, hs = opts.map(o => o.offsetHeight || 40);
    const H = hs.reduce((a, h) => a + h, 0) + gap * (n - 1), R = Math.max(130, H / 2 + 30);
    const topB = c.top + 8 - y, botB = c.bottom - 8 - y;
    let y0 = -H / 2; if (y0 + H > botB) y0 = botB - H; if (y0 < topB) y0 = topB;
    const sgn = dir === 'right' ? 1 : -1;
    let acc = y0;
    opts.forEach((o, k) => {
        const cy = acc + hs[k] / 2; acc += hs[k] + gap;
        o.style.setProperty('--tx', `${(sgn * Math.max(40, Math.sqrt(Math.max(0, R * R - cy * cy)))).toFixed(1)}px`);
        o.style.setProperty('--ty', `${cy.toFixed(1)}px`);
    });
    el.style.setProperty('--R', `${R}px`);
}
let sideT = 0;
function wireSide(el) {
    el.addEventListener('mouseenter', () => { clearTimeout(sideT); if (!ui.hover && !ui.hoverBlock) { ui.hover = true; el.classList.add('open'); } });
    el.addEventListener('mouseleave', () => { clearTimeout(sideT); ui.hoverBlock = false; sideT = setTimeout(() => { ui.hover = false; if (!sideOpen()) el.classList.remove('open'); }, 350); });
    if (wireSide.done) return; wireSide.done = true;
    let raf = 0;
    const re = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(placeSide); };
    document.addEventListener('scroll', (e) => { if (e.target?.id === 'chat') re(); }, { passive: true, capture: true });
    window.addEventListener('resize', re, { passive: true });
}
