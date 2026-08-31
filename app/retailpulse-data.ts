export type Lang = "ko" | "en" | "zh" | "ja";
export type Terminal = "all" | "T1" | "T2";
export type AirportDirection = "departure" | "arrival" | "total";

export type AirportMonth = {
  month: string;
  all: { arrival: number; departure: number };
  T1: { arrival: number; departure: number };
  T2: { arrival: number; departure: number };
};

// Incheon International Airport Corporation, published monthly statistics.
// Terminal values are official passenger-aircraft statistics; no proportional allocation is used.
export const airportMonthly: AirportMonth[] = [
  { month: "2025-08", all: { arrival: 3387926, departure: 3207879 }, T1: { arrival: 2209026, departure: 2070651 }, T2: { arrival: 1178900, departure: 1137228 } },
  { month: "2025-09", all: { arrival: 2882175, departure: 2953287 }, T1: { arrival: 1821415, departure: 1854809 }, T2: { arrival: 1060760, departure: 1098478 } },
  { month: "2025-10", all: { arrival: 3271028, departure: 3123175 }, T1: { arrival: 2065482, departure: 1968503 }, T2: { arrival: 1205546, departure: 1154672 } },
  { month: "2025-11", all: { arrival: 2983111, departure: 3098846 }, T1: { arrival: 1881928, departure: 1964750 }, T2: { arrival: 1101183, departure: 1134096 } },
  { month: "2025-12", all: { arrival: 3254961, departure: 3314048 }, T1: { arrival: 2050951, departure: 2107784 }, T2: { arrival: 1204010, departure: 1206264 } },
  { month: "2026-01", all: { arrival: 3349252, departure: 3574354 }, T1: { arrival: 1842778, departure: 1994299 }, T2: { arrival: 1506474, departure: 1580055 } },
  { month: "2026-02", all: { arrival: 3262807, departure: 3142630 }, T1: { arrival: 1624671, departure: 1569799 }, T2: { arrival: 1638136, departure: 1572831 } },
  { month: "2026-03", all: { arrival: 3446723, departure: 3130849 }, T1: { arrival: 1673223, departure: 1471900 }, T2: { arrival: 1773500, departure: 1658949 } },
  { month: "2026-04", all: { arrival: 3167264, departure: 3214294 }, T1: { arrival: 1501545, departure: 1512627 }, T2: { arrival: 1665719, departure: 1701667 } },
  { month: "2026-05", all: { arrival: 3167868, departure: 3147132 }, T1: { arrival: 1460170, departure: 1458602 }, T2: { arrival: 1707698, departure: 1688530 } },
  { month: "2026-06", all: { arrival: 3024839, departure: 3011510 }, T1: { arrival: 1407985, departure: 1419626 }, T2: { arrival: 1616854, departure: 1591884 } },
  { month: "2026-07", all: { arrival: 3199990, departure: 3364748 }, T1: { arrival: 1554721, departure: 1639145 }, T2: { arrival: 1645269, departure: 1725603 } },
];

export const airportAnnual = [
  { year: 2010, passengers: 33478925 },
  { year: 2019, passengers: 71169722 },
  { year: 2020, passengers: 12049851 },
  { year: 2021, passengers: 3198909 },
  { year: 2022, passengers: 17869759 },
  { year: 2023, passengers: 56131064 },
  { year: 2024, passengers: 71156947 },
  { year: 2025, passengers: 74071475 },
];

export type ForeignHistory = {
  month: string;
  myeongdong: number;
  hongdae: number;
  seongsu: number;
};

// Average hourly short-stay foreign living population calculated from the official
// Seoul monthly administrative-dong files. The area scope is documented in the UI.
export const foreignMonthly: ForeignHistory[] = [
  { month: "2025-01", myeongdong: 15919, hongdae: 8189, seongsu: 2120 },
  { month: "2025-02", myeongdong: 14466, hongdae: 7551, seongsu: 2012 },
  { month: "2025-03", myeongdong: 14383, hongdae: 9100, seongsu: 2578 },
  { month: "2025-04", myeongdong: 15504, hongdae: 9461, seongsu: 3085 },
  { month: "2025-05", myeongdong: 14616, hongdae: 8651, seongsu: 3102 },
  { month: "2025-06", myeongdong: 13992, hongdae: 8567, seongsu: 3088 },
  { month: "2025-07", myeongdong: 14837, hongdae: 8457, seongsu: 2898 },
  { month: "2025-08", myeongdong: 14127, hongdae: 7509, seongsu: 2741 },
  { month: "2025-09", myeongdong: 13659, hongdae: 7827, seongsu: 3147 },
  { month: "2025-10", myeongdong: 14812, hongdae: 9377, seongsu: 3591 },
  { month: "2025-11", myeongdong: 15070, hongdae: 9713, seongsu: 4010 },
  { month: "2025-12", myeongdong: 17045, hongdae: 9786, seongsu: 4478 },
  { month: "2026-01", myeongdong: 17133, hongdae: 8279, seongsu: 3431 },
  { month: "2026-02", myeongdong: 16652, hongdae: 7929, seongsu: 3327 },
  { month: "2026-03", myeongdong: 13466, hongdae: 9466, seongsu: 4062 },
  { month: "2026-04", myeongdong: 14665, hongdae: 9660, seongsu: 4721 },
  { month: "2026-05", myeongdong: 14623, hongdae: 8970, seongsu: 4597 },
  { month: "2026-06", myeongdong: 15037, hongdae: 8819, seongsu: 4852 },
  { month: "2026-07", myeongdong: 15157, hongdae: 8233, seongsu: 4443 },
];

export const foreignJulyDetail = {
  myeongdong: { average: 15157, china: 5505, chinaShare: 36.3, peakHour: "20:00", peakWeekday: 5 },
  hongdae: { average: 8233, china: 2923, chinaShare: 35.5, peakHour: "21:00", peakWeekday: 5 },
  seongsu: { average: 4443, china: 1983, chinaShare: 44.6, peakHour: "16:00", peakWeekday: 6 },
};

export const sourceCatalog = [
  { source: "INCHEON AIRPORT FORECAST", provider: "Incheon Airport", use: { ko: "D+1/D+2 여객예고·시간대 혼잡", en: "D+1/D+2 passenger outlook and hourly crowding", zh: "D+1/D+2客流预告与分时拥挤" }, status: "AUTOMATION_REVIEW", realtime: "Official web / Excel", history: "Capture after launch", coverage: "Departure D+2 · arrival/transfer D+1", lag: "Daily 17:00", geo: "ALL / T1 / T2", key: "No key shown on public page", free: "Public viewing / Excel", commercial: "Automation terms not verified", redistribution: "Derived summaries after review", priority: "P0", tier: "conditional" },
  { source: "INCHEON AIRPORT STATISTICS", provider: "Incheon Airport", use: { ko: "공식 월·연·터미널·항공사 실적", en: "Official monthly, annual, terminal and airline results", zh: "官方月度、年度、航站楼与航司实绩" }, status: "BACKFILL_AVAILABLE", realtime: "No", history: "Official download", coverage: "2010.01 — 2026.07", lag: "Next month · 5 business days", geo: "ALL / T1 / T2", key: "No", free: "Public download", commercial: "Source attribution", redistribution: "Aggregates only", priority: "P0", tier: "ready" },
  { source: "INCHEON AIRPORT FLIGHTS", provider: "Incheon Airport", use: { ko: "운항·편명·터미널·게이트·상태", en: "Flights, terminals, gates and status", zh: "航班、航站楼、登机口与状态" }, status: "KEY_REQUIRED", realtime: "Yes", history: "Official statistics", coverage: "D-3 — D+6", lag: "Near real-time", geo: "Flight / terminal", key: "data.go.kr project service key", free: "Free · 500 dev calls/day", commercial: "License unrestricted · ops review", redistribution: "Derived list", priority: "P0", tier: "key" },
  { source: "INCHEON DEPARTURE HALL CONGESTION", provider: "Incheon Airport", use: { ko: "출국장 1~6번·동서측 대기인원, T1만 제공", en: "Checkpoint 1–6 east/west waiting counts; T1 only", zh: "1至6号出境安检区东西侧等候人数，仅T1" }, status: "KEY_REQUIRED", realtime: "1-minute", history: "Archive after launch", coverage: "T1 checkpoints 1–6 · T2 planned", lag: "Approx. 1 minute", geo: "T1 / checkpoint / east-west", key: "data.go.kr project service key", free: "Free · 1,000 dev calls/day", commercial: "License unrestricted · ops review", redistribution: "Derived summaries", priority: "P0", tier: "key" },
  { source: "INCHEON ARRIVAL HALL STATUS", provider: "Incheon Airport", use: { ko: "입국장·도착편·게이트·내외국인 대기인원", en: "Arrival halls, flights, gates and waiting counts", zh: "入境大厅、到达航班、登机口与等候人数" }, status: "KEY_REQUIRED", realtime: "H-2 — H+2", history: "Archive after launch", coverage: "T1 / T2 · arrival halls", lag: "Near real-time", geo: "Terminal / arrival hall / flight", key: "data.go.kr project service key", free: "Free · 500 dev calls/day", commercial: "License unrestricted · ops review", redistribution: "Derived summaries", priority: "P0", tier: "key" },
  { source: "INCHEON DUTY-FREE FACILITIES", provider: "Incheon Airport", use: { ko: "면세점·운영사·영업시간·게이트 인접 위치, 매장 혼잡도 아님", en: "Duty-free operator, hours and gate-adjacent location; not store footfall", zh: "免税店、运营商、营业时间与登机口附近位置；并非店内客流" }, status: "CONDITION_REVIEW", realtime: "Public directory", history: "Snapshot after launch", coverage: "T1 / T2 / concourse", lag: "On change", geo: "Facility / gate vicinity", key: "No for directory", free: "Public web directory", commercial: "Usage terms review", redistribution: "Link / derived metadata only", priority: "P1", tier: "conditional" },
  { source: "SEOUL FOREIGN LIVING POPULATION", provider: "Seoul", use: { ko: "단기체류 외국인 생활인구", en: "Short-stay foreign living population", zh: "短期停留外国人生活人口" }, status: "BACKFILL_AVAILABLE", realtime: "Recent two months", history: "Monthly files", coverage: "2017.01 — 2026.07", lag: "Monthly", geo: "Administrative dong / hour", key: "Seoul Open Data key for recent", free: "Public file/API", commercial: "Open Government License 1", redistribution: "Derived aggregates", priority: "P0", tier: "ready" },
  { source: "KMA WEATHER", provider: "Korea Meteorological Administration", use: { ko: "단기예보·과거 관측", en: "Short-term forecast and observations", zh: "短期预报与历史观测" }, status: "KEY_REQUIRED", realtime: "Forecast", history: "Observation API/files", coverage: "Grid / product", lag: "Issue-time specific", geo: "5km grid / station", key: "Same data.go.kr project key", free: "Free · 10,000 dev calls/day", commercial: "Attribution required · auto ops approval", redistribution: "Attributed derived features", priority: "P0", tier: "key" },
  { source: "KTO / TOURAPI", provider: "Korea Tourism Organization", use: { ko: "관광수요·방문·행사·다국어 POI", en: "Tourism demand, visits, events and multilingual POI", zh: "旅游需求、访问、活动与多语种景点" }, status: "CONDITION_REVIEW", realtime: "Product-specific", history: "Official API/download only", coverage: "Product-specific", lag: "Product-specific", geo: "Region / POI", key: "Required for API", free: "Quota-based", commercial: "Product terms", redistribution: "Product terms", priority: "P0/P1", tier: "conditional" },
  { source: "SEOUL REAL-TIME CITY DATA", provider: "Seoul", use: { ko: "도시 활동·혼잡·교통 신호", en: "City activity, crowd and mobility", zh: "城市活动、拥挤与交通信号" }, status: "LIVE_ONLY", realtime: "Yes", history: "Archive after launch", coverage: "Current snapshot", lag: "Near real-time", geo: "One hotspot per call", key: "Seoul Open Data key", free: "Public API quota", commercial: "Open data terms", redistribution: "Derived snapshots", priority: "P1", tier: "key" },
  { source: "SEOUL × KT LIVING MOVEMENT", provider: "Seoul / KT", use: { ko: "쇼핑·관광 목적 생활이동", en: "Shopping and tourism-purpose movement", zh: "购物与旅游目的生活移动" }, status: "CONDITION_REVIEW", realtime: "No", history: "Official files", coverage: "Verify per release", lag: "Batch", geo: "Administrative area / hour", key: "No for files", free: "Public download", commercial: "Dataset terms", redistribution: "Review", priority: "P3", tier: "conditional" },
  { source: "NAVER DATALAB", provider: "Naver", use: { ko: "검색·쇼핑 클릭 상대지수, 판매액 아님", en: "Relative search/shopping clicks, not sales", zh: "搜索/购物点击相对指数，并非销售额" }, status: "KEY_REQUIRED", realtime: "Query", history: "Query range", coverage: "API-defined", lag: "Daily", geo: "No direct area truth", key: "Client credentials", free: "1,000 calls/day", commercial: "API terms", redistribution: "Review", priority: "P2", tier: "key" },
  { source: "BANK OF KOREA ECOS", provider: "Bank of Korea", use: { ko: "환율·거시 보조신호", en: "Exchange-rate and macro candidate signals", zh: "汇率与宏观候选信号" }, status: "READY", realtime: "Scheduled", history: "API", coverage: "Series-specific", lag: "Series-specific", geo: "National", key: "API key", free: "Public API", commercial: "Terms review", redistribution: "Derived features", priority: "P1", tier: "ready" },
  { source: "KASI SPECIAL DAYS", provider: "KASI", use: { ko: "공휴일·특일", en: "Public holidays and special days", zh: "公休日与特殊日期" }, status: "KEY_REQUIRED", realtime: "Calendar", history: "API", coverage: "Year-based", lag: "Published calendar", geo: "National", key: "Required", free: "Public API quota", commercial: "Terms review", redistribution: "Derived flags", priority: "P1", tier: "key" },
  { source: "SEOUL SUBWAY", provider: "Seoul", use: { ko: "관련역 승하차, 외국인 수 아님", en: "Station boardings, not foreign visitors", zh: "相关车站乘降量，并非外国游客数" }, status: "BACKFILL_AVAILABLE", realtime: "No", history: "Official files/API", coverage: "Product-specific", lag: "Daily/monthly", geo: "Station", key: "Product-specific", free: "Public data", commercial: "Open data terms", redistribution: "Derived aggregates", priority: "P1", tier: "ready" },
  { source: "SEOUL COMMERCIAL SALES", provider: "Seoul Credit Guarantee Foundation", use: { ko: "상권 체급·계절성, 외국인 매출 아님", en: "Area baseline and seasonality, not foreign spend", zh: "商圈基线与季节性，并非外国人消费" }, status: "BACKFILL_AVAILABLE", realtime: "No", history: "Quarterly files/API", coverage: "2021 onward for current standard", lag: "Quarterly", geo: "Commercial area", key: "Open API", free: "Public data", commercial: "Open Government License 1", redistribution: "Derived aggregates", priority: "P1", tier: "ready" },
  { source: "SKT GEOVISION PUZZLE", provider: "SKT", use: { ko: "유동·이동 교차검증 후보", en: "Movement cross-check candidate", zh: "流动交叉验证候选" }, status: "CONDITION_REVIEW", realtime: "Plan-dependent", history: "Plan-dependent", coverage: "Plan-dependent", lag: "Plan-dependent", geo: "Service-defined", key: "Account", free: "Free plan exists", commercial: "Approval review", redistribution: "Permission required", priority: "P3", tier: "conditional" },
  { source: "KT PLIP / BIGSIGHT", provider: "KT", use: { ko: "별도 계약형 이동 데이터 후보", en: "Contract-based movement candidate", zh: "需另行签约的移动数据候选" }, status: "NOT_SELECTED", realtime: "Contract-dependent", history: "Contract-dependent", coverage: "Contract-dependent", lag: "Contract-dependent", geo: "Service-defined", key: "Contract", free: "Not assumed free", commercial: "Contract", redistribution: "Contract", priority: "P3", tier: "conditional" },
] as const;

export function monthDays(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(year, value, 0).getDate();
}

export function airportValue(record: AirportMonth, terminal: Terminal, direction: AirportDirection) {
  const value = record[terminal];
  if (direction === "arrival") return value.arrival;
  if (direction === "departure") return value.departure;
  return value.arrival + value.departure;
}

export function formatCount(lang: Lang, value: number, unit: "people" | "flights" = "people") {
  const locale = lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
  const suffix = unit === "flights"
    ? (lang === "ko" ? "편" : lang === "zh" ? "班" : lang === "ja" ? "便" : " flights")
    : (lang === "ko" ? "명" : lang === "zh" || lang === "ja" ? "人" : " passengers");
  return `${Math.round(value).toLocaleString(locale)}${suffix}`;
}

export function formatInteger(lang: Lang, value: number) {
  const locale = lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
  return Math.round(value).toLocaleString(locale);
}
