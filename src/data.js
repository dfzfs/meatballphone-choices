// 기본 데이터: 성향 18종 · 위험 6종 · 효과 · 테마 · 프리셋. 전부 설정에서 고칠 수 있다.

export const GROUPS = {
    think: { name: '판단', icon: '🧠' },
    heart: { name: '마음', icon: '💗' },
    want: { name: '욕망', icon: '🔥' },
    mischief: { name: '장난', icon: '😜' },
    act: { name: '행동', icon: '⚔' },
    weird: { name: '이상', icon: '🌀' },
};

// attr: 이 성향으로 주사위를 굴릴 때 쓸 미트볼 능력치 (앞에서부터 찾는다)
export const KINDS = [
    { id: 'rational', name: '이성적으로', icon: '🧠', group: 'think', w: 2, desc: '현실적으로 따져서 가장 말이 되는 행동', ai: 'the realistic, level-headed thing a sensible person would do', attr: '지능,지혜,이성,판단' },
    { id: 'careful', name: '살펴보기', icon: '🔍', group: 'think', w: 2, desc: '확인하고 관찰하고 묻는다. 시간이 들지만 정보를 얻음', ai: 'investigate first: look closer, check something, or ask a question', attr: '감각,관찰,지각,지능' },
    { id: 'scheme', name: '계산적으로', icon: '🧮', group: 'think', w: 1, desc: '손익을 따지는 영리한 수', ai: "a shrewd move that tilts things in {{user}}'s favor", attr: '지능,교활,말솜씨' },
    { id: 'persona', name: '성격대로', icon: '🎭', group: 'heart', w: 2, desc: '내 캐릭터의 원래 성격이라면 할 행동', ai: "exactly what {{user}}'s established personality would do", attr: '매력,의지' },
    { id: 'feeling', name: '감정대로', icon: '💧', group: 'heart', w: 1, desc: '지금 기분을 숨기지 않고 드러냄', ai: "act openly on {{user}}'s current emotion (joy, anger, fear, sadness)", attr: '의지,매력' },
    { id: 'kind', name: '다정하게', icon: '🤝', group: 'heart', w: 1, desc: '상대를 챙기고 배려함 · 호감이 오르기 쉬움', ai: 'a considerate, caring action toward someone present', res: 'If it moves someone, record it (aff / trust +N).', attr: '매력,공감' },
    { id: 'flirt', name: '설레게', icon: '💘', group: 'heart', w: 1, desc: '플러팅 · 은근한 접근 · 로맨스', ai: 'a flirtatious or romantic move toward someone present, fitting the scene', res: 'Record the relationship change (aff ±N).', attr: '매력' },
    { id: 'need', name: '욕구대로', icon: '🍞', group: 'want', w: 2, desc: '지금 제일 급한 수치가 시키는 대로 (배고프면 먹고, 지치면 쉼)', ai: "what {{user}}'s most urgent need pushes toward", res: 'If a need is satisfied, record it (stat: 이름 +N).', attr: '체력,인내' },
    { id: 'greed', name: '욕심대로', icon: '💰', group: 'want', w: 1, desc: '돈 · 물건 · 이득을 챙김', ai: 'grab money, items or an advantage', res: 'Record gains or losses (cash / item).', attr: '교활,민첩' },
    { id: 'impulse', name: '충동적으로', icon: '⚡', group: 'want', w: 1, desc: '생각 없이 지금 당장 하고 싶은 것', ai: 'a sudden impulsive act with no second thought', attr: '민첩' },
    { id: 'tease', name: '장난스럽게', icon: '😜', group: 'mischief', w: 1, desc: '놀리기 · 장난 · 분위기 띄우기', ai: 'a playful tease or prank', attr: '매력,재치' },
    { id: 'mean', name: '못되게', icon: '😈', group: 'mischief', w: 1, heat: 4, desc: '비꼬기 · 무시 · 시비 · 호감이 깎이기 쉬움', ai: 'a mean, cutting or rude action', res: 'Record the relationship damage (aff / trust −N).', attr: '힘,의지' },
    { id: 'lie', name: '속이기', icon: '🃏', group: 'mischief', w: 1, desc: '거짓말 · 연기 · 허세', ai: 'deceive: lie, bluff or pretend', attr: '말솜씨,매력,교활' },
    { id: 'brave', name: '정면으로', icon: '⚔', group: 'act', w: 2, desc: '정면 돌파 · 맞서기', ai: 'confront it head-on', attr: '힘,체력,근력' },
    { id: 'flee', name: '피하기', icon: '🏃', group: 'act', w: 1, desc: '자리를 뜨거나 피함 · 대신 놓치는 것이 생김', ai: 'avoid or leave; escape at the cost of missing something', attr: '민첩' },
    { id: 'wait', name: '지켜보기', icon: '⏳', group: 'act', w: 1, desc: '아무것도 안 하고 흐름을 봄', ai: 'do nothing yet: wait, watch and let others move first', attr: '감각,인내' },
    { id: 'weird', name: '이상한 끌림', icon: '🌀', group: 'weird', w: 1, heat: 8, fx: ['glitch', 'bleed'], desc: '무언가가 원하는 이상한 행동 · 긴장도가 오름', ai: 'a strange, tempting, slightly unhinged action — something abnormal pulls {{user}}', attr: '의지,정신' },
    { id: 'fate', name: '운에 맡기기', icon: '🎲', group: 'weird', w: 1, check: true, desc: '동전 · 직감 · 아무거나. 늘 주사위를 굴림 (오늘 운세가 크게 작용)', ai: 'leave it to chance: a coin flip, a hunch, a random pick', attr: '운,행운' },
];

// show: show(보임) · hide(딱지 없음) · safe(안전으로 위장)
export const RISKS = [
    { id: 'none', name: '보통', icon: '·', tone: 'mid', w: 3, show: 'hide', heat: 0, desc: '특별한 위험 없음', ai: 'ordinary stakes' },
    { id: 'safe', name: '안전', icon: '🛡', tone: 'good', w: 2, heat: -8, desc: '손해가 거의 없지만 얻는 것도 적음', ai: 'low stakes, low reward' },
    { id: 'gamble', name: '모험', icon: '🎲', tone: 'warn', w: 2, heat: 10, check: true, desc: '주사위를 굴림. 성공하면 크게 얻고 실패하면 크게 잃음', ai: 'bold: a big payoff if it works, a real cost if it fails' },
    { id: 'trap', name: '함정', icon: '🪤', tone: 'bad', w: 1, heat: 22, show: 'safe', desc: '겉으론 멀쩡함. 이야기와 어긋난 데가 한 곳 있음 — 잘 읽으면 보임', ai: 'reads like a sensible option, but ONE detail quietly contradicts what the story established (wrong door, wrong name, an offer too good). A careful reader can spot it. Never hint that it is a trap' },
    { id: 'price', name: '대가', icon: '💸', tone: 'warn', w: 1, heat: 4, desc: '확실히 얻고 확실히 잃음 · 대가가 적혀 있음', ai: 'a sure gain with a sure, stated cost — end the line with the cost in parentheses, e.g. (대가: 돈 −20)' },
    { id: 'cursed', name: '금단', icon: '☠', tone: 'curse', w: 0, heat: 18, fx: ['static', 'bleed'], desc: '바라던 걸 얻지만 오래가는 저주가 붙음', ai: "forbidden: grants what {{user}} wants most, at a lasting, sinister price" },
];

export const RESULT = {
    trap: (sev) => `It was a TRAP: its hidden flaw springs NOW. Show a concrete consequence (${sev}): injury, lost money or items, a worse position, someone turning hostile. Do not soften it.`,
    price: () => 'Deliver the promised gain AND make {{user}} pay the stated cost.',
    cursed: (sev) => `Grant what {{user}} wanted, then attach a lasting curse (${sev}). If you write <meatball>, add a curse line.`,
    win: () => 'The gamble PAYS OFF: give a clear, tangible gain.',
    lose: (sev) => `It GOES WRONG: a real cost (${sev}).`,
    crit: () => 'CRITICAL SUCCESS: better than hoped, with a lucky bonus.',
    fumble: (sev) => `CRITICAL FAILURE: the worst plausible outcome (${sev}).`,
};
export const SEV = ['clear but recoverable', 'serious', 'severe and lasting', 'brutal — the world turns against {{user}}'];

// 효과 (where: panel = 선택지 창 · screen = 채팅 화면)
export const FX = {
    glitch: { name: '글자 깨짐', where: 'panel', desc: '선택지 글자가 그 언어에 맞게 일그러짐' },
    bleed: { name: '번짐', where: 'panel', desc: '글자에 붉고 푸른 잔상이 번짐' },
    redact: { name: '검열', where: 'panel', desc: '낱말 하나가 ████로 가려짐 (올리면 보임)' },
    swap: { name: '바꿔치기', where: 'panel', desc: '마우스를 올리면 잠깐 다른 말로 바뀜' },
    dodge: { name: '도망치는 버튼', where: 'panel', desc: '처음 다가가면 버튼이 슬쩍 피함' },
    whisper: { name: '속삭임', where: 'panel', desc: '창 위로 희미한 말이 흘러감' },
    static: { name: '지지직', where: 'panel', desc: '창에 잡음이 낌' },
    shake: { name: '떨림', where: 'panel', desc: '창이 가끔 흔들림' },
    timer: { name: '시간 제한', where: 'panel', desc: '시간 안에 못 고르면 저절로 골라짐' },
    vignette: { name: '붉은 가장자리', where: 'screen', desc: '채팅 가장자리가 붉게 물듦' },
    pulse: { name: '심장 박동', where: 'screen', desc: '가장자리가 심장처럼 뛰는 듯 커졌다 작아짐' },
    crt: { name: '옛 화면', where: 'screen', desc: '주사선과 색 어긋남' },
    tear: { name: '화면 찢김', where: 'screen', desc: '마지막 답이 가끔 가로로 찢김' },
    flicker: { name: '깜빡임', where: 'screen', desc: '마지막 답이 가끔 깜빡임' },
    tilt: { name: '기울어짐', where: 'screen', desc: '채팅이 아주 조금 기울어짐' },
    rot: { name: '본문 부패', where: 'screen', desc: '마지막 답 글자도 일그러짐 (번역을 켜면 번역된 글)' },
};

export const THEMES = {
    auto: { name: '실리태번 테마 따라감' },
    life: { name: '생활 시뮬' },
    gothic: { name: '고딕 호러' },
    neon: { name: '네온' },
    paper: { name: '양피지' },
    mono: { name: '미니멀' },
};

const W = (o) => o; // 프리셋 가독성용
export const PRESETS = {
    life: W({ name: '🏠 생활 시뮬', desc: '고리 메뉴 · 마음 · 욕망 · 장난 위주 · 위험은 거의 없음', set: { layout: 'ring', count: 8, look: { theme: 'life' }, danger: { on: false }, fx: { scope: 'panel' },
        kindW: { persona: 2, feeling: 2, kind: 2, flirt: 2, need: 3, greed: 1, impulse: 2, tease: 2, mean: 1, lie: 1, rational: 1, careful: 1, scheme: 0, brave: 1, flee: 1, wait: 1, weird: 0, fate: 1 },
        riskW: { none: 4, safe: 2, gamble: 1, trap: 0, price: 1, cursed: 0 } } }),
    horror: W({ name: '🕯 호러', desc: '위험 모드 · 함정 · 금단 · 고딕 · 효과 화면 전체', set: { layout: 'list', count: 4, look: { theme: 'gothic' }, danger: { on: true }, fx: { scope: 'chat' },
        kindW: { rational: 2, careful: 3, scheme: 0, persona: 1, feeling: 1, kind: 0, flirt: 0, need: 1, greed: 0, impulse: 1, tease: 0, mean: 0, lie: 1, brave: 2, flee: 2, wait: 2, weird: 3, fate: 1 },
        riskW: { none: 1, safe: 1, gamble: 2, trap: 3, price: 1, cursed: 2 } } }),
    romance: W({ name: '💘 연애', desc: '설레게 · 다정하게 · 감정대로 위주 · 생활 시뮬 테마', set: { layout: 'ring', count: 6, look: { theme: 'life' }, danger: { on: false }, fx: { scope: 'panel' },
        kindW: { persona: 2, feeling: 3, kind: 3, flirt: 3, tease: 2, mean: 1, lie: 1, need: 1, impulse: 2, rational: 1, careful: 1, scheme: 0, greed: 0, brave: 1, flee: 1, wait: 1, weird: 0, fate: 1 },
        riskW: { none: 4, safe: 2, gamble: 2, trap: 1, price: 0, cursed: 0 } } }),
    dungeon: W({ name: '⚔ 던전', desc: '카드 · 정면으로 · 살펴보기 · 모험 · 대가 · 위험 모드', set: { layout: 'cards', count: 4, look: { theme: 'paper' }, danger: { on: true }, fx: { scope: 'panel' },
        kindW: { brave: 3, careful: 3, greed: 2, flee: 2, scheme: 2, rational: 1, wait: 1, impulse: 1, fate: 2, lie: 1, persona: 1, feeling: 0, kind: 0, flirt: 0, need: 1, tease: 0, mean: 0, weird: 1 },
        riskW: { none: 1, safe: 1, gamble: 3, trap: 2, price: 2, cursed: 1 } } }),
    mystery: W({ name: '🔎 추리', desc: '이성적으로 · 살펴보기 · 속이기 · 함정 많음 · 목록', set: { layout: 'list', count: 5, look: { theme: 'mono' }, danger: { on: false }, fx: { scope: 'panel' },
        kindW: { rational: 3, careful: 3, scheme: 2, lie: 2, persona: 1, feeling: 1, wait: 2, brave: 1, flee: 0, kind: 1, flirt: 0, need: 0, greed: 0, impulse: 1, tease: 0, mean: 1, weird: 0, fate: 0 },
        riskW: { none: 3, safe: 1, gamble: 2, trap: 3, price: 1, cursed: 0 } } }),
};

export const WHISPERS = '가지 마\n그건 아니야\n뒤를 봐\n이미 늦었어\n누가 보고 있어\n다시 읽어\n정말 그걸로?\n문은 오른쪽이었어';

export const DCS = [['쉬움', 8], ['보통', 12], ['어려움', 15], ['매우 어려움', 18]];
export const LUCK = [
    { name: '대흉', mod: -2, w: 1, tone: 'bad' },
    { name: '흉', mod: -1, w: 2, tone: 'bad' },
    { name: '평', mod: 0, w: 3, tone: 'mid' },
    { name: '길', mod: 1, w: 2, tone: 'good' },
    { name: '대길', mod: 2, w: 1, tone: 'good' },
];
