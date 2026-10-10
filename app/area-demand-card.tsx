'use client';

import { useEffect, useId, useState } from 'react';
import type { Lang } from './retailpulse-data';
import type { LiveSummary } from './live-signals';
import { buildAreaCurrentBrief } from '../lib/current-brief';
import {RateText} from './change-rate';
import { comparisonText } from '../lib/period-comparison';
import { describeObservationAge } from '../lib/observation-freshness';
import {PopulationFlowChart} from './population-flow';
import {PopulationOutlook} from './population-outlook';
import { kstDay, kstStamp, peopleRange, populationFlow, usableComparison, validPopulationRange, type FlowPoint } from '../lib/demand-presentation';

export const demandCopy = {
  selected: { ko: '선택 지역', en: 'Selected area', zh: '所选地区', ja: '選択エリア' },
  observed: { ko: '관측', en: 'Observed', zh: '观测', ja: '観測' },
  forecast: { ko: '서울시 공식 예측', en: 'Seoul official forecast', zh: '首尔市官方预测', ja: 'ソウル市公式予測' },
  previous: { ko: '이전 자료', en: 'Earlier observation', zh: '历史资料', ja: '以前の資料' },
  missing: { ko: '관측자료 없음', en: 'No observation', zh: '无观测资料', ja: '観測資料なし' },
  current: { ko: '현재 추정 인구', en: 'Estimated population now', zh: '当前推定人口', ja: '現在の推定人口' },
  recorded: { ko: '관측 시점 추정 인구', en: 'Population at observation', zh: '观测时点推定人口', ja: '観測時点の推定人口' },
  latest: { ko: '최근 관측 인구', en: 'Latest observed population', zh: '最近观测人口', ja: '直近の観測人口' },
  compareMissing: { ko: '전주 동요일 비교자료 없음', en: 'Same weekday last week: comparison unavailable', zh: '上周同星期比较资料不足', ja: '先週同曜日の比較資料なし' },
  uncertain: { ko: '범위가 겹쳐 증가·감소를 확정할 수 없습니다.', en: 'Overlapping ranges do not establish an increase or decrease.', zh: '区间重叠，无法确定增减。', ja: '範囲が重なるため増減を断定できません。' },
  flow: { ko: '관측과 앞으로의 흐름', en: 'Observed and upcoming flow', zh: '观测与未来趋势', ja: '観測とこれからの流れ' },
  noHistory: { ko: '과거 흐름자료 없음 · 관측 1개를 점으로 표시', en: 'No observation history · one reading shown as a point', zh: '无历史趋势 · 当前观测以点表示', ja: '過去の推移なし・現在の観測は点で表示' },
  noFlow: { ko: '표시할 관측·공식 예보가 없습니다.', en: 'No observation or official forecast to display.', zh: '暂无可显示的观测或官方预测。', ja: '表示できる観測・公式予報がありません。' },
  noForecast: { ko: '공개된 향후 예보 없음', en: 'No published upcoming forecast', zh: '暂无已发布未来预测', ja: '公表済みの今後の予報なし' },
  issued: { ko: '발표', en: 'Issued', zh: '发布', ja: '発表' },
  collected: { ko: '수집', en: 'Collected', zh: '采集', ja: '収集' },
  unknownIssue: { ko: '발표시각 미제공', en: 'Issue time unavailable', zh: '未提供发布时间', ja: '発表時刻の提供なし' },
  details: { ko: '기준·상세 수치 보기', en: 'Basis and exact values', zh: '查看依据与详细数值', ja: '基準・詳細な数値を見る' },
  detailLink: { ko: '지역 자세히 보기', en: 'Explore this area', zh: '查看地区详情', ja: 'エリアの詳細を見る' },
  timeSelect: { ko: '차트 시간 선택', en: 'Select chart time', zh: '选择图表时间', ja: 'グラフの時刻を選択' },
  rangeNote: { ko: '범위는 측정 구역에 머무는 추정 인구입니다. 하루 누적 방문객·구매고객 수가 아닙니다.', en: 'Ranges estimate people present in the measured area, not daily visitors or shoppers.', zh: '区间为测量区域内停留人口估计，并非每日累计访客或购买人数。', ja: '範囲は測定区域に滞在する推定人口で、1日の累計来訪者・購買客数ではありません。' },
  source: { ko: '서울시 실시간 도시데이터', en: 'Seoul real-time city data', zh: '首尔市实时城市数据', ja: 'ソウル市リアルタイム都市データ' },
  today: { ko: '오늘', en: 'Today', zh: '今天', ja: '今日' },
  tomorrow: { ko: '내일', en: 'Tomorrow', zh: '明天', ja: '明日' },
  now: { ko: '지금', en: 'Now', zh: '现在', ja: '現在' },
} as const;

export const demandAreaNames = {
  myeongdong: { ko: '명동', en: 'Myeongdong', zh: '明洞', ja: '明洞' },
  hongdae: { ko: '홍대', en: 'Hongdae', zh: '弘大', ja: '弘大' },
  seongsu: { ko: '성수', en: 'Seongsu', zh: '圣水', ja: '聖水' },
  itaewon: { ko: '이태원', en: 'Itaewon', zh: '梨泰院', ja: '梨泰院' },
};
export function demandLevel(level: number, lang: Lang) {
  return ({ ko: ['자료 없음', '여유', '보통', '약간 붐빔', '붐빔'], en: ['Unavailable', 'Quiet', 'Moderate', 'Slightly busy', 'Busy'], zh: ['无资料', '空闲', '一般', '略拥挤', '拥挤'], ja: ['資料なし', '余裕', '普通', 'やや混雑', '混雑'] })[lang][level] ?? '—';
}

/** A presentation clock only. It never triggers a fetch or changes source times. */
export function usePresentationClock(reference: string): number {
  const [time, setTime] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setTime(Date.now());
    const start = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 60_000);
    return () => { window.clearTimeout(start); window.clearInterval(interval); };
  }, []);
  return time ?? Date.parse(reference);
}

export function PopulationFlow({points,lang,now}:{points:FlowPoint[];lang:Lang;now:number}) {
  return <PopulationFlowChart points={points} lang={lang} now={now} copy={demandCopy}/>;
}

export function AreaDemandCard({ summary, area, lang, linkHref, linkLabel }: { summary: LiveSummary; area: keyof typeof demandAreaNames; lang: Lang; linkHref?: string; linkLabel?: string }) {
  const id = useId(), block = summary.areas[area];
  const now = usePresentationClock(summary.generatedAt);
  const points = populationFlow({ ...block, serviceDate: summary.serviceDateKst, isToday: summary.dayRelation === 'TODAY', now });
  const realtime = validPopulationRange(block?.realtime) && kstDay(block!.realtime!.observedAt) === summary.serviceDateKst && Date.parse(block!.realtime!.observedAt) <= now ? block!.realtime! : null;
  const age = realtime ? describeObservationAge(realtime.observedAt, new Date(now).toISOString(), lang) : null;
  const ageMinutes=realtime?Math.max(0,Math.floor((now-Date.parse(realtime.observedAt))/60_000)):null;
  const isCurrent = summary.dayRelation === 'TODAY' && kstDay(now) === summary.serviceDateKst && age?.isNow && realtime?.freshness !== 'STALE';
  const comparison = usableComparison(realtime, 7), monthComparison = usableComparison(realtime, 28);
  const brief = buildAreaCurrentBrief({ realtime, realtimeForecast: points.filter(p => p.kind === 'forecast').map(p => ({ ...p, targetAt: p.at, congestionLevel: block?.realtimeForecast.find(r => r.targetAt === p.at)?.congestionLevel ?? 0 })), weather: [], eventCount: 0, nowIso: new Date(now).toISOString() });
  const peak = brief.upcomingPeak;
  const peakDay = peak ? kstDay(peak.targetAt) === kstDay(now) ? demandCopy.today[lang] : kstDay(peak.targetAt) === kstDay(now + 86_400_000) ? demandCopy.tomorrow[lang] : kstDay(peak.targetAt) : '';
  const peakSentence = peak ? ({ ko: `공개된 예보 중 ${peakDay} ${kstStamp(peak.targetAt).slice(6)}에 가장 붐빌 전망 · ${demandLevel(peak.congestionLevel, lang)}`, en: `Busiest among published forecasts: ${peakDay} ${kstStamp(peak.targetAt).slice(6)} · ${demandLevel(peak.congestionLevel, lang)}`, zh: `已发布预测中最拥挤：${peakDay} ${kstStamp(peak.targetAt).slice(6)} · ${demandLevel(peak.congestionLevel, lang)}`, ja: `公表済み予報の中で最混雑：${peakDay} ${kstStamp(peak.targetAt).slice(6)} · ${demandLevel(peak.congestionLevel, lang)}` })[lang] : demandCopy.noForecast[lang];
  const unit = { ko: '명', en: 'people', zh: '人', ja: '人' }[lang];
  return <section className="current-brief area-current-brief demand-card" data-testid="area-demand-card" aria-labelledby={`${id}-title`}>
    <header className="demand-card-head"><h2 id={`${id}-title`}>{demandAreaNames[area][lang]}</h2><span className="demand-data-state">{demandCopy[!realtime ? 'missing' : isCurrent ? 'observed' : 'previous'][lang]}</span></header>
    <div className="demand-card-body"><div className="demand-reading">
      <p className="demand-level" data-level={realtime?.congestionLevel ?? 0}>{realtime ? lang==='ko'&&realtime.congestionLabel?realtime.congestionLabel:demandLevel(realtime.congestionLevel, lang) : demandCopy.missing[lang]}</p>
      <p className="demand-metric-label">{demandCopy.latest[lang]}</p>
      <p className="demand-number">{realtime ? <><strong>{peopleRange(realtime, lang)}</strong><span>{unit}</span></> : <strong>—</strong>}</p>
      {realtime && <p className="demand-time"><strong><time dateTime={realtime.observedAt}>{kstStamp(realtime.observedAt)} KST</time> {demandCopy.observed[lang]}</strong>{age?.ago ? ` · ${age.ago}` : ''}</p>}
      {ageMinutes!==null&&<p className="demand-freshness">{({ko:`${kstStamp(now)} KST 기준 ${ageMinutes}분 앞서 확인한 인원입니다.`,en:`Observed ${ageMinutes} minutes before ${kstStamp(now)} KST.`,zh:`比${kstStamp(now)} KST早${ageMinutes}分钟观测的人数。`,ja:`${kstStamp(now)} KSTより${ageMinutes}分前に確認した人数です。`})[lang]}</p>}
      <p className="demand-comparison">{comparison ? <RateText text={comparisonText(comparison, lang, 7)} lang={lang}/> : demandCopy.compareMissing[lang]}</p>
      {comparison && comparison.minPercent <= 0 && comparison.maxPercent >= 0 && <p className="flow-note">{demandCopy.uncertain[lang]}</p>}
    </div><PopulationOutlook points={points} current={realtime} lang={lang} now={now}/></div>
    <details className="population-history-disclosure"><summary>{demandCopy.flow[lang]} · {demandCopy.details[lang]}</summary><PopulationFlow points={points} lang={lang} now={now}/></details>
    <p className="demand-takeaway">{peakSentence}</p>
    <p className="demand-source">{demandCopy.source[lang]}{realtime?.retrievedAt?` · ${demandCopy.collected[lang]} ${kstStamp(realtime.retrievedAt)} KST`:''} · {demandCopy.rangeNote[lang]}</p>
    <div className="demand-card-footer"><details><summary>{demandCopy.details[lang]}</summary>
      <p>{demandCopy.source[lang]} · {summary.serviceDateKst} · KST</p>
      {monthComparison && <p><RateText text={comparisonText(monthComparison, lang, 28)} lang={lang}/></p>}
      <p>{({ ko: '혼잡 단계는 서울시 제공 등급입니다. 선과 띠는 인구의 상·하한이며, 빠진 구간은 연결하지 않습니다.', en: 'Crowding levels are supplied by Seoul. Lines and bands retain upper/lower bounds; missing intervals are not connected.', zh: '拥挤程度采用首尔市等级，线与带保留上下限，不连接缺失区间。', ja: '混雑度はソウル市の等級です。線と帯は上下限を保ち、欠測区間は接続しません。' })[lang]}</p>
      {points.length > 0 && <div className="flow-table-wrap"><table><caption>{demandCopy.flow[lang]} · KST</caption><thead><tr><th>{demandCopy.timeSelect[lang]}</th><th>{demandCopy.observed[lang]} / {demandCopy.forecast[lang]}</th><th>{unit}</th></tr></thead><tbody>{points.map(p => <tr key={`${p.kind}:${p.at}`}><td>{kstStamp(p.at)}</td><td>{demandCopy[p.kind === 'forecast' ? 'forecast' : 'observed'][lang]}{p.issuedAt && <small>{demandCopy.issued[lang]} {kstStamp(p.issuedAt)}</small>}{p.retrievedAt && <small>{demandCopy.collected[lang]} {kstStamp(p.retrievedAt)}</small>}</td><td>{peopleRange(p, lang)}</td></tr>)}</tbody></table></div>}
    </details>{linkHref && <a className="current-brief-link" href={linkHref}>{linkLabel ?? demandCopy.detailLink[lang]} →</a>}</div>
  </section>;
}
