// 설정 편집기: 기본 · 성향 · 위험 · 위험 모드 · 효과 · 꾸미기 · 프리셋
import { settings, save, esc, ctx, meta, saveMeta, DEFAULTS } from './core.js';
import { GROUPS, FX, THEMES, PRESETS, KINDS, RISKS } from './data.js';

let onChange = () => {};
export function setOnChange(fn) { onChange = fn; }
const changed = () => { const s = settings(); s._rev = (s._rev ?? 0) + 1; save(); onChange(); };

const TABS = [['base', '기본'], ['kinds', '성향'], ['risks', '위험'], ['danger', '위험 모드'], ['fx', '효과'], ['look', '꾸미기'], ['preset', '프리셋']];
let tab = 'base', open = null; // 펼친 편집 행

const seg = (key, cur, opts) => `<div class="mbc-seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-set="${key}" data-val="${esc(v)}">${l}</button>`).join('')}</div>`;
const sw = (key, on) => `<label class="mbc-switch"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><i></i></label>`;
const row = (label, sub, ctrl) => `<div class="mbc-row"><div class="tx"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="ctl">${ctrl}</div></div>`;
const slider = (key, v, min, max, step = 1, unit = '') => `<span class="mbc-slider"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-set="${key}"><output>${v}${unit}</output></span>`;
const W_LABEL = ['없음', '가끔', '보통', '자주'];
const wSeg = (key, v) => seg(key, v, [0, 1, 2, 3].map(x => [x, W_LABEL[x]]));
const fxChips = (key, list, where) => `<div class="mbc-chipset">${Object.entries(FX).filter(([, f]) => !where || f.where === where).map(([id, f]) => `<button type="button" class="mbc-chip ${list.includes(id) ? 'on' : ''}" data-fx="${key}" data-id="${id}" title="${esc(f.desc)}">${esc(f.name)}</button>`).join('')}</div>`;

function base(s) {
    return `<div class="mbc-sec">선택지</div><div class="mbc-card">
        ${row('사용', '', sw('enabled', s.enabled))}
        ${row('개수', '6개가 넘으면 고리 메뉴가 성향 묶음으로 나뉨', `<select data-set="count">${[[0, 'AI가 3~5개'], ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(n => [n, `${n}개`])].map(([v, l]) => `<option value="${v}" ${s.count === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${row('성향 정하기', 'AI = 장면에 맞는 성향을 AI가 고름 · 확장 = 켠 성향에서 골고루', seg('kindMode', s.kindMode, [['ai', 'AI'], ['plan', '확장']]))}
        ${row('고르는 법', '두 번 = 눌러서 설명 · 확률을 보고 「이걸로」', seg('confirm', s.confirm, [[true, '두 번'], [false, '한 번']]))}
        ${row('고르면', '선택지 창의 ↵ · ➤ 칩으로도 바꿔요', seg('click', s.click, [['fill', '입력창에 넣기'], ['send', '바로 보내기']]))}
        ${row('넣을 글', '원문 = 번역 전 글 (영어로 쓰는 AI면 영어)', seg('input', s.input, [['raw', '원문'], ['shown', '화면 글']]))}
        ${row('지난 선택지', '다음 답이 오면', seg('past', s.past, [['chip', '고른 것만 칩으로'], ['delete', '지우기']]))}
        ${row('지난 선택지 AI에게 안 보내기', '본편에 쌓이는 <choices> 줄을 빼서 토큰을 아낌', sw('hideOld', s.hideOld))}
    </div>
    <div class="mbc-sec">주사위 · 운세</div><div class="mbc-card">
        ${row('주사위', '모험 · 운에 맡기기는 d20을 굴림. 미트볼 능력치가 보정으로 들어감', sw('dice.on', s.dice.on))}
        ${row('바닥난 수치 벌점', '미트볼 게이지가 거의 바닥이면 −1~−2', sw('dice.gaugePenalty', s.dice.gaugePenalty))}
        ${row('오늘의 운세', '이야기 날짜마다 대흉~대길 · 잘 풀리는 성향 하나 · 꼬이는 성향 하나', sw('luck.on', s.luck.on))}
    </div>
    <div class="mbc-sec">본편</div><div class="mbc-card">
        ${row('주입 깊이', '숫자가 작을수록 AI가 잘 지킴', slider('depth', s.depth, 0, 6))}
        ${row('다음 턴에 들어갈 글', '', '<button type="button" class="mbc-btn" data-act="peek">보기</button>')}
        ${row('이 채팅 긴장도', '', '<button type="button" class="mbc-btn" data-act="reset">0으로</button>')}
    </div>`;
}

function itemEditor(kind, it) {
    const isK = kind === 'kinds';
    const f = (k, label, v, ta = false) => `<label class="mbc-field"><span>${label}</span>${ta ? `<textarea rows="2" data-edit="${k}">${esc(v ?? '')}</textarea>` : `<input type="text" data-edit="${k}" value="${esc(v ?? '')}">`}</label>`;
    return `<div class="mbc-editbox" data-kind="${kind}" data-id="${esc(it.id)}">
        <div class="mbc-grid2">${f('icon', '아이콘', it.icon)}${f('name', '이름', it.name)}</div>
        ${isK ? `<label class="mbc-field"><span>묶음</span><select data-edit="group">${Object.entries(GROUPS).map(([g, G]) => `<option value="${g}" ${it.group === g ? 'selected' : ''}>${G.icon} ${G.name}</option>`).join('')}</select></label>` : `<label class="mbc-field"><span>색</span><select data-edit="tone">${[['good', '좋음 (초록)'], ['warn', '주의 (노랑)'], ['bad', '나쁨 (빨강)'], ['curse', '저주 (보라)'], ['mid', '중립 (회색)']].map(([v, l]) => `<option value="${v}" ${it.tone === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
        ${f('desc', '설명 (화면에 보임 · 한 줄)', it.desc)}
        ${f('ai', 'AI에게 (이 선택지를 어떻게 쓸지 · 영어 권장)', it.ai, true)}
        ${f('res', '고른 뒤 AI에게 (결과 지시 · 비워도 됨)', it.res, true)}
        ${isK ? f('attr', '주사위 능력치 (미트볼 능력치 이름, 쉼표로 · 앞에서부터 찾음)', it.attr) : `<label class="mbc-field"><span>보이는 모양</span><select data-edit="show">${[['show', '그대로 보임'], ['hide', '딱지 안 보임'], ['safe', '「안전」으로 위장']].map(([v, l]) => `<option value="${v}" ${it.show === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
        <div class="mbc-grid2"><label class="mbc-field"><span>긴장도 변화</span><input type="number" data-edit="heat" value="${Number(it.heat) || 0}"></label><label class="mbc-field"><span>늘 주사위</span><select data-edit="check"><option value="1" ${it.check ? 'selected' : ''}>굴림</option><option value="" ${it.check ? '' : 'selected'}>안 굴림</option></select></label></div>
        <div class="mbc-field"><span>이 선택지에 늘 붙는 효과</span>${fxChips(`item:${kind}:${it.id}`, it.fx ?? [], 'panel')}</div>
        <div class="mbc-editbtns"><button type="button" class="mbc-btn" data-act="restore">기본값으로</button>${(isK ? KINDS : RISKS).some(x => x.id === it.id) && !isK ? '' : '<button type="button" class="mbc-btn danger" data-act="del">지우기</button>'}<button type="button" class="mbc-btn primary" data-act="close">닫기</button></div>
    </div>`;
}
function kinds(s) {
    const blocks = Object.entries(GROUPS).map(([g, G]) => {
        const ks = s.kinds.filter(k => k.group === g);
        if (!ks.length) return '';
        return `<div class="mbc-sec">${G.icon} ${esc(G.name)}</div><div class="mbc-card">${ks.map(k => `
            <div class="mbc-row ${k.on ? '' : 'off'}"><span class="ic">${k.icon}</span><div class="tx"><b>${esc(k.name)}</b><small>${esc(k.desc)}</small></div>
            <div class="ctl">${wSeg(`kw:${k.id}`, k.on ? k.w : 0)}<button type="button" class="mbc-icon" data-open="kinds:${esc(k.id)}" aria-label="고치기">✎</button></div></div>
            ${open === `kinds:${k.id}` ? itemEditor('kinds', k) : ''}`).join('')}</div>`;
    }).join('');
    return `<p class="mbc-hint">「없음」은 끔. 많이 켤수록 AI에게 가는 글이 길어져요 (성향 하나 ≈ 15토큰).</p>${blocks}<button type="button" class="mbc-btn wide" data-act="newKind">＋ 성향 만들기</button>`;
}
function risks(s) {
    return `<p class="mbc-hint">위험은 성향과 따로 선택지마다 하나씩 붙어요. 함정은 기본으로 「안전」처럼 보여요.</p><div class="mbc-card">${s.risks.map(r => `
        <div class="mbc-row ${r.on ? '' : 'off'}"><span class="ic">${r.icon}</span><div class="tx"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></div>
        <div class="ctl">${wSeg(`rw:${r.id}`, r.on ? r.w : 0)}<button type="button" class="mbc-icon" data-open="risks:${esc(r.id)}" aria-label="고치기">✎</button></div></div>
        ${open === `risks:${r.id}` ? itemEditor('risks', r) : ''}`).join('')}</div><button type="button" class="mbc-btn wide" data-act="newRisk">＋ 위험 만들기</button>`;
}
function danger(s) {
    const d = s.danger;
    return `<div class="mbc-card">
        ${row('위험 모드', '위험한 걸 고를수록 긴장도가 쌓여 함정이 늘고, 결과가 독해지고, 주사위가 어려워지고, 효과가 세짐', sw('danger.on', d.on))}
        ${row('답마다 줄어드는 양', '', slider('danger.decay', d.decay, 0, 10))}
        ${row('불안', '이 값부터', slider('danger.th.0', d.th[0], 5, 95, 5))}
        ${row('위험', '', slider('danger.th.1', d.th[1], 10, 95, 5))}
        ${row('파국', '', slider('danger.th.2', d.th[2], 15, 100, 5))}
    </div>
    ${[1, 2, 3].map(k => `<div class="mbc-sec">${['', '😰 불안', '😱 위험', '💀 파국'][k]} 단계 효과</div><div class="mbc-card pad">${fxChips(`stage:${k}`, d.stages[k] ?? [])}</div>`).join('')}
    <div class="mbc-sec">시간 제한 (효과에서 「시간 제한」을 켠 단계만)</div><div class="mbc-card">
        ${row('시간', '', slider('timer.sec', s.timer.sec, 5, 90, 5, '초'))}
        ${row('시간이 다 되면', '', seg('timer.expire', s.timer.expire, [['random', '아무거나'], ['worst', '제일 나쁜 것'], ['none', '아무 일 없음']]))}
    </div>`;
}
function fx(s) {
    return `<div class="mbc-card">
        ${row('효과 범위', '채팅 화면 전체 = 화면 효과 + 창 효과', seg('fx.scope', s.fx.scope, [['chat', '채팅 화면 전체'], ['panel', '선택지 창만'], ['off', '없음']]))}
        ${row('세기', '', slider('fx.k', s.fx.k, 0.5, 2, 0.25, '×'))}
        ${row('고를 때 도장', '성공 · 실패 · 대성공이 창 위에 쾅', sw('fx.burst', s.fx.burst))}
    </div>
    <div class="mbc-sec">효과 목록</div><div class="mbc-card">${Object.values(FX).map(f => row(f.name, f.desc, `<span class="mbc-tag">${f.where === 'panel' ? '창' : '화면'}</span>`)).join('')}</div>
    <div class="mbc-sec">속삭임 · 바꿔치기에 쓰는 말 (한 줄에 하나)</div><div class="mbc-card pad"><textarea class="mbc-ta" rows="5" data-set="fx.whispers">${esc(s.fx.whispers)}</textarea></div>
    <p class="mbc-hint">글자 깨짐은 화면에 보이는 글에만 들어가요. 번역 확장을 켜면 번역된 한국어가 일그러지고, 저장된 글은 그대로예요.</p>`;
}
function look(s) {
    const L = s.look;
    return `<div class="mbc-sec">모양</div><div class="mbc-card">
        ${row('배치', '고리 = 답 옆 동그란 단추 → 올리면 펼쳐짐 (좁은 화면에선 목록)', seg('layout', s.layout, [['ring', '고리'], ['list', '목록'], ['cards', '카드']]))}
    </div>
    <div class="mbc-sec">테마</div><div class="mbc-card pad"><div class="mbc-chipset">${Object.entries(THEMES).map(([id, t]) => `<button type="button" class="mbc-chip ${L.theme === id ? 'on' : ''}" data-set="look.theme" data-val="${id}">${esc(t.name)}</button>`).join('')}</div></div>
    <div class="mbc-sec">직접 고르기</div><div class="mbc-card">
        ${row('강조 색', '비우면 테마 색', `<input type="color" data-set="look.accent" value="${L.accent || '#5aa9a0'}"><button type="button" class="mbc-btn" data-act="noAccent">비우기</button>`)}
        ${row('모서리', '', slider('look.radius', L.radius, 0, 24, 2, 'px'))}
        ${row('글자 크기', '', slider('look.size', L.size, 80, 130, 5, '%'))}
        ${row('배경 진하기', '', slider('look.opacity', L.opacity, 40, 100, 2, '%'))}
    </div>`;
}
function preset() {
    return `<div class="mbc-card">${Object.entries(PRESETS).map(([id, p]) => row(p.name, p.desc, `<button type="button" class="mbc-btn" data-preset="${id}">적용</button>`)).join('')}</div>
    <div class="mbc-sec">내 설정</div><div class="mbc-card">
        ${row('내보내기', '지금 설정을 글로 복사', '<button type="button" class="mbc-btn" data-act="export">복사</button>')}
        ${row('가져오기', '복사해 둔 설정 글 붙여넣기', '<button type="button" class="mbc-btn" data-act="import">붙여넣기</button>')}
        ${row('처음으로', '모든 설정을 기본값으로', '<button type="button" class="mbc-btn danger" data-act="factory">되돌리기</button>')}
    </div>`;
}

function render(root) {
    const s = settings();
    const body = { base, kinds, risks, danger, fx, look, preset }[tab](s);
    root.innerHTML = `<div class="mbc-tabs">${TABS.map(([id, l]) => `<button type="button" class="${tab === id ? 'on' : ''}" data-tab="${id}">${l}</button>`).join('')}</div><div class="mbc-tabbody">${body}</div>`;
}
function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = val; }
function cast(raw, cur) { if (typeof cur === 'boolean') return raw === true || raw === 'true'; if (typeof cur === 'number') return Number(raw); return raw; }
function getPath(obj, path) { return path.split('.').reduce((o, k) => o?.[k], obj); }

export async function openEditor(startTab) {
    if (startTab) tab = startTab;
    const root = document.createElement('div');
    root.className = 'mbc-editor';
    render(root);
    const rerender = () => { const y = root.querySelector('.mbc-tabbody')?.scrollTop ?? 0; render(root); const b = root.querySelector('.mbc-tabbody'); if (b) b.scrollTop = y; };
    root.addEventListener('click', async (e) => {
        const s = settings();
        const t = e.target.closest('button, [data-tab]');
        if (!t) return;
        if (t.dataset.tab) { tab = t.dataset.tab; open = null; render(root); return; }
        if (t.dataset.set?.startsWith('kw:') || t.dataset.set?.startsWith('rw:')) {
            const [w, id] = t.dataset.set.split(':'); const list = w === 'kw' ? s.kinds : s.risks; const it = list.find(x => x.id === id); const v = Number(t.dataset.val);
            if (it) { it.on = v > 0; if (v > 0) it.w = v; } changed(); rerender(); return;
        }
        if (t.dataset.set && t.dataset.val !== undefined) { setPath(s, t.dataset.set, cast(t.dataset.val, getPath(s, t.dataset.set))); changed(); rerender(); return; }
        if (t.dataset.open) { open = open === t.dataset.open ? null : t.dataset.open; rerender(); return; }
        if (t.dataset.fx) {
            const key = t.dataset.fx, id = t.dataset.id;
            let list;
            if (key.startsWith('stage:')) list = s.danger.stages[key.split(':')[1]] ??= [];
            else { const [, kind, iid] = key.split(':'); const it = s[kind].find(x => x.id === iid); list = it.fx ??= []; }
            const k = list.indexOf(id); if (k >= 0) list.splice(k, 1); else list.push(id);
            changed(); rerender(); return;
        }
        if (t.dataset.preset) { applyPreset(t.dataset.preset); toastr.success(`${PRESETS[t.dataset.preset].name} 적용`, '미트볼 선택지'); rerender(); return; }
        const a = t.dataset.act;
        const box = t.closest('.mbc-editbox');
        if (box && a) {
            const list = s[box.dataset.kind]; const idx = list.findIndex(x => x.id === box.dataset.id);
            if (a === 'close') open = null;
            if (a === 'del' && idx >= 0) { if (box.dataset.kind === 'kinds' && KINDS.some(k => k.id === box.dataset.id)) s._gone.push(box.dataset.id); list.splice(idx, 1); open = null; }
            if (a === 'restore') { const d = (box.dataset.kind === 'kinds' ? DEFAULTS.kinds : DEFAULTS.risks).find(x => x.id === box.dataset.id); if (d && idx >= 0) list[idx] = JSON.parse(JSON.stringify(d)); else toastr.info('직접 만든 항목은 기본값이 없어요.'); }
            changed(); rerender(); return;
        }
        if (a === 'newKind' || a === 'newRisk') {
            const id = `my${Date.now().toString(36)}`;
            if (a === 'newKind') s.kinds.push({ id, name: '새 성향', icon: '✨', group: 'act', w: 2, on: true, heat: 0, fx: [], res: '', check: false, desc: '한 줄 설명', ai: 'describe how this kind of option should read', attr: '' });
            else s.risks.push({ id, name: '새 위험', icon: '❗', tone: 'warn', w: 1, on: true, heat: 5, fx: [], show: 'show', check: false, desc: '한 줄 설명', ai: 'describe the stakes of this option', res: '' });
            open = `${a === 'newKind' ? 'kinds' : 'risks'}:${id}`; changed(); rerender(); return;
        }
        if (a === 'peek') { const { buildPrompt } = await import('./prompt.js'); const { userCount } = await import('./core.js'); const p = buildPrompt(userCount() + 1, meta().pending); const el = document.createElement('pre'); el.className = 'mbc-pre'; el.textContent = p || '(없음)'; const host = t.closest('.mbc-row'); host.after(el); return; }
        if (a === 'reset') { meta().reset = (ctx().chat?.length ?? 0) - 1; saveMeta(); changed(); toastr.info('이 채팅의 긴장도를 0으로 돌렸어요.', '미트볼 선택지'); return; }
        if (a === 'noAccent') { s.look.accent = ''; changed(); rerender(); return; }
        if (a === 'export') { const txt = JSON.stringify(settings()); try { await navigator.clipboard.writeText(txt); toastr.success('설정을 복사했어요.'); } catch { prompt('이 글을 복사하세요', txt); } return; }
        if (a === 'import') {
            const txt = await ctx().Popup?.show?.input?.('설정 가져오기', '복사해 둔 설정 글을 붙여 넣으세요.', '') ?? prompt('설정 글');
            if (!txt) return;
            try { const o = JSON.parse(txt); const es = ctx().extensionSettings; es.mbChoices = { ...o, _v: 2 }; settings(); changed(); rerender(); toastr.success('가져왔어요.'); } catch { toastr.error('설정 글이 아니에요.'); }
            return;
        }
        if (a === 'factory') { const es = ctx().extensionSettings; es.mbChoices = { _v: 2 }; settings(); changed(); rerender(); return; }
    });
    root.addEventListener('input', (e) => {
        const t = e.target;
        if (t.type === 'range') { const o = t.parentElement.querySelector('output'); if (o) o.textContent = t.value + (o.textContent.replace(/^[\d.]+/, '')); }
    });
    root.addEventListener('change', (e) => {
        const s = settings();
        const t = e.target;
        if (t.dataset.set) {
            const cur = getPath(s, t.dataset.set);
            const v = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' || t.tagName === 'SELECT' && typeof cur === 'number' ? Number(t.value) : t.value;
            setPath(s, t.dataset.set, v); changed(); if (t.type === 'checkbox' || t.tagName === 'SELECT') rerender(); return;
        }
        if (t.dataset.edit) {
            const box = t.closest('.mbc-editbox'); const it = s[box.dataset.kind].find(x => x.id === box.dataset.id); if (!it) return;
            it[t.dataset.edit] = t.dataset.edit === 'heat' ? Number(t.value) || 0 : t.dataset.edit === 'check' ? !!t.value : t.value;
            changed(); if (['group', 'icon', 'name'].includes(t.dataset.edit)) rerender();
        }
    });
    const c = ctx();
    if (c.Popup && c.POPUP_TYPE) { const p = new c.Popup(root, c.POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true, okButton: '닫기' }); await p.show(); }
    return root;
}

export function applyPreset(id) {
    const s = settings(), p = PRESETS[id]?.set;
    if (!p) return;
    s.layout = p.layout; s.count = p.count;
    Object.assign(s.look, p.look); Object.assign(s.danger, p.danger); Object.assign(s.fx, p.fx);
    for (const k of s.kinds) if (p.kindW[k.id] !== undefined) { k.w = p.kindW[k.id] || k.w; k.on = p.kindW[k.id] > 0; }
    for (const r of s.risks) if (p.riskW[r.id] !== undefined) { r.w = p.riskW[r.id] || r.w; r.on = p.riskW[r.id] > 0; }
    changed();
}
