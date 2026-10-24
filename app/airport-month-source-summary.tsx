import type {Lang} from './retailpulse-data';

/** A presentation of the prepared timestamp; raw evidence stays in the inner disclosure. */
export function AirportMonthSourceSummary({lang,calculatedAt}:{lang:Lang;calculatedAt?:string|null}){
 const text={ko:{checked:'확인 시각',missing:'확인 시각 없음',source:'인천공항 자료'},en:{checked:'Checked',missing:'Check time unavailable',source:'Incheon sources'},zh:{checked:'核实时间',missing:'暂无核实时间',source:'仁川机场资料'},ja:{checked:'確認日時',missing:'確認日時なし',source:'仁川空港の資料'}}[lang];
 const valid=Boolean(calculatedAt&&Number.isFinite(Date.parse(calculatedAt)));
 const stamp=valid?new Intl.DateTimeFormat({ko:'ko-KR',en:'en-GB',zh:'zh-CN',ja:'ja-JP'}[lang],{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(calculatedAt!)):null;
 return <p className="airport-month-source-summary">{stamp?<><span>{text.checked} </span><time dateTime={calculatedAt!}>{stamp} KST</time></>:text.missing} · <a href={`/${lang}/more#collection-status`}>{text.source}</a></p>;
}
