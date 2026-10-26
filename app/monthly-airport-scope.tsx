import type {Lang} from './retailpulse-data';
/** Scope of the stored AviationStatsByCountry passenger operation, not every airport service. */
export function MonthlyAirportScope({lang='ko'}:{lang?:Lang}){
 const copy={ko:['T1 + T2 전체 · 터미널 선택과 무관','현재 사용하는 공항공사 노선 국가별 통계는 T1·T2 합계로 제공되어 터미널별로 구분할 수 없습니다.'],en:['T1 + T2 total · independent of terminal selection','The airport corporation’s route-country statistics used here combine T1 and T2 and cannot be split by terminal.'],zh:['T1 + T2 全部 · 与航站楼选择无关','此处使用的机场公社航线国家统计合并T1和T2，无法按航站楼区分。'],ja:['T1 + T2 全体・ターミナル選択に関係なし','ここで使用する空港公社の路線国別統計はT1・T2の合計で、ターミナル別に分けられません。']}[lang];
 return <div className="monthly-airport-scope" data-testid="monthly-airport-scope"><p>{copy[0]}</p><small>{copy[1]}</small></div>;
}
