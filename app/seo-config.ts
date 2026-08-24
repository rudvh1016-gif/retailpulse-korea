import type { Metadata } from "next";

export const siteOrigin = "https://retailpulse-seoul.rudvh1016.chatgpt.site";
export const seoLocales = ["ko", "en", "zh", "ja"] as const;
export type SeoLocale = typeof seoLocales[number];
export const seoSlugs = ["myeongdong", "hongdae", "seongsu", "airport", "forecast", "business", "more"] as const;
export type SeoSlug = typeof seoSlugs[number];

const names = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
} as const;

const localeName: Record<SeoLocale, string> = { ko: "한국어", en: "English", zh: "简体中文", ja: "日本語" };

export function pageTitle(locale: SeoLocale, slug?: SeoSlug) {
  if (!slug) return {
    ko: "서울 외국인 쇼핑수요 신호 | RetailPulse Korea",
    en: "Seoul Foreign Retail Signal | RetailPulse Korea",
    zh: "首尔外国游客购物需求信号 | RetailPulse Korea",
    ja: "ソウル外国人ショッピング需要 | RetailPulse Korea",
  }[locale];
  if (slug in names) {
    const name = names[slug as keyof typeof names][locale];
    return {
      ko: `${name} 오늘·내일 쇼핑 수요 및 추천시간 | RetailPulse`,
      en: `${name} Shopping Demand & Best Time | RetailPulse`,
      zh: `${name}今日明日购物需求与推荐时间 | RetailPulse`,
      ja: `${name}の混雑・買い物需要とおすすめ時間 | RetailPulse`,
    }[locale];
  }
  const titles: Record<Exclude<SeoSlug, keyof typeof names>, Record<SeoLocale, string>> = {
    airport: { ko: "인천공항 T1·T2 출국객·항공편·혼잡도 | RetailPulse", en: "Incheon Airport T1·T2 Passengers & Flights | RetailPulse", zh: "仁川机场T1·T2出境旅客与航班 | RetailPulse", ja: "仁川空港T1・T2 出国者・フライト・混雑 | RetailPulse" },
    forecast: { ko: "서울 7일 수요·지역·과거 인사이트 | RetailPulse", en: "Seoul Demand, Area & History Insights | RetailPulse", zh: "首尔需求、地区与历史洞察 | RetailPulse", ja: "ソウル需要・エリア・過去インサイト | RetailPulse" },
    business: { ko: "서울 매장 업종별 오픈 브리프 | RetailPulse", en: "Seoul Store Opening Brief by Industry | RetailPulse", zh: "首尔门店分行业开店简报 | RetailPulse", ja: "ソウル店舗の業種別開店ブリーフ | RetailPulse" },
    more: { ko: "RetailPulse 데이터 출처·방법론", en: "RetailPulse Data Sources & Methodology", zh: "RetailPulse 数据来源与方法", ja: "RetailPulse データ出典・方法論" },
  };
  return titles[slug as Exclude<SeoSlug, keyof typeof names>][locale];
}

export function pageDescription(locale: SeoLocale, slug?: SeoSlug) {
  if (!slug) return {
    ko: "명동·홍대·성수의 오늘과 내일 쇼핑 수요, 추천시간, 인천공항 T1·T2 흐름을 한눈에 확인하세요.",
    en: "Compare today and tomorrow's shopping demand in Myeongdong, Hongdae and Seongsu, plus Incheon Airport T1/T2 flow.",
    zh: "查看明洞、弘大、圣水今天与明天的购物需求、推荐时间，以及仁川机场T1/T2客流。",
    ja: "明洞・弘大・聖水の今日と明日の買い物需要、おすすめ時間、仁川空港T1/T2の流れを確認できます。",
  }[locale];
  if (slug in names) {
    const name = names[slug as keyof typeof names][locale];
    return {
      ko: `${name}의 오늘·내일 쇼핑 수요 점수, 추천 방문시간, 7일 흐름과 예측 근거를 확인하세요. 수치는 Demo 여부와 출처를 구분합니다.`,
      en: `See ${name}'s today/tomorrow shopping pulse, best time, seven-day trend and the signals behind the forecast, with clear data labels.`,
      zh: `查看${name}今日明日购物指数、推荐到访时间、7日趋势和预测依据，并明确区分演示与官方数据。`,
      ja: `${name}の今日・明日の買い物需要、おすすめ時間、7日推移、予測の根拠を確認できます。デモと公式データを明確に区別します。`,
    }[locale];
  }
  const descriptions: Record<Exclude<SeoSlug, keyof typeof names>, Record<SeoLocale, string>> = {
    airport: { ko: "인천공항 전체·T1·T2 출국·입국 흐름, 월별 공식 실적, 항공사별 시간대 집중과 항공편 검색을 제공합니다.", en: "View Incheon Airport all/T1/T2 passenger flow, official monthly history, airline waves and searchable departure/arrival demo flights.", zh: "查看仁川机场整体、T1、T2出入境客流、官方月度历史、航司时段集中度与航班搜索。", ja: "仁川空港全体・T1・T2の出入国フロー、公式月次実績、航空会社別の時間帯集中、便検索を確認できます。" },
    forecast: { ko: "명동·홍대·성수의 7일 쇼핑 수요, 지역 비교, 어제와 달라진 점, T1·T2 공식 과거 흐름을 함께 확인하세요.", en: "Compare seven-day shopping demand, what changed, area signals and official T1/T2 history for Seoul.", zh: "查看明洞、弘大、圣水7日购物需求、昨日变化、地区比较与T1/T2官方历史趋势。", ja: "明洞・弘大・聖水の7日需要、昨日からの変化、エリア比較、T1・T2の公式履歴を確認できます。" },
    business: { ko: "뷰티·패션·식음료 등 6개 업종의 내일 수요신호와 오픈 전 인력·재고·프로모션 준비사항을 확인하세요.", en: "Turn tomorrow's demand signals into opening briefs for six retail industries, including staffing, stock and promotion guidance.", zh: "为美妆、时尚、餐饮等6个行业提供明日需求信号及开店前人员、库存与促销建议。", ja: "ビューティー・ファッション・飲食など6業種の明日需要と、開店前のスタッフ・在庫・販促準備を確認できます。" },
    more: { ko: "RetailPulse의 데이터 출처, 무료·키 필요 여부, Demo·공식 이력 구분, 예측 방법론과 데이터 상태를 확인하세요.", en: "Review RetailPulse data sources, access conditions, Demo/official-history labels, methodology and data health.", zh: "查看RetailPulse数据来源、接入条件、演示与官方历史区分、方法和数据状态。", ja: "RetailPulseのデータ出典、接続条件、デモ・公式履歴の区別、方法論、データ状況を確認できます。" },
  };
  return descriptions[slug as Exclude<SeoSlug, keyof typeof names>][locale];
}

export function buildMetadata(locale: SeoLocale, slug?: SeoSlug): Metadata {
  const path = `/${locale}${slug ? `/${slug}` : ""}`;
  const equivalents = Object.fromEntries(seoLocales.map((language) => [language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : language === "ko" ? "ko-KR" : "en", `/${language}${slug ? `/${slug}` : ""}`]));
  const title = pageTitle(locale, slug);
  const description = pageDescription(locale, slug);
  return {
    title,
    description,
    alternates: { canonical: path, languages: { ...equivalents, "x-default": `/en${slug ? `/${slug}` : ""}` } },
    openGraph: {
      title, description, url: path, siteName: "RetailPulse Korea", type: "website",
      locale: locale === "ko" ? "ko_KR" : locale === "zh" ? "zh_CN" : locale === "ja" ? "ja_JP" : "en_US",
      images: [{ url: "/assets/seoul-hangang.jpeg", width: 1200, height: 1800, alt: `${localeName[locale]} · RetailPulse Korea Seoul` }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/assets/seoul-hangang.jpeg"] },
  };
}
