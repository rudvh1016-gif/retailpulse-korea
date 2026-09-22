/**
 * What each page says when nobody runs its JavaScript.
 *
 * The problem this solves
 * ──────────────────────
 * On 2026-09-22 a render of the built Worker measured the crawlable text in
 * the FIRST HTML response of every page, in every locale. `/ko` carried 318
 * characters, `/ko/myeongdong` 350, `/ko/airport` 435 — and almost all of it
 * was navigation chrome plus the word "로딩 중". Twenty-eight of the forty
 * indexable pages served a loading placeholder where their content belongs.
 *
 * That is not a cosmetic gap. Everything on those screens arrives from
 * `useLiveSummary()`, which resolves only after hydration, so a reader that
 * never executes the page's JavaScript sees nothing worth indexing and
 * nothing worth quoting. Most AI crawlers are exactly that reader. Google's
 * own AI optimization guide sets the floor plainly: a page has to be indexed
 * and eligible for a snippet before it can appear in any AI feature, and
 * "optimizing for generative AI search is still SEO". A page whose body is a
 * spinner clears neither bar.
 *
 * What this file is
 * ─────────────────
 * The evergreen half of every page, as data: what the screen answers, which
 * public institution each number comes from, what that number does NOT mean,
 * and the questions a reader actually arrives with. All of it is true whether
 * or not today's collection succeeded, so it can be rendered on the server
 * with no fetch, no D1 read and no measurable Worker CPU — `app/page-brief.tsx`
 * turns it into markup, and it is the same constant text already sitting in
 * the bundle.
 *
 * Three rules hold this file honest:
 *
 *  1. **Nothing here is a measurement.** Not one sentence states a passenger
 *     count, a crowd level or a sales figure. Those belong to the live screen,
 *     which labels its own freshness. This file explains; it never reports.
 *     That is also why it can be cached forever without ever going stale.
 *
 *  2. **The truth boundaries in AGENTS.md are repeated, not softened.** A
 *     departure-hall forecast is not a queue; domestic card spend is not
 *     foreign spend; an estimated trade-area figure is not your store's
 *     revenue. Those distinctions are the most valuable thing KORETAIL can
 *     tell an answer engine, because an engine that quotes the caveat with
 *     the number is an engine that quotes KORETAIL correctly.
 *
 *  3. **Visible text and structured data come from this one object.**
 *     `app/page-brief.tsx` renders the questions and `app/seo-config.ts`
 *     serializes the same array into `FAQPage` JSON-LD. Markup that claims a
 *     Q&A the page does not show is a manual-action risk, and the usual cause
 *     is two copies drifting apart. Here there is one copy, and
 *     `tests/page-brief.test.mjs` asserts it.
 */
import type { Lang } from "../app/retailpulse-data";
import { activeSourceCatalog, type Words } from "./source-catalog";
import { areaNames, type SeoSlug } from "../app/seo-config";

export type { Words };

export type BriefArea = keyof typeof areaNames;

export interface BriefQuestion {
  question: Words;
  answer: Words;
}

export interface PageBrief {
  /** Heading for the whole block, so the section is never an unlabelled wall of text. */
  heading: Words;
  /** One or two sentences naming what this page is for. Unique per page. */
  intro: Words;
  /** What a reader can settle here, as short statements rather than marketing. */
  answers: Words[];
  /** Ids into `activeSourceCatalog`, so the caveats are never re-typed. */
  sources: string[];
  /** Page-specific Q&A. Rendered visibly AND emitted as FAQPage JSON-LD. */
  faq: BriefQuestion[];
}

export const localize = (lang: Lang, words: Words) => ({ ko: words[0], en: words[1], zh: words[2], ja: words[3] })[lang];

/**
 * Substitutes the area's own name into a four-language template.
 *
 * `{}` marks the slot. Each locale gets that locale's name for the area —
 * 명동 / Myeongdong / 明洞 / 明洞 — so an area sentence reads natively rather
 * than carrying a romanization into Korean or Japanese copy.
 */
const withArea = (area: BriefArea, template: Words): Words => {
  const names = areaNames[area];
  const [ko, en, zh, ja] = template;
  return [
    ko.replaceAll("{}", names.ko),
    en.replaceAll("{}", names.en),
    zh.replaceAll("{}", names.zh),
    ja.replaceAll("{}", names.ja),
  ];
};

const HEADING: Words = [
  "이 화면에 대하여",
  "About this page",
  "关于本页面",
  "このページについて",
];

/** Sub-headings shared by every brief, so the block has a real outline rather than one h2 and a wall of text. */
export const BRIEF_LABELS = {
  answers: ["이 화면에서 확인할 수 있는 것", "What you can settle here", "本页面可以确认的内容", "この画面で確認できること"] as Words,
  sources: ["이 화면이 쓰는 공식 자료", "The official records this page reads", "本页面使用的官方资料", "この画面が使う公式資料"] as Words,
  questions: ["자주 묻는 질문", "Common questions", "常见问题", "よくある質問"] as Words,
};

/**
 * How often each family of sources is attempted.
 *
 * Deliberately worded as an attempt, not a promise: `docs/ZERO_COST_HYBRID_AUDIT.md`
 * records that GitHub's scheduler can delay or drop a run, and the screen's own
 * freshness labels are what state whether today's attempt actually landed.
 */
const REFRESH: Words = [
  "서울 인구·카드 소비와 공항 출국장 대기는 약 15분 간격으로 수집을 시도하고, 공항 예상 승객은 시간 단위로, 월별·분기별 공식 실적은 기관이 발표한 뒤에 갱신합니다. 예정 시각은 실행 보장이 아니며, 수집이 실패하면 마지막으로 성공한 자료와 원래 기준시각을 그대로 유지합니다.",
  "Seoul population and card activity, and airport departure-hall queues, are attempted about every 15 minutes; airport passenger forecasts hourly; official monthly and quarterly results after the institution publishes them. A scheduled time is not a guarantee of execution, and a failed refresh keeps the last successful data with its original timestamp.",
  "首尔人口与刷卡消费、机场出境大厅等候约每15分钟尝试收集一次，机场预计旅客按小时更新，月度与季度官方实绩在机构发布后更新。计划时间不保证执行；收集失败时保留最近一次成功的资料及其原始时刻。",
  "ソウルの人口・カード消費と空港出国場の待機は約15分ごとに収集を試み、空港の予想旅客は時間単位、月次・四半期の公式実績は機関の発表後に更新します。予定時刻は実行の保証ではなく、収集に失敗した場合は最後に成功した資料と元の基準時刻をそのまま保持します。",
];

const FREE_AND_OPEN: BriefQuestion = {
  question: ["KORETAIL을 쓰는 데 가입이나 요금이 필요한가요?", "Does KORETAIL need an account or a payment?", "使用 KORETAIL 需要注册或付费吗？", "KORETAIL の利用に登録や料金は必要ですか？"],
  answer: [
    "아니요. 모든 화면은 가입이나 로그인 없이 볼 수 있고 요금도 없습니다. 역할·관심지역 같은 개인 설정은 이 기기의 브라우저에만 저장되며 서버로 보내지 않습니다.",
    "No. Every screen is readable without an account or a login, and there is no charge. Personal settings such as your role and area are stored only in this device's browser and are never sent to a server.",
    "不需要。所有页面无需注册或登录即可查看，也不收取费用。角色与关注地区等个人设置仅保存在本设备的浏览器中，不会发送至服务器。",
    "いいえ。すべての画面は登録やログインなしで閲覧でき、料金もかかりません。役割・関心エリアなどの個人設定はこの端末のブラウザにのみ保存され、サーバーには送信されません。",
  ],
};

const FORECAST_VS_ACTUAL: BriefQuestion = {
  question: ["예측값과 실제 기록을 어떻게 구분하나요?", "How are forecasts told apart from actual records?", "如何区分预测值与实际记录？", "予測値と実績はどのように区別されますか？"],
  answer: [
    "현재 관측, 기관이 발표한 앞으로의 공식 예상, 이미 확정된 과거 실적을 서로 다른 값으로 표시하고 절대 합치지 않습니다. KORETAIL이 계산한 참고 예상은 공식 발표값과 구분해 표시하며, 확인되지 않은 값은 만들어 채우지 않고 비워 둡니다.",
    "Current observations, an institution's published forecast for what is ahead, and already-final historical results are shown as three different values and never merged. A reference outlook KORETAIL computed itself is labelled separately from an official published figure, and anything unconfirmed is left blank rather than filled in.",
    "当前观测、机构发布的未来官方预测、以及已确定的历史实绩，作为三种不同数值分别显示，绝不合并。KORETAIL 自行计算的参考预测会与官方发布值区分标注；未经确认的数值留空，不会自行填补。",
    "現在の観測、機関が発表した今後の公式予想、すでに確定した過去の実績は、それぞれ別の値として表示し、決して合算しません。KORETAIL が算出した参考予想は公式発表値と区別して表示し、確認できない値は作って埋めず空欄のままにします。",
  ],
};

const areaBrief = (area: BriefArea): PageBrief => ({
  heading: HEADING,
  intro: withArea(area, [
    `{} 화면은 서울시가 공개하는 실시간 도시데이터에서 {} 일대의 추정 체류 인구와 공식 혼잡 예측을 읽고, 같은 시간대의 날씨 예보와 주변 공식 행사 일정을 함께 놓습니다. 방문 시점을 고르거나 매장 문을 열기 전에 상황을 가늠하는 용도입니다.`,
    `This page reads Seoul's open real-time city data for the estimated number of people present around {} and the city's own crowd forecast, and places the weather forecast and nearby official events for the same hours beside it. It is for choosing when to visit, or for sizing up the day before opening a store.`,
    `本页面读取首尔市公开的实时城市数据，获取{}一带的估计停留人口与官方拥挤预测，并将同一时段的天气预报与周边官方活动日程并列显示。适用于选择到访时间，或在门店开门前了解当天情况。`,
    `このページはソウル市が公開するリアルタイム都市データから{}一帯の推定滞在人口と公式の混雑予測を読み取り、同じ時間帯の天気予報と周辺の公式イベント日程を並べて示します。訪問時間を選ぶとき、または店舗を開ける前に状況を把握するための画面です。`,
  ]),
  answers: [
    withArea(area, [
      "지금 {} 일대에 머무는 것으로 추정되는 인원과 그 범위",
      "The estimated number of people present around {} right now, with its range",
      "目前{}一带估计停留人数及其区间",
      "いま{}一帯に滞在していると推定される人数とその範囲",
    ]),
    ["서울시 공식 예측 기준으로 앞으로 가장 붐빌 시간대", "The busiest hours ahead in Seoul's own official forecast", "首尔市官方预测中未来最拥挤的时段", "ソウル市の公式予測で今後最も混雑する時間帯"],
    ["같은 시간대의 기온·강수확률 예보", "The temperature and rain-probability forecast for those same hours", "同一时段的气温与降水概率预报", "同じ時間帯の気温・降水確率の予報"],
    ["기간이 겹치는 인근 공식 행사와 그 출처", "Nearby official events whose period overlaps, and where each came from", "期间重叠的周边官方活动及其出处", "期間が重なる周辺の公式イベントとその出典"],
    ["대표 지하철역의 일별 승하차 흐름", "Daily boardings and alightings at the representative subway station", "代表地铁站的每日乘降趋势", "代表地下鉄駅の日別乗降の流れ"],
  ],
  sources: [
    "SEOUL_CITYDATA_PPLTN",
    "SEOUL_CITYDATA_CMRCL",
    "KMA_VILAGE_FCST",
    "KTO_TOURAPI_EVENT",
    "SEOUL_SUBWAY_RIDERSHIP",
    "SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION",
  ],
  faq: [
    {
      question: withArea(area, [
        "{}의 인구 수치는 방문객 수인가요?",
        "Is the {} figure a visitor count?",
        "{}的人口数值是访客人数吗？",
        "{}の人口の数値は来訪者数ですか？",
      ]),
      answer: withArea(area, [
        "아니요. 서울시가 공개하는 {} 일대의 추정 체류 인구, 즉 그 시점에 머물고 있는 사람 수의 추정 범위입니다. 하루 동안 다녀간 사람을 더한 누적 방문객 수가 아니며, 거주자·근무자·방문객을 구분하지 않고 외국인만 따로 센 수치도 아닙니다.",
        "No. It is Seoul's estimate of how many people are present around {} at that moment, published as a range. It is not a cumulative count of everyone who passed through during the day, it does not separate residents from workers or visitors, and it is not a count of foreign nationals.",
        "不是。这是首尔市公布的{}一带估计停留人口，即该时刻在场人数的估计区间。它不是一天内到访者的累计人数，不区分居民、上班者与访客，也不是外国人单独统计的数字。",
        "いいえ。ソウル市が公開する{}一帯の推定滞在人口、つまりその時点に滞在している人数の推定レンジです。1日に訪れた人を合計した累計来訪者数ではなく、居住者・勤務者・来訪者を区別せず、外国人だけを数えた数値でもありません。",
      ]),
    },
    {
      question: withArea(area, [
        "{} 매장의 매출을 알 수 있나요?",
        "Can I see sales for stores in {}?",
        "可以查看{}门店的销售额吗？",
        "{}の店舗の売上はわかりますか？",
      ]),
      answer: [
        "아니요. 이 화면이 보여주는 카드 소비는 서울시 통합 도시데이터의 내국인 카드 활동이고, 상권 추정매출은 서울시 상권분석서비스의 분기 추정치입니다. 둘 다 공개 통계이며 특정 매장의 매출도, 외국인이 쓴 금액도 아닙니다. KORETAIL은 매장 실제 매출 자료를 보유하지 않습니다.",
        "No. The card activity on this page is domestic-card activity from Seoul's integrated city data, and the trade-area sales figure is a quarterly estimate from Seoul's commercial-district analysis service. Both are public statistics: neither is any individual store's revenue, and neither is money spent by foreign visitors. KORETAIL holds no actual store sales data.",
        "不可以。本页显示的刷卡消费来自首尔市综合城市数据中的本国居民刷卡活动，商圈估计销售额来自首尔市商圈分析服务的季度估算。两者均为公开统计，既非某家门店的营业额，也非外国人的消费金额。KORETAIL 不持有门店实际销售数据。",
        "いいえ。この画面のカード消費はソウル統合都市データの国内カード活動であり、商圏の推定売上はソウル市商圏分析サービスの四半期推定値です。いずれも公開統計で、特定店舗の売上でも、外国人が使った金額でもありません。KORETAIL は店舗の実売上データを保有していません。",
      ],
    },
    FORECAST_VS_ACTUAL,
  ],
});

const BRIEFS: Record<string, PageBrief> = {
  home: {
    heading: HEADING,
    intro: [
      "KORETAIL은 인천국제공항과 서울 명동·홍대·성수에 대해 공공기관이 공개한 자료만 모아, 오늘과 내일을 준비하는 데 필요한 흐름을 한 화면에 정리하는 무료 웹사이트입니다. 공항·면세점 근무자, 서울 매장 운영자, 관광안내 직원과 방문객을 위해 만들었습니다.",
      "KORETAIL collects only data published by public institutions about Incheon International Airport and the Myeongdong, Hongdae and Seongsu districts of Seoul, and lays out what you need to prepare for today and tomorrow on one screen. It is free, and it is built for airport and duty-free staff, Seoul store operators, tourism-desk staff and visitors.",
      "KORETAIL 仅汇集公共机构公开发布的仁川国际机场与首尔明洞、弘大、圣水相关资料，在同一页面整理出为今天与明天做准备所需的动态。本站免费，面向机场与免税店员工、首尔门店经营者、旅游咨询人员及访客。",
      "KORETAIL は、仁川国際空港とソウルの明洞・弘大・聖水について公的機関が公開した資料のみを集め、今日と明日の準備に必要な流れを一つの画面にまとめる無料サイトです。空港・免税店のスタッフ、ソウルの店舗運営者、観光案内スタッフと来訪者のために作られています。",
    ],
    answers: [
      ["인천공항 출국장의 공식 예상 승객과 붐비는 시간대", "The official departure-hall passenger forecast for Incheon Airport and the hours it peaks", "仁川机场出境大厅的官方预计旅客与高峰时段", "仁川空港出国場の公式予想旅客と混雑する時間帯"],
      ["명동·홍대·성수의 지금 추정 체류 인구와 공식 혼잡 예측", "Estimated people present now in Myeongdong, Hongdae and Seongsu, with the city's official crowd forecast", "明洞、弘大、圣水当前估计停留人口与官方拥挤预测", "明洞・弘大・聖水の現在の推定滞在人口と公式の混雑予測"],
      ["같은 시간대의 날씨 예보와 기간이 겹치는 공식 행사", "The weather forecast for the same hours, and official events whose period overlaps", "同一时段的天气预报与期间重叠的官方活动", "同じ時間帯の天気予報と期間が重なる公式イベント"],
      ["업종별 매장 준비 점검 목록", "A store-preparation checklist by retail business type", "按业态划分的门店准备检查清单", "業種別の店舗準備チェックリスト"],
      ["각 숫자가 어느 기관의 어떤 자료에서 왔는지", "Which institution and which dataset each number came from", "每个数字来自哪个机构的哪项资料", "それぞれの数字がどの機関のどの資料から来たか"],
    ],
    sources: ["SEOUL_CITYDATA_PPLTN", "INCHEON_PASSENGER_FORECAST", "KMA_VILAGE_FCST", "KTO_TOURAPI_EVENT", "SEOUL_CITYDATA_CMRCL"],
    faq: [
      {
        question: ["KORETAIL은 어떤 사이트인가요?", "What is KORETAIL?", "KORETAIL 是什么网站？", "KORETAIL とはどのようなサイトですか？"],
        answer: [
          "인천국제공항과 서울 명동·홍대·성수에 대한 공공기관 공개 자료를 모아 보여주는 무료 웹사이트입니다. 인천국제공항공사, 서울시, 기상청, 한국관광공사, 서울교통공사, 한국천문연구원이 공개한 자료를 지역·날짜·터미널별로 정리하고, 각 숫자 옆에 그 숫자가 뜻하지 않는 것을 함께 적습니다. KORETAIL은 자체 관측이나 설문을 하지 않으며 매장 매출 자료를 보유하지 않습니다.",
          "A free website that gathers publicly released data about Incheon International Airport and the Myeongdong, Hongdae and Seongsu districts of Seoul. It organizes what Incheon International Airport Corporation, the Seoul Metropolitan Government, the Korea Meteorological Administration, the Korea Tourism Organization, Seoul Metro and the Korea Astronomy and Space Science Institute publish, by area, date and terminal, and writes next to each number what that number does not mean. KORETAIL runs no observations or surveys of its own and holds no store sales data.",
          "这是一个免费网站，汇集有关仁川国际机场与首尔明洞、弘大、圣水的公开发布资料。它按地区、日期与航站楼整理仁川国际机场公社、首尔市、气象厅、韩国观光公社、首尔交通公社与韩国天文研究院公布的资料，并在每个数字旁注明该数字不代表什么。KORETAIL 不进行自有观测或问卷调查，也不持有门店销售数据。",
          "仁川国際空港とソウルの明洞・弘大・聖水に関する公的機関の公開資料を集めて示す無料のウェブサイトです。仁川国際空港公社、ソウル市、気象庁、韓国観光公社、ソウル交通公社、韓国天文研究院が公開した資料を地域・日付・ターミナル別に整理し、それぞれの数字の隣にその数字が意味しないことを併記します。KORETAIL は独自の観測や調査を行わず、店舗の売上データも保有していません。",
        ],
      },
      {
        question: ["자료는 얼마나 자주 갱신되나요?", "How often is the data refreshed?", "资料多久更新一次？", "資料はどのくらいの頻度で更新されますか？"],
        answer: REFRESH,
      },
      FREE_AND_OPEN,
    ],
  },

  airport: {
    heading: HEADING,
    intro: [
      "인천국제공항공사가 공개하는 출국장 예상 승객, 실제 출발 항공편, 출국장 대기 관측, 월별 확정 실적을 터미널별로 따로 보여주는 화면입니다. 네 가지는 서로 다른 자료이므로 절대 합산하지 않고 각각의 기준시각과 함께 표시합니다.",
      "This page shows what Incheon International Airport Corporation publishes — departure-hall passenger forecasts, actual departing flights, observed departure-hall queues, and confirmed monthly results — separately for each terminal. They are four different records, so they are never added together and each is shown with its own timestamp.",
      "本页面按航站楼分别展示仁川国际机场公社公布的出境大厅预计旅客、实际出发航班、出境大厅等候观测与月度确定实绩。四者属于不同资料，因此绝不相加，并各自标注基准时刻。",
      "仁川国際空港公社が公開する出国場の予想旅客、実際の出発便、出国場の待機観測、月次の確定実績を、ターミナル別に分けて示す画面です。4つは別々の資料であるため決して合算せず、それぞれの基準時刻とともに表示します。",
    ],
    answers: [
      ["전체·T1·T2의 출국장 공식 예상 승객과 피크 시간", "The official departure-hall passenger forecast and peak hour for all terminals, T1 and T2", "整体、T1、T2的出境大厅官方预计旅客与高峰时段", "全体・T1・T2の出国場公式予想旅客とピーク時間"],
      ["실제 출발하는 항공편과 출발이 몰리는 게이트", "Which flights actually depart, and which gates the departures concentrate at", "实际出发的航班与出发集中的登机口", "実際に出発する便と出発が集中するゲート"],
      ["현재 출국장 대기 관측 (T1과 T2는 별도 자료)", "Currently observed departure-hall queues (T1 and T2 come from separate sources)", "当前出境大厅等候观测（T1与T2为独立资料）", "現在の出国場の待機観測（T1とT2は別資料）"],
      ["공항 매장·시설의 위치와 공개된 영업시간", "Locations and published opening hours for airport shops and facilities", "机场商店与设施的位置及公布的营业时间", "空港の店舗・施設の位置と公開された営業時間"],
      ["월별 확정 여객 실적과 T1·T2 비중", "Confirmed monthly passenger results and the T1/T2 share", "月度确定旅客实绩与T1、T2占比", "月次の確定旅客実績とT1・T2の比率"],
    ],
    sources: [
      "INCHEON_PASSENGER_FORECAST",
      "INCHEON_TRANSFER_FORECAST",
      "INCHEON_FLIGHT_DETAIL",
      "INCHEON_DEPARTURE_CONGESTION",
      "INCHEON_DEPARTURE_CONGESTION_T2",
      "INCHEON_FACILITY_DIRECTORY",
      "AIRPORT_OFFICIAL_HISTORY",
    ],
    faq: [
      {
        question: ["출국장 예상 승객은 지금 줄 서 있는 사람 수인가요?", "Is the departure-hall forecast the number of people queueing right now?", "出境大厅预计旅客是当前排队人数吗？", "出国場の予想旅客はいま並んでいる人数ですか？"],
        answer: [
          "아니요. 인천국제공항공사가 공개하는 출국장 이용 예상값이며 내국인과 외국인을 구분하지 않습니다. 환승객 예고는 별도 자료라 여기에 포함되지 않으므로 이 값은 환승을 합산한 전체 출발 여객 수도 아닙니다. 지금 줄의 길이는 별도의 출국장 대기 관측 자료로 따로 표시하며, 두 값은 서로 더하지 않습니다.",
          "No. It is Incheon International Airport Corporation's published forecast of departure-hall use, with no split between Korean and foreign nationals. The transfer forecast is a separate record and is not included here, so this figure is also not the total number of departing passengers including transfers. The length of the queue right now comes from a separate departure-hall observation and is shown separately; the two are never added.",
          "不是。这是仁川国际机场公社公布的出境大厅使用预计值，不区分本国人与外国人。中转预报属于独立资料，未包含在内，因此该数值也不是包含中转的全部出发旅客数。当前排队情况来自独立的出境大厅等候观测并单独显示，两者不相加。",
          "いいえ。仁川国際空港公社が公開する出国場の利用予想値で、韓国人と外国人を区別しません。乗継の予告は別資料のため含まれておらず、この値は乗継を合算した出発旅客の総数でもありません。いま並んでいる人数は別の出国場待機観測として個別に表示し、2つの値を足すことはありません。",
        ],
      },
      {
        question: ["항공편 정보로 승객의 국적을 알 수 있나요?", "Do the flight records tell you passengers' nationalities?", "通过航班信息可以了解旅客国籍吗？", "フライト情報から旅客の国籍はわかりますか？"],
        answer: [
          "아니요. 공개되는 것은 편명·목적지·게이트·터미널과 출발 시각이며 탑승객의 국적은 포함되지 않습니다. 노선이나 항공사를 승객 국적으로 바꿔 읽지 않습니다. 공동운항편은 중복을 제외해 한 번만 셉니다.",
          "No. What is published is the flight number, destination, gate, terminal and departure time; passenger nationality is not part of it. A route or an airline is never read as a passenger nationality here. Codeshare flights are deduplicated so a departure is counted once.",
          "不能。公开内容为航班号、目的地、登机口、航站楼与出发时刻，不包含旅客国籍。本站不会将航线或航空公司解读为旅客国籍。代码共享航班已去重，一次出发只计一次。",
          "いいえ。公開されるのは便名・行先・ゲート・ターミナルと出発時刻で、搭乗客の国籍は含まれません。路線や航空会社を旅客の国籍として読み替えることはしません。共同運航便は重複を除き、1回の出発として数えます。",
        ],
      },
      {
        question: ["T1과 T2 중 어디가 더 붐비는지 비교할 수 있나요?", "Can I compare whether T1 or T2 is busier?", "可以比较T1与T2哪边更拥挤吗？", "T1とT2のどちらが混雑しているか比較できますか？"],
        answer: [
          "터미널별 출국장 공식 예상 승객과 실제 출발 편수는 각각 나누어 보여주므로 같은 기준끼리는 비교할 수 있습니다. 다만 출국장 대기 관측은 T1과 T2가 서로 다른 API에서 오고 공개 방식도 달라, 두 터미널의 대기값을 하나의 순위처럼 비교하지는 않습니다.",
          "Official departure-hall forecasts and actual departure counts are shown per terminal, so like can be compared with like. The observed queues are different: T1 and T2 come from two separate APIs published in different ways, so this site does not rank one terminal's queue against the other's.",
          "按航站楼分别显示出境大厅官方预计旅客与实际出发班次，因此同一口径之间可以比较。但等候观测方面，T1与T2来自不同API且公布方式不同，故本站不会将两个航站楼的等候数值排名比较。",
          "ターミナル別の出国場公式予想旅客と実際の出発便数はそれぞれ分けて表示するため、同じ基準どうしなら比較できます。ただし出国場の待機観測はT1とT2で別のAPIから提供され公開方式も異なるため、両ターミナルの待機値を一つの順位として比較することはしません。",
        ],
      },
    ],
  },

  business: {
    heading: HEADING,
    intro: [
      "같은 공식 신호를 매장 준비 관점으로 다시 읽는 화면입니다. 지금의 혼잡·예측·날씨를 매장 기준으로 정리하고, 뷰티·화장품, 패션·잡화, 식음료·카페, 편의·약국, 팝업·체험, 관광·숙박 여섯 업종의 점검 목록을 문 열기 전·혼잡 시간대·마감 전 순서로 보여줍니다.",
      "The same official signals, read from behind the counter. This page arranges the current crowding, forecast and weather for store preparation, and gives checklists for six retail types — beauty, fashion, food and cafe, convenience and pharmacy, pop-up and experience, tourism and lodging — ordered before opening, during the busy hours, and before closing.",
      "本页面以门店准备的视角重新解读相同的官方信号：按门店口径整理当前拥挤、预测与天气，并按开门前、繁忙时段、打烊前的顺序，提供美妆、时尚杂货、餐饮咖啡、便利药店、快闪体验、旅游住宿六个业态的检查清单。",
      "同じ公式シグナルを店舗準備の視点で読み直す画面です。現在の混雑・予測・天気を店舗基準で整理し、ビューティー、ファッション・雑貨、飲食・カフェ、コンビニ・薬局、ポップアップ・体験、観光・宿泊の6業種について、開店前・混雑時間帯・閉店前の順にチェックリストを示します。",
    ],
    answers: [
      ["지역의 현재 공식 혼잡 상태와 앞으로 붐빌 시간대", "The area's current official crowd condition and the busy hours ahead", "地区当前官方拥挤状况与未来繁忙时段", "エリアの現在の公式混雑状況と今後混雑する時間帯"],
      ["내국인 카드 활동과 업종별 활동 흐름", "Domestic card activity and how it moves by business category", "本国居民刷卡活动与分业态的活动趋势", "国内カード活動と業種別の活動の流れ"],
      ["업종별 오픈 전·혼잡 시간대·마감 전 점검 항목", "Checklist items for before opening, the busy hours and before closing, by business type", "按业态划分的开门前、繁忙时段、打烊前检查项目", "業種別の開店前・混雑時間帯・閉店前のチェック項目"],
      ["과거 분기의 상권 추정매출과 점포 개·폐업 흐름", "Past-quarter estimated trade-area sales and store opening and closure trends", "过往季度的商圈估计销售额与店铺开闭业趋势", "過去四半期の商圏推定売上と店舗の開業・廃業の推移"],
    ],
    sources: ["SEOUL_CITYDATA_PPLTN", "SEOUL_CITYDATA_CMRCL", "KMA_VILAGE_FCST", "SEOUL_ESTIMATED_SALES", "SEOUL_STORE_DYNAMICS"],
    faq: [
      {
        question: ["점검 목록이 오늘 매출을 예측해 주나요?", "Does the checklist predict today's sales?", "检查清单会预测今天的销售额吗？", "チェックリストは今日の売上を予測してくれますか？"],
        answer: [
          "아니요. 점검 목록은 업종별 일반 운영 가이드이며 매출이나 방문자 수를 예측하지 않습니다. 위에 표시되는 공식 혼잡 시간대와 함께 읽도록 만든 준비 항목입니다. KORETAIL은 어떤 매장의 실제 매출 자료도 보유하지 않으므로 매출 예측을 제공하지 않습니다.",
          "No. The checklist is a general operating guide by business type; it forecasts neither revenue nor visitor numbers. It is a set of preparation items meant to be read alongside the official busy hours shown above it. KORETAIL holds no actual sales data for any store, so it offers no sales forecast.",
          "不会。检查清单是按业态提供的一般运营指南，不预测销售额或访客人数。它是配合上方官方繁忙时段一起阅读的准备事项。KORETAIL 不持有任何门店的实际销售数据，因此不提供销售预测。",
          "いいえ。チェックリストは業種別の一般的な運営ガイドであり、売上や来店者数を予測するものではありません。上に表示される公式の混雑時間帯と併せて読むための準備項目です。KORETAIL はいかなる店舗の実売上データも保有しておらず、売上予測は提供しません。",
        ],
      },
      {
        question: ["여기 나오는 소비 자료는 외국인 소비인가요?", "Is the spending data here foreign-visitor spending?", "这里的消费数据是外国人消费吗？", "ここに出てくる消費データは外国人の消費ですか？"],
        answer: [
          "아니요. 서울시 통합 도시데이터의 카드 활동은 내국인 카드 기준입니다. 외국인 소비 금액이 아니며 전체 매출도 아닙니다. 지역의 외국인 규모는 별도로 공개되는 단기체류 외국인 생활인구로 따로 보여주는데, 그 값 역시 지연 공개되는 인구 추정치이지 구매 자료가 아닙니다.",
          "No. The card activity in Seoul's integrated city data is domestic-card activity. It is not money spent by foreign visitors, and it is not total sales. The scale of foreign presence in an area is shown separately, from the short-stay foreign population statistics — and that too is a delayed population estimate, not a record of purchases.",
          "不是。首尔市综合城市数据中的刷卡活动以本国居民的银行卡为准，既非外国人消费金额，也非全部营业额。地区的外国人规模另以短期停留外国生活人口单独显示，而该数值同样是延迟发布的人口估计值，并非购买数据。",
          "いいえ。ソウル統合都市データのカード活動は国内カードが基準です。外国人の消費金額でも、売上の総額でもありません。地域の外国人の規模は別途公開される短期滞在外国人の生活人口として個別に示しますが、これも遅れて公表される人口推定値であり、購買の記録ではありません。",
        ],
      },
      FORECAST_VS_ACTUAL,
    ],
  },

  forecast: {
    heading: HEADING,
    intro: [
      "화면에 나오는 각 지표가 무엇을 뜻하는지, 값이 높으면 어떤 상황인지, 어느 기관의 어떤 자료에서 왔는지를 설명하는 화면입니다. 인천공항 T1·T2 비중과 지역별 외국인 생활인구 흐름을 포함합니다.",
      "A page that explains each figure on the site: what it means, what a high value indicates, and which record from which institution it came from. It includes the T1/T2 share at Incheon Airport and the foreign-population trend by area.",
      "本页面说明站内各项指标的含义、数值偏高时代表的情况，以及来自哪个机构的哪项资料，并包含仁川机场T1、T2占比与各地区外国人生活人口的走势。",
      "画面に表示される各指標が何を意味するか、値が高いときはどのような状況か、どの機関のどの資料から来たかを説明するページです。仁川空港のT1・T2比率と、エリア別の外国人生活人口の推移を含みます。",
    ],
    answers: [
      ["각 지표의 정의와 높을 때 읽는 법", "What each figure is defined as, and how to read a high value", "各指标的定义与数值偏高时的解读方法", "各指標の定義と、値が高いときの読み方"],
      ["인천공항 T1·T2의 월별 비중", "The monthly T1 and T2 share at Incheon Airport", "仁川机场T1、T2的月度占比", "仁川空港T1・T2の月次比率"],
      ["지역별 단기체류 외국인 생활인구의 과거 흐름", "The history of short-stay foreign population by area", "各地区短期停留外国生活人口的历史走势", "エリア別の短期滞在外国人生活人口の推移"],
      ["비교 수치를 계산할 수 있는 조건과 계산하지 않는 경우", "When a comparison can be computed, and when it deliberately is not", "可计算比较数值的条件，以及不予计算的情形", "比較の数値を計算できる条件と、計算しない場合"],
    ],
    sources: ["AIRPORT_OFFICIAL_HISTORY", "SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION", "SEOUL_FOREIGN_PURPOSE_MOBILITY", "SEOUL_CITYDATA_PPLTN"],
    faq: [
      {
        question: ["외국인 이동 목적 통계는 쇼핑 매출을 뜻하나요?", "Do the foreign movement-purpose statistics mean shopping revenue?", "外国人移动目的统计代表购物销售额吗？", "外国人の移動目的統計は買物の売上を意味しますか？"],
        answer: [
          "아니요. 서울시가 공개하는 월간 추정 이동 자료로, 쇼핑이나 관광을 목적으로 추정된 이동 건수입니다. 구매가 일어났다는 뜻이 아니고 금액도 아닙니다. KORETAIL은 이런 자료를 외국인 쇼핑 수요의 대리 지표로만 쓰며, 외국인 매출이라고 부르지 않습니다.",
          "No. It is Seoul's monthly estimate of movements attributed to a shopping or tourism purpose. It does not mean a purchase took place, and it carries no monetary amount. KORETAIL uses this kind of record only as a proxy for foreign shopping demand, and never calls it foreign sales.",
          "不是。这是首尔市公布的月度推定移动资料，指被推定为以购物或旅游为目的的移动次数。它既不表示发生了购买，也不含金额。KORETAIL 仅将此类资料作为外国人购物需求的代理指标，绝不称其为外国人销售额。",
          "いいえ。ソウル市が公開する月間の推定移動データで、買物や観光を目的と推定された移動の件数です。購入が発生したことを意味せず、金額でもありません。KORETAIL はこの種の資料を外国人の買物需要の代理指標としてのみ用い、外国人売上とは呼びません。",
        ],
      },
      {
        question: ["왜 어떤 비교 수치는 비어 있나요?", "Why is some comparison left blank?", "为什么部分比较数值是空白的？", "なぜ一部の比較の数値が空欄なのですか？"],
        answer: [
          "같은 대상과 같은 기간의 자료가 양쪽 모두 있을 때에만 비교를 계산하기 때문입니다. 한쪽 기간이 비어 있거나 집계 기준이 다르면 비교값을 만들지 않고 비워 둡니다. 근사치를 채워 넣는 편이 화면은 깔끔해지지만, 그 숫자는 사실이 아니게 됩니다.",
          "Because a comparison is computed only when both sides have data for the same subject over the same period. If one period is missing, or the two are aggregated on different bases, the comparison is left blank rather than produced. Filling in an approximation would make the screen tidier and the number untrue.",
          "因为只有在双方均具备同一对象、同一期间的资料时才计算比较值。若一方期间缺失，或两者统计口径不同，则留空而不生成比较值。填入近似值会让页面更整齐，但那个数字将不再真实。",
          "同じ対象・同じ期間の資料が双方に揃っている場合にのみ比較を計算するためです。片方の期間が欠けていたり、集計基準が異なる場合は、比較値を作らず空欄のままにします。近似値で埋めれば画面は整いますが、その数字は事実ではなくなります。",
        ],
      },
      FORECAST_VS_ACTUAL,
    ],
  },

  predictions: {
    heading: HEADING,
    intro: [
      "서울시 공식 예측으로 앞으로 가장 붐빌 시간을 확인하고, 명동·홍대·성수의 내일 인구 흐름에 대한 KORETAIL 참고 예상과, 지난 예상이 실제 관측과 얼마나 맞았는지를 함께 보는 화면입니다. 예상은 발표 시점에 기록으로 남기고 나중에 관측과 따로 비교합니다.",
      "This page shows the busiest hour ahead in Seoul's official forecast, KORETAIL's own reference outlook for tomorrow in Myeongdong, Hongdae and Seongsu, and how past outlooks actually compared with what was later observed. An outlook is recorded when it is made, and the observation is compared to it separately afterwards.",
      "本页面通过首尔市官方预测查看未来最拥挤的时段，并展示 KORETAIL 对明洞、弘大、圣水明日人口走势的参考预测，以及过往预测与实际观测的吻合情况。预测在作出时即被记录，之后再与观测分别比较。",
      "ソウル市の公式予測で今後最も混雑する時間を確認し、明洞・弘大・聖水の明日の人口の流れについての KORETAIL の参考予想と、過去の予想が実際の観測とどれだけ一致したかを併せて見る画面です。予想は作成時点で記録として残し、後から観測と別々に比較します。",
    ],
    answers: [
      ["서울시 공식 예측 기준으로 앞으로 가장 붐빌 시간", "The busiest hour ahead, on Seoul's own official forecast", "以首尔市官方预测为准，未来最拥挤的时段", "ソウル市の公式予測を基準とした、今後最も混雑する時間"],
      ["명동·홍대·성수의 내일 인구 흐름 참고 예상", "A reference outlook for tomorrow's population flow in Myeongdong, Hongdae and Seongsu", "明洞、弘大、圣水明日人口走势的参考预测", "明洞・弘大・聖水の明日の人口の流れの参考予想"],
      ["최근 28일 가운데 실제로 기록이 쌓인 날", "Which of the last 28 days actually have observations on record", "最近28天中实际累积了记录的日期", "直近28日のうち実際に記録が蓄積された日"],
      ["지난 예상과 나중에 관측된 값의 비교", "Past outlooks set against what was later observed", "过往预测与之后观测值的比较", "過去の予想と後に観測された値の比較"],
    ],
    sources: ["SEOUL_CITYDATA_PPLTN", "KMA_VILAGE_FCST"],
    faq: [
      {
        question: ["왜 어떤 날은 관측 기록이 없나요?", "Why do some days have no observation on record?", "为什么有些日期没有观测记录？", "なぜ一部の日には観測記録がないのですか？"],
        answer: [
          "수집은 예정된 시각에 시도하지만 실행이 보장되지는 않습니다. 공급 기관의 점검이나 응답 지연, 수집 작업의 지연·누락으로 그 시각의 관측이 남지 않을 수 있습니다. 그런 날은 비워 두고, 최근 28일 가운데 실제로 기록이 쌓인 날이 며칠인지도 함께 보여줍니다. 빠진 값을 앞뒤 값으로 메우지 않습니다.",
          "Collection is attempted on a schedule, but a schedule is not a guarantee of execution. A provider's maintenance window, a slow response, or a delayed or dropped collection run can all leave no observation for that hour. Those days stay blank, and the screen also shows how many of the last 28 days actually have a record. A missing value is never filled in from the values either side of it.",
          "收集按计划时间尝试，但计划并不保证执行。资料提供机构的维护、响应延迟，或收集作业的延迟与遗漏，都可能导致该时刻没有留下观测。此类日期保持空白，页面同时显示最近28天中实际累积了记录的天数。缺失值不会用前后数值补齐。",
          "収集は予定時刻に試みますが、実行が保証されるわけではありません。提供機関のメンテナンスや応答の遅延、収集処理の遅れ・欠落により、その時刻の観測が残らないことがあります。そうした日は空欄のままにし、直近28日のうち実際に記録が蓄積された日数も併せて表示します。欠けた値を前後の値で埋めることはしません。",
        ],
      },
      {
        question: ["KORETAIL의 참고 예상은 서울시 공식 예측과 같은 건가요?", "Is KORETAIL's reference outlook the same as Seoul's official forecast?", "KORETAIL 的参考预测与首尔市官方预测相同吗？", "KORETAIL の参考予想はソウル市の公式予測と同じものですか？"],
        answer: [
          "아니요. 서울시 공식 예측은 서울시가 발표한 값이고, 참고 예상은 KORETAIL이 쌓아 둔 관측 기록에서 계산한 별개의 값입니다. 화면에서 두 값을 구분해 표시하며 서로 섞지 않습니다. 참고 예상을 공식 발표값처럼 인용하지 마세요.",
          "No. Seoul's official forecast is a figure the city publishes; the reference outlook is a separate figure KORETAIL computes from the observations it has accumulated. The two are labelled separately on screen and never blended. Do not cite the reference outlook as though it were an official published figure.",
          "不同。首尔市官方预测是由首尔市发布的数值，参考预测是 KORETAIL 依据自身累积的观测记录计算出的独立数值。页面上二者分开标示，绝不混用。请勿将参考预测当作官方发布值引用。",
          "いいえ。ソウル市の公式予測はソウル市が発表した値であり、参考予想は KORETAIL が蓄積した観測記録から算出した別の値です。画面では両者を区別して表示し、混ぜることはありません。参考予想を公式発表値のように引用しないでください。",
        ],
      },
      {
        question: ["지난 예상과 실제를 어떻게 비교하나요?", "How are past outlooks compared with what actually happened?", "如何将过往预测与实际情况进行比较？", "過去の予想と実際はどのように比較されますか？"],
        answer: [
          "예상은 만들어진 시점에 그대로 기록으로 남기고 나중에 고치지 않습니다. 그 뒤에 관측된 값은 별도의 기록으로 쌓이고, 비교는 두 기록을 나란히 놓는 방식입니다. 결과가 나쁘게 나왔다고 해서 과거 예상을 다시 쓰지 않습니다.",
          "An outlook is recorded exactly as it was made and is never edited afterwards. What is later observed accumulates as a separate record, and the comparison simply places the two side by side. A past outlook is not rewritten because the result turned out poorly.",
          "预测在作出时即被原样记录，之后不再修改。之后观测到的数值作为独立记录累积，比较即是将两份记录并列呈现。不会因为结果不理想而重写过去的预测。",
          "予想は作成された時点のまま記録として残し、後から修正しません。その後に観測された値は別の記録として蓄積され、比較は2つの記録を並べて示す方式です。結果が悪かったからといって過去の予想を書き換えることはありません。",
        ],
      },
    ],
  },

  about: {
    heading: HEADING,
    intro: [
      "KORETAIL이 무엇이고 누구를 위한 것인지, 어떤 공식 자료를 쓰는지, 실시간 관측·공식 예상·과거 실적이 어떻게 다른지를 설명하는 화면입니다.",
      "A page explaining what KORETAIL is and who it is for, which official records it uses, and how live observations, official forecasts and past results differ from one another.",
      "本页面说明 KORETAIL 是什么、面向哪些人、使用哪些官方资料，以及实时观测、官方预测与历史实绩之间的区别。",
      "KORETAIL とは何か、誰のためのものか、どの公式資料を使うのか、リアルタイム観測・公式予想・過去実績がどう異なるのかを説明するページです。",
    ],
    answers: [
      ["KORETAIL이 답하려는 질문과 답하지 않는 질문", "The questions KORETAIL sets out to answer, and the ones it does not", "KORETAIL 试图回答的问题，以及不予回答的问题", "KORETAIL が答えようとする問いと、答えない問い"],
      ["공항·면세점 근무자, 매장 운영자, 관광안내 직원별 사용법", "How airport and duty-free staff, store operators and tourism-desk staff each use it", "机场与免税店员工、门店经营者、旅游咨询人员的不同用法", "空港・免税店スタッフ、店舗運営者、観光案内スタッフそれぞれの使い方"],
      ["실시간 관측·공식 예상·과거 실적의 차이", "The difference between a live observation, an official forecast and a past result", "实时观测、官方预测与历史实绩的区别", "リアルタイム観測・公式予想・過去実績の違い"],
    ],
    sources: ["SEOUL_CITYDATA_PPLTN", "INCHEON_PASSENGER_FORECAST", "KMA_VILAGE_FCST", "KTO_TOURAPI_EVENT"],
    faq: [
      {
        question: ["KORETAIL은 누가 쓰면 좋은가요?", "Who is KORETAIL for?", "哪些人适合使用 KORETAIL？", "KORETAIL は誰が使うとよいですか？"],
        answer: [
          "공항·면세점 근무자는 터미널을 고른 뒤 출국장 예상 승객과 피크 시간, 출발편과 출국장 대기를 함께 보고 근무와 휴게 시간을 준비할 수 있습니다. 서울 매장 운영자는 지역의 현재 인구·카드 활동·날씨·행사를 함께 보고 업종별 점검 목록으로 오픈을 준비할 수 있습니다. 방문객과 관광안내 직원은 갈 지역의 현재 혼잡과 공식 예측, 날씨를 확인할 수 있습니다.",
          "Airport and duty-free staff can pick a terminal and read the departure-hall forecast, its peak hour, departing flights and current queues together when planning shifts and breaks. Seoul store operators can read an area's current population, card activity, weather and events together, and prepare opening with the checklist for their business type. Visitors and tourism-desk staff can check the current crowding, official forecast and weather for the area they are heading to.",
          "机场与免税店员工可选择航站楼，结合出境大厅预计旅客、高峰时段、出发航班与当前等候情况安排班次与休息。首尔门店经营者可同时查看地区当前人口、刷卡活动、天气与活动，并借助所属业态的检查清单准备开门。访客与旅游咨询人员可确认目的地区域当前的拥挤状况、官方预测与天气。",
          "空港・免税店のスタッフは、ターミナルを選んだうえで出国場の予想旅客とピーク時間、出発便と出国場の待機を併せて読み、勤務と休憩の計画に使えます。ソウルの店舗運営者は、エリアの現在の人口・カード活動・天気・イベントを併せて確認し、業種別チェックリストで開店準備ができます。来訪者と観光案内スタッフは、向かうエリアの現在の混雑と公式予測、天気を確認できます。",
        ],
      },
      {
        question: ["KORETAIL이 직접 조사한 자료도 있나요?", "Does KORETAIL collect any data of its own?", "KORETAIL 有自行调查的资料吗？", "KORETAIL が独自に調査した資料もありますか？"],
        answer: [
          "아니요. 표시되는 값은 모두 공공기관이 공개한 자료를 수집해 정리한 것입니다. KORETAIL이 직접 하는 일은 수집 시각을 기록하고, 지역·날짜·터미널 기준을 맞추고, 각 값이 뜻하지 않는 것을 함께 적고, 자료가 없을 때 비워 두는 것입니다.",
          "No. Every figure shown is collected from what public institutions release. What KORETAIL itself does is record when each was retrieved, align them onto a common area, date and terminal basis, write down what each value does not mean, and leave a gap where there is no record.",
          "没有。所示数值均来自对公共机构公开资料的收集与整理。KORETAIL 自身所做的是记录收集时刻、统一地区与日期及航站楼口径、注明各数值不代表什么，并在缺乏资料时留空。",
          "いいえ。表示される値はすべて公的機関が公開した資料を収集して整理したものです。KORETAIL 自身が行うのは、収集時刻を記録し、地域・日付・ターミナルの基準を揃え、各値が意味しないことを併記し、資料がないときは空欄にしておくことです。",
        ],
      },
      FREE_AND_OPEN,
    ],
  },

  more: {
    heading: HEADING,
    intro: [
      "KORETAIL이 쓰는 데이터 출처와 방법론, 각 자료의 접속 조건과 현재 수집 상태, 그리고 이 기기에 저장된 개인 설정을 모아 놓은 화면입니다.",
      "A page gathering KORETAIL's data sources and methodology, the access conditions and current collection status for each record, and the personal settings stored on this device.",
      "本页面汇总 KORETAIL 使用的数据来源与方法论、各项资料的接入条件与当前收集状态，以及保存在本设备上的个人设置。",
      "KORETAIL が使うデータの出典と方法論、各資料の接続条件と現在の収集状況、そしてこの端末に保存された個人設定をまとめたページです。",
    ],
    answers: [
      ["각 자료의 발행 기관과 접속 조건", "The issuing institution and access conditions for each record", "各项资料的发布机构与接入条件", "各資料の発行機関と接続条件"],
      ["현재 갱신이 확인되지 않는 자료와 마지막 성공 시각", "Which records have no confirmed refresh, and when each last succeeded", "当前未确认更新的资料及其最近一次成功时刻", "現在更新が確認できない資料と、その最終成功時刻"],
      ["예측 방법론과 관측·예상·실적의 구분", "The forecasting method, and how observation, outlook and result are kept apart", "预测方法论，以及观测、预测与实绩的区分方式", "予測の方法論と、観測・予想・実績の区別"],
    ],
    sources: activeSourceCatalog.map((row) => row.id),
    faq: [
      {
        question: ["수집이 실패하면 화면에는 무엇이 표시되나요?", "What appears on screen when a collection fails?", "收集失败时页面会显示什么？", "収集に失敗した場合、画面には何が表示されますか？"],
        answer: [
          "마지막으로 성공한 자료와 그 원래 기준시각을 그대로 유지하고, 자료 연결 상태에 어떤 자료의 갱신이 확인되지 않는지와 마지막 성공 시각을 적습니다. 값을 새로 만들어 채우거나 0으로 대체하지 않습니다. 연결이나 응답 시간이 초과되었다는 사실만으로는 공급 기관과 KORETAIL 중 어느 쪽 문제인지 단정하지 않습니다.",
          "The last successful data is kept with its original timestamp, and the data-connection panel names which record has no confirmed refresh and when it last succeeded. No value is invented to fill the gap and none is replaced with a zero. A connection or response timeout on its own is not treated as proof of whether the provider or KORETAIL caused it.",
          "保留最近一次成功的资料及其原始基准时刻，并在资料连接状态中注明哪项资料未确认更新及其最近成功时刻。不会新造数值填补，也不会以0代替。仅凭连接或响应超时，不认定是资料提供机构还是 KORETAIL 的问题。",
          "最後に成功した資料とその元の基準時刻をそのまま保持し、資料の接続状況に、どの資料の更新が確認できないかと最終成功時刻を記します。値を新たに作って埋めたり、0で置き換えたりはしません。接続や応答の時間超過だけでは、提供機関と KORETAIL のどちらの問題かを断定しません。",
        ],
      },
      {
        question: ["개인 설정은 어디에 저장되나요?", "Where are personal settings stored?", "个人设置保存在哪里？", "個人設定はどこに保存されますか？"],
        answer: [
          "역할, 관심지역, 터미널, 업종 같은 설정은 이 기기의 브라우저 저장소에만 보관되고 서버로 전송되지 않습니다. 브라우저 데이터를 지우면 함께 사라지며, 다른 기기로 이어지지 않습니다.",
          "Settings such as your role, area, terminal and business type live only in this device's browser storage and are not transmitted to a server. Clearing your browser data removes them, and they do not follow you to another device.",
          "角色、关注地区、航站楼、业态等设置仅保存在本设备的浏览器存储中，不会传输至服务器。清除浏览器数据后即会消失，也不会同步到其他设备。",
          "役割、関心エリア、ターミナル、業種などの設定はこの端末のブラウザ保存領域にのみ保持され、サーバーには送信されません。ブラウザのデータを消去すると一緒に消え、別の端末には引き継がれません。",
        ],
      },
      {
        question: ["자료는 얼마나 자주 갱신되나요?", "How often is the data refreshed?", "资料多久更新一次？", "資料はどのくらいの頻度で更新されますか？"],
        answer: REFRESH,
      },
    ],
  },

  "tourism-desk": {
    heading: HEADING,
    intro: [
      "관광안내 근무를 시작하기 전에 확인할 것을 한 화면에 모은 시험 운영 페이지입니다. 담당 지역의 공식 혼잡 상태, 날씨, 진행 중인 행사 기간, 대표역 승하차 흐름과 각 자료의 한계를 함께 보여줍니다.",
      "A pilot page that gathers what a tourism-desk shift needs before it starts: the official crowd condition for the area, the weather, which event periods are running, the representative station's flow, and the limits of each source.",
      "这是一个试运行页面，汇总旅游咨询值班开始前需要确认的内容：负责地区的官方拥挤状况、天气、正在进行的活动期间、代表车站的乘降趋势，以及各资料的局限。",
      "観光案内の勤務を始める前に確認することを一画面に集めた試験運用ページです。担当エリアの公式な混雑状況、天気、開催中のイベント期間、代表駅の乗降の流れと、各資料の限界を併せて示します。",
    ],
    answers: [
      ["담당 지역의 현재 공식 혼잡 상태", "The current official crowd condition for the area on duty", "负责地区当前的官方拥挤状况", "担当エリアの現在の公式な混雑状況"],
      ["근무 시간대의 기온·강수확률 예보", "The temperature and rain-probability forecast across the shift", "值班时段的气温与降水概率预报", "勤務時間帯の気温・降水確率の予報"],
      ["기간이 겹치는 공식 행사와 공식 안내 링크", "Official events whose period overlaps, with the official information link", "期间重叠的官方活动及官方指南链接", "期間が重なる公式イベントと公式案内リンク"],
      ["공휴일 여부와 대표역 승하차 흐름", "Whether the day is a public holiday, and the representative station's flow", "当天是否为公休日，以及代表车站的乘降趋势", "当日が祝日かどうかと、代表駅の乗降の流れ"],
    ],
    sources: ["SEOUL_CITYDATA_PPLTN", "KMA_VILAGE_FCST", "KTO_TOURAPI_EVENT", "SEOUL_SUBWAY_RIDERSHIP", "KASI_PUBLIC_HOLIDAYS"],
    faq: [
      {
        question: ["행사 기간에 포함되면 오늘 열린다는 뜻인가요?", "If an event period covers today, does that mean it is running today?", "若活动期间包含今天，是否表示今天开放？", "イベント期間に含まれていれば、今日開催されているという意味ですか？"],
        answer: [
          "아니요. 한국관광공사가 공개하는 것은 행사의 기간·장소·공식 안내이며, 기간 안에 있다는 사실이 그날의 운영을 보장하지 않습니다. 휴관일, 우천 취소, 시간 변경은 별도이므로 안내 전에 공식 링크로 당일 운영 여부를 확인하세요.",
          "No. What the Korea Tourism Organization publishes is the event's period, location and official information; falling inside the period does not guarantee it runs that day. Closing days, rain cancellations and time changes are separate, so check the official link for that day before telling a visitor.",
          "不是。韩国观光公社公开的是活动的期间、地点与官方指南，处于期间内并不保证当天举办。休馆日、雨天取消与时间变更另行规定，因此在向访客说明前，请通过官方链接确认当天的运营情况。",
          "いいえ。韓国観光公社が公開するのはイベントの期間・場所・公式案内であり、期間内であることがその日の開催を保証するものではありません。休館日、雨天中止、時間変更は別なので、案内する前に公式リンクで当日の開催を確認してください。",
        ],
      },
      {
        question: ["이 화면은 정식 서비스인가요?", "Is this page a finished service?", "本页面是正式服务吗？", "この画面は正式なサービスですか？"],
        answer: [
          "시험 운영 화면입니다. 구성과 항목이 바뀔 수 있으며, 현장 안내의 근거 자료로 쓰기 전에 각 값 옆에 적힌 출처와 한계를 함께 확인하세요.",
          "It is a pilot. Its layout and items may change, so read the source and the limitation written beside each value before relying on it as the basis for advice given at the desk.",
          "这是试运行页面。其结构与项目可能变更，在将其作为现场咨询的依据资料使用前，请一并确认各数值旁标注的出处与局限。",
          "試験運用の画面です。構成や項目が変わる可能性があるため、現場での案内の根拠として使う前に、各値の横に記載された出典と限界を併せて確認してください。",
        ],
      },
    ],
  },
};

/**
 * The evergreen brief for one page.
 *
 * Every indexable route resolves to a brief: `standaloneSeoSlugs`, the three
 * area pages, the tourism desk, and the locale home. There is no fallback to
 * an empty object, because a page with no brief is a page back at 318
 * characters, and `tests/page-brief.test.mjs` fails if one appears.
 */
export function pageBrief(slug?: SeoSlug, area: BriefArea = "myeongdong"): PageBrief {
  if (!slug) return BRIEFS.home;
  if (slug in areaNames) return areaBrief(slug as BriefArea);
  if (slug === "tourism-desk") return withTourismArea(BRIEFS["tourism-desk"], area);
  return BRIEFS[slug];
}

/** Names the area a guide-desk brief is actually for, rather than leaving it generic. */
function withTourismArea(brief: PageBrief, area: BriefArea): PageBrief {
  const names = areaNames[area];
  const prefix: Words = [`${names.ko} · `, `${names.en} · `, `${names.zh} · `, `${names.ja} · `];
  return { ...brief, intro: brief.intro.map((text, index) => prefix[index] + text) as Words };
}

/**
 * The page's visible Q&A, repeated as `FAQPage` JSON-LD.
 *
 * An honest note on what this is worth, because it is easy to oversell:
 * Google retired FAQ rich results for all sites on 2026-05-07, so this earns
 * no enhanced Google SERP listing and nobody should report that it will.
 * What it does earn is a machine-readable question-to-answer mapping that
 * does not depend on a parser inferring structure from headings — which is
 * what a non-Google answer engine, Bing and Naver's tooling actually read.
 * It costs roughly one kilobyte of JSON on a page that already ships the same
 * sentences as visible text.
 *
 * It is generated from `pageBrief`, the same object `app/page-brief.tsx`
 * renders. That is the safeguard that matters: structured data claiming a Q&A
 * the page does not display is the classic route to a manual action, and the
 * usual cause is a hand-maintained second copy. There is no second copy here,
 * and `tests/page-brief.test.mjs` fails if the rendered text and the JSON-LD
 * ever stop matching.
 */
export function faqStructuredData(locale: Lang, slug?: SeoSlug, area: BriefArea = "myeongdong"): Record<string, unknown> | null {
  const { faq } = pageBrief(slug, area);
  if (faq.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale === "ko" ? "ko-KR" : locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en",
    mainEntity: faq.map((entry) => ({
      "@type": "Question",
      name: localize(locale, entry.question),
      acceptedAnswer: { "@type": "Answer", text: localize(locale, entry.answer) },
    })),
  };
}
