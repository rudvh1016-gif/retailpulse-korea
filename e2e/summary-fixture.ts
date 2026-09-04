/** Shared summary/flight fixtures for the e2e suites. Not a spec file. */
export const AREA_BLOCK = (overrides: Record<string, unknown> = {}) => ({
  realtimeForecast: [], weather: [], events: [], eventCount: 0,
  observedSeries: [], sales: null, foreignPresence: null, foreignPurposeMobility: null,
  subwayRidership: null, storeDynamics: null, realtime: null, commercial: null,
  ...overrides,
});

/**
 * A complete, exact-date trend payload. Individual specs override the signed
 * changes, or remove `trend` entirely, to exercise the old-edge transition.
 * The dates mirror the backend contract: D-1, D-7, the seven immediately
 * preceding calendar days, and D-7/D-14/D-21/D-28.
 */
export const SUBWAY_TREND_FIXTURE = (overrides: Record<string, unknown> = {}) => ({
  observedDayCount: 29,
  earliestReferenceDate: "2026-08-02",
  previousDay: {
    baselineDates: ["2026-08-29"], baselineAlightingCount: 20_153, changeTenthsPercent: 42,
  },
  sameWeekdayLastWeek: {
    baselineDates: ["2026-08-23"], baselineAlightingCount: 18_683, changeTenthsPercent: 124,
  },
  recentSevenDayAverage: {
    baselineDates: [
      "2026-08-29", "2026-08-28", "2026-08-27", "2026-08-26",
      "2026-08-25", "2026-08-24", "2026-08-23",
    ],
    baselineAlightingCount: 19_427,
    changeTenthsPercent: 81,
  },
  fourWeekSameWeekdayAverage: {
    baselineDates: ["2026-08-23", "2026-08-16", "2026-08-09", "2026-08-02"],
    baselineAlightingCount: 19_056,
    changeTenthsPercent: 102,
  },
  ...overrides,
});

export const SUMMARY_FIXTURE = {
  mode: "live-summary",
  generatedAt: "2026-08-31T05:10:00Z",
  todayKst: "2026-08-31",
  serviceDateKst: "2026-08-31",
  dayRelation: "TODAY",
  dateAvailability: {
    airportFlights: ["2026-08-29", "2026-08-30", "2026-08-31"],
    airportPassengerForecast: ["2026-08-31", "2026-09-01"],
    seoulObserved: ["2026-08-30", "2026-08-31"],
  },
  sources: [],
  areas: {
    myeongdong: AREA_BLOCK({
      realtime: { congestionLevel: 3, congestionLabel: "약간 붐빔", populationMin: 23000, populationMax: 25000, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      commercial: {
        commercialLevel: "보통", paymentCount: 12345, paymentAmountMin: 1000000, paymentAmountMax: 1100000,
        observedAt: "2026-08-31T14:05:00+09:00", retrievedAt: "2026-08-31T05:07:00Z", qualityStatus: "VALID", freshness: "LIVE",
      },
      realtimeForecast: [{ targetAt: "2026-08-31T17:00:00+09:00", congestionLevel: 4, congestionLabel: "붐빔", populationMin: 27000, populationMax: 29000, issuedAt: "2026-08-31T14:00:00+09:00", retrievedAt: "2026-08-31T14:05:00+09:00" }],
      weather: [{ targetAt: "2026-08-31T18:00:00+09:00", precipitationProbability: 60, temperatureTenthC: 270, conditionCode: "rain" }],
      subwayRidership: {
        referenceDate: "2026-08-30", boardingCount: 20_000, alightingCount: 21_000,
        selectedStationCount: 1, selectedStations: "명동|4호선",
        retrievedAt: "2026-08-31T01:00:00Z", datasetId: "OA-22723", mappingVersion: "fixture",
        trend: SUBWAY_TREND_FIXTURE(),
      },
      foreignPresence: { value: 825.5, unit: "people", referenceAt: "2026-07-31T23:00:00+09:00", retrievedAt: "2026-08-29T01:00:00Z", productVersion: "OA-23018:fixture", freshness: "OFFICIAL_HISTORICAL", qualityStatus: "VALID" },
      foreignPurposeMobility: { referenceDate: "2026-07-31", retrievedAt: "2026-08-29T01:00:00Z", datasetId: "OA-22378", mappingVersion: "fixture", shopping: 520.5, tourism: 310.25 },
      events: [
        {
          contentId: "event-running-1", title: "명동 공연 예술제", eventStart: "2026-08-20", eventEnd: "2026-09-10", distanceM: 320,
          categoryName: "공연", address: "서울특별시 중구 명동길 14", addressDetail: "1층",
          overview: "관객과 소통하는 공연형 미술 콘텐츠입니다. 두 번째 공식 문장도 끝까지 읽을 수 있어야 합니다.", homepage: "https://example.org/event-one",
        },
        {
          contentId: "event-running-2", title: "도심 전시", eventStart: "2026-08-25", eventEnd: "2026-09-02", distanceM: 510,
          categoryName: "전시", address: "서울특별시 중구 을지로 1", addressDetail: null,
          overview: "도심의 공공 공간을 다루는 전시입니다. 공식 설명의 나머지 문장입니다.", homepage: "javascript:alert(1)",
        },
        {
          contentId: "event-upcoming-1", title: "거리 문화 주간", eventStart: "2026-09-01", eventEnd: "2026-09-03", distanceM: 220,
          categoryName: null, address: "서울특별시 중구 남대문로 2", addressDetail: null,
          overview: "거리 문화 프로그램이 열립니다. 공식 일정에 따라 운영됩니다.", homepage: null,
        },
        {
          contentId: "event-upcoming-2", title: "가을 디자인 마켓", eventStart: "2026-09-04", eventEnd: "2026-09-05", distanceM: 640,
          categoryName: "문화", address: "서울특별시 중구 세종대로 1", addressDetail: null,
          overview: "디자인 창작물을 소개하는 마켓입니다. 참여 정보는 공식 페이지를 따릅니다.", homepage: "https://example.org/event-four",
        },
      ],
      eventCount: 4,
      sales: { quarterCode: "20262", tradeAreaName: "명동", totalAmount: 1230000000, industryCount: 4 },
      storeDynamics: {
        datasetId: "OA-15577", quarterCode: "20262", tradeAreaCode: "3001492",
        tradeAreaName: "명동 남대문 북창동 다동 무교동 관광특구", tradeAreaTypeCode: "U", tradeAreaTypeName: "관광특구",
        totalStoreCount: 174, ordinaryStoreCount: 160, franchiseStoreCount: 14,
        openingCount: 10, closureCount: 5,
        mappingVersion: "oa-15577-standard-area-2026-09-03-v1", retrievedAt: "2026-08-31T05:08:00Z",
      },
    }),
    hongdae: AREA_BLOCK({
      realtime: { congestionLevel: 2, congestionLabel: "보통", populationMin: 18000, populationMax: 20000, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
      realtimeForecast: [{ targetAt: "2026-08-31T19:00:00+09:00", congestionLevel: 3, congestionLabel: "약간 붐빔", populationMin: 22000, populationMax: 24000, issuedAt: "2026-08-31T14:00:00+09:00", retrievedAt: "2026-08-31T14:05:00+09:00" }],
      weather: [{ targetAt: "2026-08-31T18:00:00+09:00", precipitationProbability: 20, temperatureTenthC: 260, conditionCode: "cloudy" }],
      events: [{
        title: "홍대 거리공연", eventStart: "2026-08-31", eventEnd: null, distanceM: 300,
        categoryName: "일반축제", address: "서울특별시 마포구 홍익로 3", addressDetail: null,
        overview: "홍대 걷고싶은거리 일대에서 열리는 버스킹 공연. 매일 저녁 거리 무대가 이어집니다.", homepage: null,
      }],
      eventCount: 1,
    }),
    seongsu: AREA_BLOCK({
      realtime: { congestionLevel: 1, congestionLabel: "여유", populationMin: 12000, populationMax: 14000, observedAt: "2026-08-31T14:05:00+09:00", freshness: "STALE" },
      weather: [{ targetAt: "2026-08-31T15:00:00+09:00", precipitationProbability: 10, temperatureTenthC: 310, conditionCode: "clear" }],
    }),
  },
  airport: {
    congestion: [
      { terminal: "T1", zone: "P01", waitTimeMinutes: 24, waitTimeRaw: "24", waitingCount: 81, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      { terminal: "T1", zone: "P02", waitTimeMinutes: 10, waitTimeRaw: "10", waitingCount: 42, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      { terminal: "T2", zone: "DG1_B", waitTimeMinutes: 61, waitTimeRaw: "60+", waitingCount: 43, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
      { terminal: "T2", zone: "DG1_A", waitTimeMinutes: 11, waitTimeRaw: "11", waitingCount: 35, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
    ],
    currentBusiestDepartureHallByTerminal: {
      T1: { terminal: "T1", zone: "P01", waitTimeMinutes: 24, waitTimeRaw: "24", waitingCount: 81, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      T2: { terminal: "T2", zone: "DG1_B", waitTimeMinutes: 61, waitTimeRaw: "60+", waitingCount: 43, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
    },
    departuresTrackedToday: 561,
    departuresTrackedTodayByTerminal: { T1: 300, T2: 261 },
    departuresTrackedTodayRetrievedAt: "2026-08-31T12:00:00+09:00",
    topDepartureGate: "27",
    topDepartureGateTerminal: "T1",
    topDepartureGateFlights: 18,
    topDepartureGateByTerminal: { T1: { gate: "27", flights: 18 }, T2: { gate: "5", flights: 12 } },
    busyDepartureGates: [
      { terminal: "T1", gate: "27", flights: 18 },
      { terminal: "T2", gate: "5", flights: 12 },
      { terminal: "T1", gate: "31", flights: 10 },
    ],
    busyDepartureGatesByTerminal: {
      T1: [{ terminal: "T1", gate: "27", flights: 18 }, { terminal: "T1", gate: "31", flights: 10 }],
      T2: [{ terminal: "T2", gate: "5", flights: 12 }],
    },
    topDepartureGateRetrievedAt: "2026-08-31T12:00:00+09:00",
    topDepartureGateRetrievedAtByTerminal: { T1: "2026-08-31T12:00:00+09:00", T2: "2026-08-31T12:05:00+09:00" },
    gateCoverageRatio: 0.76,
    gateCoverageRatioByTerminal: { T1: 0.8, T2: 0.7 },
    airlineRanking: {
      all: {
        totalFlights: 561,
        airlines: [
          { iata: "KE", registryName: "Korean Air", country: "KR", countryBasis: "REGISTRY", flights: 140, share: 0.2496 },
          { iata: "OZ", registryName: "Asiana Airlines", country: "KR", countryBasis: "REGISTRY", flights: 90, share: 0.1604 },
          { iata: "RS", registryName: null, country: null, countryBasis: "UNVERIFIED", flights: 20, share: 0.0357 },
        ],
        countries: [
          { country: "KR", flights: 230, airlines: 2, share: 0.41 },
          { country: null, flights: 20, airlines: 1, share: 0.0357 },
        ],
        retrievedAt: "2026-08-31T12:00:00+09:00",
      },
      byTerminal: {
        T1: { totalFlights: 300, airlines: [{ iata: "OZ", registryName: "Asiana Airlines", country: "KR", countryBasis: "REGISTRY", flights: 90, share: 0.3 }], countries: [{ country: "KR", flights: 90, airlines: 1, share: 0.3 }], retrievedAt: "2026-08-31T12:00:00+09:00" },
        T2: { totalFlights: 261, airlines: [{ iata: "KE", registryName: "Korean Air", country: "KR", countryBasis: "REGISTRY", flights: 140, share: 0.5364 }], countries: [{ country: "KR", flights: 140, airlines: 1, share: 0.5364 }], retrievedAt: "2026-08-31T12:00:00+09:00" },
      },
      countrySource: { provider: "OpenFlights airline database", licence: "ODbL 1.0", retrievedOn: "2026-09-03", entries: 950, suppressed: 25 },
    },
    serviceDateKst: "2026-08-31",
    periodStartAt: "2026-08-31T00:00:00+09:00",
    periodEndAt: "2026-08-31T23:59:59+09:00",
    latestRetrievedAt: "2026-08-31T14:08:00+09:00",
    todayExpectedPassengersTotal: 47320,
    todayExpectedPassengersByTerminal: { T1: 30100, T2: 17220 },
    remainingExpectedPassengers: { expectedPassengers: 11430, fromAt: "2026-08-31T14:00:00+09:00", toAt: "2026-09-01T00:00:00+09:00", bands: 2 },
    remainingExpectedPassengersByTerminal: {
      T1: { expectedPassengers: 3500, fromAt: "2026-08-31T15:00:00+09:00", toAt: "2026-09-01T00:00:00+09:00", bands: 1 },
      T2: { expectedPassengers: 2900, fromAt: "2026-08-31T16:00:00+09:00", toAt: "2026-09-01T00:00:00+09:00", bands: 1 },
    },
    passengerForecastRetrievedAt: "2026-08-31T09:05:00+09:00",
    passengerForecastRetrievedAtByTerminal: { T1: "2026-08-31T09:00:00+09:00", T2: "2026-08-31T09:05:00+09:00" },
    peakExpectedTimeBand: { targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 6320 },
    peakExpectedTimeBandByTerminal: {
      T1: { targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 3500 },
      T2: { targetStartAt: "2026-08-31T16:00:00+09:00", targetEndAt: "2026-08-31T17:00:00+09:00", expectedPassengers: 2900 },
    },
    peakExpectedPassengers: 6320,
    peakExpectedPassengersByTerminal: { T1: 3500, T2: 2900 },
    passengerForecastTimeline: [
      { targetStartAt: "2026-08-31T14:00:00+09:00", targetEndAt: "2026-08-31T15:00:00+09:00", expectedPassengers: 5110 },
      { targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 6320 },
    ],
    passengerForecastTimelineByTerminal: {
      T1: [{ targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 3500 }],
      T2: [{ targetStartAt: "2026-08-31T16:00:00+09:00", targetEndAt: "2026-08-31T17:00:00+09:00", expectedPassengers: 2900 }],
    },
    forecastCoverage: { all: "COMPLETE", byTerminal: { T1: "COMPLETE", T2: "COMPLETE" } },
    arrivalForecast: {
      todayExpectedPassengersTotal: 41300,
      todayExpectedPassengersByTerminal: { T1: 25700, T2: 15600 },
      nextExpectedTimeBand: { targetStartAt: "2026-08-31T14:00:00+09:00", targetEndAt: "2026-08-31T15:00:00+09:00", expectedPassengers: 3250 },
      peakExpectedTimeBand: { targetStartAt: "2026-08-31T18:00:00+09:00", targetEndAt: "2026-08-31T19:00:00+09:00", expectedPassengers: 4500 },
      passengerForecastRetrievedAt: "2026-08-31T09:05:00+09:00",
      forecastCoverage: { all: "COMPLETE", byTerminal: { T1: "COMPLETE", T2: "COMPLETE" } },
    },
    scheduled: [],
    passengerForecast: [],
  },
};

export const FLIGHT_ROWS = [
  { flightNumber: "KE703", airlineCode: "KE", airportCode: "NRT", direction: "departure", terminal: "T2", gate: "252", checkinCounter: "E", status: "출발", scheduledAt: "2026-08-31T09:20:00+09:00" },
  { flightNumber: "OZ102", airlineCode: "OZ", airportCode: "NRT", direction: "departure", terminal: "T1", gate: "31", checkinCounter: "C", status: "출발", scheduledAt: "2026-08-31T08:10:00+09:00" },
  { flightNumber: "KE704", airlineCode: "KE", airportCode: "NRT", direction: "arrival", terminal: "T2", gate: "251", checkinCounter: null, status: "도착", scheduledAt: "2026-08-31T13:30:00+09:00" },
];

export const routeSummary = (payload: unknown) => async (route: { fulfill: (options: { contentType: string; body: string }) => Promise<void> }) =>
  route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
