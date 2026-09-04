"use client";

/**
 * 관광안내 데스크 — three-area pilot.
 *
 * Built for one reader: someone about to work an information desk or guide
 * shift in Myeongdong, Hongdae or Seongsu, in the first half-minute before a
 * visitor arrives.
 * It is NOT a tourist app, not a nationwide travel guide, and not a
 * replacement for VisitKorea or a map service.
 *
 * It adds no provider. Every block re-reads data KORETAIL already collects
 * and already publishes elsewhere; what is new is the order, which follows
 * the shape of guide work rather than the shape of the retail page:
 *
 *   지금 지역     what is happening outside the desk right now
 *   오늘 지역     what is on today that a visitor will ask about
 *   외국인 흐름    the slower context, with its real reference period
 *   공항 입국     the upstream signal, explicitly not a Myeongdong number
 *
 * Marked 시험 운영 on screen. It implies no partnership with any tourism
 * body, and it claims nothing the underlying sources cannot support.
 */
import type { Lang } from "./retailpulse-data";
import { useLiveSummary } from "./live-signals";
import { buildTourismDeskBrief, type TourismDeskLine } from "../lib/tourism-desk-brief";
import { buildWeatherGuide } from "../lib/weather-guide";
import { describeSourcePeriod } from "../lib/source-period";
import { eventStatusForDate, safeOfficialEventHomepage } from "../lib/event-presentation";

const text = {
  pilot: { ko: "시험 운영", en: "Pilot", zh: "试运行", ja: "試験運用" },
  areaSwitch: { ko: "관광안내 지역 선택", en: "Choose a Guide Desk area", zh: "选择旅游咨询地区", ja: "観光案内エリアを選択" },
  flowTitle: { ko: "외국인 흐름 참고", en: "Foreign-flow reference", zh: "外国人流动参考", ja: "外国人の流れ（参考）" },
  airportTitle: { ko: "인천공항 입국 참고", en: "Incheon arrivals reference", zh: "仁川机场入境参考", ja: "仁川空港の入国（参考）" },
  unavailable: { ko: "확인 불가", en: "Unavailable", zh: "暂无法确认", ja: "確認不可" },
  loading: { ko: "공식 자료를 불러오는 중입니다.", en: "Loading official data.", zh: "正在载入官方数据。", ja: "公式データを読み込んでいます。" },
  noEvents: { ko: "오늘 기준 인근 공식 행사 정보가 없습니다.", en: "No official nearby event is listed for today.", zh: "今日暂无附近官方活动信息。", ja: "本日、周辺の公式イベント情報はありません。" },
  eventPage: { ko: "공식 행사 페이지", en: "Official event page", zh: "官方活动页面", ja: "公式イベントページ" },
  running: { ko: "진행 중", en: "Running", zh: "进行中", ja: "開催中" },
  upcoming: { ko: "예정", en: "Upcoming", zh: "即将举行", ja: "開催予定" },
  /**
   * The boundary that matters most on this screen. A guide quoting these
   * numbers to a visitor must not turn a living-population estimate into a
   * tourist count, so the page says so once, prominently, as well as on
   * every line.
   */
  pilotNote: {
    ko: "시험 운영 중인 화면입니다. 특정 기관과의 제휴를 뜻하지 않습니다.",
    en: "A pilot screen. It implies no partnership with any organisation.",
    zh: "此为试运行页面，不代表与任何机构的合作关系。",
    ja: "試験運用中の画面です。特定機関との提携を意味するものではありません。",
  },
} as const;

export type TourismAreaId = "myeongdong" | "hongdae" | "seongsu";

const areaNames: Record<TourismAreaId, Record<Lang, string>> = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
};

function deskCopy(lang: Lang, areaName: string) {
  return {
    title: lang === "ko" ? `${areaName} 관광안내`
      : lang === "en" ? `${areaName} Guide Desk`
      : lang === "zh" ? `${areaName}旅游咨询`
      : `${areaName} 観光案内`,
    intro: lang === "ko" ? `${areaName}에서 관광안내 근무를 시작하기 전에 확인할 것들입니다. 모두 공식 자료이며, 각 줄이 무엇을 뜻하고 무엇이 아닌지 함께 적었습니다.`
      : lang === "en" ? `What to check before starting an information shift in ${areaName}. Every line is official data, and each says what it is and what it is not.`
      : lang === "zh" ? `在${areaName}开始旅游咨询工作前需要确认的内容。全部为官方数据，每行都标明其含义与非含义。`
      : `${areaName}で観光案内の勤務を始める前に確認する項目です。すべて公式データで、各行が何を意味し何ではないかを併記しています。`,
    briefTitle: lang === "ko" ? `오늘 ${areaName} 관광안내 브리핑`
      : lang === "en" ? `Today's ${areaName} guide briefing`
      : lang === "zh" ? `今日${areaName}旅游咨询简报`
      : `本日の${areaName} 観光案内ブリーフィング`,
    nowTitle: lang === "ko" ? `지금 ${areaName}` : lang === "en" ? `${areaName} now` : lang === "zh" ? `此刻${areaName}` : `いまの${areaName}`,
    todayTitle: lang === "ko" ? `오늘 ${areaName}` : lang === "en" ? `${areaName} today` : lang === "zh" ? `今日${areaName}` : `本日の${areaName}`,
    boundary: lang === "ko" ? `생활인구·승하차·입국 예상은 모두 관광객 수가 아닙니다. 공항 입국객은 ${areaName} 방문객이 아닙니다.`
      : lang === "en" ? `Living population, boardings and arrival forecasts are none of them tourist counts. Airport arrivals are not ${areaName} visitors.`
      : lang === "zh" ? `生活人口、上下车次数与入境预计均非游客人数。机场入境者并非${areaName}到访者。`
      : `生活人口・乗降件数・入国予想はいずれも観光客数ではありません。空港の入国者は${areaName}の来訪者ではありません。`,
  };
}

function Line({ line }: { line: TourismDeskLine }) {
  return <li className="desk-line">
    <p>{line.text}</p>
    <small>{line.basis}</small>
  </li>;
}

export function TourismDeskView({ lang, area, onAreaChange }: {
  lang: Lang;
  area: TourismAreaId;
  onAreaChange: (area: TourismAreaId) => void;
}) {
  const summary = useLiveSummary(null);
  const block = summary?.areas?.[area] ?? null;
  const nowIso = summary?.generatedAt ?? null;
  const todayKst = summary?.todayKst ?? null;
  const areaName = areaNames[area][lang];
  const copy = deskCopy(lang, areaName);

  // Events the desk will actually be asked about: running today, or the next
  // to start. Ordered by the collector already; this only picks and labels.
  // Deliberately not memoized by hand — at most four rows, and the React
  // compiler handles it without the manual dependency list going stale.
  const events = !block?.events?.length || !todayKst
    ? []
    : block.events.map((row) => ({ row, status: eventStatusForDate(row, todayKst) })).slice(0, 4);

  const weatherGuide = (() => {
    const next12 = block?.weather?.slice(0, 12) ?? [];
    if (!next12.length) return null;
    const firstOf = <T,>(pick: (row: typeof next12[number]) => T | null | undefined) =>
      next12.map(pick).find((value) => value !== null && value !== undefined) ?? null;
    return buildWeatherGuide({
      temperatureTenthC: firstOf((row) => row.temperatureTenthC),
      dailyMinTemperatureTenthC: firstOf((row) => row.dailyMinTemperatureTenthC),
      dailyMaxTemperatureTenthC: firstOf((row) => row.dailyMaxTemperatureTenthC),
      precipitationProbability: Math.max(0, ...next12.map((row) => row.precipitationProbability ?? 0)),
      precipitationTypeCode: firstOf((row) => row.precipitationTypeCode),
      humidityPercent: firstOf((row) => row.humidityPercent),
      windSpeedTenthMps: firstOf((row) => row.windSpeedTenthMps),
    }, lang);
  })();

  const brief = (() => {
    if (!block) return [];
    const arrival = summary?.airport?.arrivalForecast ?? null;
    const nextBand = arrival?.forecastCoverage?.all === "COMPLETE" ? arrival.nextExpectedTimeBand : null;
    return buildTourismDeskBrief({
      crowding: block.realtime
        ? {
          label: block.realtime.congestionLabel,
          populationMin: block.realtime.populationMin,
          populationMax: block.realtime.populationMax,
          observedAt: block.realtime.observedAt,
        }
        : null,
      weatherGuide,
      todayEvent: events[0]
        ? { title: events[0].row.title, categoryName: events[0].row.categoryName ?? null, status: events[0].status }
        : null,
      eventCount: events.length,
      subway: block.subwayRidership
        ? {
          boardingCount: block.subwayRidership.boardingCount,
          alightingCount: block.subwayRidership.alightingCount,
          referenceDate: block.subwayRidership.referenceDate,
          selectedStations: block.subwayRidership.selectedStations,
        }
        : null,
      foreignPresence: block.foreignPresence
        ? { value: block.foreignPresence.value, referenceAt: block.foreignPresence.referenceAt }
        : null,
      airportArrival: nextBand
        ? {
          expectedPassengers: nextBand.expectedPassengers,
          targetStartAt: nextBand.targetStartAt,
          targetEndAt: nextBand.targetEndAt,
        }
        : null,
    }, lang, areaName);
  })();

  const lastCollected = (sourceId: string): string | null =>
    summary?.sources?.find((source) => source.sourceId === sourceId)?.retrievedAt ?? null;

  const foreignPeriod = block?.foreignPresence && nowIso
    ? describeSourcePeriod({
      cadence: "DAILY",
      referencePeriod: block.foreignPresence.referenceAt,
      retrievedAt: lastCollected("SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION"),
      nowIso,
    }, lang)
    : null;

  const mobilityPeriod = block?.foreignPurposeMobility && nowIso
    ? describeSourcePeriod({
      cadence: "MONTHLY",
      referencePeriod: block.foreignPurposeMobility.referenceDate,
      retrievedAt: lastCollected("SEOUL_FOREIGN_PURPOSE_MOBILITY"),
      nowIso,
    }, lang)
    : null;

  const byKey = (key: TourismDeskLine["key"]) => brief.filter((line) => line.key === key);

  return <section className="tourism-desk" aria-labelledby="tourism-desk-title">
    <div className="section-head">
      <div>
        <p className="eyebrow">KORETAIL · TOURISM DESK · {areaName.toUpperCase()}</p>
        <h1 id="tourism-desk-title">{copy.title}</h1>
      </div>
      <span className="official-label">{text.pilot[lang]}</span>
    </div>
    <nav className="tourism-area-switcher" aria-label={text.areaSwitch[lang]}>
      {(Object.keys(areaNames) as TourismAreaId[]).map((id) => <a
        key={id}
        href={`/${lang}/tourism-desk/${id}`}
        className={area === id ? "active" : ""}
        aria-current={area === id ? "page" : undefined}
        onClick={(event) => { event.preventDefault(); onAreaChange(id); }}
      >{areaNames[id][lang]}</a>)}
    </nav>
    <p className="section-intro">{copy.intro}</p>
    <div className="facility-basis">
      <p className="facility-basis-head">{copy.boundary}</p>
      <p>{text.pilotNote[lang]}</p>
    </div>

    {!summary ? <p className="airport-empty-line">{text.loading[lang]}</p> : <>
      <section className="desk-block" aria-label={copy.briefTitle}>
        <h2>{copy.briefTitle}</h2>
        {brief.length === 0
          ? <p className="airport-empty-line">{text.unavailable[lang]}</p>
          : <ul className="desk-lines">{brief.map((line) => <Line key={line.key} line={line} />)}</ul>}
      </section>

      <section className="desk-block" aria-label={copy.nowTitle}>
        <h2>{copy.nowTitle}</h2>
        {byKey("crowding").length + byKey("weather").length === 0
          ? <p className="airport-empty-line">{text.unavailable[lang]}</p>
          : <ul className="desk-lines">
            {byKey("crowding").map((line) => <Line key={line.key} line={line} />)}
            {byKey("weather").map((line) => <Line key={line.key} line={line} />)}
          </ul>}
      </section>

      <section className="desk-block" aria-label={copy.todayTitle}>
        <h2>{copy.todayTitle}</h2>
        {events.length === 0
          ? <p className="airport-empty-line">{text.noEvents[lang]}</p>
          : <ul className="desk-events">{events.map(({ row, status }) => {
            const homepage = safeOfficialEventHomepage(row.homepage ?? null);
            return <li key={row.contentId ?? `${row.title}-${row.eventStart}`}>
              <p className="desk-event-head">
                <strong>{row.title}</strong>
                <span>{status === "RUNNING" ? text.running[lang] : text.upcoming[lang]}</span>
              </p>
              <small>{[row.categoryName, row.eventEnd ? `${row.eventStart} ~ ${row.eventEnd}` : row.eventStart].filter(Boolean).join(" · ")}</small>
              {row.address && <small>{row.address}</small>}
              {homepage && <p><a href={homepage} target="_blank" rel="noreferrer noopener">{text.eventPage[lang]}</a></p>}
            </li>;
          })}</ul>}
      </section>

      <section className="desk-block" aria-label={text.flowTitle[lang]}>
        <h2>{text.flowTitle[lang]}</h2>
        {byKey("subway").length + byKey("foreign").length === 0
          ? <p className="airport-empty-line">{text.unavailable[lang]}</p>
          : <ul className="desk-lines">
            {byKey("subway").map((line) => <Line key={line.key} line={line} />)}
            {byKey("foreign").map((line) => <Line key={line.key} line={line} />)}
          </ul>}
        {foreignPeriod && <p className="signal-row-period">
          <span>{foreignPeriod.cadenceLabel} · {foreignPeriod.periodLabel}</span>
          <small>{foreignPeriod.publicationNote}</small>
          {foreignPeriod.cadenceNote && <small>{foreignPeriod.cadenceNote}</small>}
        </p>}
        {mobilityPeriod && <p className="signal-row-period">
          <span>{mobilityPeriod.cadenceLabel} · {mobilityPeriod.periodLabel}</span>
          <small>{mobilityPeriod.publicationNote}</small>
        </p>}
      </section>

      <section className="desk-block" aria-label={text.airportTitle[lang]}>
        <h2>{text.airportTitle[lang]}</h2>
        {byKey("airport").length === 0
          ? <p className="airport-empty-line">{text.unavailable[lang]}</p>
          : <ul className="desk-lines">{byKey("airport").map((line) => <Line key={line.key} line={line} />)}</ul>}
      </section>
    </>}
  </section>;
}
