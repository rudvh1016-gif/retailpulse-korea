/**
 * The official sources KORETAIL reads, as plain data.
 *
 * This table used to live inside `app/source-status.tsx`, which is a client
 * module. That made it unreachable from a server component — and it is the
 * single most citable thing this product publishes: twenty named public
 * institutions, in four languages, each with the boundary of what its number
 * does NOT mean written next to it.
 *
 * A crawler that never runs the page's JavaScript, and an answer engine
 * deciding whether KORETAIL is worth quoting, both read the first HTML
 * response and nothing else. Keeping this list behind hydration meant neither
 * ever saw it. Nothing here imports React, so a server component can render
 * it at no request-time cost: it is constant text already in the bundle, with
 * no network call and no D1 read behind it.
 *
 * `app/source-status.tsx` re-exports these, so the client tree keeps its
 * existing import path and there is exactly one copy of the text.
 */
import type { Lang } from "../app/retailpulse-data";

/** Korean, English, Chinese, Japanese — in the order `Lang` declares them. */
export type Words = [string, string, string, string];

const word = (lang: Lang, words: Words) => ({ ko: words[0], en: words[1], zh: words[2], ja: words[3] })[lang];

export interface SourceEntry {
  id: string;
  names: Words;
  uses: Words;
}

export const activeSourceCatalog: SourceEntry[] = [
 {id:'INCHEON_PASSENGER_FORECAST',names:['출국장·입국심사 예상 승객','Departure-hall / arrival-inspection forecast','出境大厅·入境检查预计旅客','出国場・入国審査の予想旅客'],uses:['인천국제공항공사 · 출국장은 내·외국인 구분 없는 이용 예상이며 환승 합산 전체 출발 여객 수가 아닙니다.','Incheon Airport · departure-hall use, no nationality breakdown; not total departures including transfers.','仁川机场：出境大厅预计使用人数，不区分国籍，并非包含中转的全部出发旅客。','仁川空港：出国場の利用予想・国籍別区分なし。乗継を合算した出発総数ではありません。']},
 {id:'INCHEON_TRANSFER_FORECAST',names:['환승 보안검색 예고','Transfer security forecast','中转安检预报','乗継保安検査予告'],uses:['공식 Excel · D+1 도착 기준 T1·T2 환승 보안검색 이용 예상. 출국장 예상과 합산하지 않습니다.','Official Excel · D+1 arrival-based T1/T2 transfer security forecast; never added to departure halls.','官方Excel：D+1按到达日的T1/T2中转安检预报，不与出境大厅相加。','公式Excel：D+1到着基準のT1/T2乗継保安検査予告。出国場予想と合算しません。']},
 {id:'INCHEON_FLIGHT_DETAIL',names:['공항 출발 항공편','Airport departure records','机场出发航班','空港の出発便記録'],uses:['인천국제공항공사 · 편명·게이트·터미널을 정리하고 공동운항 중복을 제외합니다.','Incheon Airport · flight, gate and terminal records with codeshare deduplication.','仁川机场：航班、登机口及航站楼，排除代码共享重复。','仁川空港：便名・ゲート・ターミナル。共同運航の重複を除外。']},
 {id:'INCHEON_DEPARTURE_CONGESTION',names:['T1 출국장 대기','T1 departure-hall queues','T1出境等候','T1出国場の待機'],uses:['인천국제공항공사 · T1 출국장 대기 관측. T2는 별도 자료로 수집합니다.','Incheon Airport · observed T1 queues; T2 uses a separate source.','仁川机场：T1等候观测，T2使用独立数据。','仁川空港：T1の待機観測。T2は別資料です。']},
 {id:'INCHEON_DEPARTURE_CONGESTION_T2',names:['T2 출국장 대기','T2 departure-hall queues','T2出境等候','T2出国場の待機'],uses:['인천국제공항공사 · T2 전용 API의 출국장 대기 관측. 탑승 게이트 혼잡이 아닙니다.','Incheon Airport · dedicated T2 queue API, not boarding-gate crowding.','仁川机场：T2专用等候API，并非登机口拥挤度。','仁川空港：T2専用APIの待機観測。搭乗ゲートの混雑ではありません。']},
 {id:'INCHEON_FACILITY_DIRECTORY',names:['공항 매장·시설 안내','Airport shops and facilities','机场商店与设施','空港の店舗・施設'],uses:['공식 시설 목록의 위치·공개 영업시간. 현재 영업 여부를 보장하지 않습니다.','Official directory locations and published hours; not verified live opening status.','官方设施位置与公布营业时间，不保证当前营业。','公式施設の位置・公開営業時間。現在の営業状態を保証しません。']},
 {id:'INCHEON_SCHEDULED_DUTY_FREE',names:['면세점용 예정 출발편 자료','Scheduled departures for duty-free operations','免税店用计划出发资料','免税店向け出発予定資料'],uses:['인천국제공항공사 · 예정 운항·위치 보조자료. 매출 자료가 아니며 현재 항공편과 별도입니다.','Incheon Airport · supplementary scheduled flight/location data, not sales or current flight records.','仁川机场：计划航班及位置辅助资料，并非销售或当前航班。','仁川空港：予定運航・位置の補助資料。売上や現在便の記録とは別です。']},
 {id:'INCHEON_DUTY_FREE_ACTUAL',names:['면세점용 출발편 보조자료','Departure enrichment for duty-free operations','免税店用出发辅助资料','免税店向け出発便の補助資料'],uses:['인천국제공항공사 · 출발편의 위치 등 보조 정보. 매장 실제 매출이 아닙니다.','Incheon Airport · supplementary departure location data, not store sales.','仁川机场：出发航班位置等补充信息，并非门店销售。','仁川空港：出発便の位置などの補足情報。店舗売上ではありません。']},
 {id:'SEOUL_CITYDATA_PPLTN',names:['서울 현재 인구·공식 예상','Seoul population and official forecast','首尔人口与官方预测','ソウル人口・公式予測'],uses:['서울시 · 명동·홍대·성수의 추정 체류 인구. 누적 방문객이 아닙니다.','Seoul · estimated people present in three areas, not cumulative visitors.','首尔市：三个地区估计停留人口，非累计访客。','ソウル市：3地域の推定滞在人口。累計来訪者ではありません。']},
 {id:'SEOUL_CITYDATA_CMRCL',names:['서울 내국인 카드 소비·주변 환경','Seoul domestic-card activity and environment','首尔居民卡消费与环境','ソウル国内カード消費・環境'],uses:['서울시 통합 도시데이터 · 신한카드 내국인 최근 10분 소비와 업종별 활동, 별도 시각의 날씨·미세먼지 관측.','Seoul integrated data · Shinhan domestic 10-minute/category activity, and separately timed weather/PM observations.','首尔综合城市数据：新韩卡居民10分钟及分行业消费，另有独立时刻的天气和颗粒物观测。','ソウル統合都市データ：新韓カード国内10分・業種別消費と、別時刻の天気・粒子状物質観測。']},
 {id:'KMA_VILAGE_FCST',names:['기상청 단기 날씨예보','KMA short-term weather forecast','气象厅短期天气预报','気象庁の短期天気予報'],uses:['기상청 · 기온·강수확률·습도·바람 예보. 관측값과 구분합니다.','KMA · temperature, rain probability, humidity and wind forecasts, distinct from observations.','气象厅：气温、降水概率、湿度和风预报，与观测分开。','気象庁：気温・降水確率・湿度・風の予報。観測と区別。']},
 {id:'KTO_TOURAPI_EVENT',names:['공식 행사 일정','Official event schedules','官方活动日程','公式イベント日程'],uses:['한국관광공사 · 행사기간·장소·공식 안내. 기간 안이라도 당일 운영 여부는 별도 확인합니다.','KTO · dates, locations and official links; in-period does not prove daily operation.','韩国观光公社：日期、地点及官方链接，期间内不保证当天运营。','韓国観光公社：期間・場所・公式案内。期間内でも当日の開催は別確認。']},
 {id:'KASI_PUBLIC_HOLIDAYS',names:['공휴일 달력','Public holiday calendar','公休日历','祝日カレンダー'],uses:['한국천문연구원 · 공식 공휴일 정보. 수집에 성공하기 전에는 휴일 여부를 단정하지 않습니다.','KASI · official public holidays; no holiday claims until collection succeeds.','韩国天文研究院：官方公休日，收集成功前不确认假日。','韓国天文研究院：公式祝日。収集成功前に休日と断定しません。']},
 {id:'SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION',names:['단기체류 외국인 생활인구','Short-stay foreign population','短期外国生活人口','短期滞在外国人の生活人口'],uses:['서울시 · 지연 공개되는 외국인 생활인구. 실시간 관광객·구매자 수가 아닙니다.','Seoul · delayed foreign-population estimates, not live tourists or buyers.','首尔市：延迟发布的外国生活人口，并非实时游客或买家。','ソウル市：遅れて公表される外国人人口。リアルタイム観光客や購入者ではありません。']},
 {id:'SEOUL_FOREIGN_PURPOSE_MOBILITY',names:['외국인 이동 목적 통계','Foreign movement-purpose statistics','外国人移动目的统计','外国人の移動目的統計'],uses:['서울시 · 월간 쇼핑·관광 목적 추정 이동. 구매나 매출이 아닙니다.','Seoul · monthly estimated shopping/tourism movements, not purchases or sales.','首尔市：月度购物及旅游目的推定移动，并非购买或销售。','ソウル市：月間の買物・観光目的推定移動。購入・売上ではありません。']},
 {id:'SEOUL_SUBWAY_RIDERSHIP',names:['대표 지하철역 승하차','Representative station ridership','代表地铁站乘降','代表地下鉄駅の乗降'],uses:['서울교통공사 · 일별 승하차. 상권 고유 방문객이나 외국인 수가 아닙니다.','Seoul Metro · daily boardings/alightings, not unique area visitors or foreigners.','首尔交通公社：每日乘降，非商圈独立访客或外国人数。','ソウル交通公社：日別乗降。商圏の固有来訪者や外国人数ではありません。']},
 {id:'SEOUL_ESTIMATED_SALES',names:['과거 상권 추정매출','Historical district estimated sales','历史商圈估计销售','過去の商圏推定売上'],uses:['서울시 상권분석서비스 · 분기별 추정매출. 내 매장 매출과 다릅니다.','Seoul commercial analysis · quarterly estimated sales, not your store sales.','首尔商圈分析：季度估计销售，并非您的门店销售。','ソウル商圏分析：四半期の推定売上。自店舗の売上とは異なります。']},
 {id:'SEOUL_STORE_DYNAMICS',names:['과거 점포·개폐업 현황','Historical store openings and closures','历史店铺开闭业','過去の店舗・開閉業'],uses:['서울시 상권분석서비스 · 분기 점포·개업·폐업 수. 실시간 영업 현황이 아닙니다.','Seoul commercial analysis · quarterly store/opening/closure counts, not live trading status.','首尔商圈分析：季度店铺及开闭业数量，非实时营业状态。','ソウル商圏分析：四半期の店舗・開閉業数。リアルタイム営業状況ではありません。']},
 {id:'AIRPORT_OFFICIAL_HISTORY',names:['공항 공식 월별 실적','Official monthly airport statistics','机场官方月度实绩','空港公式月次実績'],uses:['인천국제공항공사 · 보유한 월별 확정 과거 실적. 예측과 별도입니다.','Incheon Airport · stored official historical monthly results, separate from forecasts.','仁川机场：保存的官方历史月度实绩，与预测分开。','仁川空港：保存済み公式月次実績。予測と別です。']},
];

export const sourceName = (id: string, lang: Lang) =>
  word(lang, activeSourceCatalog.find((row) => row.id === id)?.names ?? [id, id, id, id]);

export const sourceUse = (row: SourceEntry, lang: Lang) => word(lang, row.uses);

/** One localized string from a four-language tuple, for callers outside this file. */
export const localized = word;

/**
 * Where each number actually comes from, as a citation a reader can follow.
 *
 * Until now the site carried NOT ONE outbound link to a primary source in any
 * server-rendered page: `grep -rn 'href="https' app/*.tsx` returned nothing.
 * Every caveat above names its institution in prose — "인천국제공항공사 ·",
 * "서울시 ·" — but prose is not a citation, and an answer engine deciding
 * whether to trust a republisher looks for the link to the original.
 * Princeton's 2024 study of generative-engine visibility put citing sources
 * first among the techniques it measured. It is also simply correct: a reader
 * who wants to check a figure should be one click from the dataset.
 *
 * Nothing here is guessed. Every identifier below appears in
 * `docs/DATA_SOURCES.md`, the repository's own verified source matrix, and
 * `tests/page-brief.test.mjs` re-reads that file and fails if an identifier
 * in this map is not in it. That test is the reason this map cannot quietly
 * acquire a plausible-looking dataset number that does not exist.
 *
 * `url` is present only where the landing-page form is attested in that same
 * document. The data.go.kr pattern is (three worked examples there). The
 * Seoul 열린데이터광장 deep-link form is NOT, so those entries link the portal
 * and carry the dataset identifier as text instead of guessing a path —
 * `OA-21285` resolves from the portal search, and an invented URL would 404.
 */
export interface SourceProvenance {
  /** The publisher's own catalogue number, shown as text next to the link. */
  identifier: string;
  /** Landing page, only where `docs/DATA_SOURCES.md` attests the URL form. */
  url?: string;
}

const dataGoKr = (id: string) => `https://www.data.go.kr/data/${id}/openapi.do`;
const SEOUL_OPEN_DATA = "https://data.seoul.go.kr/";

export const sourceProvenance: Record<string, SourceProvenance> = {
  INCHEON_PASSENGER_FORECAST: { identifier: "공공데이터포털 15095066", url: dataGoKr("15095066") },
  INCHEON_FLIGHT_DETAIL: { identifier: "공공데이터포털 15140153", url: dataGoKr("15140153") },
  INCHEON_DEPARTURE_CONGESTION: { identifier: "공공데이터포털 15148225", url: dataGoKr("15148225") },
  INCHEON_DEPARTURE_CONGESTION_T2: { identifier: "공공데이터포털 15161098", url: dataGoKr("15161098") },
  INCHEON_FACILITY_DIRECTORY: { identifier: "공공데이터포털 15095064", url: dataGoKr("15095064") },
  INCHEON_DUTY_FREE_ACTUAL: { identifier: "공공데이터포털 15134279", url: dataGoKr("15134279") },
  INCHEON_SCHEDULED_DUTY_FREE: { identifier: "공공데이터포털 15134281", url: dataGoKr("15134281") },
  KMA_VILAGE_FCST: { identifier: "공공데이터포털 15084084", url: dataGoKr("15084084") },
  KASI_PUBLIC_HOLIDAYS: { identifier: "공공데이터포털 15012690", url: dataGoKr("15012690") },
  KTO_TOURAPI_EVENT: { identifier: "한국관광공사 TourAPI B551011 KorService2" },
  SEOUL_CITYDATA_PPLTN: { identifier: "서울 열린데이터광장 OA-21285", url: SEOUL_OPEN_DATA },
  SEOUL_CITYDATA_CMRCL: { identifier: "서울 열린데이터광장 OA-21285", url: SEOUL_OPEN_DATA },
  SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION: { identifier: "서울 열린데이터광장 OA-23018", url: SEOUL_OPEN_DATA },
  SEOUL_FOREIGN_PURPOSE_MOBILITY: { identifier: "서울 열린데이터광장 OA-22378", url: SEOUL_OPEN_DATA },
  SEOUL_SUBWAY_RIDERSHIP: { identifier: "서울 열린데이터광장 OA-22723", url: SEOUL_OPEN_DATA },
  SEOUL_ESTIMATED_SALES: { identifier: "서울시 상권분석서비스 OA-15572", url: "https://golmok.seoul.go.kr/" },
  SEOUL_STORE_DYNAMICS: { identifier: "서울시 상권분석서비스 OA-15577", url: "https://golmok.seoul.go.kr/" },
  // Published as an official Excel release and as stored history rather than
  // through a catalogued open-data endpoint, so there is no dataset number to
  // cite. Naming the publisher without a fake identifier is the honest form.
  INCHEON_TRANSFER_FORECAST: { identifier: "인천국제공항공사 공식 공개 자료" },
  AIRPORT_OFFICIAL_HISTORY: { identifier: "인천국제공항공사 공식 월별 통계" },
};
