// 설정 판: 채팅 옆에 떠 있음 (팝업 아님) — 바꾸면 바로 반영
import { settings, save, esc, lite, userCount, meta } from './core.js';
import { KINDS, RISKS } from './data.js';
import { injectTokens, sceneTokens, buildPrompt } from './prompt.js';
import { SECTIONS } from './guide.js';

let onChange = () => {};
export function setOnChange(fn) { onChange = fn; }
const changed = () => { const s = settings(); s._rev = (s._rev ?? 0) + 1; save(); onChange(); };

const seg = (key, cur, opts) => `<div class="mbc-seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-set="${key}" data-val="${esc(v)}">${l}</button>`).join('')}</div>`;
const sw = (key, on) => `<label class="mbc-switch"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><i></i></label>`;
const row = (label, sub, ctrl) => `<div class="mbc-row"><div class="tx"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="ctl">${ctrl}</div></div>`;

function body() {
    const s = settings();
    return `<div class="mbc-sec">선택지</div><div class="mbc-card">
        ${row('사용', '', sw('enabled', s.enabled))}
        ${row('받는 때', '눌러서 = 「🎯 선택지 받기」를 누를 때만 AI 1회 (본편 토큰 0) · 매 답 = 본편이 답마다 같이 씀', seg('gen', s.gen, [['ask', '눌러서'], ['auto', '매 답']]))}
        ${row('개수', '', seg('count', s.count, [3, 4, 5, 6].map(n => [n, `${n}개`])))}
        ${row('고르는 법', '두 번 = 눌러서 설명 · 확률을 보고 「이걸로」', seg('confirm', s.confirm, [[true, '두 번'], [false, '한 번']]))}
        ${row('고르면', '', seg('click', s.click, [['fill', '입력창에'], ['send', '바로 보내기']]))}
        ${row('넣을 글', '원문 = 번역 전 글', seg('input', s.input, [['raw', '원문'], ['shown', '화면 글']]))}
        ${row('보는 방식', '옆 동그라미 = 채팅 옆 「?」에 마우스를 올리면 부채꼴로 펼침 (좁은 화면은 목록)', seg('view', s.view, [['list', '목록'], ['side', '옆 동그라미']]))}
        ${s.view === 'side' ? `${row('동그라미 가로', '', seg('sideX', s.sideX ?? 'auto', [['auto', '자동'], ['right', '오른쪽'], ['left', '왼쪽']]))}${row('동그라미 세로', '마지막 답 = 마지막 답 옆을 따라감', seg('sideY', s.sideY ?? 'msg', [['msg', '마지막 답'], ['top', '위'], ['middle', '가운데'], ['bottom', '아래']]))}` : ''}
    </div>
    <div class="mbc-sec">탭 — 선택지 옆에 둘 것 (처음 누를 때 AI 1회로 한꺼번에)</div><div class="mbc-card">${Object.entries(SECTIONS).map(([k, x]) => row(`${x.icon} ${esc(x.name)}`, esc(x.desc), sw(`guide.${k}`, s.guide?.[k] !== false))).join('')}</div>
    <div class="mbc-sec">성향</div><div class="mbc-card">${KINDS.map(k => row(`${k.icon} ${esc(k.name)}`, esc(k.desc), sw(`kinds.${k.id}`, s.kinds[k.id] !== false))).join('')}</div>
    <div class="mbc-sec">위험</div><div class="mbc-card">${RISKS.map(r => row(`${r.icon || '·'} ${esc(r.name)}${r.off ? ' <small>(기본 끔)</small>' : ''}`, esc(r.desc), sw(`risks.${r.id}`, s.risks[r.id] === true || (s.risks[r.id] !== false && !r.off)))).join('')}</div>
    <div class="mbc-sec">본편에 넣는 글</div><div class="mbc-card">
        ${row(`매 턴 약 ${injectTokens()}토큰`, lite() ? `그중 미트볼폰 장면 줄 약 ${sceneTokens()}토큰 · 고른 다음 턴만 결과 지시가 더 붙어요` : '고른 다음 턴만 결과 지시가 더 붙어요', '<button type="button" class="mbc-btn" data-act="peek">보기</button>')}
        ${row('주입 깊이', '숫자가 작을수록 AI가 잘 지켜요', seg('depth', s.depth, [0, 1, 2, 4].map(n => [n, String(n)])))}
    </div>`;
}
function render(root) { const y = root.scrollTop; root.innerHTML = body(); root.scrollTop = y; }
const setPath = (o, p, v) => { const ks = p.split('.'); while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = v; };
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);

export function placeEditDock() {
    const d = document.getElementById('mbc-editdock'); if (!d) return;
    const c = document.getElementById('chat')?.getBoundingClientRect();
    const W = Math.min(380, window.innerWidth - 24);
    if (window.innerWidth < 700 || !c) { d.dataset.pos = 'sheet'; d.style.cssText = ''; return; }
    d.dataset.pos = 'side';
    const left = c.left >= W + 24 ? c.left - W - 12 : window.innerWidth - c.right >= W + 24 ? c.right + 12 : window.innerWidth - W - 12;
    d.style.left = `${Math.max(12, left)}px`; d.style.width = `${W}px`;
    d.style.top = `${Math.max(12, c.top)}px`; d.style.maxHeight = `${Math.min(window.innerHeight - 24, c.height)}px`;
}
export function openEditor() {
    let dock = document.getElementById('mbc-editdock');
    if (dock) { dock.remove(); return; } // ⚙ 다시 누르면 닫기
    dock = document.createElement('div');
    dock.id = 'mbc-editdock';
    dock.className = 'mbc-ed';
    dock.innerHTML = '<div class="mbc-ed-top"><b>⚙ 선택지 설정</b><small>바꾸면 바로 반영돼요</small><button type="button" class="mbc-icon" data-ed-close aria-label="닫기">✕</button></div><div class="mbc-ed-body"></div>';
    const root = dock.querySelector('.mbc-ed-body');
    dock.querySelector('[data-ed-close]').addEventListener('click', () => dock.remove());
    root.addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        const s = settings();
        if (t.dataset.set && t.dataset.val !== undefined) {
            const cur = getPath(s, t.dataset.set);
            setPath(s, t.dataset.set, typeof cur === 'boolean' ? t.dataset.val === 'true' : typeof cur === 'number' ? Number(t.dataset.val) : t.dataset.val);
            changed(); render(root); return;
        }
        if (t.dataset.act === 'peek') {
            const old = root.querySelector('.mbc-pre'); if (old) { old.remove(); return; }
            const pre = document.createElement('pre'); pre.className = 'mbc-pre'; pre.textContent = buildPrompt(userCount() + 1, meta().pending) || '(없음)';
            t.closest('.mbc-row').after(pre);
        }
    });
    root.addEventListener('change', (e) => {
        const t = e.target; if (!t.dataset.set || t.type !== 'checkbox') return;
        setPath(settings(), t.dataset.set, t.checked); changed(); render(root);
    });
    document.body.append(dock);
    placeEditDock();
    render(root);
}
