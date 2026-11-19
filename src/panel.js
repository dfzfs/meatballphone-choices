// 선택지 창: 고리 메뉴(생활 시뮬풍) · 목록 · 카드 + 자세히 보기 + 주사위 + 안내
import { settings, ctx, esc, meta, saveMeta, kindOf, riskOf, heatAt, stageOf, todayLuck, mbState, urgentNeeds, checkFor, rollCheck, userCount, lite, liteLuck } from './core.js';
import { GROUPS, FX } from './data.js';
import { choicesOf, NUM_RE, TAG_RE, setInject, buildPrompt, rerollPrompt } from './prompt.js';
import { panelFx, stamp, timerFx } from './fx.js';

const SLOT_SEL = '.ss-slot, .custom-ss-slot, .ml-msg';
const STAGE_KO = ['평온', '불안', '위험', '파국'];
export const ui = { sel: null, group: null, rolling: false, open: false, reroll: false, rerollText: '', rerolling: false, hover: false, hoverBlock: false, gen: false }; // 지금 고른 칸 · 열어 둔 묶음

// 위험 딱지 (보이는 모양: 그대로 · 숨김 · 안전으로 위장). 지난 선택지는 진짜를 보여 준다
function riskView(id, reveal) {
    const r = riskOf(id);
    if (!r) return null;
    if (reveal) return r.id === 'none' ? null : r;
    if (r.show === 'hide') return null;
    if (r.show === 'safe') return riskOf('safe');
    return r.id === 'none' ? null : r;
}
const badge = (r) => r ? `<span class="mbc-badge t-${r.tone}">${r.icon} ${esc(r.name)}</span>` : '';

// 미트볼 라이트 대가 미리 보기 (「−3골드 · 허기 +20」 · 돈 부족이면 흐리게)
function costOf(label) { const L = lite(); if (!L?.preview) return null; try { return L.preview(label) ?? null; } catch { return null; } }
function seedOf(i, n) { return `${ctx().chatId ?? ''}:${i}:${n}`; }
export function checkOf(i, it, n) {
    const st = settings().danger.on ? stageOf(heatAt(i + 1)) : 0;
    // 함정은 위장해서 보이므로 주사위도 보이는 위험 기준으로 (함정이 「모험」으로 위장하면 굴림)
    const shown = riskView(it.risk, false);
    return checkFor(it.kind, shown?.id === it.risk ? it.risk : (shown?.id ?? 'none'), seedOf(i, n), st, it.label);
}

// ───── 머리줄: 오늘 운세 · 급한 수치 · 긴장도 ─────
function headHTML(i, live, count) {
    const set = settings();
    const chips = [];
    if (live) {
        const lk = todayLuck(), ll = lk ? null : liteLuck();
        if (lk) chips.push(`<button class="mbc-chip t-${lk.tone}" data-mbc-act="luck" title="오늘의 운세">🍀 오늘 ${lk.name}${lk.mod ? ` ${lk.mod > 0 ? '+' : '−'}${Math.abs(lk.mod)}` : ''}</button>`);
        else if (ll?.rolled) chips.push(`<button class="mbc-chip t-${ll.tier === '대흉' ? 'bad' : 'good'}" data-mbc-act="luck" title="${esc(ll.text)}">🍀 ${ll.tier || '★'.repeat(ll.stars)}</button>`);
        const st = mbState();
        const urgent = st?.lite ? (st.danger ?? []).map(d => ({ name: `${d.icon ?? ''}${d.name}`, cur: d.stage })) : urgentNeeds(st);
        for (const g of urgent.slice(0, 2)) chips.push(`<span class="mbc-chip t-bad" title="미트볼 수치">${esc(g.name)} ${esc(g.cur)}</span>`);
    }
    let heat = '';
    if (set.danger.on && live) {
        const h = heatAt(i + 1), s = stageOf(h);
        heat = `<button class="mbc-heat s${s}" data-mbc-act="heat" title="긴장도 ${h}/100"><span class="bar"><i style="width:${h}%"></i></span><b>${STAGE_KO[s]}</b></button>`;
    }
    return `<div class="mbc-head">
        <span class="mbc-title">${live ? '무엇을 할까요' : '지난 선택'}<small>${count}</small></span>
        <span class="mbc-chips">${chips.join('')}</span>${heat}
        ${live ? `<button class="mbc-chip mbc-send" data-mbc-act="click" title="고르면 입력창에 넣을지, 바로 보낼지">${set.click === 'send' ? '➤ 바로 보내기' : '↵ 입력창에'}</button><button class="mbc-icon${ui.reroll ? ' on' : ''}" data-mbc-act="reroll" title="선택지 다시 받기" aria-label="선택지 다시 받기">🔄</button><button class="mbc-icon" data-mbc-act="help" title="읽는 법" aria-label="읽는 법">ⓘ</button><button class="mbc-icon" data-mbc-act="edit" title="선택지 설정" aria-label="선택지 설정">⚙</button>` : ''}
    </div>${live && ui.reroll ? `<div class="mbc-reroll"><input type="text" class="mbc-rr-in" placeholder="추가 지시 (비워도 돼요) · 예: 더 위험하게, 로맨스 쪽으로" value="${esc(ui.rerollText)}"><button class="mbc-go sm" data-mbc-act="rerollGo" ${ui.rerolling ? 'disabled' : ''}>${ui.rerolling ? '받는 중…' : '다시 받기'}</button></div>` : ''}`;
}

function optHTML(i, it, n, live, picked, cls = '') {
    const k = kindOf(it.kind) ?? { icon: '•', name: it.kind, group: 'act' };
    const reveal = !live;
    const r = riskView(it.risk, reveal);
    const ch = live ? checkOf(i, it, n) : null;
    const mine = picked && picked.n === n;
    const sel = live && ui.sel?.i === i && ui.sel?.n === n;
    const lk = live ? todayLuck() : null;
    const fit = live && !lk ? (liteLuck(it.label)?.fit ?? 0) : 0;
    const luckMark = lk && lk.up === it.kind ? '<span class="mbc-lucky" title="오늘 잘 풀리는 성향">✦</span>' : lk && lk.down === it.kind ? '<span class="mbc-unlucky" title="오늘 꼬이는 성향">✧</span>' : fit > 0 ? '<span class="mbc-lucky" title="오늘 운세와 맞음">🍀</span>' : fit < 0 ? '<span class="mbc-unlucky" title="오늘 조심할 행동">⚠</span>' : '';
    const cost = live ? costOf(it.label) : null;
    let res = '';
    if (mine) {
        const c = picked.check;
        res = c ? `<span class="mbc-res ${c.ok ? 'good' : 'bad'}">🎲 ${c.roll}${c.mod ? `${c.mod > 0 ? '+' : '−'}${Math.abs(c.mod)}` : ''} ${c.crit ? '대성공' : c.fumble ? '대실패' : c.ok ? '성공' : '실패'}</span>` : '';
        if (it.risk === 'trap') res += '<span class="mbc-res bad">🪤 함정이었다</span>';
        if (it.risk === 'cursed') res += '<span class="mbc-res curse">☠ 저주</span>';
    }
    return `<button class="mbc-opt ${cls}${mine ? ' mine' : ''}${sel ? ' sel' : ''}"${cls === 'ring' ? ` title="${esc(it.label)}"` : ''} data-mbc-i="${i}" data-mbc-n="${n}" data-kind="${esc(it.kind)}" data-risk="${esc(it.risk)}" data-group="${esc(k.group)}" ${live ? '' : 'disabled'}>
        <span class="mbc-kind g-${esc(k.group)}"><span class="ic">${k.icon}</span><span class="nm">${esc(k.name)}</span>${luckMark}</span>
        ${cls === 'ring' ? `<span class="mbc-ring-txt"><span class="mbc-ring-k">${esc(k.name)}${r ? ` · ${r.icon} ${esc(r.name)}` : ''}${ch ? ` · ${ch.pct}%` : ''}</span>` : ''}<span class="mbc-label">${esc(it.label)}${cost ? `<span class="mbc-cost${cost.ok ? '' : ' poor'}">${esc(cost.text)}</span>` : ''}</span>
        ${cls === 'ring' ? '</span>' : ''}<span class="mbc-tags">${badge(r)}${ch ? `<span class="mbc-odds" title="성공 확률">${ch.pct}%</span>` : ''}${res}</span>
    </button>`;
}

// 고른 칸 자세히 (설명 · 확률 계산 · 「이걸로」)
function detailHTML(i, it, n) {
    const k = kindOf(it.kind), r = riskView(it.risk, false);
    const ch = checkOf(i, it, n);
    const parts = ch ? ch.parts.map(([a, v]) => `<span class="mbc-part ${v >= 0 ? 'good' : 'bad'}">${esc(a)} ${v >= 0 ? '+' : '−'}${Math.abs(v)}</span>`).join('') : '';
    return `<div class="mbc-detail">
        <div class="mbc-d-row"><span class="mbc-d-ic">${k?.icon ?? '•'}</span><div class="mbc-d-txt"><b>${esc(k?.name ?? it.kind)}</b><small>${esc(k?.desc ?? '')}</small></div></div>
        ${r ? `<div class="mbc-d-row"><span class="mbc-d-ic">${r.icon}</span><div class="mbc-d-txt"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></div></div>` : ''}
        ${(() => { const c = costOf(it.label); return c ? `<div class="mbc-d-row"><span class="mbc-d-ic">🧾</span><div class="mbc-d-txt"><b>${esc(c.text)}</b><small>${c.ok ? '미트볼 라이트 예상' : '돈이 모자라요'}</small></div></div>` : ''; })()}
        ${ch ? `<div class="mbc-d-row"><span class="mbc-d-ic">🎲</span><div class="mbc-d-txt"><b>${ch.dcName} ${ch.dc} · 성공 ${ch.pct}%</b><small>d20 ${parts || '<span class="mbc-part">보정 없음</span>'}</small></div></div>` : ''}
        <div class="mbc-d-go"><span class="mbc-dice" hidden></span><button class="mbc-go" data-mbc-act="go">이걸로 <span aria-hidden="true">›</span></button></div>
    </div>`;
}

// ───── 고리 메뉴 (넓을 때) ─────
function ringHTML(i, items, live, picked) {
    const set = settings();
    const groups = [...new Set(items.map(it => kindOf(it.kind)?.group ?? 'act'))];
    const useGroups = items.length > 6 && groups.length > 1;
    const inGroup = useGroups && ui.group && groups.includes(ui.group) ? ui.group : null;
    let center, nodes;
    if (useGroups && !inGroup) {
        center = `<div class="mbc-hub"><b>${items.length}</b><small>묶음을 고르세요</small></div>`;
        nodes = groups.map(g => { const G = GROUPS[g] ?? { name: g, icon: '•' }; const c = items.filter(it => (kindOf(it.kind)?.group ?? 'act') === g).length; return `<button class="mbc-opt mbc-group g-${g}" data-mbc-act="group" data-g="${g}"><span class="mbc-kind"><span class="ic">${G.icon}</span></span><span class="mbc-label">${esc(G.name)} <small>${c}</small> ›</span></button>`; });
    } else {
        const list = items.map((it, n) => [it, n]).filter(([it]) => !inGroup || (kindOf(it.kind)?.group ?? 'act') === inGroup);
        const sel = ui.sel?.i === i ? items[ui.sel.n] : null;
        center = inGroup
            ? `<button class="mbc-hub back" data-mbc-act="back"><b>‹</b><small>${esc(GROUPS[inGroup]?.name ?? '')}</small></button>`
            : `<div class="mbc-hub">${sel ? `<b>${kindOf(sel.kind)?.icon ?? '•'}</b><small>${esc(kindOf(sel.kind)?.name ?? '')}</small>` : `<b>?</b><small>하나를 고르세요</small>`}</div>`;
        nodes = list.map(([it, n]) => optHTML(i, it, n, live, picked, 'ring'));
    }
    const N = nodes.length;
    const pos = nodes.map((h, k) => {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / N;
        return h.replace('class="mbc-opt', `style="--x:${Math.cos(a).toFixed(3)};--y:${Math.sin(a).toFixed(3)}" class="mbc-opt`);
    });
    return `<div class="mbc-ring n${N}">${center}${pos.join('')}</div>`;
}

export function panelHTML(i, items, live, picked, width) {
    const set = settings();
    let layout = set.layout;
    if (layout === 'ring' && (width < 540 || !live)) layout = 'list'; // 좁거나 지난 선택지는 목록으로
    let body;
    if (layout === 'ring') body = ringHTML(i, items, live, picked);
    else if (layout === 'cards') body = `<div class="mbc-cards">${items.map((it, n) => optHTML(i, it, n, live, picked, 'card')).join('')}</div>`;
    else {
        // 좁은 고리 메뉴: 묶음 칩 + 목록
        const groups = set.layout === 'ring' && live ? [...new Set(items.map(it => kindOf(it.kind)?.group ?? 'act'))] : [];
        const g = groups.length > 1 && items.length > 6 && groups.includes(ui.group) ? ui.group : null;
        const tabs = groups.length > 1 && items.length > 6 ? `<div class="mbc-gtabs"><button class="mbc-gtab ${g ? '' : 'on'}" data-mbc-act="back">전체</button>${groups.map(x => `<button class="mbc-gtab ${g === x ? 'on' : ''}" data-mbc-act="group" data-g="${x}">${GROUPS[x]?.icon ?? ''} ${esc(GROUPS[x]?.name ?? x)}</button>`).join('')}</div>` : '';
        const rows = items.map((it, n) => [it, n]).filter(([it]) => !live || !g || (kindOf(it.kind)?.group ?? 'act') === g);
        body = `${tabs}<div class="mbc-list">${rows.map(([it, n]) => optHTML(i, it, n, live, picked, 'row')).join('')}</div>`;
    }
    const det = live && set.confirm && ui.sel?.i === i && items[ui.sel.n] ? detailHTML(i, items[ui.sel.n], ui.sel.n) : '';
    return `${headHTML(i, live, items.length)}${body}${det}`;
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
    const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
    const dead = [];
    while (walker.nextNode()) if (/<\/?choices>/i.test(walker.currentNode.nodeValue) && !walker.currentNode.parentElement.closest('.mbc-panel')) dead.push(walker.currentNode);
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
    const items = set.enabled ? choicesOf(i) : null;
    let panel = mesEl.querySelector('.mbc-panel');
    if (!items) { panel?.remove(); mesEl.querySelector(':scope > .mbc-dock')?.remove(); return; }
    stripRaw(textEl, items);
    const live = i === lastAI && !ctx().chat?.[i + 1];
    if (live && ui.gen) { panel?.remove(); return; } // 받는 중엔 반쯤 온 선택지를 그리지 않음
    const picked = pickedFor(i);
    // 지난 선택지: 고른 것만 칩으로 · 아니면 지우기
    if (!live) {
        mesEl.querySelector(':scope > .mbc-dock')?.remove();
        if (set.past === 'delete' || !picked) { panel?.remove(); return; }
        const k = JSON.stringify([picked.n, picked.check?.roll, items.length, set._rev]);
        if (!panel || panel.classList.contains('mbc-pop')) { panel = document.createElement('div'); }
        if (panel.dataset.key !== k) {
            const it = items[picked.n], kd = it ? kindOf(it.kind) : null, c = picked.check;
            panel.className = `mbc-panel mbc-mini th-${set.look.theme}`;
            panel.innerHTML = it ? `<span class="mbc-mini-k">✔ ${kd?.icon ?? '•'} ${esc(kd?.name ?? '')}</span> ${esc(it.label)}${c ? ` <span class="mbc-res ${c.ok ? 'good' : 'bad'}">🎲 ${c.roll}${c.mod ? `${c.mod > 0 ? '+' : '−'}${Math.abs(c.mod)}` : ''} ${c.crit ? '대성공' : c.fumble ? '대실패' : c.ok ? '성공' : '실패'}</span>` : ''}${it.risk === 'trap' ? ' <span class="mbc-res bad">🪤 함정이었다</span>' : ''}${it.risk === 'cursed' ? ' <span class="mbc-res curse">☠ 금단</span>' : ''}` : '';
            panel.dataset.key = k;
        }
        place(textEl, panel);
        return;
    }
    const width = textEl.clientWidth || 600;
    const key = JSON.stringify([items.map(x => x.label + x.kind + x.risk), live, picked?.n, picked?.check?.roll, live ? [ui.sel, ui.group, ui.reroll, ui.rerolling, set.click, width < 540, set.danger.on && heatAt(i + 1), todayLuck()?.name, urgentNeeds(mbState()).map(g => g.cur)] : 0, set._rev]);
    // 고리 메뉴(넓은 화면): 채팅 옆 빈자리에 「?」 동그라미 하나 → 올리면 선택지가 부채꼴로 촤락
    const floating = set.layout === 'ring' && window.innerWidth >= 700;
    mesEl.querySelector(':scope > .mbc-dock')?.remove();
    if (floating) {
        if (panel && !panel.classList.contains('mbc-side')) panel.remove();
        panel = document.getElementById('mbc-side');
        if (!panel) { panel = document.createElement('div'); panel.id = 'mbc-side'; document.body.append(panel); wireSide(panel); }
        sideLive.on = true;
        const typing = panel.contains(document.activeElement) && document.activeElement.classList.contains('mbc-rr-in');
        if (!typing && (force || panel.dataset.key !== key || panel.dataset.i !== String(i))) { panel.innerHTML = sideHTML(i, items, picked); panel.dataset.key = key; panel.dataset.i = String(i); }
        panel.className = `mbc-panel mbc-side th-${set.look.theme}${sideOpen() ? ' open' : ''}${ui.sel?.i === i ? ' has-sel' : ''}`;
        lookVars(panel);
        placeSide();
    } else {
        if (panel?.classList.contains('mbc-side')) panel = null;
        if (!panel) { panel = document.createElement('div'); }
        const typing = panel.contains?.(document.activeElement) && document.activeElement.classList.contains('mbc-rr-in');
        if (!typing && (force || panel.dataset.key !== key)) { panel.innerHTML = panelHTML(i, items, live, picked, width); panel.dataset.key = key; }
        panel.className = `mbc-panel th-${set.look.theme} lay-${set.layout}`;
        lookVars(panel);
        place(textEl, panel);
    }
    panelFx(panel, live, mesEl);
    timerFx(panel, live, () => autoPick(i, items));
}
export function lookVars(el) {
    const L = settings().look;
    if (L.accent) el.style.setProperty('--mbc-accent', L.accent); else el.style.removeProperty('--mbc-accent');
    el.style.setProperty('--mbc-r', `${L.radius}px`);
    el.style.setProperty('--mbc-fs', `${L.size / 100}`);
    el.style.setProperty('--mbc-op', `${L.opacity / 100}`);
}

// 시간이 다 되면
function autoPick(i, items) {
    const how = settings().timer.expire;
    if (how === 'none') return;
    let n = Math.floor(Math.random() * items.length);
    if (how === 'worst') { const order = ['cursed', 'trap', 'gamble', 'price', 'none', 'safe']; n = items.map((it, k) => [order.indexOf(it.risk), k]).sort((a, b) => a[0] - b[0])[0][1]; }
    toastr.warning('시간이 다 됐어요. 망설이는 사이에 몸이 먼저 움직였다.', '미트볼 선택지');
    choose(i, n, true);
}

// ───── 고르기 ─────
export async function choose(i, n, forced = false) {
    const items = choicesOf(i);
    const it = items?.[n];
    if (!it || ui.rolling) return;
    const set = settings();
    const panel = document.querySelector(`#chat .mes[mesid="${i}"] .mbc-panel`) ?? document.getElementById('mbc-side');
    const ch = checkOf(i, it, n);
    let check = null;
    if (ch) {
        check = rollCheck(ch, `${seedOf(i, n)}:${userCount()}`);
        if (panel) await rollAnim(panel, check);
    }
    const p = { i, n, kind: it.kind, risk: it.risk, label: set.input === 'shown' ? it.label : (it.orig ?? it.label), shown: it.label, check, forced };
    meta().pending = p;
    saveMeta();
    ui.sel = null; ui.group = null; ui.open = false; ui.reroll = false;
    if (panel && check) stamp(panel, check.crit ? '대성공' : check.fumble ? '대실패' : check.ok ? '성공' : '실패', check.ok ? 'good' : 'bad');
    insertInput(set.input === 'shown' ? it.label : (it.orig ?? it.label), set.click === 'send');
    setInject(buildPrompt(userCount() + 1, p));
}
function rollAnim(panel, c) {
    ui.rolling = true;
    const box = panel.querySelector('.mbc-dice') ?? (() => { const d = document.createElement('div'); d.className = 'mbc-dice floating'; panel.append(d); return d; })();
    box.hidden = false;
    return new Promise(res => {
        let k = 0;
        const t = setInterval(() => {
            box.textContent = `🎲 ${1 + Math.floor(Math.random() * 20)}`;
            if (++k >= 12) {
                clearInterval(t);
                box.innerHTML = `🎲 <b>${c.roll}</b>${c.mod ? ` ${c.mod > 0 ? '+' : '−'} ${Math.abs(c.mod)}` : ''} = ${c.roll + c.mod} <small>/ ${c.dc}</small>`;
                box.classList.add(c.ok ? 'good' : 'bad');
                ui.rolling = false;
                setTimeout(res, 650);
            }
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

// ───── 안내 시트 ─────
export function helpSheet(focus) {
    const set = settings();
    const lk = todayLuck();
    const st = mbState();
    const kinds = Object.entries(GROUPS).map(([g, G]) => {
        const ks = set.kinds.filter(k => k.on && k.group === g);
        if (!ks.length) return '';
        return `<div class="mbc-sec">${G.icon} ${esc(G.name)}</div><div class="mbc-card">${ks.map(k => `<div class="mbc-row"><span class="ic">${k.icon}</span><div class="tx"><b>${esc(k.name)}${lk?.up === k.id ? ' <em class="good">✦ 오늘 +2</em>' : lk?.down === k.id ? ' <em class="bad">✧ 오늘 −2</em>' : ''}</b><small>${esc(k.desc)}</small></div></div>`).join('')}</div>`;
    }).join('');
    const risks = `<div class="mbc-sec">위험</div><div class="mbc-card">${set.risks.filter(r => r.on && r.id !== 'none').map(r => `<div class="mbc-row"><span class="ic">${r.icon}</span><div class="tx"><b>${esc(r.name)}${r.show === 'safe' ? ' <em>· 「안전」으로 보임</em>' : r.show === 'hide' ? ' <em>· 딱지 안 보임</em>' : ''}</b><small>${esc(r.desc)}</small></div></div>`).join('')}</div>`;
    const dice = `<div class="mbc-sec">주사위</div><div class="mbc-card">
        <div class="mbc-row"><span class="ic">🎲</span><div class="tx"><b>d20 + 보정 ≥ 난이도면 성공</b><small>20은 늘 성공(대성공), 1은 늘 실패(대실패). 고르는 순간 굴려요.</small></div></div>
        <div class="mbc-row"><span class="ic">💪</span><div class="tx"><b>능력치</b><small>${st?.attrs?.length ? esc(st.attrs.map(a => `${a.name} ${a.val >= 0 ? '+' : ''}${a.val}`).join(' · ')) : '미트볼 능력치가 없으면 0'} — 성향마다 맞는 능력치를 씀</small></div></div>
        <div class="mbc-row"><span class="ic">🍞</span><div class="tx"><b>바닥난 수치</b><small>${(() => { const u = urgentNeeds(st).filter(g => g.bad >= 0.75); return u.length ? esc(u.map(g => `${g.name} ${g.cur}/${g.max}`).join(' · ')) + ' — 하나에 −1~−2 (최대 −3)' : '지금은 없음 · 75% 넘게 닳으면 −1, 90%면 −2'; })()}</small></div></div>
    </div>`;
    const ll = lk ? null : liteLuck();
    const luckLite = ll ? `<div class="mbc-sec">오늘의 운세 · 미트볼 라이트</div><div class="mbc-card"><div class="mbc-row"><span class="ic">🍀</span><div class="tx"><b>${ll.rolled ? esc(ll.text) : '아직 안 굴림'}</b><small>${ll.rolled ? '운세와 맞는 선택지 🍀 주사위 +2 (≈+10%) · 조심할 행동 ⚠ −2' : '미트볼 라이트 › 주사위 탭에서 「오늘 운세 굴리기」를 하면 선택지에 🍀 · ⚠가 붙어요'}</small></div></div></div>` : '';
    const luck = luckLite || lk && `<div class="mbc-sec">오늘의 운세 · ${esc(lk.day)}${lk.fromStory ? '' : ' (실제 날짜)'}</div><div class="mbc-card"><div class="mbc-row"><span class="ic">🍀</span><div class="tx"><b class="${lk.tone}">${lk.name} ${lk.mod > 0 ? '+' : ''}${lk.mod || ''}</b><small>모든 주사위에 ${lk.mod >= 0 ? '+' : ''}${lk.mod} · 「운에 맡기기」는 두 배 · 잘 풀림 ✦ ${esc(kindOf(lk.up)?.name ?? '-')} +2 · 꼬임 ✧ ${esc(kindOf(lk.down)?.name ?? '-')} −2</small></div></div></div>` || '';
    const heat = set.danger.on ? (() => { const h = heatAt(Infinity), s = stageOf(h); return `<div class="mbc-sec">긴장도 ${h}/100 · ${STAGE_KO[s]}</div><div class="mbc-card"><div class="mbc-row"><span class="ic">🔥</span><div class="tx"><b>고를수록 쌓이고 답마다 −${set.danger.decay}</b><small>${set.risks.filter(r => r.on && r.heat).map(r => `${r.icon}${r.name} ${r.heat > 0 ? '+' : ''}${r.heat}`).join(' · ')} · 성공 −3 · 실패 +6. ${set.danger.th.join(' · ')}에서 불안 · 위험 · 파국: 함정이 늘고 결과가 독해지고 효과가 세짐</small></div></div>
        ${[1, 2, 3].map(k => `<div class="mbc-row"><span class="ic">${['', '😰', '😱', '💀'][k]}</span><div class="tx"><b>${STAGE_KO[k]}</b><small>${(set.danger.stages[k] ?? []).map(x => FX[x]?.name).filter(Boolean).join(' · ') || '효과 없음'}</small></div></div>`).join('')}</div>`; })() : '';
    const order = focus === 'luck' ? [luck, dice, kinds, risks, heat] : focus === 'heat' ? [heat, risks, dice, luck, kinds] : [kinds, risks, dice, luck, heat];
    sheet('선택지 읽는 법', `<div class="mbc-sheet">${order.join('')}</div>`);
}
export async function sheet(title, html, wide = false) {
    const c = ctx();
    const el = document.createElement('div');
    el.innerHTML = `<h3 class="mbc-sheet-title">${esc(title)}</h3>${html}`;
    if (c.Popup && c.POPUP_TYPE) { const p = new c.Popup(el, c.POPUP_TYPE.TEXT, '', { wide, large: wide, allowVerticalScrolling: true, okButton: '닫기' }); await p.show(); return el; }
    alert(el.textContent); return el;
}

// ───── 🔄 선택지만 다시 받기 ─────
async function quietGen(prompt) {
    const c = ctx(), g = c.generateQuietPrompt;
    if (typeof g !== 'function') throw new Error('이 실리태번은 조용한 생성을 못 해요');
    return g.length >= 2 ? await g(prompt, false, true) : await g({ quietPrompt: prompt, skipWIAN: true });
}
const swapBlock = (text, block) => /<choices>/i.test(text) ? text.replace(/<choices>[\s\S]*?(?:<\/choices>|$)/i, block) : `${text}\n\n${block}`;
export async function reroll(i, extra) {
    const c = ctx(), m = c.chat?.[i];
    if (!m || ui.rerolling) return;
    const items = choicesOf(i) ?? [];
    const gloss = !!m.extra?.display_text;
    ui.rerolling = true;
    try {
        const out = String(await quietGen(rerollPrompt(i, items.map(x => x.orig ?? x.label), extra, gloss)) ?? '');
        const body = out.match(/<choices>([\s\S]*?)(?:<\/choices>|$)/i)?.[1] ?? out;
        const lines = body.split('\n').map(x => x.trim()).filter(x => /^\s*(?:\d+[.)]\s*)?[\[【〔]/.test(x));
        if (!lines.length) throw new Error('선택지를 못 받았어요');
        const orig = `<choices>\n${lines.map(x => x.split('||')[0].trim()).join('\n')}\n</choices>`;
        const shown = `<choices>\n${lines.map(x => { const [a, b] = x.split('||'); const tag = a.match(/^\s*(?:\d+[.)]\s*)?[\[【〔][^\]】〕]*[\]】〕]/)?.[0] ?? ''; return b ? `${tag} ${b.trim()}` : a.trim(); }).join('\n')}\n</choices>`;
        m.mes = swapBlock(m.mes, orig);
        if (Array.isArray(m.swipes) && Number.isInteger(m.swipe_id)) m.swipes[m.swipe_id] = m.mes;
        m.extra = { ...(m.extra ?? {}), mbcRe: (m.extra?.mbcRe ?? 0) + 1 };
        if (gloss) m.extra.display_text = swapBlock(m.extra.display_text, shown);
        await c.saveChat?.();
        if (typeof c.updateMessageBlock === 'function') c.updateMessageBlock(i, m);
        else { const t = document.querySelector(`#chat .mes[mesid="${i}"] .mes_text`); if (t && c.messageFormatting) t.innerHTML = c.messageFormatting(m.extra?.display_text ?? m.mes, m.name, m.is_system, m.is_user, i); }
        ui.sel = null; ui.group = null; ui.reroll = false; ui.rerollText = '';
    } catch (e) { toastr.error(String(e?.message ?? e), '미트볼 선택지'); }
    finally { ui.rerolling = false; }
}

// ───── 옆 동그라미 + 부채꼴 ─────
export const sideLive = { on: false };
export function dropSide() { document.getElementById('mbc-side')?.remove(); }
const sideOpen = () => ui.open || !!ui.sel || ui.reroll || ui.hover;
function sideHTML(i, items, picked) {
    const set = settings();
    const groups = [...new Set(items.map(it => kindOf(it.kind)?.group ?? 'act'))];
    const useGroups = items.length > 8 && groups.length > 1;
    const inGroup = useGroups && groups.includes(ui.group) ? ui.group : null;
    let nodes;
    if (useGroups && !inGroup) nodes = groups.map(g => { const G = GROUPS[g] ?? { name: g, icon: '•' }; const c = items.filter(it => (kindOf(it.kind)?.group ?? 'act') === g).length; return `<button class="mbc-opt ring mbc-group g-${g}" data-mbc-act="group" data-g="${g}"><span class="mbc-kind"><span class="ic">${G.icon}</span></span><span class="mbc-label">${esc(G.name)} <small>${c}</small> ›</span></button>`; });
    else nodes = items.map((it, n) => [it, n]).filter(([it]) => !inGroup || (kindOf(it.kind)?.group ?? 'act') === inGroup).map(([it, n]) => optHTML(i, it, n, true, picked, 'ring'));
    const sel = ui.sel?.i === i ? items[ui.sel.n] : null;
    const hub = inGroup
        ? `<button class="mbc-sidehub" data-mbc-act="back" title="묶음으로"><b>‹</b><small>${esc(GROUPS[inGroup]?.name ?? '')}</small></button>`
        : `<button class="mbc-sidehub" data-mbc-act="dock" title="선택지 ${items.length}개"><b>${sel ? kindOf(sel.kind)?.icon ?? '?' : '?'}</b><small>${items.length}</small></button>`;
    const lk = todayLuck(), ll = lk ? null : liteLuck();
    const luckBtn = lk ? `<button class="mbc-tool" data-mbc-act="luck" title="오늘 ${lk.name}">🍀</button>` : ll?.rolled ? `<button class="mbc-tool" data-mbc-act="luck" title="${esc(ll.text)}">🍀</button>` : '';
    const heat = set.danger.on ? (() => { const h = heatAt(i + 1), st = stageOf(h); return `<button class="mbc-tool heat s${st}" data-mbc-act="heat" title="긴장도 ${h}/100 · ${STAGE_KO[st]}">${['😌', '😰', '😱', '💀'][st]}</button>`; })() : '';
    const tools = `<div class="mbc-tools">${heat}${luckBtn}<button class="mbc-tool" data-mbc-act="click" title="${set.click === 'send' ? '고르면 바로 보내기' : '고르면 입력창에 넣기'} (눌러서 바꾸기)">${set.click === 'send' ? '➤' : '↵'}</button><button class="mbc-tool${ui.reroll ? ' on' : ''}" data-mbc-act="reroll" title="선택지 다시 받기">🔄</button><button class="mbc-tool" data-mbc-act="help" title="읽는 법">ⓘ</button><button class="mbc-tool" data-mbc-act="edit" title="설정">⚙</button></div>`;
    const card = ui.reroll
        ? `<div class="mbc-sidecard"><div class="mbc-reroll"><input type="text" class="mbc-rr-in" placeholder="추가 지시 (비워도 돼요)" value="${esc(ui.rerollText)}"><button class="mbc-go sm" data-mbc-act="rerollGo" ${ui.rerolling ? 'disabled' : ''}>${ui.rerolling ? '받는 중…' : '다시 받기'}</button></div></div>`
        : sel && set.confirm ? `<div class="mbc-sidecard">${detailHTML(i, sel, ui.sel.n)}</div>` : '';
    return `<div class="mbc-scrim"></div>${tools}<div class="mbc-fan">${nodes.map((h, k) => h.replace('class="mbc-opt', `style="--k:${k}" class="mbc-opt`)).join('')}</div>${hub}${card}`;
}
// 채팅 옆 빈자리 찾기 · 부채꼴 각도 (스크롤 · 창 크기 바뀔 때마다)
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
    el.style.left = `${Math.round(x)}px`; el.style.top = `${Math.round(y)}px`; el.dataset.dir = dir; el.dataset.cardUp = window.innerHeight - y < 330 ? '1' : '';
    // 테마 배경이 반투명이면 선택지가 본문과 겹쳐 안 읽힘 → 불투명하게
    if (settings().look.theme === 'auto' && !el.dataset.solid) {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor').trim();
        const m = v.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
        if (m) el.style.setProperty('--bg0', `rgb(${m[1]}, ${m[2]}, ${m[3]})`);
        el.dataset.solid = '1';
    }
    // 실제 높이를 재서 부채꼴(활 모양)로 위에서 아래로 쌓는다 → 절대 안 겹침 · 채팅 안에서만
    const opts = [...el.querySelectorAll('.mbc-fan > .mbc-opt')];
    const n = opts.length; if (!n) return;
    const gap = 6, hs = opts.map(o => o.offsetHeight || 40);
    const H = hs.reduce((a, h) => a + h, 0) + gap * (n - 1);
    const R = Math.max(130, H / 2 + 30);
    const topB = c.top + 8 - y, botB = c.bottom - 8 - y;
    let y0 = -H / 2;
    if (y0 + H > botB) y0 = botB - H;
    if (y0 < topB) y0 = topB;
    const hubR = 30, sgn = dir === 'right' ? 1 : -1;
    let acc = y0;
    opts.forEach((o, k) => {
        const cy = acc + hs[k] / 2; acc += hs[k] + gap;
        const dx = Math.max(hubR + 10, Math.sqrt(Math.max(0, R * R - cy * cy)));
        o.style.setProperty('--tx', `${(sgn * dx).toFixed(1)}px`);
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
    const re = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { placeSide(); import('./editor.js').then(m => m.placeEditDock()); }); };
    document.addEventListener('scroll', (e) => { if (e.target?.id === 'chat') re(); }, { passive: true, capture: true });
    window.addEventListener('resize', re, { passive: true });
}
