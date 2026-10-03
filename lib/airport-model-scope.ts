type Lang = 'ko' | 'en' | 'zh' | 'ja';
export function airportModelScope(terminal: 'all' | 'T1' | 'T2' | 'CONCOURSE', lang: Lang): string {
  return {
    all: {ko:'전체 T1·T2·탑승동',en:'All T1·T2·Concourse',zh:'全部 T1·T2·登机楼',ja:'全体 T1・T2・搭乗棟'},
    T1: {ko:'제1터미널 T1',en:'Terminal 1 T1',zh:'第1航站楼 T1',ja:'第1ターミナル T1'},
    T2: {ko:'제2터미널 T2',en:'Terminal 2 T2',zh:'第2航站楼 T2',ja:'第2ターミナル T2'},
    CONCOURSE:{ko:'탑승동',en:'Concourse',zh:'登机楼',ja:'搭乗棟'},
  }[terminal][lang];
}
