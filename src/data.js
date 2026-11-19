// 성향 6종(묶음마다 하나) · 위험 4종 · 결과 지시

// attr: 주사위를 굴릴 때 쓸 라이트 능력치 이름 (앞에서부터 찾는다)
export const KINDS = [
    { id: 'rational', name: '이성적으로', icon: '🧠', group: '판단', desc: '현실적으로 따져서 가장 말이 되는 행동', ai: 'the realistic, level-headed thing a sensible person would do', attr: '지능,지혜,이성,판단' },
    { id: 'persona', name: '성격대로', icon: '🎭', group: '마음', desc: '내 캐릭터의 원래 성격이라면 할 행동', ai: "exactly what {{user}}'s established personality would do", attr: '매력,의지' },
    { id: 'need', name: '욕구대로', icon: '🍞', group: '욕망', desc: '지금 가장 급한 욕구가 시키는 대로', ai: "what {{user}}'s most urgent need or desire pushes toward", res: 'If a need is satisfied, record it as an event line.', attr: '체력,인내' },
    { id: 'tease', name: '장난스럽게', icon: '😜', group: '장난', desc: '놀리기 · 장난 · 분위기 띄우기', ai: 'a playful tease or prank', attr: '매력,재치' },
    { id: 'brave', name: '정면으로', icon: '⚔', group: '행동', desc: '정면 돌파 · 맞서기', ai: 'confront it head-on', attr: '힘,체력,근력' },
    { id: 'fate', name: '운에 맡기기', icon: '🎲', group: '이상', check: true, desc: '동전 · 직감 · 아무거나. 늘 주사위를 굴림 (오늘 운세가 크게 작용)', ai: 'leave it to chance: a coin flip, a hunch, a random pick', attr: '운,행운' },
];

export const RISKS = [
    { id: 'none', name: '보통', icon: '', tone: 'mid', w: 3, desc: '특별한 위험 없음', ai: 'ordinary stakes' },
    { id: 'safe', name: '안전', icon: '🛡', tone: 'good', w: 2, desc: '손해가 거의 없지만 얻는 것도 적음', ai: 'low stakes, low reward' },
    { id: 'gamble', name: '모험', icon: '🎲', tone: 'warn', w: 2, check: true, desc: '주사위를 굴림. 성공하면 크게 얻고 실패하면 크게 잃음', ai: 'bold: a big payoff if it works, a real cost if it fails' },
    { id: 'price', name: '대가', icon: '💸', tone: 'warn', w: 1, desc: '확실히 얻고 확실히 잃음 (대가는 배지로 보여요)', ai: 'a sure gain that clearly costs something (money, time, trust). Do NOT write the cost in the option text' },
];

export const RESULT = {
    price: 'Deliver the gain AND make {{user}} pay a fitting cost.',
    win: 'The gamble PAYS OFF: give a clear, tangible gain.',
    lose: 'It GOES WRONG: a real, recoverable cost.',
    crit: 'CRITICAL SUCCESS: better than hoped, with a lucky bonus.',
    fumble: 'CRITICAL FAILURE: the worst plausible outcome.',
};

export const DCS = [['쉬움', 8], ['보통', 12], ['어려움', 15]];
