"use client";
/**
 * The airport screen, split out of the shell so that the Seoul, 서울 한눈에,
 * 소비 흐름 and 매장 routes no longer download airport-only code. The server
 * pages for the airport routes pass this component to the shell directly
 * (so it is server-rendered and preloaded with the route); every other route
 * reaches it through the shell's dynamic() import on first use.
 */
import { useState, type ReactNode } from "react";
import { useAirportHashReveal } from "./use-airport-hash-reveal";
import { ChangeRate } from "./change-rate";
import { AirportParkingGuide } from "./facility-guide";
import { airportAnnual, airportMonthly, airportValue, formatCount, monthDays, type AirportDirection, type Lang, type Terminal } from "./retailpulse-data";
import type { IndustryId } from "../lib/industry-guidance";
import { DateNavigator, DateScopeNote } from "./live-signals";
import { AirportArrivalSummary, AirportTodaySummary, FacilityDirectory, FlightBoard } from "./airport-live-signals";
import { IndustryGuide } from "./industry-guide";
import { AirportDepartureOverview } from "./airport-departure-overview";
import { AirportConcourse } from "./airport-concourse";
import { AirportTaxRefundGuide } from "./airport-tax-refund-guide";
import { AirportDeparturePreparation } from "./airport-departure-preparation";
import { MonthRangePicker } from "./month-range-picker";
import { localText } from "./local-text";

export type AirportSection = "now" | "arrivals" | "flights" | "stores" | "history";

export function AirportView({
  lang, terminal, setTerminal, concourse, setConcourse, section, setSection, date, setDate, industry, setIndustry, industryContext,
}: {
  industryContext?: ReactNode;
  industry: IndustryId; setIndustry: (value: IndustryId) => void;
  lang: Lang; terminal: Terminal; setTerminal: (value: Terminal) => void;
  concourse:boolean;setConcourse:(value:boolean)=>void;
  section: AirportSection; setSection: (value: AirportSection) => void;
  date: string | null; setDate: (value: string | null) => void;
}) {
  useAirportHashReveal();
  const [direction, setDirection] = useState<AirportDirection>("departure");
  const [historyPeriod, setHistoryPeriod] = useState<"6m" | "12m" | "all" | "custom">("6m");
  const [historyRangeOpen, setHistoryRangeOpen] = useState(false);
  const [historyStart, setHistoryStart] = useState(airportMonthly.at(-6)!.month);
  const [historyEnd, setHistoryEnd] = useState(airportMonthly.at(-1)!.month);
  const [draftHistoryStart, setDraftHistoryStart] = useState(airportMonthly.at(-6)!.month);
  const [draftHistoryEnd, setDraftHistoryEnd] = useState(airportMonthly.at(-1)!.month);

  const historyRows = historyPeriod === "6m" ? airportMonthly.slice(-6)
    : historyPeriod === "12m" ? airportMonthly.slice(-12)
      : historyPeriod === "custom" ? airportMonthly.filter((item) => item.month >= historyStart && item.month <= historyEnd)
        : airportMonthly;
  const historyValues = historyRows.map((item) => airportValue(item, terminal, direction));
  const historyMax = Math.max(1, ...historyValues);
  const rangeStartRow = historyRows.at(0);
  const rangeEndRow = historyRows.at(-1);
  const periodLabel = rangeStartRow && rangeEndRow ? (rangeStartRow.month === rangeEndRow.month ? rangeStartRow.month : `${rangeStartRow.month} — ${rangeEndRow.month}`) : "—";
  const rangeTotal = historyRows.reduce((sum, item) => sum + airportValue(item, terminal, direction), 0);
  const rangeDays = historyRows.reduce((sum, item) => sum + monthDays(item.month), 0);
  const rangeDailyAverage = rangeDays ? Math.round(rangeTotal / rangeDays) : 0;
  const firstValue = rangeStartRow ? airportValue(rangeStartRow, terminal, direction) : 0;
  const endValue = rangeEndRow ? airportValue(rangeEndRow, terminal, direction) : 0;
  const rangeChange = rangeStartRow && rangeEndRow && rangeStartRow.month !== rangeEndRow.month && firstValue ? ((endValue - firstValue) / firstValue) * 100 : null;
  const peakRow = historyRows.reduce<(typeof airportMonthly)[number] | null>((best, item) => {
    if (!best) return item;
    return airportValue(item, terminal, direction) / monthDays(item.month) > airportValue(best, terminal, direction) / monthDays(best.month) ? item : best;
  }, null);

  const directionLabels = {
    departure: localText(lang, { ko: "출국", en: "DEPARTURES", zh: "出境", ja: "出国" }),
    arrival: localText(lang, { ko: "입국", en: "ARRIVALS", zh: "入境", ja: "入国" }),
    total: localText(lang, { ko: "전체여객", en: "TOTAL", zh: "总旅客", ja: "全旅客" }),
  };

  return (
    <section className="view-section airport-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">INCHEON AIRPORT · OFFICIAL · KST</p>
          <h1>{localText(lang, { ko: "인천공항", en: "Incheon Airport", zh: "仁川机场", ja: "仁川空港" })}</h1>
        </div>
      </div>

      {(concourse||section === "now")&&<AirportDeparturePreparation lang={lang}/>}
      <div id="airport-data-flow" className="terminal-selector" role="tablist" aria-label="Terminal">
        {(["all", "T1", "T2"] as Terminal[]).map((item) => <button key={item} className={!concourse&&terminal === item ? "active" : ""} onClick={() => setTerminal(item)} role="tab" aria-selected={!concourse&&terminal === item}>{item === "all" ? <><span>{localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全体" })}</span><small>T1·T2</small></> : item}</button>)}
        <button className={concourse?'active':''} onClick={()=>setConcourse(true)} role="tab" aria-selected={concourse}>{localText(lang,{ko:'탑승동',en:'Concourse',zh:'登机楼',ja:'搭乗棟'})}</button>
      </div>

      {!concourse&&<nav className="airport-context-nav" aria-label={localText(lang, { ko: "공항 정보 구분", en: "Airport sections", zh: "机场信息分类", ja: "空港情報の分類" })}>
        {/*
          * "지금" said WHEN, which was never the choice a reader is making
          * here — the two screens differ by DIRECTION, and the arrival one
          * had no way in at all. 출국 / 입국 sit next to each other because
          * that is the only thing that separates them.
          */}
        {(["now", "arrivals", "flights", "stores", "history"] as AirportSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)} aria-current={section === item ? "page" : undefined}>
          {item === "now" ? localText(lang, { ko: "출국", en: "DEPARTURES", zh: "出境", ja: "出国" })
            : item === "arrivals" ? localText(lang, { ko: "입국", en: "ARRIVALS", zh: "入境", ja: "入国" })
            : item === "flights" ? localText(lang, { ko: "항공편", en: "FLIGHTS", zh: "航班", ja: "フライト" })
              : item === "stores" ? localText(lang, { ko: "매장·시설", en: "STORES", zh: "店铺·设施", ja: "店舗・施設" })

                  : localText(lang, { ko: "과거", en: "HISTORY", zh: "历史", ja: "履歴" })}
        </button>)}
      </nav>}

      {(concourse||(section !== "history" && section !== "stores")) && <div className={`airport-date-reserved${concourse?' airport-date-concourse':''}`}>
        <DateNavigator lang={lang} date={date} onChange={setDate} airportDates={!concourse} compactDatePicker />
        {!concourse&&<DateScopeNote lang={lang} date={date} scope={section === "arrivals" ? "arrivals" : "departures"} />}
      </div>}

      {!concourse&&(section === "now" || section === "arrivals") && <a className="operating-jump" href="#airport-industry-guide">{localText(lang, { ko: "업종별 공항 매장 운영 가이드 ↓", en: "Airport store operating guide ↓", zh: "按业态查看机场店铺指南 ↓", ja: "業種別の空港店舗ガイド ↓" })}</a>}

      {concourse&&<AirportConcourse lang={lang} date={date}/>}
      {!concourse&&section === "now" && <AirportTodaySummary lang={lang} terminal={terminal} date={date} />}
      {!concourse&&section === "now" && <AirportDepartureOverview lang={lang} terminal={terminal} date={date} />}
      {!concourse&&section === "arrivals" && <AirportArrivalSummary lang={lang} terminal={terminal} date={date} />}
      {!concourse&&section === "flights" && <FlightBoard lang={lang} terminal={terminal} date={date} />}
      {!concourse&&section === "stores" && <><AirportParkingGuide lang={lang} /><FacilityDirectory lang={lang} terminal={terminal} /></>}
      {!concourse&&section === "stores"&&<AirportTaxRefundGuide lang={lang} terminal={terminal}/>}

      {!concourse&&(section === "now" || section === "arrivals") && <>{industryContext}<IndustryGuide key={section} lang={lang} industry={industry} onIndustryChange={setIndustry} airport={{ terminal, direction: section === "arrivals" ? "arrival" : "departure" }} /></>}

      {!concourse&&section === "history" && <section className="airport-history" aria-labelledby="airport-history-title">
        <div className="section-head">
          <div><p className="eyebrow">OFFICIAL MONTHLY STATISTICS</p><h2 id="airport-history-title">{localText(lang, { ko: "공식 월별 여객 실적", en: "Official monthly passenger results", zh: "官方月度旅客实绩", ja: "公式月次旅客実績" })}</h2></div>
          <span className="official-label">OFFICIAL HISTORICAL</span>
        </div>
        <p className="section-intro">{localText(lang, {
          ko: "인천국제공항공사가 발표한 월별 실적입니다. 예측이 아니라 이미 확정된 과거 기록이며, 터미널 값은 공식 집계 그대로입니다.",
          en: "Monthly results published by Incheon International Airport Corporation. These are settled past records, not forecasts, and terminal values are the official figures as published.",
          zh: "由仁川国际机场公社发布的月度实绩。这是已确定的过去记录而非预测，航站楼数值为官方口径原值。",
          ja: "仁川国際空港公社が発表した月次実績です。予測ではなく確定した過去の記録で、ターミナル値は公式集計そのままです。",
        })}</p>

        <div className="history-controls">
          <div role="tablist" aria-label={directionLabels.total}>
            {(["departure", "arrival", "total"] as AirportDirection[]).map((item) => <button key={item} className={direction === item ? "active" : ""} onClick={() => setDirection(item)}>{directionLabels[item]}</button>)}
          </div>
          <div role="tablist" aria-label="Period">
            {(["6m", "12m", "all"] as const).map((item) => <button key={item} className={historyPeriod === item ? "active" : ""} onClick={() => { setHistoryPeriod(item); setHistoryRangeOpen(false); }}>{item === "6m" ? localText(lang, { ko: "6개월", en: "6M", zh: "6个月", ja: "6か月" }) : item === "12m" ? localText(lang, { ko: "12개월", en: "12M", zh: "12个月", ja: "12か月" }) : localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全期間" })}</button>)}
            <button className={(historyPeriod === "custom" ? "active " : "") + "range-trigger"} onClick={() => { setDraftHistoryStart(historyStart); setDraftHistoryEnd(historyEnd); setHistoryRangeOpen((open) => !open); }} aria-expanded={historyRangeOpen}>＋ {localText(lang, { ko: "기간 설정", en: "CUSTOM", zh: "自定义", ja: "期間指定" })}</button>
          </div>
        </div>
        {historyRangeOpen && <MonthRangePicker lang={lang} start={draftHistoryStart} end={draftHistoryEnd} min={airportMonthly[0].month} max={airportMonthly.at(-1)!.month} onStart={setDraftHistoryStart} onEnd={setDraftHistoryEnd} onCancel={() => setHistoryRangeOpen(false)} onApply={(nextStart, nextEnd) => { setHistoryStart(nextStart); setHistoryEnd(nextEnd); setHistoryPeriod("custom"); setHistoryRangeOpen(false); }} />}

        <div className="history-kpis">
          <div><span>{localText(lang, { ko: "선택 기간 합계", en: "PERIOD TOTAL", zh: "所选期间合计", ja: "選択期間の合計" })}</span><strong>{formatCount(lang, rangeTotal)}</strong><small>{periodLabel} · {terminal === "all" ? "ALL" : terminal}</small></div>
          <div><span>{localText(lang, { ko: "일평균", en: "DAILY AVERAGE", zh: "日均", ja: "1日平均" })}</span><strong>{formatCount(lang, rangeDailyAverage)}</strong><small>{rangeDays}{localText(lang, { ko: "일 기준", en: " days", zh: "天口径", ja: "日基準" })}</small></div>
          <div><span>{localText(lang, { ko: "월 총합 · 첫 달 대비", en: "MONTHLY TOTAL · FIRST TO LAST", zh: "月总量 · 首末月对比", ja: "月合計・最初の月比" })}</span><strong>{<ChangeRate value={rangeChange} lang={lang}/>}</strong><small>{rangeStartRow?.month ?? "—"} → {rangeEndRow?.month ?? "—"}</small></div>
          <div><span>{localText(lang, { ko: "일평균 최고 월", en: "PEAK MONTH BY DAILY AVG.", zh: "日均峰值月", ja: "日平均ピーク月" })}</span><strong>{peakRow?.month ?? "—"}</strong><small>{peakRow ? formatCount(lang, Math.round(airportValue(peakRow, terminal, direction) / monthDays(peakRow.month))) : "—"}</small></div>
        </div>

        <ol className="history-bars" aria-label={localText(lang, { ko: "월별 여객 추이", en: "Monthly passenger trend", zh: "月度旅客趋势", ja: "月次旅客推移" })}>
          {historyRows.map((row) => {
            const value = airportValue(row, terminal, direction);
            const isPeak = peakRow?.month === row.month;
            return <li key={row.month} className={isPeak ? "peak" : ""}>
              <span>{row.month}</span>
              <i style={{ width: `${Math.max(2, value / historyMax * 100)}%` }} />
              <b>{formatCount(lang, value)}</b>
            </li>;
          })}
        </ol>

        <div className="annual-strip">
          <p className="eyebrow">{localText(lang, { ko: "연간 여객", en: "ANNUAL PASSENGERS", zh: "年度旅客", ja: "年間旅客" })}</p>
          <ol>{airportAnnual.map((row) => <li key={row.year}><span>{row.year}</span><b>{formatCount(lang, row.passengers)}</b></li>)}</ol>
        </div>
      </section>}
    </section>
  );
}

