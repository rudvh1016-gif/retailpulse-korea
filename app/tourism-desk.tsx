"use client";

/**
 * 관광안내 데스크 — Myeongdong pilot.
 *
 * Built for one reader: someone about to work an information desk or guide
 * shift in Myeongdong, in the first half-minute before a visitor arrives.
 * It is NOT a tourist app, not a nationwide travel guide, and not a
 * replacement for VisitKorea or a map service.
 *
 * It adds no provider. Every block re-reads data KORETAIL already collects
 * and already publishes elsewhere; what is new is the order, which follows
 * the shape of guide work rather than the shape of the retail page:
 *
 *   지금 명동     what is happening outside the desk right now
 *   오늘 명동     what is on today that a visitor will ask about
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
  title: { ko: "관광안내 데스크", en: "Tourism information desk", zh: "旅游咨询台", ja: "観光案内デスク" },
  pilot: { ko: "시험 운영", en: "Pilot", zh: "试运行", ja: "試験運用" },
  area: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  intro: {
    ko: "명동에서 관광안내 근무를 시작하기 전에 확인할 것들입니다. 모두 공식 자료이며, 각 줄이 무엇을 뜻하고 무엇이 아닌지 함께 적었습니다.",
    en: "What to check before starting an information shift in Myeongdong. Every line is official data, and each says what it is and what it is not.",
    zh: "在明洞开始旅游咨询工作前需要确认的内容。全部为官方数据，每行都标明其含义与非含义。",
    ja: "明洞で観光案内の勤務を始める前に確認する項目です。すべて公式データで、各行が何を意味し何ではないかを併記しています。",
  },
  briefTitle: { ko: "오늘 명동 관광안내 브리핑", en: "Today's Myeongdong guide briefing", zh: "今日明洞旅游咨询简报", ja: "本日の明洞 観光案内ブリーフィング" },
  nowTitle: { ko: "지금 명동", en: "Myeongdong now", zh: "此刻明洞", ja: "いまの明洞" },
  todayTitle: { ko: "오늘 명동", en: "Myeongdong today", zh: "今日明洞", ja: "本日の明洞" },
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
  boundary: {
    ko: "생활인구·승하차·입국 예상은 모두 관광객 수가 아닙니다. 공항 입국객은 명동 방문객이 아닙니다.",
    en: "Living population, boardings and arrival forecasts are none of them tourist counts. Airport arrivals are not Myeongdong visitors.",
    zh: "生活人口、上下车次数与入境预计均非游客人数。机场入境者并非明洞到访者。",
    ja: "生活人口・乗降件数・入国予想はいずれも観光客数ではありません。空港の入国者は明洞の来訪者ではありません。",
  },
  pilotNote: {
    ko: "시험 운영 중인 화면입니다. 특정 기관과의 제휴를 뜻하지 않습니다.",
    en: "A pilot screen. It implies no partnership with any organisation.",
    zh: "此为试运行页面，不代表与任何机构的合作关系。",
    ja: "試験運用中の画面です。特定機関との提携を意味するものではありません。",
  },
} as const;

function Line({ line }: { line: TourismDeskLine }) {
  return <li className="desk-line">
    <p>{line.text}</p>
    <small>{line.basis}</small>
  </li>;
}

export function TourismDeskView({ lang }: { lang: Lang }) {
  const summary = useLiveSummary(null);
  const block = summary?.areas?.myeongdong ?? null;
  const nowIso = summary?.generatedAt ?? null;
  const todayKst = summary?.todayKst ?? null;

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
    }, lang);
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
        <p className="eyebrow">KORETAIL · TOURISM DESK · {text.area[lang].toUpperCase()}</p>
        <h2 id="tourism-desk-title">{text.title[lang]}</h2>
      </div>
      <span className="official-label">{text.pilot[lang]}</span>
    </div>
    <p className="section-intro">{text.intro[lang]}</p>
    <div className="facility-basis">
      <p className="facility-basis-head">{text.boundary[lang]}</p>
      <p>{text.pilotNote[lang]}</p>
    </div>

    {!summary ? <p className="airport-empty-line">{text.loading[lang]}</p> : <>
      <section className="desk-block" aria-label={text.briefTitle[lang]}>
        <h3>{text.briefTitle[lang]}</h3>
        {brief.length === 0
          ? <p className="airport-empty-line">{text.unavailable[lang]}</p>
          : <ul className="desk-lines">{brief.map((line) => <Line key={line.key} line={line} />)}</ul>}
      </section>

      <section className="desk-block" aria-label={text.nowTitle[lang]}>
        <h3>{text.nowTitle[lang]}</h3>
        {byKey("crowding").length + byKey("weather").length === 0
          ? <p className="airport-empty-line">{text.unavailable[lang]}</p>
          : <ul className="desk-lines">
            {byKey("crowding").map((line) => <Line key={line.key} line={line} />)}
            {byKey("weather").map((line) => <Line key={line.key} line={line} />)}
          </ul>}
      </section>

      <section className="desk-block" aria-label={text.todayTitle[lang]}>
        <h3>{text.todayTitle[lang]}</h3>
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
        <h3>{text.flowTitle[lang]}</h3>
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
        <h3>{text.airportTitle[lang]}</h3>
        {byKey("airport").length === 0
          ? <p className="airport-empty-line">{text.unavailable[lang]}</p>
          : <ul className="desk-lines">{byKey("airport").map((line) => <Line key={line.key} line={line} />)}</ul>}
      </section>
    </>}
  </section>;
}
