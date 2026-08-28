"use client";
/* eslint-disable @next/next/no-img-element -- Prototype preserves user-provided editorial assets directly; production optimization is specified in the handoff. */

import { useEffect, useMemo, useState } from "react";
import {
  airportAnnual,
  airportMonthly,
  airportValue,
  demoFlights,
  foreignJulyDetail,
  foreignMonthly,
  formatCount,
  monthDays,
  sourceCatalog,
  type AirportDirection,
  type Lang,
  type Terminal,
} from "./retailpulse-data";
import { pageDescription, pageTitle, seoLocales, seoSlugs, siteOrigin, type SeoSlug } from "./seo-config";
import LiveSignals from "./live-signals";
import { classifyDemoDemand } from "../lib/demand-index";

const betaSignupEnabled = process.env.NEXT_PUBLIC_ENABLE_BETA_SIGNUP === "true";

type View = "today" | "forecast" | "airport" | "business" | "more";
type AirportSection = "now" | "next" | "flights" | "history" | "airlines";
type Day = "today" | "tomorrow";
type AreaId = "myeongdong" | "hongdae" | "seongsu";
type IndustryId = "beauty" | "fashion" | "food" | "convenience" | "popup" | "tourism";

const areaInfo = {
  myeongdong: { en: "MYEONGDONG", ko: "명동", zh: "明洞", ja: "明洞", best: "14:00 — 18:00" },
  hongdae: { en: "HONGDAE", ko: "홍대", zh: "弘大", ja: "弘大", best: "16:00 — 21:00" },
  seongsu: { en: "SEONGSU", ko: "성수", zh: "圣水", ja: "聖水", best: "12:00 — 16:00" },
};

const scores: Record<Day, Record<AreaId, number>> = {
  today: { myeongdong: 82, hongdae: 77, seongsu: 71 },
  tomorrow: { myeongdong: 86, hongdae: 74, seongsu: 69 },
};

const demoDemandCohort = Object.values(scores).flatMap((period) => Object.values(period));

const forecast = {
  myeongdong: [82, 86, 78, 74, 88, 91, 94],
  hongdae: [77, 74, 81, 83, 85, 90, 92],
  seongsu: [71, 69, 73, 76, 82, 86, 84],
};

const dates = {
  ko: { today: "예시 오늘", tomorrow: "예시 내일" },
  en: { today: "SAMPLE TODAY", tomorrow: "SAMPLE TOMORROW" },
  zh: { today: "示例今天", tomorrow: "示例明天" },
  ja: { today: "サンプル今日", tomorrow: "サンプル明日" },
};

const copy = {
  ko: {
    hero: "내일 서울은\n어디가 좋을까요?",
    sub: "공항·외국인 체류·날씨를 함께 읽어 서울 상권의 외국인 쇼핑수요 신호를 보여줍니다.",
    areaPulse: "지역 펄스",
    foreignPulse: "외국인 쇼핑 펄스",
    bestTime: "추천 시간",
    why: "왜 이렇게 봤나요?",
    know: "알아두면 좋아요",
    detail: "자세히",
    demo: "데모 데이터",
    sample: "예시 데이터",
    high: "높음",
    good: "양호",
    moderate: "보통",
    today: "오늘",
    tomorrow: "내일",
    forecast: "인사이트",
    airport: "공항",
    business: "매장",
    more: "더보기",
    airportTitle: "인천공항 출국 펄스",
    airportSub: "서울 수요보다 공항 흐름을 먼저 확인하세요.",
    moderatelyBusy: "다소 혼잡",
    busiest: "가장 혼잡",
    quieter: "비교적 여유",
    search: "항공편·도시 검색",
    searchHint: "예: KE703, Tokyo, Shanghai",
    departures: "출발",
    arrivals: "도착",
    allTerminals: "전체 터미널",
    noFlights: "조건에 맞는 항공편이 없습니다.",
    noFlightsSub: "항공편명이나 도시를 다시 확인해 주세요.",
    onTime: "정상",
    delayed: "지연",
    cancelled: "결항",
    forecastConfidence: "예측 검증",
    bestDay: "가장 강한 날",
    compare: "지역 비교",
    pro: "KORETAIL Pro 미리보기",
    proSub: "더 긴 예측과 상세 근거를 한곳에서.",
    openPreview: "미리보기 열기",
    close: "닫기",
    layers: "서울은 매일 다르게 움직입니다.",
    layersSub: "전통, 쇼핑, 이동과 사람이 한 도시 안에서 동시에 흐릅니다.",
    demoNote: "표시된 수치는 제품 구조 검증을 위한 예시이며 실시간 정보가 아닙니다.",
    kst: "모든 시간은 한국 표준시(KST)입니다.",
    areaTip: "오전이 상대적으로 여유롭고, 14시 이후 쇼핑수요가 높아질 전망입니다.",
    sourceDelay: "일부 데이터가 지연되어 예측 신뢰도가 낮아질 수 있습니다.",
    stateLab: "오류 화면 미리보기",
    handoff: "Production 구현 명세 보기",
  },
  en: {
    hero: "Where should you go\nin Seoul tomorrow?",
    sub: "Read airport, foreign-presence and weather signals together to understand Seoul's foreign shopping demand.",
    areaPulse: "Area pulse",
    foreignPulse: "Foreign shopping pulse",
    bestTime: "Best time",
    why: "Why this forecast?",
    know: "Good to know",
    detail: "Details",
    demo: "Demo data",
    sample: "Sample data",
    high: "High",
    good: "Good",
    moderate: "Moderate",
    today: "Today",
    tomorrow: "Tomorrow",
    forecast: "Insights",
    airport: "Airport",
    business: "Business",
    more: "More",
    airportTitle: "Incheon departure pulse",
    airportSub: "Check the airport flow before it reaches Seoul.",
    moderatelyBusy: "Moderately busy",
    busiest: "Busiest",
    quieter: "Quieter",
    search: "Search flights or cities",
    searchHint: "Try KE703, Tokyo, Shanghai",
    departures: "Departures",
    arrivals: "Arrivals",
    allTerminals: "All terminals",
    noFlights: "No flights match your search.",
    noFlightsSub: "Check the flight number or city and try again.",
    onTime: "On time",
    delayed: "Delayed",
    cancelled: "Cancelled",
    forecastConfidence: "Forecast validation",
    bestDay: "Best day",
    compare: "Area comparison",
    pro: "KORETAIL Pro preview",
    proSub: "Longer forecasts and deeper signals in one place.",
    openPreview: "Open preview",
    close: "Close",
    layers: "Seoul moves differently every day.",
    layersSub: "Tradition, shopping, movement and people — all moving at once.",
    demoNote: "Values shown are sample data for product testing, not live information.",
    kst: "All times are Korea Standard Time (KST).",
    areaTip: "Mornings look calmer, with shopping demand expected to rise after 14:00.",
    sourceDelay: "A delayed source may reduce forecast confidence.",
    stateLab: "Error state preview",
    handoff: "View production handoff",
  },
  zh: {
    hero: "明天去首尔哪里\n比较好？",
    sub: "综合机场、外国人停留与天气信号，判断首尔商圈的外国游客购物需求。",
    areaPulse: "地区指数",
    foreignPulse: "外国游客购物指数",
    bestTime: "推荐时间",
    why: "为什么这样预测？",
    know: "出发前提示",
    detail: "详情",
    demo: "演示数据",
    sample: "示例数据",
    high: "较高",
    good: "良好",
    moderate: "一般",
    today: "今天",
    tomorrow: "明天",
    forecast: "洞察",
    airport: "机场",
    business: "商家",
    more: "更多",
    airportTitle: "仁川机场出境指数",
    airportSub: "先查看机场客流，再判断首尔需求。",
    moderatelyBusy: "较为拥挤",
    busiest: "最拥挤",
    quieter: "相对宽松",
    search: "搜索航班或城市",
    searchHint: "例如 KE703、东京、上海",
    departures: "出发",
    arrivals: "到达",
    allTerminals: "全部航站楼",
    noFlights: "没有符合条件的航班。",
    noFlightsSub: "请确认航班号或城市后重试。",
    onTime: "准点",
    delayed: "延误",
    cancelled: "取消",
    forecastConfidence: "预测验证",
    bestDay: "最佳日期",
    compare: "地区比较",
    pro: "KORETAIL Pro 预览",
    proSub: "更长周期预测与更详细的信号。",
    openPreview: "打开预览",
    close: "关闭",
    layers: "首尔每天都以不同方式流动。",
    layersSub: "传统、购物、移动与人群在同一座城市中同时变化。",
    demoNote: "当前数值仅用于产品测试，并非实时信息。",
    kst: "所有时间均为韩国标准时间（KST）。",
    areaTip: "上午相对宽松，预计14点以后购物需求上升。",
    sourceDelay: "部分数据延迟，可能会降低预测可信度。",
    stateLab: "错误状态预览",
    handoff: "查看生产实现说明",
  },
  ja: {
    hero: "明日のソウル、\nどこへ行く？",
    sub: "空港・外国人滞在・天気のシグナルを合わせ、ソウル商圏の外国人ショッピング需要を読みます。",
    areaPulse: "エリア指数",
    foreignPulse: "外国人ショッピング需要",
    bestTime: "おすすめの時間帯",
    why: "この数値の理由",
    know: "知っておきたいこと",
    detail: "詳細",
    demo: "デモデータ",
    sample: "サンプルデータ",
    high: "高め",
    good: "良好",
    moderate: "標準",
    today: "今日",
    tomorrow: "明日",
    forecast: "インサイト",
    airport: "空港",
    business: "ビジネス",
    more: "その他",
    airportTitle: "仁川空港 出発需要",
    airportSub: "ソウルへ向かう人の流れを、空港から先に確認できます。",
    moderatelyBusy: "やや混雑",
    busiest: "混雑ピーク",
    quieter: "比較的空いている時間",
    search: "便名・都市を検索",
    searchHint: "例：KE703、Tokyo、Shanghai",
    departures: "出発",
    arrivals: "到着",
    allTerminals: "全ターミナル",
    noFlights: "条件に合う便がありません。",
    noFlightsSub: "便名や都市名を確認して、もう一度お試しください。",
    onTime: "定刻",
    delayed: "遅延",
    cancelled: "欠航",
    forecastConfidence: "予測検証",
    bestDay: "最も強い日",
    compare: "エリア比較",
    pro: "KORETAIL Pro プレビュー",
    proSub: "より長い予測と詳しい根拠をひとつに。",
    openPreview: "プレビューを見る",
    close: "閉じる",
    layers: "ソウルの流れは、毎日少しずつ変わります。",
    layersSub: "伝統、買い物、人の移動がひとつの都市で同時に動いています。",
    demoNote: "表示値は製品検証用のサンプルで、リアルタイム情報ではありません。",
    kst: "時刻はすべて韓国標準時（KST）です。",
    areaTip: "午前は比較的落ち着き、14時以降に買い物需要が高まる見込みです。",
    sourceDelay: "一部データの遅延により、予測信頼度が下がる場合があります。",
    stateLab: "エラー画面プレビュー",
    handoff: "Production実装仕様を見る",
  },
};

function localText(lang: Lang, values: Record<Lang, string>) {
  return values[lang];
}

function areaLocalName(id: AreaId, lang: Lang) {
  const area = areaInfo[id];
  return lang === "en" ? area.en : area[lang];
}

function airlineLocalName(flight: typeof demoFlights[number], lang: Lang) {
  if (lang === "ko") return flight.airlineKo;
  if (lang === "ja") return flight.airlineJa;
  return flight.airlineEn;
}

const sourceUseJa: Record<string, string> = {
  "INCHEON AIRPORT FORECAST": "D+1/D+2旅客予測・時間帯別混雑",
  "INCHEON AIRPORT STATISTICS": "公式の月次・年次・ターミナル・航空会社実績",
  "INCHEON AIRPORT FLIGHTS": "運航・便名・ターミナル・搭乗口・運航状況",
  "INCHEON DEPARTURE HALL CONGESTION": "出国審査場1〜6・東西側の待機人数（T1のみ）",
  "INCHEON ARRIVAL HALL STATUS": "入国場・到着便・搭乗口・内外国人の待機人数",
  "INCHEON DUTY-FREE FACILITIES": "免税店・運営会社・営業時間・搭乗口付近の位置（店舗混雑ではない）",
  "SEOUL FOREIGN LIVING POPULATION": "短期滞在外国人の生活人口",
  "KMA WEATHER": "短期予報・過去の観測",
  "KTO / TOURAPI": "観光需要・訪問・イベント・多言語スポット",
  "SEOUL REAL-TIME CITY DATA": "都市活動・混雑・交通シグナル",
  "SEOUL × KT LIVING MOVEMENT": "買い物・観光目的の生活移動",
  "NAVER DATALAB": "検索・ショッピングクリックの相対指数（売上ではない）",
  "BANK OF KOREA ECOS": "為替・マクロ補助シグナル",
  "KASI SPECIAL DAYS": "祝日・特別日",
  "SEOUL SUBWAY": "関連駅の乗降数（外国人数ではない）",
  "SEOUL COMMERCIAL SALES": "商圏の基礎規模・季節性（外国人消費ではない）",
  "SKT GEOVISION PUZZLE": "流動・移動の交差検証候補",
  "KT PLIP / BIGSIGHT": "別途契約が必要な移動データ候補",
};

const readinessSources: {
  label: Record<Lang, string>;
  state: Record<Lang, string>;
  tone: "ok" | "warn" | "off";
}[] = [
  {
    label: { ko: "인천공항 월별 실적", en: "Airport monthly history", zh: "机场月度实绩", ja: "空港月次実績" },
    state: { ko: "공식 과거값 사용 중", en: "OFFICIAL HISTORY BUNDLED", zh: "已内置官方历史", ja: "公式履歴を内蔵" },
    tone: "ok",
  },
  {
    label: { ko: "외국인 생활인구 월별", en: "Foreign-population history", zh: "外国人生活人口月度", ja: "外国人生活人口の月次履歴" },
    state: { ko: "공식 과거값 사용 중", en: "OFFICIAL HISTORY BUNDLED", zh: "已内置官方历史", ja: "公式履歴を内蔵" },
    tone: "ok",
  },
  {
    label: { ko: "공항 실시간·항공편", en: "Airport live feeds and flights", zh: "机场实时与航班", ja: "空港Live・フライト" },
    state: { ko: "미연결 · 활용신청 필요", en: "NOT CONNECTED · APPLICATIONS REQUIRED", zh: "未接入 · 需要申请", ja: "未接続・利用申請が必要" },
    tone: "off",
  },
  {
    label: { ko: "기상·서울 실시간", en: "Weather and Seoul live data", zh: "天气与首尔实时数据", ja: "天気・ソウルLiveデータ" },
    state: { ko: "미연결 · 키 필요", en: "NOT CONNECTED · KEY REQUIRED", zh: "未接入 · 需要密钥", ja: "未接続・キーが必要" },
    tone: "off",
  },
];

const industryProfiles: Record<IndustryId, {
  label: Record<Lang, string>;
  short: string;
  adjustment: number;
  best: string;
  headline: Record<Lang, string>;
  actions: Record<Lang, [string, string][]>;
}> = {
  beauty: {
    label: { ko: "뷰티·화장품", en: "Beauty & cosmetics", zh: "美妆·化妆品", ja: "ビューティー・化粧品" }, short: "BEAUTY", adjustment: 0, best: "14:00 — 18:00",
    headline: { ko: "중문 응대와 오후 핵심 재고를 먼저 준비하세요.", en: "Prepare language coverage and afternoon hero stock first.", zh: "优先准备中文接待与下午核心库存。", ja: "多言語での接客と午後の主力在庫を先に整えておきましょう。" },
    actions: {
      ko: [["인력", "중문·영문 응대 인력을 13:30 전 전진 배치"], ["재고", "선케어·마스크팩·미니세트 오후 판매분 점검"], ["프로모션", "약한 비에 맞춘 실내 체류형 묶음 제안 준비"]],
      en: [["STAFF", "Place English/Chinese coverage before 13:30"], ["STOCK", "Check afternoon stock for sun care, masks and mini sets"], ["OFFER", "Prepare an indoor bundle for the light-rain window"]],
      zh: [["人员", "13:30前安排中文与英文接待人员"], ["库存", "检查防晒、面膜与旅行装的下午库存"], ["促销", "针对小雨时段准备室内组合优惠"]],
      ja: [["スタッフ", "13:30までに多言語対応の配置を確認"], ["在庫", "日焼け止め・マスク・ミニセットの午後在庫を確認"], ["販促", "小雨の時間帯に合う店内セット提案を準備"]],
    },
  },
  fashion: {
    label: { ko: "패션·잡화", en: "Fashion & goods", zh: "时尚·杂货", ja: "ファッション・雑貨" }, short: "FASHION", adjustment: -2, best: "15:00 — 20:00",
    headline: { ko: "오후 피팅 수요와 인기 사이즈 회전을 대비하세요.", en: "Plan for afternoon fittings and faster size turnover.", zh: "为下午试穿与热门尺码周转做准备。", ja: "午後の試着需要と人気サイズの回転に備えましょう。" },
    actions: {
      ko: [["인력", "15시부터 피팅·결제 동선을 분리 운영"], ["재고", "인기 사이즈와 가벼운 우천 대응 상품 전면 배치"], ["콘텐츠", "가격·사이즈 안내를 영문·중문으로 함께 노출"]],
      en: [["STAFF", "Separate fitting and checkout flow from 15:00"], ["STOCK", "Front-load popular sizes and light-rain items"], ["CONTENT", "Show price and sizing guidance in English and Chinese"]],
      zh: [["人员", "15点起分开试衣与结账动线"], ["库存", "前置热门尺码与轻雨适用商品"], ["内容", "同时展示英文与中文价格、尺码说明"]],
      ja: [["スタッフ", "15時から試着と会計の導線を分ける"], ["在庫", "人気サイズと小雨向け商品を前面に配置"], ["案内", "価格・サイズ案内を多言語で表示"]],
    },
  },
  food: {
    label: { ko: "식음료·카페", en: "Food & café", zh: "餐饮·咖啡", ja: "飲食・カフェ" }, short: "F&B", adjustment: -4, best: "12:00 — 15:00",
    headline: { ko: "점심 직후 외국인 주문 피크에 맞춰 회전율을 높이세요.", en: "Tune service for a post-lunch international visitor peak.", zh: "围绕午餐后的外国游客高峰提高周转。", ja: "昼食後の外国人注文ピークに合わせて回転を整えましょう。" },
    actions: {
      ko: [["인력", "11:30 전 주문·픽업 역할을 분리"], ["메뉴", "사진형 다국어 베스트 메뉴를 첫 화면에 배치"], ["운영", "우천 시 대기 동선과 포장 주문 위치를 구분"]],
      en: [["STAFF", "Split order and pickup roles before 11:30"], ["MENU", "Lead with a visual multilingual best-seller menu"], ["FLOW", "Separate rainy-day queues from takeaway pickup"]],
      zh: [["人员", "11:30前分开点单与取餐岗位"], ["菜单", "首屏展示带图片的多语种人气菜单"], ["动线", "雨天排队与外带取餐分流"]],
      ja: [["スタッフ", "11:30までに注文と受取の役割を分ける"], ["メニュー", "写真付きの多言語人気メニューを最初に表示"], ["導線", "雨天の待機列とテイクアウト受取を分ける"]],
    },
  },
  convenience: {
    label: { ko: "편의·약국", en: "Convenience & pharmacy", zh: "便利店·药店", ja: "コンビニ・薬局" }, short: "ESSENTIALS", adjustment: -1, best: "13:00 — 19:00",
    headline: { ko: "관광객 필수품과 간편 결제 안내를 눈에 띄게 준비하세요.", en: "Make travel essentials and payment guidance easy to spot.", zh: "突出展示游客必需品与支付说明。", ja: "旅行必需品と決済案内を見つけやすく整えましょう。" },
    actions: {
      ko: [["재고", "우산·보조배터리·상비품 안전재고 점검"], ["진열", "여행용 소용량 제품을 동선 전면에 배치"], ["안내", "면세·결제 가능 수단을 다국어로 명확히 표시"]],
      en: [["STOCK", "Check safety stock for umbrellas, batteries and basics"], ["DISPLAY", "Place travel-size essentials on the main path"], ["GUIDE", "Explain tax-free and payment options in key languages"]],
      zh: [["库存", "检查雨伞、充电宝与常备用品安全库存"], ["陈列", "将旅行装必需品放在主要动线"], ["说明", "清楚标注退税与可用支付方式"]],
      ja: [["在庫", "傘・モバイルバッテリー・常備品の安全在庫を確認"], ["陳列", "旅行用の小容量商品を主要導線に配置"], ["案内", "免税と利用可能な決済方法を多言語で明記"]],
    },
  },
  popup: {
    label: { ko: "팝업·체험", en: "Pop-up & experience", zh: "快闪·体验", ja: "ポップアップ・体験" }, short: "POP-UP", adjustment: 2, best: "13:00 — 18:00",
    headline: { ko: "오후 방문 집중 전에 예약·현장 대기 기준을 나누세요.", en: "Separate bookings and walk-ins before the afternoon rush.", zh: "在下午高峰前分开预约与现场排队。", ja: "午後の集中前に予約客と当日客の待機基準を分けましょう。" },
    actions: {
      ko: [["인력", "12:30 전 입장·안내·구매 역할을 분리"], ["대기", "다국어 대기시간과 마감 기준을 입구에 표시"], ["콘텐츠", "사진 촬영 구간과 구매 동선을 충돌 없이 분리"]],
      en: [["STAFF", "Split entry, guidance and sales roles before 12:30"], ["QUEUE", "Post multilingual wait and cutoff guidance"], ["FLOW", "Keep photo moments separate from purchase flow"]],
      zh: [["人员", "12:30前分开入场、引导与购买岗位"], ["排队", "入口展示多语种等待时间与截止规则"], ["动线", "分开拍照区与购买动线"]],
      ja: [["スタッフ", "12:30までに入場・案内・販売の役割を分ける"], ["待機", "入口に多言語の待ち時間と受付終了基準を表示"], ["導線", "撮影エリアと購入導線を分ける"]],
    },
  },
  tourism: {
    label: { ko: "관광·숙박", en: "Tourism & stay", zh: "旅游·住宿", ja: "観光・宿泊" }, short: "TOURISM", adjustment: 1, best: "09:00 — 12:00",
    headline: { ko: "입국 흐름에 맞춰 조기 짐보관과 쇼핑 동선을 제안하세요.", en: "Match early bag-drop and shopping guidance to arrival flow.", zh: "根据入境客流提供提前寄存与购物路线。", ja: "到着の流れに合わせて荷物預かりと買い物ルートを案内しましょう。" },
    actions: {
      ko: [["프런트", "오전 입국객용 짐보관·체크인 안내를 사전 준비"], ["추천", "날씨와 혼잡을 반영한 명동·홍대·성수 동선 제안"], ["메시지", "도착 전 발송할 다국어 교통·체크인 안내 점검"]],
      en: [["FRONT", "Prepare bag-drop and check-in guidance for arrivals"], ["ROUTE", "Suggest area routes using weather and crowd signals"], ["MESSAGE", "Review pre-arrival transit and check-in guidance"]],
      zh: [["前台", "为上午入境客准备寄存与入住说明"], ["推荐", "结合天气与拥挤度推荐区域路线"], ["消息", "检查抵达前发送的多语种交通与入住说明"]],
      ja: [["フロント", "午前到着客向けの荷物預かり・チェックイン案内を準備"], ["提案", "天気と混雑を踏まえたエリアルートを案内"], ["連絡", "到着前の交通・チェックイン案内を確認"]],
    },
  },
};

function statusLabel(lang: Lang, score: number) {
  const level = classifyDemoDemand(score, demoDemandCohort);
  const labels: Record<typeof level, Record<Lang, string>> = {
    low: { ko: "낮음", en: "Low", zh: "较低", ja: "低め" },
    normal: { ko: "보통", en: "Normal", zh: "一般", ja: "普通" },
    high: { ko: "높음", en: "High", zh: "较高", ja: "高め" },
  };
  return labels[level][lang];
}

function Icon({ name }: { name: View }) {
  const paths: Record<View, React.ReactNode> = {
    today: <><circle cx="12" cy="12" r="7" /><path d="M12 9v6M9 12h6" /></>,
    forecast: <><path d="M4 17l5-5 3 2 7-7" /><path d="M16 7h3v3" /></>,
    airport: <><path d="M4 14l7-3V5a1 1 0 012 0v6l7 3v2l-7-1v3l2 1v1l-3-1-3 1v-1l2-1v-3l-7 1z" /></>,
    business: <><path d="M4 20V8h16v12M8 8V4h8v4M8 12h2M14 12h2M8 16h2M14 16h2" /></>,
    more: <><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function DemoLabel({ lang, sample = false }: { lang: Lang; sample?: boolean }) {
  return <span className="demo-label">{sample ? copy[lang].sample : copy[lang].demo}</span>;
}

function MonthRangePicker({
  lang, start, end, min, max, onStart, onEnd, onApply, onCancel,
}: {
  lang: Lang; start: string; end: string; min: string; max: string;
  onStart: (value: string) => void; onEnd: (value: string) => void;
  onApply: (start: string, end: string) => void; onCancel: () => void;
}) {
  const monthChoices: string[] = [];
  let cursor = min;
  while (cursor <= max && monthChoices.length < 240) {
    monthChoices.push(cursor);
    const [year, month] = cursor.split("-").map(Number);
    cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  }
  const monthLabel = (value: string) => {
    const [year, month] = value.split("-");
    if (lang === "ko") return `${year}년 ${Number(month)}월`;
    if (lang === "zh") return `${year}年${Number(month)}月`;
    if (lang === "ja") return `${year}年${Number(month)}月`;
    return `${year}.${month}`;
  };
  const invalid = !start || !end || start > end || start < min || end > max;
  return <form className="month-range-picker" onSubmit={(event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextStart = String(formData.get("startMonth") ?? "");
    const nextEnd = String(formData.get("endMonth") ?? "");
    const submittedInvalid = !nextStart || !nextEnd || nextStart > nextEnd || nextStart < min || nextEnd > max;
    if (!submittedInvalid) onApply(nextStart, nextEnd);
  }}>
    <div className="month-range-copy">
      <p className="eyebrow">CUSTOM MONTH RANGE · OFFICIAL HISTORICAL</p>
      <h3>{localText(lang, { ko: "상세 기간 설정", en: "SET A CUSTOM PERIOD", zh: "设置自定义期间", ja: "期間を指定" })}</h3>
      <p>{localText(lang, {
        ko: "사이트에 확보된 공식 월별 데이터 안에서 시작월과 종료월을 선택하세요. 선택 결과는 요약·차트·표·T1/T2 비교에 함께 적용됩니다.",
        en: "Choose a start and end month within the official monthly data held in this site. The range applies to summaries, charts, tables and T1/T2 comparisons.",
        zh: "请在本站已收录的官方月度数据范围内选择开始月和结束月。该期间会同步应用于摘要、图表、表格及T1/T2比较。",
        ja: "このサイトに収録された公式月次データの範囲内で開始月と終了月を選択してください。集計・グラフ・表・T1/T2比較に反映されます。",
      })}</p>
    </div>
    <div className="month-range-fields">
      <label><span>{localText(lang, { ko: "시작월", en: "START MONTH", zh: "开始月", ja: "開始月" })}</span><select name="startMonth" aria-label={localText(lang, { ko: "시작월", en: "Start month", zh: "开始月", ja: "開始月" })} value={start} onChange={(event) => onStart(event.target.value)}>{monthChoices.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
      <span aria-hidden="true">→</span>
      <label><span>{localText(lang, { ko: "종료월", en: "END MONTH", zh: "结束月", ja: "終了月" })}</span><select name="endMonth" aria-label={localText(lang, { ko: "종료월", en: "End month", zh: "结束月", ja: "終了月" })} value={end} onChange={(event) => onEnd(event.target.value)}>{monthChoices.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
    </div>
    {invalid && <p className="month-range-error" role="alert">{localText(lang, { ko: "선택 가능 범위 안에서 종료월을 시작월과 같거나 뒤로 선택하세요.", en: "Choose an end month on or after the start month within the available range.", zh: "请在可选范围内选择不早于开始月的结束月。", ja: "選択可能範囲内で、終了月を開始月以降に設定してください。" })}</p>}
    <div className="month-range-actions">
      <button type="button" onClick={onCancel}>{localText(lang, { ko: "취소", en: "CANCEL", zh: "取消", ja: "キャンセル" })}</button>
      <button type="submit" className="primary" disabled={invalid}>{localText(lang, { ko: "이 기간 보기", en: "VIEW THIS PERIOD", zh: "查看该期间", ja: "この期間を見る" })}</button>
    </div>
    <small className="month-range-coverage">{localText(lang, { ko: "선택 가능", en: "AVAILABLE", zh: "可选范围", ja: "選択可能" })} · {min} — {max}</small>
  </form>;
}

function HomeRankings({ lang, selected, onSelect }: { lang: Lang; selected: AreaId; onSelect: (day: Day, area: AreaId) => void }) {
  const t = copy[lang];
  return <section className="command-rankings" id="area-compare" aria-labelledby="command-ranking-title">
    <div className="section-head"><div><p className="eyebrow">TODAY + TOMORROW · KST</p><h2 id="command-ranking-title">{localText(lang, { ko: "서울 지역 비교", en: "SEOUL AREA PULSE", zh: "首尔地区比较", ja: "ソウルのエリア比較" })}</h2></div><DemoLabel lang={lang} /></div>
    <p className="section-intro">{localText(lang, {
      ko: "예시 수요지수는 화면 구조를 시험하는 0~100 샘플값입니다. 확률이나 실시간 수요가 아니며, 같은 예시값 분포 안에서 낮음·보통·높음으로 나눕니다.",
      en: "The Demo Demand Index is a 0–100 sample used to test the interface. It is not a probability or live demand; Low, Normal and High are relative to this sample cohort.",
      zh: "演示需求指数是用于验证界面的0–100示例值，并非概率或实时需求；低、一般、较高仅表示该组示例值中的相对位置。",
      ja: "デモ需要指数は画面検証用の0〜100サンプル値です。確率やリアルタイム需要ではなく、低め・普通・高めは同じサンプル内での相対区分です。",
    })}</p>
    <details className="index-method" suppressHydrationWarning><summary>{localText(lang, { ko: "지수 기준 보기", en: "How the sample bands work", zh: "查看指数标准", ja: "指数の基準を見る" })}</summary><p>{localText(lang, { ko: "오늘·내일에 표시된 여섯 예시값의 아래 1/3은 낮음, 가운데 1/3은 보통, 위 1/3은 높음입니다. 실제 모델이 검증되면 공식 신호 기반 기준으로 교체됩니다.", en: "The lower, middle and upper thirds of the six displayed sample values are labelled Low, Normal and High. A verified official-signal model will replace this sample method.", zh: "当前六个示例值按下、中、上三分位标为较低、一般、较高。模型验证后将改用官方信号标准。", ja: "表示中の6つのサンプル値を下位・中位・上位の3分の1に分けています。検証済みモデル完成後は公式シグナル基準に置き換えます。" })}</p></details>
    <div className="ranking-pair">
      {(["today", "tomorrow"] as Day[]).map((period) => {
        const ordered = (Object.keys(areaInfo) as AreaId[]).sort((a, b) => scores[period][b] - scores[period][a]);
        return <section className="compact-ranking" key={period} aria-label={period}>
          <div className="compact-ranking-head"><p>{period === "today" ? t.today.toUpperCase() : t.tomorrow.toUpperCase()}</p><span>{dates[lang][period]}</span></div>
          {ordered.map((id, index) => <button key={id} className={selected === id ? "selected" : ""} onClick={() => onSelect(period, id)}>
            <span>0{index + 1}</span><strong>{areaInfo[id].en}<small>{areaLocalName(id, lang)}</small></strong><b><small>{localText(lang, { ko: "예시 수요지수", en: "DEMO INDEX", zh: "演示指数", ja: "デモ指数" })}</small>{scores[period][id]} · {statusLabel(lang, scores[period][id])}</b><i>{localText(lang, { ko: "예시 추천", en: "SAMPLE TIME", zh: "示例推荐", ja: "サンプル時間" })} {areaInfo[id].best.replace(" — ", "–")}</i>
          </button>)}
        </section>;
      })}
    </div>
  </section>;
}

function HomeAirportNow({ lang, onOpen }: { lang: Lang; onOpen: (section: AirportSection, terminal?: Terminal) => void }) {
  return <section className="home-airport" aria-labelledby="home-airport-title">
    <div className="section-head"><div><p className="eyebrow">AIRPORT PRESSURE · UNAVAILABLE</p><h2 id="home-airport-title">{localText(lang, { ko: "인천공항 운항 집중", en: "INCHEON AIRPORT PRESSURE", zh: "仁川机场航班集中度", ja: "仁川空港の運航集中" })}</h2></div><button className="text-link" onClick={() => onOpen("now")}>{localText(lang, { ko: "공항 자세히", en: "OPEN AIRPORT", zh: "查看机场", ja: "空港を見る" })} ↗</button></div>
    <div className="airport-unavailable" role="status">
      <strong>{localText(lang, { ko: "실시간 공항 데이터 연결 준비 중", en: "Live airport data is being prepared", zh: "实时机场数据正在准备接入", ja: "空港リアルタイムデータを準備中" })}</strong>
      <p>{localText(lang, { ko: "공식 운항·게이트 인증 전에는 사람 수나 게이트 혼잡을 추정해 표시하지 않습니다. 공식 월별 실적은 공항의 ‘과거’에서 볼 수 있습니다.", en: "We do not estimate people counts or gate pressure before official flight and gate authentication. Official monthly actuals remain available under Airport History.", zh: "在官方航班与登机口完成认证前，不推算旅客人数或登机口拥挤度。机场‘历史’中仍可查看官方月度实绩。", ja: "公式の運航・搭乗口データの認証前は、人数や搭乗口混雑を推定表示しません。空港の「履歴」では公式月次実績を確認できます。" })}</p>
      <button onClick={() => onOpen("history")}>{localText(lang, { ko: "공식 과거 실적 보기", en: "VIEW OFFICIAL HISTORY", zh: "查看官方历史实绩", ja: "公式の過去実績を見る" })} ↗</button>
    </div>
  </section>;
}

function QuickActions({ lang, onArea, onAirport, onBusiness, onInsights, onMore }: { lang: Lang; onArea: () => void; onAirport: (section: AirportSection) => void; onBusiness: () => void; onInsights: () => void; onMore: () => void }) {
  const actions = [
    [localText(lang, { ko: "지역 비교", en: "AREA COMPARE", zh: "地区比较", ja: "エリア比較" }), localText(lang, { ko: "오늘·내일 세 지역", en: "TODAY + TOMORROW", zh: "今天与明天", ja: "今日と明日" }), onArea],
    [localText(lang, { ko: "내 항공편", en: "MY FLIGHT", zh: "我的航班", ja: "自分の便" }), localText(lang, { ko: "편명·도시 검색", en: "FLIGHT SEARCH", zh: "搜索航班", ja: "便名検索" }), () => onAirport("flights")],
    ["T1 / T2", localText(lang, { ko: "터미널 비교", en: "TERMINAL COMPARE", zh: "航站楼比较", ja: "ターミナル比較" }), () => onAirport("history")],
    [localText(lang, { ko: "매장 준비", en: "STORE PREP", zh: "门店准备", ja: "店舗準備" }), localText(lang, { ko: "업종별 오픈 브리프", en: "OPENING BRIEF", zh: "分行业开店简报", ja: "業種別ブリーフ" }), onBusiness],
    [localText(lang, { ko: "과거와 비교", en: "COMPARE HISTORY", zh: "对比历史", ja: "過去と比較" }), localText(lang, { ko: "7일·월별 흐름", en: "7-DAY + MONTHLY", zh: "7日与月度趋势", ja: "7日・月次推移" }), onInsights],
    ["MY KORETAIL", localText(lang, { ko: "선호 설정 확인", en: "SAVED PREFERENCES", zh: "查看偏好设置", ja: "保存設定を確認" }), onMore],
  ] as const;
  return <section className="quick-actions" aria-labelledby="quick-actions-title"><div className="section-head"><div><p className="eyebrow">START HERE</p><h2 id="quick-actions-title">{localText(lang, { ko: "빠른 실행", en: "QUICK ACTIONS", zh: "快捷入口", ja: "クイック操作" })}</h2></div></div><div>{actions.map(([label, note, action], index) => <button key={label} onClick={action}><span>0{index + 1}</span><strong>{label}</strong><small>{note}</small><b>↗</b></button>)}</div></section>;
}

function FeatureDiscovery({ lang, onAirport, onBusiness, onInsights, onMore }: { lang: Lang; onAirport: (section: AirportSection) => void; onBusiness: () => void; onInsights: () => void; onMore: () => void }) {
  const features = [
    [localText(lang, { ko: "서울 쇼핑수요", en: "SEOUL SHOPPING DEMAND", zh: "首尔购物需求", ja: "ソウル買い物需要" }), localText(lang, { ko: "오늘·내일 명동·홍대·성수를 비교합니다.", en: "Compare Myeongdong, Hongdae and Seongsu today and tomorrow.", zh: "比较今天和明天的明洞、弘大、圣水。", ja: "今日と明日の明洞・弘大・聖水を比較します。" }), () => window.scrollTo({ top: 0, behavior: "smooth" })],
    [localText(lang, { ko: "공항 흐름", en: "AIRPORT FLOW", zh: "机场客流", ja: "空港の流れ" }), localText(lang, { ko: "전체·T1·T2 출국수요와 혼잡시간을 봅니다.", en: "See all-airport, T1 and T2 demand and peak times.", zh: "查看整体、T1、T2出境需求与高峰时段。", ja: "空港全体・T1・T2の出国需要とピークを確認します。" }), () => onAirport("now")],
    [localText(lang, { ko: "항공편", en: "FLIGHTS", zh: "航班", ja: "フライト" }), localText(lang, { ko: "편명·항공사·도시·게이트를 찾습니다.", en: "Search flight, airline, city and gate.", zh: "搜索航班、航司、城市与登机口。", ja: "便名・航空会社・都市・搭乗口を検索します。" }), () => onAirport("flights")],
    [localText(lang, { ko: "매장 운영", en: "STORE OPERATIONS", zh: "门店运营", ja: "店舗運営" }), localText(lang, { ko: "지역·업종별 내일 준비사항을 확인합니다.", en: "Get tomorrow's prep by area and industry.", zh: "按地区与行业查看明日准备事项。", ja: "エリア・業種別に明日の準備を確認します。" }), onBusiness],
    [localText(lang, { ko: "과거 분석", en: "HISTORICAL ANALYSIS", zh: "历史分析", ja: "過去分析" }), localText(lang, { ko: "최근 7일에서 12개월 이상 흐름을 읽습니다.", en: "Read changes from seven days to twelve months and beyond.", zh: "查看最近7日至12个月以上的变化。", ja: "直近7日から12か月以上の推移を読みます。" }), onInsights],
    [localText(lang, { ko: "개인화", en: "PERSONALISE", zh: "个性化", ja: "パーソナライズ" }), localText(lang, { ko: "선호 지역·터미널·항공사·업종을 저장합니다.", en: "Save your area, terminal, airline and business.", zh: "保存偏好地区、航站楼、航司与行业。", ja: "エリア・ターミナル・航空会社・業種を保存します。" }), onMore],
  ] as const;
  return <section className="feature-discovery" aria-labelledby="feature-discovery-title"><div className="section-head"><div><p className="eyebrow">PRODUCT MAP</p><h2 id="feature-discovery-title">{localText(lang, { ko: "KORETAIL에서 할 수 있는 것", en: "WHAT YOU CAN DO WITH KORETAIL", zh: "KORETAIL可以做什么", ja: "KORETAILでできること" })}</h2></div></div><div>{features.map(([label, note, action], index) => <button key={label} onClick={action}><span>0{index + 1}</span><p><strong>{label}</strong><small>{note}</small></p><b>↗</b></button>)}</div></section>;
}

type SignupSegment = "visitor" | "airport" | "store" | "research";

function BetaSignup({ lang }: { lang: Lang }) {
  const [email, setEmail] = useState("");
  const [segment, setSegment] = useState<SignupSegment>("visitor");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const segmentLabels: Record<SignupSegment, string> = {
    visitor: localText(lang, { ko: "서울 방문", en: "SEOUL VISIT", zh: "首尔出行", ja: "ソウル訪問" }),
    airport: localText(lang, { ko: "공항·항공편", en: "AIRPORT & FLIGHTS", zh: "机场与航班", ja: "空港・フライト" }),
    store: localText(lang, { ko: "매장 운영", en: "STORE OPERATIONS", zh: "门店运营", ja: "店舗運営" }),
    research: localText(lang, { ko: "데이터·연구", en: "DATA & RESEARCH", zh: "数据与研究", ja: "データ・研究" }),
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || !email.trim()) return;
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/beta-signups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          segment,
          locale: lang,
          sourcePath: window.location.pathname,
          consent,
          website: form.get("website") ?? "",
        }),
      });
      if (!response.ok) throw new Error("signup_failed");
      setStatus("success");
      setEmail("");
      setConsent(false);
    } catch {
      setStatus("error");
    }
  }

  return <section className="beta-signup" aria-labelledby="beta-signup-title">
    <div className="beta-signup-copy">
      <p className="eyebrow">PUBLIC BETA · RETURN LOOP</p>
      <h2 id="beta-signup-title">{localText(lang, { ko: "공개 베타 소식 받기", en: "GET PUBLIC BETA UPDATES", zh: "接收公开测试更新", ja: "公開ベータの更新を受け取る" })}</h2>
      <p>{localText(lang, {
        ko: "공개 베타와 중요한 데이터 업데이트만 이메일로 안내합니다. 매일 알림이나 정확도 개선을 아직 약속하지 않습니다.",
        en: "Get public-beta and material data updates by email. This is not yet a daily alert or an accuracy-improvement promise.",
        zh: "仅通过邮件通知公开测试与重要数据更新。目前不承诺每日提醒或准确率持续提升。",
        ja: "公開ベータと重要なデータ更新だけをメールでお知らせします。毎日通知や精度向上を約束するものではありません。",
      })}</p>
      <ol>
        <li><span>01</span><strong>WHAT CHANGED</strong><small>{localText(lang, { ko: "어제와 달라진 핵심", en: "What changed since yesterday", zh: "与昨天相比的变化", ja: "昨日からの変化" })}</small></li>
        <li><span>02</span><strong>MY KORETAIL</strong><small>{localText(lang, { ko: "선호 지역·터미널 저장", en: "Saved area and terminal", zh: "保存地区与航站楼", ja: "エリア・ターミナル保存" })}</small></li>
        <li><span>03</span><strong>VERIFICATION</strong><small>{localText(lang, { ko: "실제 결과가 쌓인 뒤 공개", en: "Published only after outcomes exist", zh: "有实际结果后才公开", ja: "実績蓄積後に公開" })}</small></li>
      </ol>
    </div>
    {status === "success" ? <div className="beta-signup-result" role="status"><strong>{localText(lang, { ko: "신청을 저장했습니다.", en: "YOUR REQUEST IS SAVED.", zh: "申请已保存。", ja: "登録を保存しました。" })}</strong><p>{localText(lang, { ko: "이메일 발송 흐름이 Production에 연결되면 공개 베타 소식부터 보내드립니다.", en: "You will receive public-beta news after the production email workflow is connected.", zh: "Production邮件流程接入后，将从公开测试消息开始发送。", ja: "Productionのメール配信が接続された後、公開ベータ情報からお送りします。" })}</p><button onClick={() => setStatus("idle")}>{localText(lang, { ko: "다른 이메일 등록", en: "ADD ANOTHER", zh: "登记其他邮箱", ja: "別のメールを登録" })}</button></div> : <form onSubmit={submit} className="beta-signup-form">
      <label><span>{localText(lang, { ko: "관심 분야", en: "I USE IT FOR", zh: "关注领域", ja: "利用目的" })}</span><select value={segment} onChange={(event) => setSegment(event.target.value as SignupSegment)}>{(Object.keys(segmentLabels) as SignupSegment[]).map((id) => <option key={id} value={id}>{segmentLabels[id]}</option>)}</select></label>
      <label><span>EMAIL</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required placeholder="name@example.com" /></label>
      <label className="signup-honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="signup-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>{localText(lang, { ko: "베타·주요 업데이트 안내를 위해 이메일을 저장하는 데 동의합니다. 언제든 삭제 요청할 수 있습니다.", en: "I agree to store my email for beta and material product updates. I may request deletion at any time.", zh: "我同意为接收测试与重要更新而保存邮箱，并可随时申请删除。", ja: "ベータ・重要更新の案内のためメールアドレスを保存することに同意します。いつでも削除を依頼できます。" })}</span></label>
      <button type="submit" disabled={!consent || !email.trim() || status === "sending"}>{status === "sending" ? localText(lang, { ko: "저장 중…", en: "SAVING…", zh: "保存中…", ja: "保存中…" }) : localText(lang, { ko: "공개 베타 알림 신청", en: "JOIN PUBLIC BETA UPDATES", zh: "申请公开测试通知", ja: "公開ベータ通知に登録" })}</button>
      {status === "error" && <p className="signup-error" role="alert">{localText(lang, { ko: "지금은 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.", en: "We could not save this right now. Please try again later.", zh: "目前无法保存，请稍后重试。", ja: "現在保存できません。しばらくしてから再度お試しください。" })}</p>}
      <small>{localText(lang, { ko: "저장 항목: 이메일·관심분야·언어·신청시각. 결제정보·민감정보는 수집하지 않습니다.", en: "Stored: email, interest, language and signup time. No payment or sensitive data is collected.", zh: "保存：邮箱、关注领域、语言与申请时间。不收集支付或敏感信息。", ja: "保存項目：メール・関心分野・言語・登録時刻。決済・機微情報は収集しません。" })}</small>
    </form>}
  </section>;
}

function BetaDelete({ lang }: { lang: Lang }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function remove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    try {
      const response = await fetch("/api/beta-signups", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error("delete_failed");
      setEmail("");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }
  return <form className="beta-delete" onSubmit={remove}>
    <label><span>{localText(lang, { ko: "베타 등록 삭제", en: "DELETE BETA SIGNUP", zh: "删除测试申请", ja: "ベータ登録を削除" })}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" placeholder="name@example.com" /></label>
    <button type="submit" disabled={!email.trim() || status === "sending"}>{status === "sending" ? localText(lang, { ko: "삭제 중…", en: "DELETING…", zh: "删除中…", ja: "削除中…" }) : localText(lang, { ko: "내 등록 삭제", en: "DELETE MY SIGNUP", zh: "删除我的申请", ja: "自分の登録を削除" })}</button>
    {status === "done" && <small role="status">{localText(lang, { ko: "해당 이메일이 등록돼 있었다면 삭제했습니다.", en: "If that email was registered, it has been removed.", zh: "如该邮箱已登记，现已删除。", ja: "該当メールが登録されていた場合は削除しました。" })}</small>}
    {status === "error" && <small className="signup-error" role="alert">{localText(lang, { ko: "지금은 삭제할 수 없습니다. 잠시 후 다시 시도해 주세요.", en: "Deletion is unavailable right now. Try again later.", zh: "目前无法删除，请稍后重试。", ja: "現在削除できません。しばらくしてから再度お試しください。" })}</small>}
  </form>;
}

function ForecastVerification({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const labels = {
    title: localText(lang, { ko: "공개할 예측 정확도가 아직 없습니다", en: "NO FORECAST ACCURACY TO PUBLISH YET", zh: "目前没有可公开的预测准确率", ja: "公開できる予測精度はまだありません" }),
    intro: localText(lang, {
      ko: "공식 과거 실적은 분석에 쓰지만, 당시 저장한 예측이 아닙니다. 따라서 과거값으로 정확도를 꾸며내지 않고 Production에서 앞으로 저장한 예측만 검증합니다.",
      en: "Official history supports analysis, but it is not a forecast captured at the time. Accuracy will use only forecasts saved prospectively in production.",
      zh: "官方历史实绩可用于分析，但并不是当时保存的预测。因此不会用历史值包装准确率，只验证Production上线后保存的预测。",
      ja: "公式の過去実績は分析に使えますが、当時保存された予測ではありません。精度はProduction稼働後に前向き保存した予測だけで検証します。",
    }),
  };
  return <section className={(compact ? "forecast-verification compact" : "forecast-verification")} aria-labelledby={compact ? "forecast-verification-compact-title" : "forecast-verification-title"}>
    <div className="verification-head"><div><p className="eyebrow">PROSPECTIVE EVIDENCE · CURRENT STATUS</p><h2 id={compact ? "forecast-verification-compact-title" : "forecast-verification-title"}>{labels.title}</h2></div><span>NOT VERIFIED</span></div>
    <p className="verification-intro">{labels.intro}</p>
    <dl className="verification-counts">
      <div><dt>{localText(lang, { ko: "앞으로 저장한 예측", en: "FORWARD PREDICTIONS", zh: "前瞻保存预测", ja: "前向き保存予測" })}</dt><dd>0</dd></div>
      <div><dt>{localText(lang, { ko: "빠른 검증", en: "FAST VERIFIED", zh: "快速验证", ja: "早期検証済み" })}</dt><dd>0</dd></div>
      <div><dt>{localText(lang, { ko: "심층 검증", en: "DEEP VERIFIED", zh: "深度验证", ja: "深層検証済み" })}</dt><dd>0</dd></div>
      <div><dt>{localText(lang, { ko: "기준모델 우위", en: "BASELINE BEATEN", zh: "优于基线", ja: "ベースライン超過" })}</dt><dd>N/A</dd></div>
    </dl>
    {!compact && <>
      <ol className="verification-pipeline">
        <li><span>01</span><p><strong>{localText(lang, { ko: "예측 발행", en: "ISSUE", zh: "发布预测", ja: "予測発行" })}</strong><small>forecastIssuedAt · targetDate · modelVersion</small></p></li>
        <li><span>02</span><p><strong>{localText(lang, { ko: "판단시점 입력 저장", en: "CAPTURE INPUTS", zh: "保存判断时点输入", ja: "判断時点の入力保存" })}</strong><small>{localText(lang, { ko: "나중에 안 데이터로 바꾸지 않음", en: "No later-known data", zh: "不使用事后信息", ja: "後から判明した値は不使用" })}</small></p></li>
        <li><span>03</span><p><strong>{localText(lang, { ko: "실제 결과 연결", en: "RESOLVE OUTCOME", zh: "匹配实际结果", ja: "実績を照合" })}</strong><small>actualValue · outcomeResolvedAt</small></p></li>
        <li><span>04</span><p><strong>{localText(lang, { ko: "기준모델과 비교", en: "SCORE VS BASELINES", zh: "与基线比较", ja: "ベースライン比較" })}</strong><small>{localText(lang, { ko: "지난주 같은 요일 · 최근 4주 · 계절평균", en: "Same weekday · 4-week avg · seasonal avg", zh: "上周同星期 · 近4周 · 季节平均", ja: "前週同曜日・4週平均・季節平均" })}</small></p></li>
      </ol>
      <div className="verification-gates"><p><span>{localText(lang, { ko: "첫 공개 최소조건", en: "FIRST PUBLICATION GATE", zh: "首次公开门槛", ja: "初回公開条件" })}</span><strong>30 {localText(lang, { ko: "결과일 + 연속 4주", en: "OUTCOME DAYS + 4 CONTINUOUS WEEKS", zh: "个结果日 + 连续4周", ja: "実績日 + 連続4週" })}</strong></p><p><span>{localText(lang, { ko: "모델 승격 검토", en: "MODEL PROMOTION REVIEW", zh: "模型晋级评估", ja: "モデル昇格検討" })}</span><strong>90 {localText(lang, { ko: "일 이상 + 기준모델 우위", en: "DAYS + BASELINE ADVANTAGE", zh: "天以上 + 优于基线", ja: "日以上 + ベースライン優位" })}</strong></p></div>
    </>}
  </section>;
}

function ForecastLab({ lang }: { lang: Lang }) {
  const targets = [
    ["TARGET_A", "AREA_ACTIVITY", localText(lang, { ko: "지역 전체 활동 신호", en: "Area-wide activity signal", zh: "地区整体活动信号", ja: "エリア全体の活動シグナル" }), "FAST"],
    ["TARGET_B", "FOREIGN_PRESENCE", localText(lang, { ko: "단기체류 외국인 존재 신호", en: "Short-stay foreign presence", zh: "短期停留外国人存在信号", ja: "短期滞在外国人の滞在シグナル" }), "FAST / DEEP"],
    ["TARGET_C", "FOREIGN_SHOPPING_MOVEMENT", localText(lang, { ko: "외국인 쇼핑목적 이동 신호", en: "Foreign shopping-purpose movement", zh: "外国人购物目的移动信号", ja: "外国人の買い物目的移動シグナル" }), "DEEP"],
    ["TARGET_D", "FOREIGN_RETAIL_PROXY", localText(lang, { ko: "외국인 리테일 공개신호 조합값", en: "Combined public foreign-retail proxy", zh: "外国人零售公开信号组合值", ja: "外国人リテール公開シグナルの複合値" }), "DEEP / STORE"],
  ];
  return <section className="forecast-lab" id="forecast-lab" aria-labelledby="forecast-lab-title">
    <div className="section-head"><div><p className="eyebrow">FORECAST LAB · TARGET MATCH ONLY</p><h2 id="forecast-lab-title">{localText(lang, { ko: "무엇을 예측하고 어떻게 검증하나요?", en: "WHAT IS FORECAST AND HOW IS IT VERIFIED?", zh: "预测什么，如何验证？", ja: "何を予測し、どう検証する？" })}</h2></div><span className="unverified-label">COLLECTING</span></div>
    <p className="section-intro">{localText(lang, {
      ko: "결과가 나오기 전에 저장한 예측만 Track Record에 포함합니다. 외국인 쇼핑수요 신호는 실제 매출액이 아니며, 같은 정의·단위·시간·지역의 Actual과만 비교합니다.",
      en: "Only forecasts saved before outcomes exist enter the track record. The foreign shopping signal is not sales and is scored only against an actual with the same definition, unit, time and area grain.",
      zh: "只有在结果出现前保存的预测才计入成绩。外国游客购物需求信号并非销售额，只与定义、单位、时间和地区粒度一致的实际值比较。",
      ja: "結果が出る前に保存した予測だけを実績に含めます。外国人ショッピング需要シグナルは売上ではなく、定義・単位・時間・地域粒度が同じ実績とのみ比較します。",
    })}</p>
    <div className="target-registry">{targets.map(([id, code, description, level]) => <article key={id}><span>{id}</span><strong>{code}</strong><p>{description}</p><small>{level}</small></article>)}</div>
    <div className="verification-levels">
      <p><span>FAST</span><strong>{localText(lang, { ko: "수일 내 확인", en: "Resolved within days", zh: "数日内确认", ja: "数日以内に確認" })}</strong><small>{localText(lang, { ko: "실제 날씨·운항·도시활동처럼 빨리 나오는 결과", en: "Weather, flight and city-activity outcomes available quickly", zh: "天气、航班、城市活动等较快发布的结果", ja: "天気・運航・都市活動など早く確認できる結果" })}</small></p>
      <p><span>DEEP</span><strong>{localText(lang, { ko: "늦지만 행동에 가까움", en: "Slower, closer to behavior", zh: "较慢但更接近行为", ja: "遅いが行動に近い" })}</strong><small>{localText(lang, { ko: "외국인 체류·쇼핑목적 이동처럼 공개가 늦은 결과", en: "Foreign presence and shopping-purpose movement published later", zh: "外国人停留、购物目的移动等较晚发布的结果", ja: "外国人滞在・買い物目的移動など公開が遅い結果" })}</small></p>
      <p><span>STORE</span><strong>{localText(lang, { ko: "동의받은 매장 결과", en: "Consented store outcomes", zh: "经同意的门店结果", ja: "同意を得た店舗実績" })}</strong><small>{localText(lang, { ko: "현재 0건. 방문·거래·매출지수는 향후 파트너가 제공할 때만", en: "Currently zero. Visits, transactions or sales index require a future partner", zh: "目前为0。访问、交易、销售指数仅在未来合作门店提供时使用", ja: "現在0件。来店・取引・売上指数は将来の協力店舗提供時のみ" })}</small></p>
    </div>
    <details className="forecast-contract-preview"><summary><span>IMMUTABLE FORECAST CONTRACT</span><b>↘</b></summary><p>createdAt · targetDate · dataCutoff · modelVersion · proxyVersion · featureVersion · sourceVersions · availableDataHash · predictionHash · recordOrigin</p><p>{localText(lang, { ko: "Actual이 나온 뒤 예측값을 고치지 않습니다. 개선은 새 모델 버전으로만 기록합니다.", en: "Forecasts are never edited after an actual arrives. Improvements require a new model version.", zh: "实际结果出现后不修改预测值，改进只能通过新模型版本记录。", ja: "実績判明後に予測値を修正しません。改善は新しいモデル版として記録します。" })}</p></details>
  </section>;
}

type RetailPulseProps = {
  initialLang?: Lang;
  initialView?: View;
  initialArea?: AreaId;
  initialRoute?: boolean;
};

const htmlLang: Record<Lang, string> = { ko: "ko", en: "en", zh: "zh-CN", ja: "ja" };

function routeFor(lang: Lang, view: View, area: AreaId) {
  const base = `/${lang}`;
  if (view === "today") return `${base}/${area}`;
  return `${base}/${view}`;
}

export default function Home({ initialLang = "ko", initialView = "today", initialArea = "myeongdong", initialRoute = false }: RetailPulseProps = {}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [view, setView] = useState<View>(initialView);
  const [day, setDay] = useState<Day>("tomorrow");
  const [selected, setSelected] = useState<AreaId>(initialArea);
  const [search, setSearch] = useState("");
  const [flightKind, setFlightKind] = useState<"departures" | "arrivals">("departures");
  const [terminal, setTerminal] = useState<Terminal>("all");
  const [airportSection, setAirportSection] = useState<AirportSection>("now");
  const [industry, setIndustry] = useState<IndustryId>("beauty");
  const [watchedAirlines, setWatchedAirlines] = useState<string[]>([]);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [statePreview, setStatePreview] = useState("normal");
  const t = copy[lang];

  const filteredFlights = useMemo(() => {
    const query = search.trim().toUpperCase();
    return demoFlights.filter((flight) => {
      const matchesText = !query || [flight.code, flight.city, flight.airline, flight.airlineKo, flight.airlineEn, flight.airlineJa]
        .some((value) => value.toUpperCase().includes(query));
      const matchesKind = flight.kind === flightKind;
      const matchesTerminal = terminal === "all" || flight.terminal === terminal;
      return matchesText && matchesKind && matchesTerminal;
    });
  }, [search, flightKind, terminal]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("retailpulse-preferences");
        const legacyAirlines = window.localStorage.getItem("retailpulse-airlines");
        if (saved) {
          const value = JSON.parse(saved) as Partial<{ lang: Lang; area: AreaId; terminal: Terminal; industry: IndustryId; airlines: string[] }>;
          if (!initialRoute && value.lang && ["ko", "en", "zh", "ja"].includes(value.lang)) setLang(value.lang);
          if (!initialRoute && value.area && Object.hasOwn(areaInfo, value.area)) setSelected(value.area);
          if (value.terminal && ["all", "T1", "T2"].includes(value.terminal)) setTerminal(value.terminal);
          if (value.industry && Object.hasOwn(industryProfiles, value.industry)) setIndustry(value.industry);
          if (Array.isArray(value.airlines)) setWatchedAirlines(value.airlines.filter((item) => typeof item === "string"));
        } else if (legacyAirlines) {
          const airlines = JSON.parse(legacyAirlines);
          if (Array.isArray(airlines)) setWatchedAirlines(airlines.filter((item) => typeof item === "string"));
        }
      } catch {
        setWatchedAirlines([]);
      } finally {
        setPreferencesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRoute]);

  useEffect(() => {
    document.documentElement.lang = htmlLang[lang];
    if (!preferencesReady) return;
    try {
      window.localStorage.setItem("retailpulse-preferences", JSON.stringify({ lang, area: selected, terminal, industry, airlines: watchedAirlines }));
      window.localStorage.setItem("retailpulse-airlines", JSON.stringify(watchedAirlines));
    } catch {
      // Device-local preferences are optional. The product remains usable without storage.
    }
  }, [lang, selected, terminal, industry, watchedAirlines, preferencesReady]);

  useEffect(() => {
    const pathSlug = window.location.pathname.split("/")[2];
    const slug = seoSlugs.includes(pathSlug as SeoSlug) ? pathSlug as SeoSlug : undefined;
    const title = pageTitle(lang, slug);
    const description = pageDescription(lang, slug);
    const canonicalPath = `/${lang}${slug ? `/${slug}` : ""}`;

    document.title = title;
    const setMeta = (selector: string, value: string) => {
      document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", value);
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', `${siteOrigin}${canonicalPath}`);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", `${siteOrigin}${canonicalPath}`);

    const languageTags: Record<(typeof seoLocales)[number], string> = { ko: "ko-KR", en: "en", zh: "zh-CN", ja: "ja-JP" };
    seoLocales.forEach((locale) => {
      document.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${languageTags[locale]}"]`)
        ?.setAttribute("href", `${siteOrigin}/${locale}${slug ? `/${slug}` : ""}`);
    });
    document.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="x-default"]')
      ?.setAttribute("href", `${siteOrigin}/en${slug ? `/${slug}` : ""}`);
  }, [lang, view, selected]);

  useEffect(() => {
    const onPopState = () => {
      const [, locale, slug] = window.location.pathname.split("/");
      if (["ko", "en", "zh", "ja"].includes(locale)) setLang(locale as Lang);
      if (slug && Object.hasOwn(areaInfo, slug)) { setSelected(slug as AreaId); setView("today"); }
      else if (["today", "forecast", "airport", "business", "more"].includes(slug)) setView(slug as View);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function updateUrl(nextLang: Lang, nextView: View, nextArea: AreaId) {
    const nextPath = routeFor(nextLang, nextView, nextArea);
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
  }

  function changeLanguage(next: Lang) {
    setLang(next);
    updateUrl(next, view, selected);
  }

  function selectArea(next: AreaId) {
    setSelected(next);
    if (view === "today") updateUrl(lang, "today", next);
  }

  function navigate(next: View) {
    setView(next);
    setStatePreview("normal");
    updateUrl(lang, next, selected);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openAirport(section: AirportSection, preferredTerminal?: Terminal) {
    if (preferredTerminal) setTerminal(preferredTerminal);
    setAirportSection(section);
    navigate("airport");
  }

  return (
    <div className={"app lang-" + lang} data-hydrated={preferencesReady ? "true" : "false"}>
      <header className="topbar">
        <button className="brand brand-button" onClick={() => navigate("today")} aria-label="KORETAIL home">
          <span>KORETAIL</span><span className="brand-descriptor">Retail Demand Signals for Korea</span>
        </button>
        <div className="header-meta">
          <span className="kst-chip">{localText(lang, { ko: "예시 날짜 · 8월 23일 · KST", en: "SAMPLE DATE · AUG 23 · KST", zh: "示例日期 · 8月23日 · KST", ja: "サンプル日付 · 8月23日 · KST" })}</span>
          <button className="global-search-trigger" onClick={() => setGlobalSearchOpen((open) => !open)} aria-expanded={globalSearchOpen} aria-controls="global-search">
            <span aria-hidden="true">⌕</span><span>{lang === "ko" ? "검색" : lang === "zh" ? "搜索" : lang === "ja" ? "検索" : "Search"}</span>
          </button>
          <label className="language-control">
            <span className="sr-only">Language</span>
            <select value={lang} onChange={(event) => changeLanguage(event.target.value as Lang)} aria-label="Language">
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="zh">简体中文</option>
              <option value="ja">日本語</option>
            </select>
          </label>
        </div>
      </header>

      <main className="page-shell">
        {globalSearchOpen && <GlobalSearch lang={lang} onClose={() => setGlobalSearchOpen(false)} onArea={(id) => { setSelected(id); setView("today"); updateUrl(lang, "today", id); window.scrollTo({ top: 0, behavior: "smooth" }); setGlobalSearchOpen(false); }} onView={(next) => { navigate(next); setGlobalSearchOpen(false); }} onTerminal={(next) => { setTerminal(next); setAirportSection("now"); navigate("airport"); setGlobalSearchOpen(false); }} onFlight={(query) => { setSearch(query); setAirportSection("flights"); navigate("airport"); setGlobalSearchOpen(false); }} onIndustry={(id) => { setIndustry(id); navigate("business"); setGlobalSearchOpen(false); }} />}
        {statePreview !== "normal" && <StatePreview state={statePreview} lang={lang} onClose={() => setStatePreview("normal")} />}
        {view === "today" && (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <div className="hero-copy">
                <p className="eyebrow">FOREIGN VISITOR RETAIL INTELLIGENCE · SEOUL</p>
                <h1 id="hero-title">{t.hero.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
                <p className="hero-line">{t.sub}</p>
                <div className="day-switch" role="tablist" aria-label="Date">
                  <button className={day === "today" ? "active" : ""} onClick={() => setDay("today")} role="tab" aria-selected={day === "today"}>{t.today.toUpperCase()} <span>{dates[lang].today}</span></button>
                  <button className={day === "tomorrow" ? "active" : ""} onClick={() => setDay("tomorrow")} role="tab" aria-selected={day === "tomorrow"}>{t.tomorrow.toUpperCase()} <span>{dates[lang].tomorrow}</span></button>
                </div>
              </div>
              <figure className="hero-visual">
                <img src="/assets/seoul-hangang.jpeg" alt={lang === "zh" ? "夕阳下可见汉江与南山首尔塔的首尔全景" : lang === "ja" ? "夕暮れの漢江と南山ソウルタワーを望むソウルの風景" : lang === "en" ? "Seoul skyline with the Han River and N Seoul Tower at sunset" : "석양 아래 한강과 남산서울타워가 보이는 서울 전경"} width="1200" height="1800" fetchPriority="high" />
                <figcaption>SEOUL · 20:42 KST</figcaption>
              </figure>
            </section>

            <section className="audience-rail" aria-label={lang === "zh" ? "使用目的" : lang === "ja" ? "利用目的" : lang === "en" ? "Choose how to use KORETAIL" : "KORETAIL 사용 목적"}>
              <div>
                <p className="eyebrow">FOR VISITORS</p>
                <strong>{lang === "zh" ? "今天去哪儿、几点去？" : lang === "ja" ? "今日はどこへ、何時に行く？" : lang === "en" ? "Where should I go, and when?" : "오늘 어디를, 몇 시에 갈까?"}</strong>
                <span>{lang === "zh" ? "比较3个地区的购物指数" : lang === "ja" ? "3つのエリアの買い物需要を比較" : lang === "en" ? "Compare three shopping areas" : "세 지역 쇼핑 펄스를 바로 비교"}</span>
              </div>
              <button onClick={() => navigate("business")}>
                <p className="eyebrow">FOR STORE OPERATORS</p>
                <strong>{lang === "zh" ? "明天会来多少客人，要准备什么？" : lang === "ja" ? "明日の需要と、開店前の準備は？" : lang === "en" ? "How much demand tomorrow, and what should I prepare?" : "내일 손님이 얼마나 올까, 무엇을 준비할까?"}</strong>
                <span>{lang === "zh" ? "查看分行业运营建议 ↗" : lang === "ja" ? "業種別の開店前ブリーフを見る ↗" : lang === "en" ? "See industry action plans ↗" : "업종별 운영 브리핑 보기 ↗"}</span>
              </button>
            </section>

            <LiveSignals lang={lang} area={selected} />
            <HomeRankings lang={lang} selected={selected} onSelect={(nextDay, area) => { setDay(nextDay); selectArea(area); }} />
            <HomeAirportNow lang={lang} onOpen={openAirport} />
            <QuickActions lang={lang} onArea={() => document.getElementById("area-compare")?.scrollIntoView({ behavior: "smooth", block: "start" })} onAirport={openAirport} onBusiness={() => navigate("business")} onInsights={() => navigate("forecast")} onMore={() => navigate("more")} />
            {betaSignupEnabled && <BetaSignup lang={lang} />}
            <AreaDetail lang={lang} day={day} selected={selected} />

            <section className="seoul-layers">
              <figure>
                <img src="/assets/seoul-hanok.jpeg" alt={lang === "zh" ? "韩屋屋顶后方可见南山首尔塔的首尔风景" : lang === "ja" ? "韓屋の屋根越しに南山ソウルタワーを望むソウルの風景" : lang === "en" ? "N Seoul Tower seen beyond traditional hanok rooftops" : "한옥 지붕 너머로 남산서울타워가 보이는 서울 풍경"} width="1080" height="1920" loading="lazy" />
              </figure>
              <div>
                <p className="eyebrow">SEOUL IN LAYERS</p>
                <h2>{t.layers}</h2>
                <p>{t.layersSub}</p>
              </div>
            </section>
          </>
        )}

        {view === "forecast" && <ForecastView lang={lang} selected={selected} setSelected={selectArea} />}
        {view === "airport" && (
          <AirportView
            lang={lang}
            search={search}
            setSearch={setSearch}
            flightKind={flightKind}
            setFlightKind={setFlightKind}
            terminal={terminal}
            setTerminal={setTerminal}
            section={airportSection}
            setSection={setAirportSection}
            rows={filteredFlights}
            watchedAirlines={watchedAirlines}
            setWatchedAirlines={setWatchedAirlines}
          />
        )}
        {view === "business" && <BusinessView lang={lang} selected={selected} setSelected={selectArea} industry={industry} setIndustry={setIndustry} setProOpen={setProOpen} />}
        {view === "more" && <MoreView lang={lang} setLang={changeLanguage} selected={selected} terminal={terminal} industry={industry} watchedAirlines={watchedAirlines} setProOpen={setProOpen} statePreview={statePreview} setStatePreview={setStatePreview} onAirport={openAirport} onBusiness={() => navigate("business")} onInsights={() => navigate("forecast")} />}

        <footer className="site-footer">
          <p>{t.demoNote}</p><p>{t.kst}</p>
          <nav className="footer-links" aria-label="KORETAIL sections">
            <a href={`/${lang}`}>HOME</a>
            {(Object.keys(areaInfo) as AreaId[]).map((id) => <a key={id} href={routeFor(lang, "today", id)}>{areaLocalName(id, lang)}</a>)}
            <a href={routeFor(lang, "airport", selected)}>{t.airport}</a>
            <a href={routeFor(lang, "business", selected)}>{t.business}</a>
            <a href={routeFor(lang, "forecast", selected)}>{t.forecast}</a>
          </nav>
          <span>KORETAIL · RETAIL DEMAND SIGNALS FOR KOREA</span>
        </footer>
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {(["today", "airport", "business", "forecast", "more"] as View[]).map((item) => (
          <a key={item} href={routeFor(lang, item, selected)} className={view === item ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate(item); }} aria-current={view === item ? "page" : undefined}>
            <Icon name={item} />
            <span>{t[item].toUpperCase()}</span>
          </a>
        ))}
      </nav>

      {proOpen && <ProModal lang={lang} onClose={() => setProOpen(false)} />}
    </div>
  );
}

function GlobalSearch({
  lang, onClose, onArea, onView, onTerminal, onFlight, onIndustry,
}: {
  lang: Lang;
  onClose: () => void;
  onArea: (id: AreaId) => void;
  onView: (view: View) => void;
  onTerminal: (terminal: Terminal) => void;
  onFlight: (query: string) => void;
  onIndustry: (id: IndustryId) => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const includes = (...values: string[]) => !normalized || values.some((value) => value.toLocaleLowerCase().includes(normalized));
  const areaRows = (Object.keys(areaInfo) as AreaId[]).filter((id) => includes(id, areaInfo[id].ko, areaInfo[id].en, areaInfo[id].zh, areaInfo[id].ja));
  const airlineRows = Array.from(new Map(demoFlights.map((flight) => [flight.airline, flight])).values()).filter((flight) => includes(flight.airline, flight.airlineKo, flight.airlineEn, flight.airlineJa));
  const flightRows = demoFlights.filter((flight) => includes(flight.code, flight.city, flight.airline, flight.airlineKo, flight.airlineEn, flight.airlineJa));
  const industryRows = (Object.keys(industryProfiles) as IndustryId[]).filter((id) => includes(id, ...Object.values(industryProfiles[id].label)));
  const terminalRows = (["T1", "T2"] as const).filter((item) => includes(item, `${item} terminal`, `${item} 터미널`, `${item} 航站楼`, `${item} ターミナル`));
  const sectionRows = [
    { view: "forecast" as View, code: "INSIGHTS", label: copy[lang].forecast, keywords: ["history", "historical", "forecast", "insights", "과거", "예측", "인사이트", "历史", "预测", "洞察", "履歴", "予測", "インサイト"] },
    { view: "airport" as View, code: "ICN", label: copy[lang].airport, keywords: ["airport", "flight", "airline", "gate", "공항", "항공편", "게이트", "机场", "航班", "登机口", "空港", "フライト", "搭乗口"] },
    { view: "business" as View, code: "STORE", label: copy[lang].business, keywords: ["business", "store", "opening brief", "매장", "오픈 브리프", "商家", "门店", "店舗", "開店"] },
  ].filter((item) => includes(item.code, item.label, ...item.keywords));
  const hasResults = areaRows.length + airlineRows.length + flightRows.length + industryRows.length + terminalRows.length + sectionRows.length > 0;
  const labels = {
    title: localText(lang, { ko: "KORETAIL 전체 검색", en: "Search KORETAIL", zh: "搜索 KORETAIL", ja: "KORETAILを検索" }),
    placeholder: localText(lang, { ko: "지역, 항공편, 항공사, 업종 검색", en: "Area, flight, airline or business", zh: "搜索地区、航班、航司或行业", ja: "エリア・便名・航空会社・業種を検索" }),
    area: localText(lang, { ko: "지역", en: "AREA", zh: "地区", ja: "エリア" }),
    airport: localText(lang, { ko: "공항", en: "AIRPORT", zh: "机场", ja: "空港" }),
    airline: localText(lang, { ko: "항공사", en: "AIRLINE", zh: "航司", ja: "航空会社" }),
    flight: localText(lang, { ko: "항공편", en: "FLIGHT", zh: "航班", ja: "フライト" }),
    business: localText(lang, { ko: "업종", en: "BUSINESS", zh: "行业", ja: "業種" }),
    empty: localText(lang, { ko: "일치하는 결과가 없습니다.", en: "No matching results.", zh: "没有匹配结果。", ja: "一致する結果がありません。" }),
  };
  return <section className="global-search" id="global-search" aria-labelledby="global-search-title">
    <div className="global-search-head"><div><p className="eyebrow">GLOBAL SEARCH</p><h2 id="global-search-title">{labels.title}</h2></div><button onClick={onClose} aria-label={copy[lang].close}>×</button></div>
    <label className="search-field global-search-field"><span aria-hidden="true">⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.placeholder} aria-label={labels.title} /></label>
    {hasResults ? <div className="global-search-results">
      {areaRows.length > 0 && <div><p>{labels.area}</p>{areaRows.map((id) => <button key={id} onClick={() => onArea(id)}><span>{areaInfo[id].en}</span><strong>{areaLocalName(id, lang)}</strong></button>)}</div>}
      {terminalRows.length > 0 && <div><p>{labels.airport}</p>{terminalRows.map((item) => <button key={item} onClick={() => onTerminal(item)}><span>{item}</span><strong>{labels.airport}</strong></button>)}</div>}
      {airlineRows.length > 0 && <div><p>{labels.airline}</p>{airlineRows.slice(0, 6).map((flight) => <button key={flight.airline} onClick={() => onFlight(flight.airline)}><span>{flight.airline}</span><strong>{airlineLocalName(flight, lang)}</strong></button>)}</div>}
      {flightRows.length > 0 && <div><p>{labels.flight}</p>{flightRows.slice(0, 6).map((flight) => <button key={flight.code + flight.kind} onClick={() => onFlight(flight.code)}><span>{flight.code}</span><strong>{flight.city} · {flight.terminal}</strong></button>)}</div>}
      {industryRows.length > 0 && <div><p>{labels.business}</p>{industryRows.map((id) => <button key={id} onClick={() => onIndustry(id)}><span>{industryProfiles[id].short}</span><strong>{industryProfiles[id].label[lang]}</strong></button>)}</div>}
      {sectionRows.length > 0 && <div><p>SECTIONS</p>{sectionRows.map((item) => <button key={item.view} onClick={() => onView(item.view)}><span>{item.code}</span><strong>{item.label}</strong></button>)}</div>}
    </div> : <p className="global-search-empty">{labels.empty}</p>}
  </section>;
}

function AreaDetail({ lang, day, selected }: { lang: Lang; day: Day; selected: AreaId }) {
  const [shareState, setShareState] = useState("");
  const t = copy[lang];
  const area = areaInfo[selected];
  const score = scores[day][selected];
  const why = [
    [localText(lang, { ko: "지역 활동", en: "Area activity", zh: "地区活动", ja: "エリア活動" }), localText(lang, { ko: "예시 입력", en: "SAMPLE INPUT", zh: "示例输入", ja: "サンプル入力" }), localText(lang, { ko: "화면 구조를 검증하기 위해 설정한 예시 입력입니다. 현재 공식 실시간 활동값과 연결해 계산하지 않습니다.", en: "A sample input used to test the interface. It is not currently calculated from the official live activity value.", zh: "这是用于验证界面的示例输入，目前未与官方实时活动值连接计算。", ja: "画面検証用のサンプル入力で、現在の公式リアルタイム活動値からは計算していません。" })],
    [localText(lang, { ko: "방문·관광 관심", en: "Visit and tourism interest", zh: "到访与旅游关注", ja: "訪問・観光関心" }), localText(lang, { ko: "예시 입력", en: "SAMPLE INPUT", zh: "示例输入", ja: "サンプル入力" }), localText(lang, { ko: "실제 방문자 수나 매출이 아닌 제품 설명용 가정입니다.", en: "A product-explanation assumption, not observed visits or sales.", zh: "这是产品说明用假设，并非实际访客数或销售额。", ja: "実際の来訪者数や売上ではなく、製品説明用の仮定です。" })],
    [localText(lang, { ko: "시간대", en: "Time window", zh: "时间段", ja: "時間帯" }), area.best, localText(lang, { ko: "추천 시간 역시 실제 예측 결과가 아닌 화면 검증용 예시입니다.", en: "The recommended time is also an interface sample, not a live forecast result.", zh: "推荐时间同样是界面验证示例，并非实时预测结果。", ja: "おすすめ時間も実際の予測結果ではなく、画面検証用のサンプルです。" })],
  ];
  const tips = lang === "zh"
    ? ["希望相对宽松时，可优先考虑上午。", "下午可优先选择室内购物动线。", "14点后需求可能上升，请预留移动与排队时间。"]
    : lang === "ja"
      ? ["比較的落ち着いた時間を希望するなら、午前を検討してください。", "午後は屋内中心の買い物ルートが利用しやすい見込みです。", "14時以降は需要が高まる可能性があるため、移動や待ち時間に余裕を持つと安心です。"]
    : lang === "en"
      ? ["Consider the morning if you prefer a relatively calmer visit.", "Indoor shopping routes may work better in the afternoon.", "Demand may rise after 14:00, so allow extra time for movement and queues."]
      : ["상대적으로 여유로운 방문을 원한다면 오전 시간을 고려하세요.", "오후에는 실내 쇼핑 동선을 우선하면 이동이 편할 수 있습니다.", "14시 이후 수요가 높아질 수 있으니 이동과 대기시간에 여유를 두세요."];
  return (
    <section className="area-detail area-detail-v55" aria-label={area.en + " detail"}>
      <div className="area-summary-grid">
        <div className="pulse-panel">
          <div className="pulse-heading"><div><p className="eyebrow">SUMMARY · {day.toUpperCase()}</p><h2>{area.en}<small>{areaLocalName(selected, lang)}</small></h2></div><DemoLabel lang={lang} /></div>
          <div className="pulse-line"><strong>{score}</strong><span>{statusLabel(lang, score).toUpperCase()}<small>{localText(lang, { ko: "예시 수요지수", en: "DEMO DEMAND INDEX", zh: "演示需求指数", ja: "デモ需要指数" })}</small></span></div>
          <div className="pulse-meta"><div><p>{localText(lang, { ko: "예시 추천 시간", en: "SAMPLE RECOMMENDED TIME", zh: "示例推荐时间", ja: "サンプル推奨時間" })}</p><strong>{area.best}</strong><small>{day === "tomorrow" ? dates[lang].tomorrow : dates[lang].today}</small></div></div>
        </div>
        <div className="area-summary-copy"><p className="eyebrow">ONE-LINE READING</p><h3>{localText(lang, {
          ko: `${area.ko}은 여섯 예시값 가운데 ${statusLabel(lang, score)} 구간입니다.`,
          en: `${area.en} sits in the ${statusLabel(lang, score)} band of the six sample values.`,
          zh: `${area.zh}在六个示例值中属于${statusLabel(lang, score)}区间。`,
          ja: `${area.ja}は6つのサンプル値のうち「${statusLabel(lang, score)}」区分です。`,
        })}</h3><p>{localText(lang, { ko: "확률·실시간 수요·매출이 아닙니다. 공식 신호 기반 모델이 검증될 때까지 예시로만 봐주세요.", en: "It is not a probability, live demand or sales. Treat it only as a sample until an official-signal model is validated.", zh: "这不是概率、实时需求或销售额；在官方信号模型验证前仅作为示例。", ja: "確率・リアルタイム需要・売上ではありません。公式シグナルモデルの検証まではサンプルとしてご覧ください。" })}</p></div>
      </div>
      <section className="area-why" aria-labelledby="area-why-title"><div className="section-head"><div><p className="eyebrow">TOP 3 · DEMO ASSUMPTIONS</p><h2 id="area-why-title">{t.why}</h2></div></div><div className="area-why-list">{why.map(([label, value, detail], index) => <details key={label}><summary><span>0{index + 1}</span><strong>{label}</strong><b>{value}</b></summary><p>{detail}</p></details>)}</div></section>
      <details className="area-tips"><summary>{t.know}</summary><div>{tips.map((tip, index) => <p key={tip}><span>0{index + 1}</span><strong>{tip}</strong></p>)}</div></details>
      <details className="area-data"><summary><span>DATA</span><strong>{localText(lang, { ko: "이 숫자의 종류와 기준", en: "DATA TYPE & BASIS", zh: "数据类型与基准", ja: "データ種別と基準" })}</strong><b>↘</b></summary><div><p><strong>DEMO DATA</strong><span>{localText(lang, { ko: "화면과 기능을 검증하기 위한 예시값입니다.", en: "Sample values used to validate the interface and functions.", zh: "用于验证画面与功能的示例值。", ja: "画面と機能を検証するためのサンプル値です。" })}</span></p><p><strong>OFFICIAL HISTORICAL</strong><span>{localText(lang, { ko: "공식 공개자료에서 확인한 과거 실제값은 History에서 별도로 표시합니다.", en: "Past actuals verified in official public data are labeled separately in History.", zh: "官方公开资料中的历史实际值会在History中单独标注。", ja: "公式公開資料で確認した過去の実績値は、Historyで別に表示します。" })}</span></p></div></details>
      <div className="share-pulse"><p><span>{area.en}</span><strong>{day === "tomorrow" ? t.tomorrow : t.today} · {score}</strong><small>{t.bestTime} · {area.best}</small></p><button onClick={async () => { const text = `${area.en} · ${day === "tomorrow" ? t.tomorrow : t.today} ${score} · ${t.bestTime} ${area.best} · KORETAIL`; try { if (navigator.share) await navigator.share({ title: "KORETAIL", text }); else await navigator.clipboard.writeText(text); setShareState(localText(lang, { ko: "복사됨", en: "COPIED", zh: "已复制", ja: "コピー済み" })); } catch { setShareState(localText(lang, { ko: "공유 취소", en: "CANCELLED", zh: "已取消", ja: "キャンセル" })); } }}>{shareState || localText(lang, { ko: "펄스 공유", en: "SHARE PULSE", zh: "分享指数", ja: "指数を共有" })}</button></div>
    </section>
  );
}

function ForecastView({ lang, selected, setSelected }: { lang: Lang; selected: AreaId; setSelected: (id: AreaId) => void }) {
  const t = copy[lang];
  const values = forecast[selected];
  const max = Math.max(...values);
  const bestIndex = values.indexOf(max);
  const recentAirport = airportMonthly.slice(-3);
  const priorAirport = airportMonthly.slice(-6, -3);
  const recentAirportTotal = recentAirport.reduce((sum, item) => sum + airportValue(item, "all", "departure"), 0);
  const recentT2Total = recentAirport.reduce((sum, item) => sum + airportValue(item, "T2", "departure"), 0);
  const priorAirportTotal = priorAirport.reduce((sum, item) => sum + airportValue(item, "all", "departure"), 0);
  const priorT2Total = priorAirport.reduce((sum, item) => sum + airportValue(item, "T2", "departure"), 0);
  const recentT2Share = recentT2Total / recentAirportTotal * 100;
  const priorT2Share = priorT2Total / priorAirportTotal * 100;
  const days = lang === "zh" ? ["周六", "周日", "周一", "周二", "周三", "周四", "周五"] : lang === "ja" ? ["土", "日", "月", "火", "水", "木", "金"] : lang === "ko" ? ["토", "일", "월", "화", "수", "목", "금"] : ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"];
  const linePoints = values.map((value, i) => (i * 100 / 6) + "," + (100 - ((value - 60) / 40) * 80)).join(" ");
  return (
    <section className="view-section forecast-view">
      <div className="view-intro">
        <div><p className="eyebrow">THIS WEEK + COMPARE + HISTORY</p><h1>{t.forecast}</h1><p>{localText(lang, { ko: "7일 예측, 지역 비교, 어제와 달라진 점과 공식 과거 흐름을 한곳에서 읽습니다.", en: "Read the seven-day outlook, area comparison, what changed and official history in one place.", zh: "在一个页面查看7日预测、地区比较、昨日变化与官方历史趋势。", ja: "7日予測・エリア比較・昨日からの変化・公式の過去推移をひとつの画面で確認します。" })}</p></div>
        <DemoLabel lang={lang} />
      </div>
      <nav className="insight-map" aria-label={localText(lang, { ko: "인사이트 구성", en: "Insight sections", zh: "洞察内容", ja: "インサイトの構成" })}><a href="#this-week">{localText(lang, { ko: "이번 주", en: "THIS WEEK", zh: "本周", ja: "今週" })}</a><a href="#forecast-lab">FORECAST LAB</a><a href="#area-comparison">{localText(lang, { ko: "지역 비교", en: "AREA COMPARE", zh: "地区比较", ja: "エリア比較" })}</a><a href="#terminal-insight">T1 VS T2</a><a href="#historical-highlights">{localText(lang, { ko: "과거 하이라이트", en: "HISTORICAL HIGHLIGHTS", zh: "历史亮点", ja: "過去のハイライト" })}</a></nav>
      <div className="area-tabs" role="tablist">
        {(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}
      </div>
      <div className="forecast-chart" id="this-week">
        <div className="chart-summary">
          <p className="eyebrow">{t.bestDay.toUpperCase()}</p>
          <strong>{days[bestIndex]}</strong>
          <span>{max}</span>
        </div>
        <div className="chart-canvas">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="7-day pulse line chart">
            <polyline className="chart-area" points={"0,100 " + linePoints + " 100,100"} />
            <polyline className="chart-line" points={linePoints} />
          </svg>
          <div className="forecast-days">
            {values.map((value, index) => <div key={days[index]} className={value === max ? "best" : ""}><span>{days[index]}</span><strong>{value}</strong><small>8/{23 + index}</small></div>)}
          </div>
        </div>
      </div>
      <div className="confidence-strip">
        <div><strong>{localText(lang, { ko: "검증 전", en: "UNVERIFIED", zh: "未验证", ja: "未検証" })}</strong><span>{t.forecastConfidence.toUpperCase()}</span></div>
        <p>{localText(lang, { ko: "이 7일 값은 기능 검증용 Demo입니다. 실제 신뢰도나 적중률로 해석하면 안 됩니다.", en: "These seven-day values are interface Demo data, not measured confidence or hit rate.", zh: "这些7日数值仅用于界面演示，不代表已测量的可信度或命中率。", ja: "この7日分の値は画面検証用デモで、測定済みの信頼度や的中率ではありません。" })}</p>
      </div>
      <ForecastVerification lang={lang} compact />
      <ForecastLab lang={lang} />
      <div className="comparison-section" id="area-comparison">
        <div className="section-head"><div><p className="eyebrow">{dates[lang].tomorrow}</p><h2>{t.compare.toUpperCase()}</h2></div><DemoLabel lang={lang} /></div>
        {(Object.keys(areaInfo) as AreaId[]).sort((a, b) => scores.tomorrow[b] - scores.tomorrow[a]).map((id) => (
          <div className="compare-row" key={id}><span>{areaInfo[id].en}<small>{areaLocalName(id, lang)}</small></span><div><i style={{ width: scores.tomorrow[id] + "%" }} /></div><strong>{scores.tomorrow[id]}</strong></div>
        ))}
        <p className="truth-note">{localText(lang, { ko: "지역 비교는 예측 예시이며 실시간 추천이 아닙니다.", en: "Area comparisons are forecast samples, not live recommendations.", zh: "地区说明为预测示例，不代表实时推荐。", ja: "エリア比較は予測サンプルで、リアルタイムのおすすめではありません。" })}</p>
      </div>
      <section className="insight-terminal" id="terminal-insight" aria-labelledby="terminal-insight-title"><div className="section-head"><div><p className="eyebrow">T1 VS T2 · OFFICIAL HISTORICAL</p><h2 id="terminal-insight-title">{localText(lang, { ko: "터미널 흐름 한눈에", en: "TERMINAL FLOW AT A GLANCE", zh: "航站楼客流概览", ja: "ターミナルの流れを比較" })}</h2></div><span className="official-label">OFFICIAL HISTORICAL</span></div><p className="section-intro">{localText(lang, { ko: "최근 3개월 공식 월별 실적을 이전 3개월과 같은 기준으로 비교합니다.", en: "Compares the latest three official monthly results with the previous three on the same basis.", zh: "以相同口径比较最近3个月与此前3个月的官方月度实绩。", ja: "直近3か月の公式月次実績を、その前の3か月と同じ基準で比較します。" })}</p><div className="terminal-insight-grid"><p><span>T1</span><strong>{(100 - recentT2Share).toFixed(1)}%</strong><small>2026.05—07 · {localText(lang, { ko: "출국", en: "DEPARTURES", zh: "出境", ja: "出国" })}</small></p><p><span>T2</span><strong>{recentT2Share.toFixed(1)}%</strong><small>2026.05—07 · {localText(lang, { ko: "출국", en: "DEPARTURES", zh: "出境", ja: "出国" })}</small></p><p><span>{localText(lang, { ko: "이전 3개월 대비 T2", en: "T2 VS PRIOR 3 MONTHS", zh: "T2较前3个月", ja: "前3か月比 T2" })}</span><strong>{recentT2Share - priorT2Share >= 0 ? "+" : ""}{(recentT2Share - priorT2Share).toFixed(1)}%p</strong><small>{localText(lang, { ko: "같은 월별 기준", en: "SAME MONTHLY BASIS", zh: "同一月度口径", ja: "同じ月次基準" })}</small></p></div></section>
      <section className="historical-highlights" id="historical-highlights" aria-labelledby="historical-highlights-title"><div className="section-head"><div><p className="eyebrow">HISTORICAL HIGHLIGHTS</p><h2 id="historical-highlights-title">{localText(lang, { ko: "지금 판단에 도움 되는 과거 흐름", en: "HISTORY THAT HELPS NOW", zh: "有助于当前判断的历史趋势", ja: "今の判断に役立つ過去の流れ" })}</h2></div></div><div><p><span>01 · AIRPORT</span><strong>{localText(lang, { ko: "2026년 7월 전체 공항 출국객은 3,364,748명이었습니다.", en: "All-airport departures reached 3,364,748 in July 2026.", zh: "2026年7月全机场出境旅客为3,364,748人。", ja: "2026年7月の空港全体の出国者は3,364,748人でした。" })}</strong><small>OFFICIAL HISTORICAL · PUBLISHED / FINAL</small></p><p><span>02 · AREA</span><strong>{localText(lang, { ko: `${areaLocalName(selected, lang)}의 7월 외국인 생활인구는 6월과 비교해 변화했습니다. Business History에서 정확한 수치를 확인할 수 있습니다.`, en: `${areaLocalName(selected, lang)}'s July foreign living population changed from June; the exact value is available in Business History.`, zh: `${areaLocalName(selected, lang)}7月外国人生活人口较6月发生变化，准确数值可在Business History查看。`, ja: `${areaLocalName(selected, lang)}の7月の外国人生活人口は6月から変化しました。正確な値はBusiness Historyで確認できます。` })}</strong><small>OFFICIAL HISTORICAL · NOT SALES OR VISITS</small></p></div></section>
    </section>
  );
}

function AirportView({
  lang, search, setSearch, flightKind, setFlightKind, terminal, setTerminal, section, setSection, rows, watchedAirlines, setWatchedAirlines,
}: {
  lang: Lang; search: string; setSearch: (value: string) => void;
  flightKind: "departures" | "arrivals"; setFlightKind: (value: "departures" | "arrivals") => void;
  terminal: Terminal; setTerminal: (value: Terminal) => void;
  section: AirportSection; setSection: (value: AirportSection) => void; rows: typeof demoFlights;
  watchedAirlines: string[]; setWatchedAirlines: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const t = copy[lang];
  const [direction, setDirection] = useState<AirportDirection>("departure");
  const [historyPeriod, setHistoryPeriod] = useState<"7d" | "30d" | "6m" | "12m" | "all" | "custom">("6m");
  const [historyRangeOpen, setHistoryRangeOpen] = useState(false);
  const [historyStart, setHistoryStart] = useState(airportMonthly.at(-6)!.month);
  const [historyEnd, setHistoryEnd] = useState(airportMonthly.at(-1)!.month);
  const [draftHistoryStart, setDraftHistoryStart] = useState(airportMonthly.at(-6)!.month);
  const [draftHistoryEnd, setDraftHistoryEnd] = useState(airportMonthly.at(-1)!.month);
  const [airline, setAirline] = useState("all");
  const [region, setRegion] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "onTime" | "delayed" | "cancelled">("all");
  const [flightWindow, setFlightWindow] = useState<"all" | "1" | "3" | "6">("all");
  const [windowHours, setWindowHours] = useState<1 | 3 | 6 | 24>(3);
  const flightStatus = { onTime: t.onTime, delayed: t.delayed, cancelled: t.cancelled };
  const terminalLabel = terminal === "all" ? localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全体" }) : terminal;
  const shortHistoryGap = historyPeriod === "7d" || historyPeriod === "30d";
  const historyRows = shortHistoryGap ? [] : historyPeriod === "6m" ? airportMonthly.slice(-6)
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
  const rangeAllTotal = historyRows.reduce((sum, item) => sum + airportValue(item, "all", direction), 0);
  const rangeT1Total = historyRows.reduce((sum, item) => sum + airportValue(item, "T1", direction), 0);
  const rangeT2Total = historyRows.reduce((sum, item) => sum + airportValue(item, "T2", direction), 0);
  const selectedShare = rangeAllTotal ? (terminal === "all" ? rangeT2Total : terminal === "T1" ? rangeT1Total : rangeT2Total) / rangeAllTotal * 100 : 0;
  const shareTerminal = terminal === "all" ? "T2" : terminal;
  const rangeStartIndex = rangeStartRow ? airportMonthly.findIndex((item) => item.month === rangeStartRow.month) : -1;
  const previousRangeRows = rangeStartIndex >= historyRows.length ? airportMonthly.slice(rangeStartIndex - historyRows.length, rangeStartIndex) : [];
  const previousRangeAll = previousRangeRows.reduce((sum, item) => sum + airportValue(item, "all", direction), 0);
  const previousRangeT2 = previousRangeRows.reduce((sum, item) => sum + airportValue(item, "T2", direction), 0);
  const previousRangeT2Share = previousRangeAll ? previousRangeT2 / previousRangeAll * 100 : null;
  const rangeT2Share = rangeAllTotal ? rangeT2Total / rangeAllTotal * 100 : 0;
  const t2ShareDelta = previousRangeT2Share === null ? null : rangeT2Share - previousRangeT2Share;
  const allAirlines = Array.from(new Map(demoFlights.map((flight) => [flight.airline, { code: flight.airline, flight }])).values());
  const visibleFlights = rows.filter((flight) => {
    const [hour, minute] = flight.time.split(":").map(Number);
    const delta = hour * 60 + minute - 8 * 60;
    const matchesWindow = flightWindow === "all" || (delta >= 0 && delta <= Number(flightWindow) * 60);
    return (airline === "all" || flight.airline === airline)
      && (region === "all" || flight.region === region)
      && (statusFilter === "all" || flight.status === statusFilter)
      && matchesWindow;
  });

  function toggleAirline(code: string) {
    setWatchedAirlines((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  const referenceMinutes = 8 * 60;
  const concentratedFlights = demoFlights.filter((flight) => {
    if (flight.kind !== "departures" || flight.status === "cancelled" || (terminal !== "all" && flight.terminal !== terminal)) return false;
    const [hour, minute] = flight.time.split(":").map(Number);
    const delta = hour * 60 + minute - referenceMinutes;
    return windowHours === 24 ? true : delta >= 0 && delta <= windowHours * 60;
  });
  const airlineCounts = Object.entries(concentratedFlights.reduce<Record<string, number>>((acc, flight) => {
    acc[flight.airline] = (acc[flight.airline] ?? 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const regionCounts = Object.entries(concentratedFlights.reduce<Record<string, number>>((acc, flight) => {
    acc[flight.region] = (acc[flight.region] ?? 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const demoNowAvailable = false;
  const noTerminalDemo = localText(lang, { ko: "터미널별 Demo 수치 미제공", en: "No terminal-level demo value", zh: "未提供分航站楼演示值", ja: "ターミナル別のデモ値は未提供" });
  const directionLabels = {
    departure: localText(lang, { ko: "출국", en: "DEPARTURES", zh: "出境", ja: "出国" }),
    arrival: localText(lang, { ko: "입국", en: "ARRIVALS", zh: "入境", ja: "入国" }),
    total: localText(lang, { ko: "전체여객", en: "TOTAL", zh: "总旅客", ja: "全旅客" }),
  };
  return (
    <section className="view-section airport-view">
      <div className="view-intro">
        <div><p className="eyebrow">{localText(lang, { ko: "INCHEON AIRPORT · 예시 날짜 · 8월 23일 · KST", en: "INCHEON AIRPORT · SAMPLE DATE · AUG 23 · KST", zh: "INCHEON AIRPORT · 示例日期 · 8月23日 · KST", ja: "INCHEON AIRPORT · サンプル日付 · 8月23日 · KST" })}</p><h1>{t.airportTitle}</h1><p>{t.airportSub}</p></div>
        <DemoLabel lang={lang} />
      </div>
      <div className="terminal-selector" role="tablist" aria-label="Terminal">
        {(["all", "T1", "T2"] as Terminal[]).map((item) => <button key={item} className={terminal === item ? "active" : ""} onClick={() => setTerminal(item)} role="tab" aria-selected={terminal === item}>{item === "all" ? localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全体" }) : item}</button>)}
        <span>{localText(lang, { ko: "공항의 모든 지원 항목에 적용", en: "APPLIES TO SUPPORTED AIRPORT DATA", zh: "应用于所有支持的机场数据", ja: "対応する空港データすべてに適用" })}</span>
      </div>
      <nav className="airport-context-nav" aria-label={localText(lang, { ko: "공항 정보 구분", en: "Airport sections", zh: "机场信息分类", ja: "空港情報の分類" })}>
        {(["now", "next", "flights", "history", "airlines"] as AirportSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)} aria-current={section === item ? "page" : undefined}>{item === "now" ? localText(lang, { ko: "지금", en: "NOW", zh: "现在", ja: "現在" }) : item === "next" ? localText(lang, { ko: "다음 흐름", en: "NEXT", zh: "后续客流", ja: "次の流れ" }) : item === "flights" ? localText(lang, { ko: "항공편", en: "FLIGHTS", zh: "航班", ja: "フライト" }) : item === "history" ? localText(lang, { ko: "과거", en: "HISTORY", zh: "历史", ja: "履歴" }) : localText(lang, { ko: "항공사", en: "AIRLINES", zh: "航司", ja: "航空会社" })}</button>)}
      </nav>
      {section === "now" && <div className="airport-unavailable" role="status"><strong>{localText(lang, { ko: "실시간 공항 데이터 연결 준비 중", en: "Live airport data is being prepared", zh: "实时机场数据正在准备接入", ja: "空港リアルタイムデータを準備中" })}</strong><p>{localText(lang, { ko: "공식 운항·게이트 인증 전에는 예상 승객 수, 혼잡 시간, 게이트 압력을 표시하지 않습니다. 터미널을 선택해도 같은 원칙을 지킵니다.", en: "Expected passenger counts, busy windows and gate pressure stay hidden until official flight and gate authentication. The same rule applies to every terminal.", zh: "官方航班与登机口完成认证前，不显示预计旅客数、拥挤时段或登机口压力；所有航站楼均遵循同一原则。", ja: "公式の運航・搭乗口データの認証前は、予想旅客数・混雑時間・搭乗口圧力を表示しません。すべてのターミナルで同じ原則を守ります。" })}</p><button onClick={() => setSection("history")}>{localText(lang, { ko: "공식 과거 실적 보기", en: "VIEW OFFICIAL HISTORY", zh: "查看官方历史实绩", ja: "公式の過去実績を見る" })} ↗</button></div>}
      {section === "now" && demoNowAvailable && <>
      <div className="airport-pulse">
        <div className={"airport-score " + (demoNowAvailable ? "" : "unavailable")}><strong>{demoNowAvailable ? "74" : "N/A"}</strong><span>DEPARTURE PULSE · {terminalLabel}<small>{demoNowAvailable ? t.moderatelyBusy : noTerminalDemo}</small></span></div>
        <div className="airport-times"><div><p>{t.busiest.toUpperCase()}</p><strong>{demoNowAvailable ? "07:00 — 09:00" : "—"}</strong><small>{demoNowAvailable ? "DEMO" : noTerminalDemo}</small></div><div><p>{t.quieter.toUpperCase()}</p><strong>{demoNowAvailable ? "13:00 — 15:00" : "—"}</strong><small>{demoNowAvailable ? "DEMO" : noTerminalDemo}</small></div></div>
      </div>
      <div className="airport-signal"><span>AIRPORT ARRIVAL SIGNAL · DEMO</span><strong>{demoNowAvailable ? "+13%" : "—"}</strong><p>→ TOMORROW FOREIGN SHOPPING PULSE</p></div>

      <section className="airport-volume" aria-labelledby="airport-volume-title">
        <div className="section-head">
          <div><p className="eyebrow">NOW &amp; TOMORROW · {terminalLabel} · KST</p><h2 id="airport-volume-title">{localText(lang, { ko: "오늘과 내일 공항 흐름", en: "TODAY & TOMORROW", zh: "今天与明天的机场客流", ja: "本日と明日の空港利用" })}</h2></div>
          <DemoLabel lang={lang} />
        </div>
        <p className="volume-explainer">{localText(lang, { ko: "실시간 API가 아직 연결되지 않았습니다. 아래 값은 전체 공항 Demo이며, T1/T2로 임의 배분하지 않습니다.", en: "The live API is not connected. Values below are all-airport demos; T1/T2 are never allocated by assumption.", zh: "实时API尚未连接。以下数值均为整体机场演示值，T1/T2不会被任意分配。", ja: "リアルタイムAPIは未接続です。以下は空港全体のデモ値で、T1/T2へ推定配分しません。" })}</p>
        <div className="volume-primary">
          <div className="volume-main">
            <p>{localText(lang, { ko: "오늘 예상 출국객", en: "TODAY EXPECTED DEPARTURES", zh: "今日预计出境人数", ja: "本日の出国者予測" })}</p>
            <strong>{demoNowAvailable ? formatCount(lang, 58430) : "—"}</strong>
            <span>{demoNowAvailable ? localText(lang, { ko: "Demo 예상 · 하루 전체", en: "DEMO FORECAST · FULL DAY", zh: "演示预测 · 全日", ja: "デモ予測 · 終日" }) : noTerminalDemo}</span>
          </div>
          <div className="volume-side">
            <div><p>{localText(lang, { ko: "현재 누적 출국", en: "DEPARTURES SO FAR", zh: "当前累计出境", ja: "現在までの出国者" })}</p><strong>{demoNowAvailable ? formatCount(lang, 31204) : "—"}</strong><span>{demoNowAvailable ? `17:00 KST · ${localText(lang, { ko: "Demo 관측", en: "DEMO OBSERVED", zh: "演示观测", ja: "デモ観測" })}` : noTerminalDemo}</span></div>
            <div><p>{localText(lang, { ko: "내일 예상 출국", en: "TOMORROW EXPECTED", zh: "明日预计出境", ja: "明日の出国者予測" })}</p><strong>{demoNowAvailable ? formatCount(lang, 61800) : "—"}</strong><span>{demoNowAvailable ? localText(lang, { ko: "Demo 예상", en: "DEMO FORECAST", zh: "演示预测", ja: "デモ予測" }) : noTerminalDemo}</span></div>
          </div>
        </div>
        <div className="volume-grid">
          <div><p>{localText(lang, { ko: "오늘 예상 입국객", en: "TODAY EXPECTED ARRIVALS", zh: "今日预计入境", ja: "本日の入国者予測" })}</p><strong>{demoNowAvailable ? formatCount(lang, 56740) : "—"}</strong><span>{demoNowAvailable ? "DEMO FORECAST" : noTerminalDemo}</span></div>
          <div><p>{localText(lang, { ko: "내일 예상 입국객", en: "TOMORROW EXPECTED ARRIVALS", zh: "明日预计入境", ja: "明日の入国者予測" })}</p><strong>{demoNowAvailable ? formatCount(lang, 59120) : "—"}</strong><span>{demoNowAvailable ? localText(lang, { ko: "쇼핑수요 후보신호", en: "SHOPPING CANDIDATE SIGNAL", zh: "购物需求候选信号", ja: "買い物需要の候補シグナル" }) : noTerminalDemo}</span></div>
          <div><p>{localText(lang, { ko: "혼잡시간", en: "BUSIEST WINDOW", zh: "最繁忙时段", ja: "混雑ピーク" })}</p><strong>{demoNowAvailable ? "07:00—09:00" : "—"}</strong><span>{demoNowAvailable ? localText(lang, { ko: "Demo 시간대", en: "DEMO WINDOW", zh: "演示时段", ja: "デモ時間帯" }) : noTerminalDemo}</span></div>
          <div><p>{localText(lang, { ko: "비교적 여유시간", en: "QUIETER WINDOW", zh: "相对宽松时段", ja: "比較的空いている時間" })}</p><strong>{demoNowAvailable ? "13:00—15:00" : "—"}</strong><span>{demoNowAvailable ? localText(lang, { ko: "Demo 시간대", en: "DEMO WINDOW", zh: "演示时段", ja: "デモ時間帯" }) : noTerminalDemo}</span></div>
        </div>
        <p className="deterministic-sentence airport-now-reading">{demoNowAvailable ? localText(lang, { ko: "오늘 전체 공항 출국 흐름은 Demo 기준 다소 혼잡하며, 07:00~09:00에 수요가 집중됩니다.", en: "On the all-airport demo basis, departures are moderately busy today and concentrate from 07:00 to 09:00.", zh: "按机场整体演示值，今日出境客流较为拥挤，需求集中在07:00至09:00。", ja: "空港全体のデモ基準では、本日の出国フローはやや混雑し、07:00〜09:00に需要が集中します。" }) : localText(lang, { ko: `현재 ${terminal} 실시간 출국 수치는 공식 연결 전이라 표시하지 않습니다. 과거 탭에서 ${terminal} 공식 월별 실적을 확인할 수 있습니다.`, en: `A live ${terminal} departure value is not shown before the official connection. Official monthly ${terminal} results remain available in History.`, zh: `官方接口接入前不显示${terminal}实时出境数值。可在历史中查看${terminal}官方月度实绩。`, ja: `公式接続前のため、${terminal}のリアルタイム出国値は表示しません。履歴では${terminal}の公式月次実績を確認できます。` })}</p>
      </section>
      </>}

      {section === "history" && <section className="airport-history" aria-labelledby="airport-history-title">
        <div className="section-head"><div><p className="eyebrow">OFFICIAL HISTORICAL · PUBLISHED / FINAL</p><h2 id="airport-history-title">{localText(lang, { ko: "공항 과거 흐름", en: "AIRPORT HISTORY", zh: "机场历史趋势", ja: "空港の過去推移" })}</h2></div><span className="official-label">OFFICIAL HISTORICAL</span></div>
        <p className="section-intro">{localText(lang, { ko: "빠른 기간을 누르거나 시작월·종료월을 직접 지정할 수 있습니다. 선택한 기간은 합계, 일평균, 월별 표와 T1/T2 구성비에 모두 적용됩니다.", en: "Use a quick range or set exact start and end months. The selection applies to totals, daily averages, the monthly table and T1/T2 mix.", zh: "可使用快捷期间，也可指定开始月和结束月。所选期间会应用于总量、日均、月度表格及T1/T2构成。", ja: "プリセットまたは開始月・終了月を指定できます。選択期間は合計・日平均・月次表・T1/T2構成に反映されます。" })}</p>
        <div className="history-controls">
          <div role="tablist" aria-label="Direction">{(["departure", "arrival", "total"] as AirportDirection[]).map((item) => <button key={item} className={direction === item ? "active" : ""} onClick={() => setDirection(item)}>{directionLabels[item]}</button>)}</div>
          <div role="tablist" aria-label="Period">{(["7d", "30d", "6m", "12m", "all"] as const).map((item) => <button key={item} className={historyPeriod === item ? "active" : ""} onClick={() => { setHistoryPeriod(item); setHistoryRangeOpen(false); }}>{item === "7d" ? localText(lang, { ko: "7일", en: "7D", zh: "7天", ja: "7日" }) : item === "30d" ? localText(lang, { ko: "30일", en: "30D", zh: "30天", ja: "30日" }) : item === "6m" ? localText(lang, { ko: "6개월", en: "6M", zh: "6个月", ja: "6か月" }) : item === "12m" ? localText(lang, { ko: "12개월", en: "12M", zh: "12个月", ja: "12か月" }) : localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全期間" })}</button>)}<button className={(historyPeriod === "custom" ? "active " : "") + "range-trigger"} onClick={() => { setDraftHistoryStart(historyStart); setDraftHistoryEnd(historyEnd); setHistoryRangeOpen((open) => !open); }} aria-expanded={historyRangeOpen}>＋ {localText(lang, { ko: "기간 설정", en: "CUSTOM", zh: "自定义", ja: "期間指定" })}</button></div>
        </div>
        {historyRangeOpen && <MonthRangePicker lang={lang} start={draftHistoryStart} end={draftHistoryEnd} min={airportMonthly[0].month} max={airportMonthly.at(-1)!.month} onStart={setDraftHistoryStart} onEnd={setDraftHistoryEnd} onCancel={() => setHistoryRangeOpen(false)} onApply={(nextStart, nextEnd) => { setHistoryStart(nextStart); setHistoryEnd(nextEnd); setHistoryPeriod("custom"); setHistoryRangeOpen(false); }} />}
        {shortHistoryGap ? <div className="history-gap"><strong>HISTORICAL GAP</strong><p>{localText(lang, { ko: "일별 7일·30일 실적은 공식 자동 수집 연결 후 표시합니다. 월별 실적을 일별 값처럼 만들지 않습니다.", en: "Seven- and 30-day actuals appear after the official daily collector is connected; monthly values are never reshaped into daily history.", zh: "接入官方日度采集后显示7日与30日实绩，不会用月度数据伪造日度值。", ja: "日別の7日・30日実績は公式収集の接続後に表示します。月次値を日別履歴として作り替えません。" })}</p></div> : <>
          <div className="history-kpis">
            <div><span>{localText(lang, { ko: "선택 기간 합계", en: "SELECTED PERIOD TOTAL", zh: "所选期间合计", ja: "選択期間の合計" })}</span><strong>{formatCount(lang, rangeTotal)}</strong><small>{periodLabel} · {directionLabels[direction]} · {terminalLabel}</small></div>
            <div><span>{localText(lang, { ko: "선택 기간 일평균", en: "DAILY AVERAGE", zh: "所选期间日均", ja: "選択期間の日平均" })}</span><strong>{formatCount(lang, rangeDailyAverage)}</strong><small>{rangeDays} {localText(lang, { ko: "일 기준", en: "calendar days", zh: "个自然日", ja: "暦日基準" })}</small></div>
            <div><span>{localText(lang, { ko: "기간 처음 대비", en: "START-TO-END CHANGE", zh: "期初至期末变化", ja: "期間初比" })}</span><strong>{rangeChange === null ? "—" : `${rangeChange >= 0 ? "+" : ""}${rangeChange.toFixed(1)}%`}</strong><small>{rangeStartRow?.month ?? "—"} → {rangeEndRow?.month ?? "—"}</small></div>
          </div>
          {terminal === "all" && <div className="terminal-breakdown"><div><span>T1 · {periodLabel}</span><strong>{formatCount(lang, rangeT1Total)}</strong><i style={{ width: `${rangeAllTotal ? rangeT1Total / rangeAllTotal * 100 : 0}%` }} /></div><div><span>T2 · {periodLabel}</span><strong>{formatCount(lang, rangeT2Total)}</strong><i style={{ width: `${rangeAllTotal ? rangeT2Total / rangeAllTotal * 100 : 0}%` }} /></div></div>}
          <div className="official-chart" aria-label="Official monthly passenger history">
            {historyRows.map((item) => { const value = airportValue(item, terminal, direction); return <div key={item.month}><i style={{ height: `${Math.max(8, value / historyMax * 100)}%` }} /><span>{item.month.slice(2).replace("-", ".")}</span></div>; })}
          </div>
          <div className="monthly-board official-monthly-board">
            <div className="monthly-head"><p>{localText(lang, { ko: "월", en: "MONTH", zh: "月份", ja: "月" })}</p><p>{directionLabels[direction]}</p><p>{localText(lang, { ko: "일평균", en: "DAILY AVERAGE", zh: "日均", ja: "日平均" })}</p></div>
            {historyRows.slice().reverse().map((item) => { const value = airportValue(item, terminal, direction); return <div key={item.month}><strong>{item.month}</strong><span>{formatCount(lang, value)}<small>PUBLISHED / FINAL</small></span><b>{formatCount(lang, value / monthDays(item.month))}</b></div>; })}
          </div>
          {historyPeriod === "all" && <div className="annual-history"><p className="eyebrow">LONG-RUN REFERENCE · ALL AIRPORT</p>{airportAnnual.slice().reverse().map((item) => <div key={item.year}><span>{item.year}</span><strong>{formatCount(lang, item.passengers)}</strong></div>)}</div>}
          <div className="deterministic-insights">
            <p className="eyebrow">DETERMINISTIC INSIGHTS · {periodLabel}</p>
            <div><span>01</span><strong>{peakRow ? localText(lang, { ko: `선택 기간 중 ${peakRow.month}의 일평균 ${directionLabels[direction]}이 가장 높았습니다.`, en: `${peakRow.month} had the highest daily-average ${directionLabels[direction].toLowerCase()} in the selected period.`, zh: `所选期间内，${peakRow.month}的${directionLabels[direction]}日均最高。`, ja: `選択期間では${peakRow.month}の${directionLabels[direction]}日平均が最も高くなりました。` }) : "—"}</strong></div>
            <div><span>02</span><strong>{localText(lang, { ko: `${shareTerminal} 비중은 ${selectedShare.toFixed(1)}%입니다.`, en: `${shareTerminal} represented ${selectedShare.toFixed(1)}% of the total.`, zh: `${shareTerminal}占比为${selectedShare.toFixed(1)}%。`, ja: `${shareTerminal}の構成比は${selectedShare.toFixed(1)}%です。` })}</strong></div>
          </div>
          <div className="terminal-history-compare" aria-label="T1 and T2 historical comparison">
            <div><p className="eyebrow">T1 VS T2 · OFFICIAL HISTORICAL</p><h3>{localText(lang, { ko: "선택 기간 터미널 구성", en: "SELECTED-PERIOD TERMINAL MIX", zh: "所选期间航站楼构成", ja: "選択期間のターミナル構成" })}</h3><small>{periodLabel} · {directionLabels[direction]}</small></div>
            <p><span>T1</span><strong>{(100 - rangeT2Share).toFixed(1)}%</strong></p><p><span>T2</span><strong>{rangeT2Share.toFixed(1)}%</strong></p>
            <p className="terminal-change"><span>{localText(lang, { ko: "직전 동일 길이 대비 T2", en: "T2 VS PRIOR SAME-LENGTH PERIOD", zh: "T2较此前同长度期间", ja: "直前の同期間比 T2" })}</span><strong>{t2ShareDelta === null ? "—" : `${t2ShareDelta >= 0 ? "+" : ""}${t2ShareDelta.toFixed(1)}%p`}</strong><small>{t2ShareDelta === null ? localText(lang, { ko: "비교 가능한 이전 데이터 부족", en: "NOT ENOUGH PRIOR DATA", zh: "此前数据不足", ja: "比較可能な過去データ不足" }) : localText(lang, { ko: "같은 개월 수 기준", en: "SAME NUMBER OF MONTHS", zh: "按相同月数", ja: "同じ月数で比較" })}</small></p>
          </div>
        </>}
        <p className="coverage-note">MONTHLY DETAIL IN SITE · 2025.08 — 2026.07 · LONG-RUN ANNUAL REFERENCE · 2010 — 2025 · Source · Incheon International Airport Corporation · {terminal === "T2" && localText(lang, { ko: "T2 개항 이전은 0이 아니라 NOT OPERATING", en: "Pre-opening T2 is NOT OPERATING, not zero", zh: "T2启用前标记为NOT OPERATING，并非0", ja: "T2開業前は0ではなくNOT OPERATING" })}</p>
      </section>}

      {section === "airlines" && <section className="airline-intelligence" aria-labelledby="airline-title">
        <div className="section-head"><div><p className="eyebrow">AIRLINE + TERMINAL + TIME + ROUTE</p><h2 id="airline-title">{localText(lang, { ko: "항공사별 항공편 흐름", en: "AIRLINE INTELLIGENCE", zh: "分航司航班流", ja: "航空会社別フライト動向" })}</h2></div><DemoLabel lang={lang} /></div>
        <p className="volume-explainer">{localText(lang, { ko: "아래 운항편은 기능 검증용 Demo입니다. 항공편 수는 승객 수가 아니며, 목적지는 승객 국적이 아닙니다.", en: "Flights below are demo rows. Flight counts are not passenger counts, and destinations are not passenger nationality.", zh: "以下航班为功能演示。航班数不等于旅客数，目的地也不等于旅客国籍。", ja: "以下は機能検証用のデモ便です。便数は旅客数ではなく、目的地は旅客の国籍ではありません。" })}</p>
        <div className="watch-row"><span>MY AIRLINES</span>{allAirlines.slice(0, 6).map((item) => <button key={item.code} className={watchedAirlines.includes(item.code) ? "active" : ""} onClick={() => toggleAirline(item.code)} aria-pressed={watchedAirlines.includes(item.code)}>☆ {item.code} · {airlineLocalName(item.flight, lang)}</button>)}</div>
        <div className="concentration-controls">{([1, 3, 6, 24] as const).map((item) => <button key={item} className={windowHours === item ? "active" : ""} onClick={() => setWindowHours(item)}>{item === 24 ? "TODAY" : `NEXT ${item}H`}</button>)}</div>
        <div className="airline-concentration">{airlineCounts.length ? airlineCounts.map(([code, count], index) => { const item = allAirlines.find((entry) => entry.code === code)!; return <div key={code}><span>0{index + 1}</span><p><strong>{code} · {airlineLocalName(item.flight, lang)}</strong><small>{terminalLabel} · {t.departures.toUpperCase()}</small></p><b>{formatCount(lang, count, "flights")}</b></div>; }) : <div className="history-gap"><strong>NO FLIGHTS</strong><p>{localText(lang, { ko: "선택한 시간과 터미널에 Demo 항공편이 없습니다.", en: "No demo flights match this window and terminal.", zh: "所选时段与航站楼没有演示航班。", ja: "選択した時間帯・ターミナルに該当するデモ便はありません。" })}</p></div>}</div>
        {regionCounts.length > 0 && <div className="wave-routes"><p className="eyebrow">ROUTE WAVE · DESTINATION REGION ≠ NATIONALITY</p>{regionCounts.map(([route, count]) => <p key={route}><span>{route} ROUTES</span><strong>{formatCount(lang, count, "flights")}</strong></p>)}</div>}
        <details className="official-airline-note"><summary>OFFICIAL HISTORICAL · JUL 2026 · KOREAN AIR</summary><div><span>{localText(lang, { ko: "출발편", en: "DEPARTURE FLIGHTS", zh: "出发航班", ja: "出発便" })}<strong>{formatCount(lang, 4294, "flights")}</strong></span><span>{localText(lang, { ko: "출국 여객", en: "DEPARTURE PASSENGERS", zh: "出境旅客", ja: "出国旅客" })}<strong>{formatCount(lang, 794414)}</strong></span></div><p>{localText(lang, { ko: "공식 월별 항공사 실적이며 실시간 예상 승객 수가 아닙니다. 전체 공항 기준입니다.", en: "Official monthly airline results, not real-time expected passengers. All-airport basis.", zh: "这是官方月度航司实绩，并非实时预计旅客数，按整个机场统计。", ja: "公式の月次航空会社実績で、リアルタイムの予測旅客数ではありません。空港全体の値です。" })}</p></details>
      </section>}

      {section === "next" && <>
      <section className="airport-next-summary" aria-labelledby="airport-next-title">
        <div className="section-head"><div><p className="eyebrow">NEXT {windowHours === 24 ? "TODAY" : `${windowHours} HOURS`} · DEMO FLIGHTS</p><h2 id="airport-next-title">{localText(lang, { ko: "앞으로 어떤 항공편이 몰리나요?", en: "WHAT IS CONCENTRATING NEXT?", zh: "接下来哪些航班集中？", ja: "これからどの便が集中する？" })}</h2></div><DemoLabel lang={lang} /></div>
        <p className="section-intro">{localText(lang, { ko: "출발편의 항공사·목적지 지역·터미널·상태를 같은 시간창으로 묶어 보여줍니다.", en: "Groups departing flights by airline, destination region, terminal and status within the same time window.", zh: "在同一时间窗口内按航司、目的地区域、航站楼与状态汇总出发航班。", ja: "同じ時間枠の出発便を航空会社・目的地域・ターミナル・運航状況でまとめます。" })}</p>
        <div className="concentration-controls" aria-label="Flight wave window">{([1, 3, 6, 24] as const).map((item) => <button key={item} className={windowHours === item ? "active" : ""} onClick={() => setWindowHours(item)}>{item === 24 ? "TODAY" : `NEXT ${item}H`}</button>)}</div>
        <div className="next-summary-grid"><p><span>{localText(lang, { ko: "출발편", en: "DEPARTURES", zh: "出发航班", ja: "出発便" })}</span><strong>{formatCount(lang, concentratedFlights.length, "flights")}</strong></p><p><span>T1</span><strong>{formatCount(lang, concentratedFlights.filter((flight) => flight.terminal === "T1").length, "flights")}</strong></p><p><span>T2</span><strong>{formatCount(lang, concentratedFlights.filter((flight) => flight.terminal === "T2").length, "flights")}</strong></p><p><span>{t.delayed}</span><strong>{formatCount(lang, concentratedFlights.filter((flight) => flight.status === "delayed").length, "flights")}</strong></p></div>
        <div className="next-split"><div><p className="eyebrow">AIRLINES</p>{airlineCounts.slice(0, 5).map(([code, count]) => <p key={code}><span>{code}</span><strong>{formatCount(lang, count, "flights")}</strong></p>)}</div><div><p className="eyebrow">ROUTES · DESTINATION ≠ NATIONALITY</p>{regionCounts.slice(0, 5).map(([route, count]) => <p key={route}><span>{route}</span><strong>{formatCount(lang, count, "flights")}</strong></p>)}</div></div>
        <p className="deterministic-sentence">{airlineCounts.length ? localText(lang, { ko: `선택한 시간에는 ${airlineCounts[0][0]} 출발편이 가장 많이 잡혀 있습니다. 항공편 수는 승객 수가 아닙니다.`, en: `${airlineCounts[0][0]} has the most scheduled departures in this window. Flight count is not passenger count.`, zh: `所选时段内${airlineCounts[0][0]}出发航班最多。航班数不等于旅客数。`, ja: `選択した時間帯では${airlineCounts[0][0]}の出発便が最も多くなっています。便数は旅客数ではありません。` }) : localText(lang, { ko: "선택한 시간과 터미널에 Demo 출발편이 없습니다.", en: "No demo departures match this window and terminal.", zh: "所选时段与航站楼没有演示出发航班。", ja: "選択した時間帯・ターミナルに該当するデモ出発便はありません。" })}</p>
      </section>
      <section className="gate-retail-intelligence" aria-labelledby="gate-retail-title">
        <div className="section-head"><div><p className="eyebrow">GATE-AREA PRESSURE · UNAVAILABLE</p><h2 id="gate-retail-title">{localText(lang, { ko: "게이트 주변 예상 혼잡", en: "GATE-AREA PRESSURE", zh: "登机口周边预计拥挤", ja: "搭乗口周辺の予想混雑" })}</h2></div><span className="unverified-label">NOT LIVE</span></div>
        <div className="airport-unavailable" role="status"><strong>{localText(lang, { ko: "공식 운항·게이트 인증을 기다리고 있습니다", en: "Waiting for official flight and gate authentication", zh: "正在等待官方航班与登机口认证", ja: "公式の運航・搭乗口認証を待っています" })}</strong><p>{localText(lang, { ko: "지금은 가짜 게이트 범위나 사람 수를 표시하지 않습니다. 연결 후에는 60분 단위로 시간·터미널·검증된 위치·운항 집중도를 보여주며, 게이트 근거가 약하면 터미널까지만 표시합니다.", en: "No fabricated gate range or people count is shown. Once connected, hourly rows will show time, terminal, verified location and flight concentration; weak gate evidence degrades to terminal only.", zh: "当前不显示虚构的登机口范围或人数。接入后将按60分钟显示时间、航站楼、已验证位置与航班集中度；登机口依据不足时仅显示航站楼。", ja: "架空の搭乗口範囲や人数は表示しません。接続後は60分単位で時間・ターミナル・検証済み位置・運航集中度を表示し、搭乗口の根拠が弱い場合はターミナルまでに留めます。" })}</p></div>
        <details className="airport-pressure-method"><summary>{localText(lang, { ko: "계산 원칙 보기", en: "VIEW CALCULATION RULES", zh: "查看计算原则", ja: "計算原則を見る" })}</summary><ul><li>A1/A2 · {localText(lang, { ko: "실제 운항은 공동운항편을 같은 항공기로 중복 계산하지 않음", en: "actual operations deduplicate codeshares into one physical flight", zh: "实际航班按同一实体航班去除代码共享重复", ja: "実運航はコードシェアを同一の物理便として重複排除" })}</li><li>A3 · {localText(lang, { ko: "예정 운항은 미래 게이트를 추측하지 않고 터미널·시간만 표시", en: "scheduled service never invents a future gate", zh: "计划航班不推测未来登机口", ja: "予定便では将来の搭乗口を推測しない" })}</li><li>A4 · {localText(lang, { ko: "현재 제공 범위인 T1 출국장 혼잡만 보조 근거로 사용", en: "only the currently supplied T1 checkpoint scope may be supporting evidence", zh: "仅将当前提供范围内的T1出境安检拥挤作为辅助依据", ja: "現在提供範囲のT1出国審査場混雑のみ補助根拠に使用" })}</li></ul></details>
      </section></>}

      {section === "flights" && <div className="flight-search">
        <div className="section-head"><div><p className="eyebrow">FLIGHT BOARD</p><h2>{t.search.toUpperCase()}</h2></div><DemoLabel lang={lang} /></div>
        <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchHint} aria-label={t.search} /><button onClick={() => setSearch("")} aria-label="Clear search">{search ? "×" : ""}</button></label>
        <div className="flight-filters">
          <div role="tablist"><button className={flightKind === "departures" ? "active" : ""} onClick={() => setFlightKind("departures")}>{t.departures.toUpperCase()}</button><button className={flightKind === "arrivals" ? "active" : ""} onClick={() => setFlightKind("arrivals")}>{t.arrivals.toUpperCase()}</button></div>
          <label><span className="sr-only">Airline</span><select value={airline} onChange={(event) => setAirline(event.target.value)}><option value="all">{localText(lang, { ko: "전체 항공사", en: "All airlines", zh: "全部航司", ja: "すべての航空会社" })}</option>{allAirlines.map((item) => <option key={item.code} value={item.code}>{item.code} · {airlineLocalName(item.flight, lang)}</option>)}</select></label>
          <label><span className="sr-only">Route region</span><select value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">{localText(lang, { ko: "전체 노선", en: "All routes", zh: "全部航线", ja: "すべての路線" })}</option>{["CHINA", "JAPAN", "SOUTHEAST ASIA", "EUROPE"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="sr-only">Time window</span><select value={flightWindow} onChange={(event) => setFlightWindow(event.target.value as typeof flightWindow)}><option value="all">{localText(lang, { ko: "전체 시간", en: "All times", zh: "全部时间", ja: "すべての時間" })}</option><option value="1">NEXT 1H</option><option value="3">NEXT 3H</option><option value="6">NEXT 6H</option></select></label>
          <label><span className="sr-only">Flight status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">{localText(lang, { ko: "전체 상태", en: "All status", zh: "全部状态", ja: "すべての運航状況" })}</option><option value="onTime">{t.onTime}</option><option value="delayed">{t.delayed}</option><option value="cancelled">{t.cancelled}</option></select></label>
        </div>
        <div className="flight-list" aria-live="polite">
          {visibleFlights.length ? visibleFlights.map((flight) => (
            <div className="flight-row" key={flight.code + flight.kind}>
              <strong className="flight-time">{flight.time}</strong>
              <span className="flight-code">{flight.code}<small>{airlineLocalName(flight, lang)}</small></span>
              <span className="flight-city">{flight.city}<small>{flight.kind === "departures" ? `${localText(lang, { ko: "게이트", en: "GATE", zh: "登机口", ja: "搭乗口" })} ${flight.gate} · ${localText(lang, { ko: "체크인", en: "CHECK-IN", zh: "值机", ja: "チェックイン" })} ${flight.checkin}` : `${localText(lang, { ko: "게이트", en: "GATE", zh: "登机口", ja: "搭乗口" })} ${flight.gate}`}</small></span>
              <span className="flight-terminal">{flight.terminal}</span>
              <span className={"flight-status " + flight.status}>{flightStatus[flight.status as keyof typeof flightStatus].toUpperCase()}</span>
            </div>
          )) : <div className="empty-state"><span>∅</span><strong>{t.noFlights}</strong><p>{t.noFlightsSub}</p></div>}
        </div>
        <p className="coverage-note">DEMO OPERATIONAL DATA · {terminalLabel} · 2026.08.23 KST · PRODUCTION LIVE API: BLOCKED_BY_CREDENTIAL</p>
      </div>}
    </section>
  );
}

function BusinessView({
  lang, selected, setSelected, industry, setIndustry, setProOpen,
}: {
  lang: Lang; selected: AreaId; setSelected: (id: AreaId) => void;
  industry: IndustryId; setIndustry: (id: IndustryId) => void; setProOpen: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"briefing" | "history" | "accuracy">("briefing");
  const profile = industryProfiles[industry];
  const score = Math.max(0, Math.min(100, scores.tomorrow[selected] + profile.adjustment));
  const area = areaInfo[selected];
  const signals = lang === "zh"
    ? [["机场入境流量", "+13%", "仁川机场 · 预测"], ["短期外国人口", "+8.4%", "首尔市 · D-4"], ["购物目的移动", "+6%", "首尔×KT · 样本"], ["旅游需求", "78 / 100", "韩国观光公社"], ["城市活动", "82 / 100", "首尔实时城市数据"], ["天气", "小雨", "气象厅"], ["购物关注度", "+9", "Naver相对指数"], ["人民币汇率", "+1.6%", "韩国银行 ECOS"]]
    : lang === "ja"
      ? [["空港入国フロー", "+13%", "仁川空港 · 予測"], ["短期滞在外国人", "+8.4%", "ソウル市 · D-4"], ["買い物目的の移動", "+6%", "ソウル×KT · サンプル"], ["観光需要", "78 / 100", "韓国観光公社"], ["都市活動", "82 / 100", "ソウルリアルタイム都市データ"], ["天気", "弱い雨", "気象庁"], ["買い物関心度", "+9", "Naver相対指数"], ["人民元為替", "+1.6%", "韓国銀行 ECOS"]]
    : lang === "en"
      ? [["Airport arrivals", "+13%", "Incheon · forecast"], ["Short-stay foreigners", "+8.4%", "Seoul · D-4"], ["Shopping-purpose movement", "+6%", "Seoul × KT · sample"], ["Tourism demand", "78 / 100", "KTO"], ["City activity", "82 / 100", "Seoul real-time city"], ["Weather", "Light rain", "KMA"], ["Shopping interest", "+9", "Naver relative index"], ["CNY/KRW", "+1.6%", "BOK ECOS"]]
      : [["공항 입국 흐름", "+13%", "인천공항 · 예상"], ["단기체류 외국인", "+8.4%", "서울시 · D-4"], ["쇼핑 목적 생활이동", "+6%", "서울×KT · 예시"], ["관광 수요", "78 / 100", "한국관광공사"], ["도시 활동", "82 / 100", "서울 실시간 도시데이터"], ["날씨", "약한 비", "기상청"], ["쇼핑 관심도", "+9", "네이버 상대지수"], ["위안화 환율", "+1.6%", "한국은행 ECOS"]];
  const actionNotes = [
    localText(lang, { ko: "집중시간 전에 담당 역할과 다국어 응대 가능 여부를 확인하세요. 정확한 인원수는 매장 상황에 맞춰 판단해야 합니다.", en: "Confirm roles and language coverage before the peak. Headcount should still be set from your store's conditions.", zh: "请在高峰前确认岗位与多语种接待能力，具体人数仍需根据门店情况判断。", ja: "ピーク前に役割と多言語対応を確認してください。具体的な人数は店舗の状況に合わせて判断する必要があります。" }),
    localText(lang, { ko: "정확한 수량을 지시하는 것이 아니라, 인기 품목의 접근성과 품절 가능성을 먼저 점검하라는 의미입니다.", en: "This is not a fixed quantity order; it means checking access to popular items and stock-out risk first.", zh: "这不是固定数量指令，而是建议优先检查热门商品的可取性与缺货风险。", ja: "固定数量の指示ではなく、人気商品の取りやすさと欠品リスクを先に確認するという意味です。" }),
    localText(lang, { ko: "날씨와 고객 흐름에 맞춰 안내 강도를 조정하고, 실제 매출 증가를 보장하는 문구는 사용하지 마세요.", en: "Adjust the message to weather and customer flow; it does not guarantee a sales increase.", zh: "请根据天气与顾客动线调整提示力度，不代表保证销售增长。", ja: "天気と顧客動線に合わせて案内を調整してください。売上増加を保証するものではありません。" }),
  ];

  return (
    <section className="view-section business-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">KORETAIL FOR BUSINESS · AUG 24</p>
          <h1>{localText(lang, { ko: "내일 손님이 얼마나 올까,\n무엇을 준비할까?", en: "How much demand tomorrow,\nand what should you prepare?", zh: "明天会来多少客人，\n要准备什么？", ja: "明日の需要はどのくらい？\n何を準備する？" })}</h1>
          <p>{localText(lang, { ko: "공공데이터를 인력·재고·프로모션 준비로 바꿉니다.", en: "Turn public signals into staffing, stock and promotion actions.", zh: "把公共数据转化为人员、库存与促销行动。", ja: "公共データをスタッフ・在庫・販促の準備に変換します。" })}</p>
        </div>
        <DemoLabel lang={lang} />
      </div>

      <div className="business-mode" role="tablist">
        <button className={mode === "briefing" ? "active" : ""} onClick={() => setMode("briefing")} role="tab" aria-selected={mode === "briefing"}>{localText(lang, { ko: "내일 운영 브리핑", en: "TOMORROW BRIEFING", zh: "明日运营简报", ja: "明日の開店ブリーフ" })}</button>
        <button className={mode === "history" ? "active" : ""} onClick={() => setMode("history")} role="tab" aria-selected={mode === "history"}>{localText(lang, { ko: "과거 수요신호", en: "HISTORICAL SIGNALS", zh: "历史信号", ja: "過去の需要シグナル" })}</button>
        <button className={mode === "accuracy" ? "active" : ""} onClick={() => setMode("accuracy")} role="tab" aria-selected={mode === "accuracy"}>{localText(lang, { ko: "예측 성과", en: "FORECAST PERFORMANCE", zh: "预测表现", ja: "予測パフォーマンス" })}</button>
      </div>

      {mode === "accuracy" ? <HistoryView lang={lang} embedded /> : mode === "history" ? <BusinessHistoryView lang={lang} selected={selected} setSelected={setSelected} /> : <div className="business-briefing-stack">
        <nav className="business-reading-map" aria-label={localText(lang, { ko: "매장 브리핑 구성", en: "Business briefing sections", zh: "门店简报内容", ja: "店舗ブリーフの構成" })}><a href="#business-tomorrow">{localText(lang, { ko: "내일", en: "TOMORROW", zh: "明天", ja: "明日" })}</a><a href="#business-why">WHY</a><a href="#opening-brief">OPENING BRIEF</a><button onClick={() => setMode("history")}>{localText(lang, { ko: "과거", en: "HISTORY", zh: "历史", ja: "履歴" })}</button><button onClick={() => setMode("accuracy")}>DATA</button></nav>
        <div className="area-tabs" role="tablist">
          {(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}
        </div>

        <section className="business-overview" id="business-tomorrow" aria-label="business demand briefing">
          <div className="business-pulse">
            <p className="eyebrow">{localText(lang, { ko: "내일 외국인 쇼핑수요", en: "TOMORROW FOREIGN SHOPPING DEMAND", zh: "明日外国游客购物需求", ja: "明日の外国人ショッピング需要" })}</p>
            <div><strong>{score}</strong><span>{statusLabel(lang, score).toUpperCase()}<small>{area.en} · {areaLocalName(selected, lang)}</small></span></div>
            <dl>
              <div><dt>{localText(lang, { ko: "최근 4주 평균 대비", en: "VS. 4-WEEK AVG.", zh: "较近4周平均", ja: "直近4週平均比" })}</dt><dd>+12%</dd></div>
              <div><dt>{localText(lang, { ko: "집중 시간", en: "PRIORITY TIME", zh: "重点时间", ja: "ピーク時間" })}</dt><dd>{profile.best}</dd></div>
              <div><dt>{localText(lang, { ko: "검증 상태", en: "VALIDATION", zh: "验证状态", ja: "検証状況" })}</dt><dd>{localText(lang, { ko: "미검증", en: "NOT VERIFIED", zh: "未验证", ja: "未検証" })}</dd></div>
            </dl>
          </div>
          <div className="industry-picker">
            <div><p className="eyebrow">INDUSTRY</p><h2>{localText(lang, { ko: "내 업종 선택", en: "Choose your business", zh: "选择店铺类型", ja: "業種を選択" })}</h2></div>
            {(Object.keys(industryProfiles) as IndustryId[]).map((id, index) => <button key={id} className={industry === id ? "active" : ""} onClick={() => setIndustry(id)}><span>0{index + 1}</span><strong>{industryProfiles[id].label[lang]}</strong><small>{industryProfiles[id].short}</small></button>)}
          </div>
        </section>

        <section className="action-plan" id="opening-brief" aria-labelledby="action-plan-title">
          <div className="section-head"><div><p className="eyebrow">OPENING BRIEF · {profile.short}</p><h2 id="action-plan-title">{localText(lang, { ko: "내일 오픈 전 브리프", en: "OPENING BRIEF", zh: "明日开店简报", ja: "明日の開店前ブリーフ" })}</h2></div><DemoLabel lang={lang} /></div>
          <h3>{profile.headline[lang]}</h3>
          <p className="opening-brief-copy">{localText(lang, { ko: `내일 ${profile.best.replace(" — ", "~")}에 수요가 집중될 수 있습니다. 최근 4주 평균보다 높은 Demo 신호이므로, 개점 전부터 다국어 안내와 핵심 동선을 먼저 확인하는 것이 좋습니다.`, en: `Demand may concentrate around ${profile.best}. The demo signal is above its four-week average, so check multilingual guidance and the main customer path before opening.`, zh: `明日需求可能集中在${profile.best.replace(" — ", "至")}。演示信号高于近4周平均，建议开店前先检查多语种说明与主要顾客动线。`, ja: `明日は${profile.best.replace(" — ", "〜")}に需要が集中する可能性があります。直近4週平均を上回るデモシグナルのため、開店前に多言語案内と主要動線を確認しておくと安心です。` })}</p>
          <div className="action-rows">{profile.actions[lang].map(([label, action], index) => <div key={label}><span>0{index + 1} · {label}</span><p><strong>{action}</strong><small>{actionNotes[index]}</small></p></div>)}</div>
          <p className="truth-note">{localText(lang, { ko: "추천은 데모 신호 기반이며 실시간 매출 보장이 아닙니다.", en: "Recommendations use demo signals and are not a live business guarantee.", zh: "建议基于演示信号，不是实时经营保证。", ja: "提案はデモシグナルに基づく運営参考情報で、売上を保証するものではありません。" })}</p>
        </section>

        <section className="decision-signals" id="business-why" aria-labelledby="decision-signals-title">
          <div className="section-head"><div><p className="eyebrow">WHY · 8 DEMO SIGNALS</p><h2 id="decision-signals-title">{localText(lang, { ko: "판단에 사용한 데이터", en: "DECISION SIGNALS", zh: "判断依据", ja: "判断に使ったデータ" })}</h2></div><strong>DEMO · NOT LIVE</strong></div>
          <div className="decision-grid">{signals.map(([name, value, source], index) => <div key={name}><span>0{index + 1}</span><p>{name}<small>{source}</small></p><strong>{value}</strong></div>)}</div>
          <p className="signal-truth">{localText(lang, { ko: "네이버 수치는 상대 클릭지수이지 매출이 아닙니다. 공항 전체승객은 외국인 수가 아닙니다.", en: "Naver is a relative click index, not sales. Total airport passengers are not foreign visitors.", zh: "Naver数值为相对点击指数，并非销售额。机场总客流并不等同于外国人。", ja: "Naverの数値は相対クリック指数で、売上ではありません。空港の総旅客数は外国人数ではありません。" })}</p>
        </section>

        <section className="business-pro">
          <div><p className="eyebrow">KORETAIL PRO · PREVIEW</p><h2>{localText(lang, { ko: "매일 문 열기 전, 한 장으로 받으세요.", en: "One page before you open.", zh: "每天开店前收到一页简报。", ja: "開店前に、一枚のブリーフを。" })}</h2><p>{localText(lang, { ko: "업종별 7일 예측·알림·지역 비교·과거 정확도·CSV.", en: "7-day industry forecast, alerts, comparisons, accuracy and CSV.", zh: "7日行业预测、提醒、区域比较、历史准确率与CSV。", ja: "業種別7日予測・通知・エリア比較・過去精度・CSV。" })}</p></div>
          <button onClick={() => setProOpen(true)}>{copy[lang].openPreview} ↗</button>
        </section>
      </div>}
    </section>
  );
}

function BusinessHistoryView({ lang, selected, setSelected }: { lang: Lang; selected: AreaId; setSelected: (id: AreaId) => void }) {
  const [period, setPeriod] = useState<"3m" | "6m" | "12m" | "all" | "custom">("6m");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(foreignMonthly.at(-6)!.month);
  const [rangeEnd, setRangeEnd] = useState(foreignMonthly.at(-1)!.month);
  const [draftStart, setDraftStart] = useState(foreignMonthly.at(-6)!.month);
  const [draftEnd, setDraftEnd] = useState(foreignMonthly.at(-1)!.month);
  const count = period === "3m" ? 3 : period === "6m" ? 6 : period === "12m" ? 12 : foreignMonthly.length;
  const rows = period === "custom" ? foreignMonthly.filter((item) => item.month >= rangeStart && item.month <= rangeEnd) : foreignMonthly.slice(-count);
  const values = rows.map((item) => item[selected]);
  const max = Math.max(1, ...values);
  const startRow = rows.at(0);
  const endRow = rows.at(-1);
  const periodLabel = startRow && endRow ? (startRow.month === endRow.month ? startRow.month : `${startRow.month} — ${endRow.month}`) : "—";
  const periodAverage = rows.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / rows.length) : 0;
  const periodChange = startRow && endRow && startRow.month !== endRow.month && startRow[selected] ? (endRow[selected] - startRow[selected]) / startRow[selected] * 100 : null;
  const peakRow = rows.reduce<(typeof foreignMonthly)[number] | null>((best, item) => !best || item[selected] > best[selected] ? item : best, null);
  const detail = foreignJulyDetail[selected];
  const area = areaInfo[selected];
  const weekday = lang === "ko" ? ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"] : lang === "zh" ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] : lang === "ja" ? ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"] : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return <section className="business-history">
    <div className="area-tabs" role="tablist">{(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}</div>
    <div className="section-head"><div><p className="eyebrow">OFFICIAL HISTORICAL · SEOUL SHORT-STAY FOREIGN POPULATION</p><h2>{localText(lang, { ko: `${area.ko} 외국인 생활인구 흐름`, en: `${area.en} FOREIGN POPULATION HISTORY`, zh: `${area.zh}外国人生活人口趋势`, ja: `${area.ja}の外国人生活人口推移` })}</h2></div><span className="official-label">OFFICIAL HISTORICAL</span></div>
    <p className="volume-explainer">{localText(lang, { ko: "월별 시간당 평균 생활인구입니다. 방문자 수나 매출이 아니며, 당시 저장된 예측기록도 아닙니다.", en: "Monthly average hourly living population—not visits, sales, or a forecast captured at the time.", zh: "这是月度每小时平均生活人口，不是访问人数、销售额或当时保存的预测。", ja: "月別の時間当たり平均生活人口です。訪問者数や売上、当時保存された予測記録ではありません。" })}</p>
    <div className="history-controls"><div role="tablist" aria-label="Period">{(["3m", "6m", "12m", "all"] as const).map((item) => <button key={item} className={period === item ? "active" : ""} onClick={() => { setPeriod(item); setRangeOpen(false); }}>{item === "3m" ? localText(lang, { ko: "3개월", en: "3M", zh: "3个月", ja: "3か月" }) : item === "6m" ? localText(lang, { ko: "6개월", en: "6M", zh: "6个月", ja: "6か月" }) : item === "12m" ? localText(lang, { ko: "12개월", en: "12M", zh: "12个月", ja: "12か月" }) : localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全期間" })}</button>)}<button className={(period === "custom" ? "active " : "") + "range-trigger"} onClick={() => { setDraftStart(rangeStart); setDraftEnd(rangeEnd); setRangeOpen((open) => !open); }} aria-expanded={rangeOpen}>＋ {localText(lang, { ko: "기간 설정", en: "CUSTOM", zh: "自定义", ja: "期間指定" })}</button></div></div>
    {rangeOpen && <MonthRangePicker lang={lang} start={draftStart} end={draftEnd} min={foreignMonthly[0].month} max={foreignMonthly.at(-1)!.month} onStart={setDraftStart} onEnd={setDraftEnd} onCancel={() => setRangeOpen(false)} onApply={(nextStart, nextEnd) => { setRangeStart(nextStart); setRangeEnd(nextEnd); setPeriod("custom"); setRangeOpen(false); }} />}
    <div className="history-kpis foreign-kpis">
      <div><span>{localText(lang, { ko: "선택 기간 월평균", en: "SELECTED-PERIOD MONTHLY AVG.", zh: "所选期间月均", ja: "選択期間の月平均" })}</span><strong>{formatCount(lang, periodAverage)}</strong><small>{periodLabel} · {area.en}</small></div>
      <div><span>{localText(lang, { ko: "기간 처음 대비", en: "START-TO-END CHANGE", zh: "期初至期末变化", ja: "期間初比" })}</span><strong>{periodChange === null ? "—" : `${periodChange >= 0 ? "+" : ""}${periodChange.toFixed(1)}%`}</strong><small>{startRow?.month ?? "—"} → {endRow?.month ?? "—"}</small></div>
      <div><span>{localText(lang, { ko: "선택 기간 최고 월", en: "PEAK MONTH", zh: "所选期间峰值月", ja: "選択期間のピーク月" })}</span><strong>{peakRow?.month ?? "—"}</strong><small>{peakRow ? formatCount(lang, peakRow[selected]) : "—"}</small></div>
    </div>
    <div className="official-chart foreign-chart" aria-label="Monthly foreign living population">{rows.map((item) => <div key={item.month}><i style={{ height: `${Math.max(8, item[selected] / max * 100)}%` }} /><span>{item.month.slice(2).replace("-", ".")}</span></div>)}</div>
    <p className="history-detail-label">LATEST DETAIL · 2026.07 · {localText(lang, { ko: "아래 시간·요일·국적 상세는 선택 기간 집계와 별도입니다.", en: "The hour, weekday and nationality details below are the latest July profile, separate from the selected-period summary.", zh: "以下时段、星期与国籍明细为最新7月画像，与所选期间摘要分开。", ja: "以下の時間・曜日・国籍の詳細は最新の7月プロファイルで、選択期間の集計とは別です。" })}</p>
    <div className="history-patterns">
      <div><span>{localText(lang, { ko: "피크 시간", en: "PEAK HOUR", zh: "高峰时间", ja: "ピーク時間" })}</span><strong>{detail.peakHour}</strong><small>2026.07 · {localText(lang, { ko: "월 평균", en: "MONTHLY AVG.", zh: "月均", ja: "月平均" })}</small></div>
      <div><span>{localText(lang, { ko: "피크 요일", en: "PEAK WEEKDAY", zh: "高峰星期", ja: "ピーク曜日" })}</span><strong>{weekday[detail.peakWeekday]}</strong><small>2026.07</small></div>
      <div><span>{localText(lang, { ko: "중국인 생활인구", en: "CHINESE LIVING POP.", zh: "中国人生活人口", ja: "中国人生活人口" })}</span><strong>{formatCount(lang, detail.china)}</strong><small>{detail.chinaShare.toFixed(1)}% · {localText(lang, { ko: "공식 분류", en: "OFFICIAL CATEGORY", zh: "官方分类", ja: "公式分類" })}</small></div>
    </div>
    <div className="deterministic-insights"><p className="eyebrow">BUSINESS READING · DETERMINISTIC · {periodLabel}</p><div><span>01</span><strong>{periodChange === null ? localText(lang, { ko: `${periodLabel}의 공식 월평균 생활인구를 표시합니다.`, en: `This shows the official monthly-average living population for ${periodLabel}.`, zh: `显示${periodLabel}的官方月均生活人口。`, ja: `${periodLabel}の公式月平均生活人口を表示しています。` }) : localText(lang, { ko: `선택 기간 마지막 달은 첫 달보다 ${Math.abs(periodChange).toFixed(1)}% ${periodChange >= 0 ? "높았습니다" : "낮았습니다"}.`, en: `The final month was ${Math.abs(periodChange).toFixed(1)}% ${periodChange >= 0 ? "above" : "below"} the first month in the selected period.`, zh: `所选期间末月较首月${periodChange >= 0 ? "高" : "低"}${Math.abs(periodChange).toFixed(1)}%。`, ja: `選択期間の最終月は開始月を${Math.abs(periodChange).toFixed(1)}%${periodChange >= 0 ? "上回りました" : "下回りました"}。` })}</strong></div><div><span>02</span><strong>{localText(lang, { ko: "이 값은 업종 매출이 아니라 운영계획에 참고하는 지역 수요신호입니다.", en: "This is an area demand signal for planning, not industry sales.", zh: "该数值不是行业销售额，而是用于运营计划的区域需求信号。", ja: "この値は業種売上ではなく、運営計画の参考にするエリア需要シグナルです。" })}</strong></div></div>
    <p className="coverage-note">COVERAGE USED IN SITE · 2025.01 — 2026.07 · SOURCE COVERAGE VERIFIED · 2017.01 — 2026.07 · {localText(lang, { ko: "범위: 명동=명동 행정동, 홍대=서교동, 성수=성수 4개 행정동 합계", en: "Scope: Myeong-dong admin dong; Hongdae=Seogyo-dong; Seongsu=four Seongsu admin dongs", zh: "范围：明洞行政洞、弘大=西桥洞、圣水=4个圣水行政洞合计", ja: "範囲：明洞=明洞行政洞、弘大=西橋洞、聖水=聖水4行政洞の合計" })}</p>
  </section>;
}

function HistoryView({ lang, embedded = false }: { lang: Lang; embedded?: boolean }) {
  return (
    <section className={(embedded ? "embedded-history " : "view-section ") + "history-view"}>
      <div className="view-intro"><div><p className="eyebrow">FORECAST VALIDATION · DATA TRUTH</p><h1>{localText(lang, { ko: "예측 검증은 아직 시작 전입니다", en: "FORECAST VALIDATION HAS NOT STARTED", zh: "预测验证尚未开始", ja: "予測検証はまだ始まっていません" })}</h1><p>{localText(lang, { ko: "Demo 성과표를 제거했습니다. 이제 실제로 저장한 예측과 이후 확정된 결과가 연결될 때만 성과를 표시합니다.", en: "The demo scoreboard has been removed. Performance will appear only when captured forecasts are linked to later outcomes.", zh: "已移除演示成绩表。只有保存的预测与后续实际结果匹配后才会显示表现。", ja: "デモの成績表を削除しました。保存した予測と後日確定した実績を照合できた場合のみ成績を表示します。" })}</p></div><span className="unverified-label">NO PUBLIC SCORE</span></div>
      <ForecastVerification lang={lang} />
      <div className="benchmark pending">
        <div className="section-head"><div><p className="eyebrow">BASELINES · READY FOR FUTURE OUTCOMES</p><h2>{localText(lang, { ko: "검증이 시작되면 무엇과 비교하나요?", en: "WHAT WILL THE MODEL BE COMPARED WITH?", zh: "开始验证后与什么比较？", ja: "検証開始後、何と比較する？" })}</h2></div><span>{localText(lang, { ko: "현재 점수 없음", en: "NO SCORES YET", zh: "暂无分数", ja: "現在スコアなし" })}</span></div>
        <div className="benchmark-row unavailable"><span>{localText(lang, { ko: "지난주 같은 요일", en: "SAME WEEKDAY LAST WEEK", zh: "上周同星期", ja: "前週同曜日" })}<small>BASELINE 01</small></span><strong>—</strong></div>
        <div className="benchmark-row unavailable"><span>{localText(lang, { ko: "최근 4주 같은 요일 평균", en: "RECENT 4-WEEK WEEKDAY AVERAGE", zh: "近4周同星期平均", ja: "直近4週の同曜日平均" })}<small>BASELINE 02</small></span><strong>—</strong></div>
        <div className="benchmark-row unavailable"><span>{localText(lang, { ko: "계절 평균", en: "SEASONAL AVERAGE", zh: "季节平均", ja: "季節平均" })}<small>BASELINE 03</small></span><strong>—</strong></div>
        <div className="benchmark-row unavailable"><span>KORETAIL CHAMPION<small>{localText(lang, { ko: "Production 예측기록 전에는 없음", en: "Unavailable before production captures", zh: "Production开始保存前不可用", ja: "Production予測保存前は未設定" })}</small></span><strong>—</strong></div>
      </div>
      <div className="harness-note"><p className="eyebrow">EVOLUTION HARNESS · NOT PROMOTING</p><div><span>CAPTURE</span><b>→</b><span>RESOLVE</span><b>→</b><span>COMPARE</span><b>→</b><span>REVIEW</span></div><p>{localText(lang, { ko: "오프라인 Backfill은 연구에는 쓸 수 있지만 Production 승격 증거가 아닙니다. 최소 90일의 Prospective 결과와 기준모델 우위가 없으면 자동승격하지 않습니다.", en: "Backfill can support research but cannot justify production promotion. No automatic promotion occurs without at least 90 days of prospective outcomes and baseline advantage.", zh: "回填数据可用于研究，但不能作为Production晋级证据。没有至少90天的前瞻结果且未优于基线，不自动晋级。", ja: "Backfillは研究には使えますがProduction昇格の根拠にはなりません。少なくとも90日の前向き実績とベースライン優位がなければ自動昇格しません。" })}</p></div>
    </section>
  );
}

function MoreView({
  lang, setLang, selected, terminal, industry, watchedAirlines, setProOpen, statePreview, setStatePreview, onAirport, onBusiness, onInsights,
}: {
  lang: Lang; setLang: (lang: Lang) => void; setProOpen: (open: boolean) => void;
  selected: AreaId; terminal: Terminal; industry: IndustryId; watchedAirlines: string[];
  statePreview: string; setStatePreview: (state: string) => void;
  onAirport: (section: AirportSection) => void; onBusiness: () => void; onInsights: () => void;
}) {
  const t = copy[lang];
  const [sourceFilter, setSourceFilter] = useState<"all" | "ready" | "key" | "conditional">("all");
  const visibleSources = sourceCatalog.filter((item) => sourceFilter === "all" || item.tier === sourceFilter);
  const faq = [
    [localText(lang, { ko: "KORETAIL 점수는 무엇인가요?", en: "What is the KORETAIL score?", zh: "KORETAIL指数是什么？", ja: "KORETAIL指数とは？" }), localText(lang, { ko: "공항·외국인 생활인구·관광·날씨 등 여러 신호를 0~100으로 합성한 수요지표입니다. 현재 화면의 예측점수는 Demo입니다.", en: "It combines airport, foreign-population, tourism and weather signals into a 0–100 demand index. Forecast scores on this Work site are Demo.", zh: "它把机场、外国人生活人口、旅游与天气等信号合成为0到100的需求指数。本Work站点的预测指数为演示值。", ja: "空港・外国人生活人口・観光・天気などのシグナルを0〜100に統合した需要指数です。このWorkサイトの予測指数はデモです。" })],
    [localText(lang, { ko: "공항 승객 수는 외국인 관광객 수인가요?", en: "Are airport passengers foreign tourists?", zh: "机场旅客数等于外国游客数吗？", ja: "空港旅客数は外国人観光客数ですか？" }), localText(lang, { ko: "아닙니다. 공항 승객에는 내국인과 환승객 등이 포함되며 외국인 쇼핑수요의 보조 신호로만 사용합니다.", en: "No. Passenger totals include Korean travelers and other groups; they are only a supporting signal for foreign shopping demand.", zh: "不是。机场旅客包含韩国旅客与其他群体，只作为外国游客购物需求的辅助信号。", ja: "いいえ。空港旅客には韓国人旅行者なども含まれ、外国人買い物需要の補助シグナルとしてのみ使います。" })],
    [localText(lang, { ko: "T1과 T2는 어떻게 구분하나요?", en: "How are T1 and T2 separated?", zh: "T1和T2如何区分？", ja: "T1とT2はどう分けますか？" }), localText(lang, { ko: "공식 데이터에 터미널 필드가 있을 때만 구분합니다. 전체값을 임의 비율로 나누지 않습니다.", en: "Only official terminal fields are used. All-airport totals are never split by assumed ratios.", zh: "仅在官方数据提供航站楼字段时区分，不会按假设比例拆分整体值。", ja: "公式データにターミナル項目がある場合のみ区分し、全体値を推定比率で分割しません。" })],
    [localText(lang, { ko: "예측값과 실제값은 어떻게 다른가요?", en: "How do forecasts differ from actuals?", zh: "预测值与实际值有何不同？", ja: "予測値と実績値の違いは？" }), localText(lang, { ko: "예측은 미래 대상값이고 실제값은 이후 확정된 결과입니다. 공식 과거 실적을 당시 예측처럼 표시하지 않습니다.", en: "A forecast targets the future; an actual is resolved later. Official history is never relabeled as a forecast captured at the time.", zh: "预测面向未来，实际值是事后确认的结果。官方历史实绩不会被标成当时的预测。", ja: "予測は未来の対象値、実績は後日確定した結果です。公式の過去実績を当時の予測として表示しません。" })],
    [localText(lang, { ko: "Demo Data는 무엇인가요?", en: "What is Demo Data?", zh: "什么是演示数据？", ja: "デモデータとは？" }), localText(lang, { ko: "실시간 API 연결 전 기능과 정보구조를 검증하기 위한 예시입니다. 공식 과거실적은 Demo와 별도로 표시합니다.", en: "It is sample data used to test functions before live APIs are connected. Official historical results are labeled separately.", zh: "它是在实时API接入前验证功能与信息结构的示例，官方历史实绩会单独标注。", ja: "リアルタイムAPI接続前に機能と情報設計を検証するサンプルです。公式の過去実績は別に表示します。" })],
  ];
  return (
    <section className="view-section more-view">
      <div className="view-intro"><div><p className="eyebrow">SYSTEM &amp; PRODUCT</p><h1>{t.more}</h1></div></div>
      <FeatureDiscovery lang={lang} onAirport={onAirport} onBusiness={onBusiness} onInsights={onInsights} onMore={() => document.getElementById("my-retailpulse")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
      <div className="more-section">
        <div className="section-head"><div><p className="eyebrow">LIVE READINESS · CURRENT BUILD</p><h2>{localText(lang, { ko: "연결 준비 상태", en: "LIVE CONNECTION READINESS", zh: "实时接入准备状态", ja: "Live接続の準備状況" })}</h2></div><strong className="health-score">2 / 4</strong></div>
        <p className="delay-note">{localText(lang, {
          ko: "공식 과거 데이터 2개는 사용 중이지만, 방문 시 호출되는 Live 데이터 API는 아직 0개입니다. 가짜 업데이트 시각을 표시하지 않습니다.",
          en: "Two official historical sources are bundled, but the site still calls zero live data APIs. No simulated update timestamps are shown.",
          zh: "已内置2个官方历史来源，但网站目前调用的实时数据API仍为0，不显示模拟更新时间。",
          ja: "公式履歴2件は内蔵済みですが、閲覧時に呼び出すLiveデータAPIはまだ0件です。架空の更新時刻は表示しません。",
        })}</p>
        <div className="health-list">
          {readinessSources.map((item) => <div key={item.label.en}><span><i className={item.tone} />{item.label[lang]}</span><strong>{item.state[lang]}</strong></div>)}
        </div>
      </div>
      <section className="source-directory" aria-labelledby="source-directory-title">
        <div className="section-head">
          <div><p className="eyebrow">FREE &amp; CONDITIONAL DATA MAP</p><h2 id="source-directory-title">{localText(lang, { ko: "데이터 출처와 연동 조건", en: "DATA SOURCES & ACCESS", zh: "数据来源与接入条件", ja: "データ出典と接続条件" })}</h2></div>
          <strong>{visibleSources.length} / {sourceCatalog.length}</strong>
        </div>
        <p className="source-note">{localText(lang, { ko: "무료 조회와 무료 상업용 API는 다릅니다. 관광데이터랩 화면을 스크래핑하지 않고, KT·SKT 데이터를 무조건 무료라고 표시하지 않습니다.", en: "Free viewing is not the same as a free commercial API. We do not scrape Tourism Data Lab or treat KT/SKT data as unrestricted.", zh: "‘可免费查看’不等于‘可免费用于商业API’。不会抓取韩国观光数据实验室页面，也不会把KT、SKT数据标成无条件免费。", ja: "無料閲覧と無料の商用APIは同じではありません。観光データラボ画面をスクレイピングせず、KT・SKTデータを無条件の無料とは表示しません。" })}</p>
        <section className="runtime-api-audit" aria-labelledby="runtime-api-audit-title">
          <div><p className="eyebrow">CURRENT SITE RUNTIME AUDIT</p><h3 id="runtime-api-audit-title">{localText(lang, { ko: "현재 실제 API 연결 상태", en: "CURRENT API CONNECTION STATUS", zh: "当前实际API连接状态", ja: "現在のAPI接続状況" })}</h3><p>{localText(lang, {
            ko: "지금 공개 Site는 방문할 때 외부 공공데이터 API를 직접 호출하지 않습니다. 공항과 외국인 생활인구 과거값은 검증 후 코드에 넣은 정적 집계값이고, 오늘·내일·항공편·게이트·매장 신호는 Live 연결 전 Demo입니다.",
            en: "The public Work site does not call an external public-data API when a visitor opens it. Airport and foreign-population history are verified static aggregates; today, tomorrow, flight, gate and business signals remain Demo until live connections are added.",
            zh: "当前公开站点在访问时不会直接调用外部公共数据API。机场与外国人生活人口历史值为核验后内置的静态汇总；今天、明天、航班、登机口与门店信号在实时接入前均为演示数据。",
            ja: "現在の公開Workサイトは、閲覧時に外部の公共データAPIを直接呼び出していません。空港と外国人生活人口の履歴は検証済みの静的集計値で、今日・明日・便・搭乗口・店舗シグナルはLive接続前のデモです。",
          })}</p></div>
          <dl>
            <div><dt>LIVE RUNTIME DATA API</dt><dd>0</dd><small>{localText(lang, { ko: "현재 직접 호출 0개", en: "NO DIRECT CALLS", zh: "当前无直接调用", ja: "現在の直接呼出しなし" })}</small></div>
            <div><dt>OFFICIAL HISTORY BUNDLED</dt><dd>2</dd><small>{localText(lang, { ko: "공항 · 외국인 생활인구", en: "AIRPORT · FOREIGN POPULATION", zh: "机场 · 外国人生活人口", ja: "空港 · 外国人生活人口" })}</small></div>
            <div><dt>AUDITED SOURCE CANDIDATES</dt><dd>{sourceCatalog.length}</dd><small>{localText(lang, { ko: "아래 연동 후보 전체", en: "ALL CANDIDATES BELOW", zh: "以下全部候选来源", ja: "以下の接続候補" })}</small></div>
          </dl>
          <p className="runtime-font-note">{localText(lang, { ko: "Pretendard·Noto 웹폰트 요청은 화면 자산이며 관광·공항 데이터 API가 아닙니다.", en: "Pretendard and Noto web-font requests are presentation assets, not tourism or airport data APIs.", zh: "Pretendard与Noto网页字体请求属于界面资源，并非旅游或机场数据API。", ja: "Pretendard・NotoのWebフォント取得は表示用アセットで、観光・空港データAPIではありません。" })}</p>
        </section>
        <section className="credential-audit" aria-labelledby="credential-audit-title">
          <div className="section-head"><div><p className="eyebrow">KEY COUNT · OFFICIAL TERMS AUDIT</p><h3 id="credential-audit-title">{localText(lang, { ko: "공항용 키는 몇 개 필요한가요?", en: "HOW MANY AIRPORT KEYS ARE NEEDED?", zh: "机场数据需要几个密钥？", ja: "空港用キーはいくつ必要？" })}</h3></div><span className="official-label">AUDITED · 2026.08.23</span></div>
          <p className="credential-answer">{localText(lang, {
            ko: "세 개의 별도 키가 아닙니다. 공항 최소 Live 구성은 공공데이터포털 프로젝트 서비스키 1개를 서버에 보관하고, 아래 API 3개를 각각 활용신청하는 구조입니다.",
            en: "Not three separate secrets. The minimum live-airport setup keeps one data.go.kr project service key on the server and submits three separate API applications.",
            zh: "不是3个独立密钥。机场最小实时方案是在服务器保存1个data.go.kr项目服务密钥，并分别申请以下3个API。",
            ja: "別々の秘密キーが3つ必要なわけではありません。空港Liveの最小構成は、data.go.krのプロジェクトサービスキー1つをサーバーに保管し、以下3 APIを個別に利用申請します。",
          })}</p>
          <div className="credential-summary">
            <p><span>SECRET</span><strong>1</strong><small>{localText(lang, { ko: "data.go.kr 프로젝트 서비스키", en: "data.go.kr project service key", zh: "data.go.kr项目服务密钥", ja: "data.go.krプロジェクトサービスキー" })}</small></p>
            <p><span>API APPLICATIONS</span><strong>3</strong><small>{localText(lang, { ko: "운항 상세 · T1 출국장 · 입국장", en: "Flights · T1 checkpoints · arrivals", zh: "航班详情 · T1出境区 · 入境大厅", ja: "運航詳細・T1出国場・入国場" })}</small></p>
            <p><span>LIVE API COST</span><strong>{localText(lang, { ko: "0원", en: "FREE", zh: "免费", ja: "無料" })}</strong><small>{localText(lang, { ko: "개발 한도 내 · 운영증설 심의", en: "Within dev quotas · ops review", zh: "开发额度内 · 生产扩容需审核", ja: "開発枠内・運用増枠は審査" })}</small></p>
          </div>
          <ol className="credential-applications">
            <li><span>01</span><p><strong>{localText(lang, { ko: "항공기 운항 상세", en: "FLIGHT OPERATION DETAILS", zh: "航班运行详情", ja: "航空機運航詳細" })}</strong><small>D-3 — D+6 · 500 DEV CALLS/DAY · {localText(lang, { ko: "무료 · 운영심의", en: "FREE · OPS REVIEW", zh: "免费 · 生产审核", ja: "無料・運用審査" })}</small></p></li>
            <li><span>02</span><p><strong>{localText(lang, { ko: "출국장 혼잡도", en: "DEPARTURE CHECKPOINT CONGESTION", zh: "出境安检区拥挤度", ja: "出国場混雑度" })}</strong><small>T1 ONLY · 1 MIN · 1,000 DEV CALLS/DAY · {localText(lang, { ko: "무료 · T2 미제공", en: "FREE · T2 NOT PROVIDED", zh: "免费 · 暂无T2", ja: "無料・T2未提供" })}</small></p></li>
            <li><span>03</span><p><strong>{localText(lang, { ko: "입국장 현황", en: "ARRIVAL HALL STATUS", zh: "入境大厅状态", ja: "入国場状況" })}</strong><small>T1 / T2 · H-2 — H+2 · 500 DEV CALLS/DAY · {localText(lang, { ko: "무료 · 운영심의", en: "FREE · OPS REVIEW", zh: "免费 · 生产审核", ja: "無料・運用審査" })}</small></p></li>
          </ol>
          <p className="credential-caveat">{localText(lang, {
            ko: "여객예고는 공식 웹페이지와 Excel 공개는 확인했지만 자동화용 OpenAPI 키 계약은 확인되지 않아 ‘키 필요’로 세지 않았습니다. 기상청은 같은 data.go.kr 프로젝트키로 별도 활용신청하며, 서울 데이터는 서울 열린데이터광장 키 1개가 추가로 필요합니다.",
            en: "Passenger outlook is publicly viewable and downloadable as Excel, but an automation OpenAPI contract was not verified, so it is not counted as a key. KMA weather uses the same data.go.kr project key with a separate application; Seoul data adds one Seoul Open Data key.",
            zh: "旅客预告可在官网查看并下载Excel，但尚未核实自动化OpenAPI合同，因此不计为密钥。气象厅使用同一data.go.kr项目密钥但需另行申请；首尔数据还需1个首尔开放数据密钥。",
            ja: "旅客予告は公式Web・Excel公開を確認しましたが、自動化用OpenAPI契約は未確認のためキー数に含めません。気象庁は同じdata.go.krプロジェクトキーで別申請、ソウルデータはソウルOpen Dataキーが1つ追加で必要です。",
          })}</p>
        </section>
        <div className="source-filters" role="tablist">
          {(["all", "ready", "key", "conditional"] as const).map((filter) => <button key={filter} role="tab" aria-selected={sourceFilter === filter} className={sourceFilter === filter ? "active" : ""} onClick={() => setSourceFilter(filter)}>{filter === "all" ? localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "すべて" }) : filter === "ready" ? localText(lang, { ko: "공개", en: "OPEN", zh: "开放数据", ja: "公開" }) : filter === "key" ? localText(lang, { ko: "키 필요", en: "KEY", zh: "需要密钥", ja: "キー必要" }) : localText(lang, { ko: "조건 확인", en: "CONDITIONAL", zh: "条件确认", ja: "条件確認" })}</button>)}
        </div>
        <div className="source-list">
          {visibleSources.map((item, index) => <details key={item.source}>
            <summary><span>{String(index + 1).padStart(2, "0")}</span><p><strong>{item.source}</strong><small>{item.provider} · {lang === "ja" ? (sourceUseJa[item.source] ?? item.use.en) : item.use[lang]}</small></p><b className={item.tier}>{item.status}</b></summary>
            <dl>
              <div><dt>REALTIME</dt><dd>{item.realtime}</dd></div><div><dt>HISTORY</dt><dd>{item.history}</dd></div>
              <div><dt>COVERAGE</dt><dd>{item.coverage}</dd></div><div><dt>UPDATE / LAG</dt><dd>{item.lag}</dd></div>
              <div><dt>GEO LEVEL</dt><dd>{item.geo}</dd></div><div><dt>API KEY</dt><dd>{item.key}</dd></div>
              <div><dt>FREE</dt><dd>{item.free}</dd></div><div><dt>COMMERCIAL USE</dt><dd>{item.commercial}</dd></div>
              <div><dt>REDISTRIBUTION</dt><dd>{item.redistribution}</dd></div><div><dt>PRIORITY</dt><dd>{item.priority}</dd></div>
            </dl>
          </details>)}
        </div>
        <p className="signal-truth">{localText(lang, { ko: "서울 상권 추정매출은 외국인 소비 데이터가 아니므로 보조 기준으로만 씁니다.", en: "Seoul estimated commercial sales are not foreign-spend data; they remain a supporting baseline only.", zh: "首尔商圈推算销售额主要不是外国人消费；只作为辅助基准。", ja: "ソウル商圏の推定売上は外国人消費データではないため、補助基準としてのみ使用します。" })}</p>
      </section>
      <section className="methodology" aria-labelledby="methodology-title">
        <div className="section-head"><div><p className="eyebrow">ABOUT · METHODOLOGY · DATA TRUTH</p><h2 id="methodology-title">{localText(lang, { ko: "무엇을 보여주고, 어떻게 판단하나요?", en: "WHAT WE SHOW & HOW IT WORKS", zh: "展示什么，如何判断？", ja: "何を示し、どう判断する？" })}</h2></div><span>UPDATED · 2026.08.23 KST</span></div>
        <p className="methodology-intro">{localText(lang, { ko: "KORETAIL은 서울의 현재 신호, 내일 수요예측, 공식 과거실적을 분리해 보여주는 관광·리테일 데이터 제품입니다. 예측은 확정이 아니며 매장 권고는 운영 참고자료입니다.", en: "KORETAIL separates current signals, tomorrow's forecast and official history. Forecasts are not guarantees; business guidance is operational reference material.", zh: "KORETAIL分开展示首尔当前信号、明日预测与官方历史。预测并非保证，门店建议仅供运营参考。", ja: "KORETAILはソウルの現在シグナル、明日の予測、公式の過去実績を分けて表示します。予測は確約ではなく、店舗向け提案は運営の参考情報です。" })}</p>
        <div className="methodology-steps"><p><span>01</span><strong>CURRENT SIGNALS</strong><small>{localText(lang, { ko: "현재 또는 최신 공개 데이터", en: "Current or latest public data", zh: "当前或最新公开数据", ja: "現在または最新の公開データ" })}</small></p><p><span>02</span><strong>FORECAST</strong><small>{localText(lang, { ko: "오늘·내일·7일 수요 판단", en: "Today, tomorrow and seven-day view", zh: "今日、明日与7日需求判断", ja: "今日・明日・7日間の需要判断" })}</small></p><p><span>03</span><strong>OUTCOME</strong><small>{localText(lang, { ko: "이후 확정된 실제 결과", en: "Actual outcome resolved later", zh: "事后确认的实际结果", ja: "後日確定した実績" })}</small></p><p><span>04</span><strong>SCOREBOARD</strong><small>{localText(lang, { ko: "동일 기준으로 성능 검증", en: "Like-for-like performance check", zh: "按同一口径验证表现", ja: "同じ基準で性能を検証" })}</small></p></div>
        <div className="faq-list">{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
      </section>
      <section className="my-retailpulse" id="my-retailpulse" aria-labelledby="my-retailpulse-title">
        <div className="section-head"><div><p className="eyebrow">LOCAL PREFERENCES · NO ACCOUNT</p><h2 id="my-retailpulse-title">MY KORETAIL</h2></div><span className="official-label">THIS DEVICE</span></div>
        <dl>
          <div><dt>{localText(lang, { ko: "지역", en: "AREA", zh: "地区", ja: "エリア" })}</dt><dd>{areaInfo[selected].en}<small>{areaLocalName(selected, lang)}</small></dd></div>
          <div><dt>{localText(lang, { ko: "터미널", en: "TERMINAL", zh: "航站楼", ja: "ターミナル" })}</dt><dd>{terminal === "all" ? localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全体" }) : terminal}</dd></div>
          <div><dt>{localText(lang, { ko: "관심 항공사", en: "MY AIRLINES", zh: "关注航司", ja: "登録航空会社" })}</dt><dd>{watchedAirlines.length ? watchedAirlines.join(" · ") : localText(lang, { ko: "선택 없음", en: "NOT SET", zh: "未选择", ja: "未設定" })}</dd></div>
          <div><dt>{localText(lang, { ko: "업종", en: "BUSINESS", zh: "行业", ja: "業種" })}</dt><dd>{industryProfiles[industry].label[lang]}</dd></div>
          <div><dt>{localText(lang, { ko: "언어", en: "LANGUAGE", zh: "语言", ja: "言語" })}</dt><dd>{({ ko: "한국어", en: "English", zh: "简体中文", ja: "日本語" } as Record<Lang, string>)[lang]}</dd></div>
        </dl>
        <p>{localText(lang, { ko: "이 선호값만 기기에 저장합니다. 계정·위치·민감정보는 수집하지 않습니다.", en: "Only these preferences are stored on this device. No account, location or sensitive data is collected.", zh: "仅在本设备保存这些偏好，不收集账户、位置或敏感信息。", ja: "この設定だけを端末に保存します。アカウント・位置情報・機微情報は収集しません。" })}</p>
      </section>
      {betaSignupEnabled && <section className="privacy-note" id="privacy" aria-labelledby="privacy-title">
        <div><p className="eyebrow">PRIVACY · BETA SIGNUP</p><h2 id="privacy-title">{localText(lang, { ko: "저장하는 정보", en: "WHAT THE BETA FORM STORES", zh: "测试申请保存哪些信息", ja: "ベータ登録で保存する情報" })}</h2></div>
        <div><p>{localText(lang, { ko: "공개 베타 신청 시 이메일, 관심분야, 언어, 신청경로와 시각을 저장합니다. 결제·위치·민감정보는 수집하지 않습니다.", en: "The beta form stores email, interest, language, signup path and time. It collects no payment, location or sensitive data.", zh: "公开测试申请会保存邮箱、关注领域、语言、申请路径与时间。不收集支付、位置或敏感信息。", ja: "公開ベータ登録ではメール・関心分野・言語・登録経路・時刻を保存します。決済・位置・機微情報は収集しません。" })}</p><BetaDelete lang={lang} /></div>
      </section>}
      <div className="more-section compact">
        <div><p className="eyebrow">LANGUAGE</p><h2>{localText(lang, { ko: "언어", en: "Language", zh: "语言", ja: "言語" })}</h2></div>
        <div className="language-list">
          {([["ko", "한국어"], ["en", "English"], ["zh", "简体中文"], ["ja", "日本語"]] as [Lang, string][]).map(([code, label]) => <button key={code} className={lang === code ? "active" : ""} onClick={() => setLang(code)}>{label}<span>{lang === code ? "●" : "○"}</span></button>)}
        </div>
      </div>
      <div className="pro-banner">
        <div><p className="eyebrow">KORETAIL PRO · PREVIEW</p><h2>{t.pro}</h2><p>{t.proSub}</p></div>
        <button onClick={() => setProOpen(true)}>{t.openPreview} ↗</button>
      </div>
      <div className="more-section compact state-lab">
        <div><p className="eyebrow">QA LAB</p><h2>{t.stateLab}</h2></div>
        <label><span className="sr-only">{t.stateLab}</span><select value={statePreview} onChange={(event) => setStatePreview(event.target.value)}><option value="normal">NORMAL</option><option value="loading">LOADING</option><option value="delayed">API DELAYED</option><option value="partial">PARTIAL DATA</option><option value="terminalPartial">T1 ONLY / T2 FAILED</option><option value="historicalGap">HISTORICAL GAP</option><option value="keyRequired">KEY REQUIRED</option><option value="maintenance">MAINTENANCE</option><option value="noForecast">NO FORECAST</option><option value="noHistory">NO HISTORY</option><option value="network">NETWORK ERROR</option><option value="language">LANGUAGE MISSING</option></select></label>
      </div>
    </section>
  );
}

function StatePreview({ state, lang, onClose }: { state: string; lang: Lang; onClose: () => void }) {
  const labels: Record<string, [string, string]> = {
    loading: ["LOADING", localText(lang, { ko: "최신 신호를 정리하고 있습니다.", en: "Gathering the latest signals.", zh: "正在整理最新信号。", ja: "最新シグナルを整理しています。" })],
    delayed: ["API DELAYED", copy[lang].sourceDelay],
    partial: ["PARTIAL DATA", localText(lang, { ko: "일부 신호를 불러오지 못해 현재 지수는 참고용입니다.", en: "Some signals are unavailable; treat this pulse as directional.", zh: "部分信号暂时不可用，当前指数仅供参考。", ja: "一部シグナルを取得できないため、現在の指数は参考値です。" })],
    terminalPartial: ["T1 ONLY · T2 FAILED", localText(lang, { ko: "T1만 수신되었습니다. T2에 T1 또는 전체값을 복제하지 않습니다.", en: "Only T1 is available; T2 will not copy T1 or all-airport values.", zh: "仅T1数据可用，T2不会复制T1或整体值。", ja: "T1のみ受信しました。T2へT1または全体値を複製しません。" })],
    historicalGap: ["HISTORICAL GAP", localText(lang, { ko: "선택한 기간의 공식 데이터가 비어 있습니다.", en: "Official data is missing for the selected period.", zh: "所选期间的官方数据缺失。", ja: "選択した期間の公式データがありません。" })],
    keyRequired: ["KEY REQUIRED", localText(lang, { ko: "Production 키를 연결하기 전에는 Live 값으로 표시하지 않습니다.", en: "Live values stay off until a production key is connected.", zh: "生产密钥连接前不会显示实时值。", ja: "Productionキー接続前はLive値として表示しません。" })],
    maintenance: ["MAINTENANCE", localText(lang, { ko: "데이터원이 점검 중입니다. 마지막 정상값과 기준시간을 표시합니다.", en: "The source is under maintenance; the last healthy value and time remain visible.", zh: "数据源正在维护，显示最近正常值及其时间。", ja: "データ提供元はメンテナンス中です。最後の正常値と基準時刻を表示します。" })],
    noForecast: ["NO FORECAST", localText(lang, { ko: "현재 제공할 수 있는 예측이 없습니다.", en: "A forecast is not available right now.", zh: "目前没有可用的预测。", ja: "現在利用できる予測がありません。" })],
    noHistory: ["NO HISTORY", localText(lang, { ko: "실제 결과 날짜가 쌓이면 예측 기록을 보여드립니다.", en: "History appears after enough outcome dates are collected.", zh: "结果日期积累后将显示历史表现。", ja: "結果日が蓄積されると予測履歴を表示します。" })],
    network: ["NETWORK ERROR", localText(lang, { ko: "네트워크 연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.", en: "The network connection was interrupted. Try again.", zh: "网络连接中断，请稍后重试。", ja: "ネットワーク接続が切れました。しばらくしてからお試しください。" })],
    language: ["LANGUAGE MISSING", localText(lang, { ko: "일부 번역이 없어 영어 원문으로 표시합니다.", en: "Some content is temporarily shown in English.", zh: "部分内容暂以英语显示。", ja: "一部の翻訳がないため英語で表示します。" })],
  };
  const content = labels[state] ?? labels.partial;
  return <aside className={"state-preview " + state} aria-live="polite"><div><span>{state === "loading" ? "◌" : "!"}</span><p><strong>{content[0]}</strong>{content[1]}</p></div><button onClick={onClose} aria-label="Close">×</button></aside>;
}

function ProModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = copy[lang];
  const features = lang === "zh"
    ? ["分行业7日详细预测", "每日开店简报", "需求变化提醒", "地区比较", "预测验证记录（积累后）", "CSV与高级信号"]
    : lang === "ja"
      ? ["業種別7日詳細予測", "毎日の開店ブリーフ", "需要変化アラート", "エリア比較", "予測検証記録（蓄積後）", "CSV・高度シグナル"]
    : lang === "en"
      ? ["7-day industry forecast", "Daily opening briefing", "Demand change alerts", "Area comparison", "Validation record (after collection)", "CSV & advanced signals"]
      : ["업종별 7일 상세 예측", "매일 오픈 전 운영 브리핑", "수요 변화 알림", "지역 비교", "예측 검증 기록(축적 후)", "CSV·고급 신호"];
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="pro-modal" role="dialog" aria-modal="true" aria-labelledby="pro-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t.close}>×</button>
        <p className="eyebrow">PREVIEW · NO PAYMENT</p>
        <h2 id="pro-title">KORETAIL<br />PRO</h2>
        <p>{t.proSub}</p>
        <div className="pro-features">{features.map((feature, index) => <div key={feature}><span>0{index + 1}</span><strong>{feature}</strong></div>)}</div>
        <div className="pro-price"><span>PREVIEW PRICING<small>{localText(lang, { ko: "실제 확정 가격 아님", en: "Not final pricing", zh: "尚未最终确定", ja: "確定価格ではありません" })}</small></span><strong>₩4,900<small>/ MONTH</small></strong></div>
        <button className="pro-disabled" disabled>{localText(lang, { ko: "결제 기능은 아직 열리지 않았습니다", en: "Payments are not enabled", zh: "付款功能尚未启用", ja: "決済機能はまだ利用できません" })}</button>
      </section>
    </div>
  );
}
