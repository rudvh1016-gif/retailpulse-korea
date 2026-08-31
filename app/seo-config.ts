import type { Metadata } from "next";

const configuredOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim();
export const isStagingDeployment = process.env.RPK_DEPLOYMENT_STAGE === "staging";

function normalizeOrigin(value: string | undefined): string {
  if (!value) return "http://localhost:3000";
  const url = new URL(value);
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !isLoopback) {
    throw new Error("NEXT_PUBLIC_SITE_ORIGIN must use HTTPS outside localhost.");
  }
  return url.origin;
}

/**
 * Canonical origin for independently deployed production builds.
 * Production deployment is blocked by scripts/validate-production-env.mjs
 * when NEXT_PUBLIC_SITE_ORIGIN is missing or not HTTPS.
 */
export const siteOrigin = normalizeOrigin(configuredOrigin);
export const seoLocales = ["ko", "en", "zh", "ja"] as const;
export type SeoLocale = typeof seoLocales[number];
export const seoSlugs = ["myeongdong", "hongdae", "seongsu", "airport", "forecast", "business", "about", "more"] as const;
export type SeoSlug = typeof seoSlugs[number];

const names = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
} as const;

const localeName: Record<SeoLocale, string> = { ko: "한국어", en: "English", zh: "简体中文", ja: "日本語" };

export function pageTitle(locale: SeoLocale, slug?: SeoSlug) {
  if (!slug) return {
    ko: "서울 외국인 쇼핑수요 신호 | KORETAIL",
    en: "Seoul Foreign Retail Demand Signals | KORETAIL",
    zh: "首尔外国游客购物需求信号 | KORETAIL",
    ja: "ソウル外国人ショッピング需要 | KORETAIL",
  }[locale];
  if (slug in names) {
    const name = names[slug as keyof typeof names][locale];
    return {
      ko: `${name} 실시간 혼잡과 공식 혼잡 예측 | KORETAIL`,
      en: `${name} Live Crowding & Official Forecast | KORETAIL`,
      zh: `${name}实时拥挤与官方预测 | KORETAIL`,
      ja: `${name}のリアルタイム混雑と公式予測 | KORETAIL`,
    }[locale];
  }
  const titles: Record<Exclude<SeoSlug, keyof typeof names>, Record<SeoLocale, string>> = {
    airport: { ko: "인천공항 T1·T2 출국객·항공편·혼잡도 | KORETAIL", en: "Incheon Airport T1·T2 Passengers & Flights | KORETAIL", zh: "仁川机场T1·T2出境旅客与航班 | KORETAIL", ja: "仁川空港T1・T2 出国者・フライト・混雑 | KORETAIL" },
    forecast: { ko: "서울·인천공항 공식 기록과 숫자 설명 | KORETAIL", en: "Seoul & Incheon Official Records Explained | KORETAIL", zh: "首尔与仁川机场官方记录与数据说明 | KORETAIL", ja: "ソウル・仁川空港の公式記録と数値の説明 | KORETAIL" },
    business: { ko: "서울 매장 운영 브리핑과 점검 목록 | KORETAIL", en: "Seoul Store Briefing & Checklist | KORETAIL", zh: "首尔门店运营简报与检查清单 | KORETAIL", ja: "ソウル店舗の運営ブリーフとチェックリスト | KORETAIL" },
    about: { ko: "KORETAIL 소개 — 무엇을 어떻게 보여주나요", en: "About KORETAIL — What It Shows and How", zh: "关于 KORETAIL — 展示什么、如何呈现", ja: "KORETAIL について — 何をどう表示するか" },
    more: { ko: "KORETAIL 데이터 출처·방법론", en: "KORETAIL Data Sources & Methodology", zh: "KORETAIL 数据来源与方法", ja: "KORETAIL データ出典・方法論" },
  };
  return titles[slug as Exclude<SeoSlug, keyof typeof names>][locale];
}

export function pageDescription(locale: SeoLocale, slug?: SeoSlug) {
  if (!slug) return {
    ko: "명동·홍대·성수의 오늘과 내일 쇼핑 수요, 추천시간, 인천공항 T1·T2 흐름을 KORETAIL에서 한눈에 확인하세요.",
    en: "KORETAIL compares today and tomorrow's shopping demand in Myeongdong, Hongdae and Seongsu, plus Incheon Airport T1/T2 flow.",
    zh: "通过KORETAIL查看明洞、弘大、圣水今天与明天的购物需求、推荐时间，以及仁川机场T1/T2客流。",
    ja: "KORETAILで明洞・弘大・聖水の今日と明日の買い物需要、おすすめ時間、仁川空港T1/T2の流れを確認できます。",
  }[locale];
  if (slug in names) {
    const name = names[slug as keyof typeof names][locale];
    return {
      ko: `${name}의 지금 혼잡 상태와 인원 범위, 서울시 공식 예측 기준 가장 붐빌 시간, 날씨와 인근 행사를 확인하세요. 모두 공식 데이터입니다.`,
      en: `See ${name}'s current crowding and headcount range, the busiest hour ahead in Seoul's official forecast, the weather and nearby events — all official data.`,
      zh: `查看${name}当前拥挤状况与人数区间、首尔市官方预测中最拥挤的时段、天气与附近活动，全部为官方数据。`,
      ja: `${name}の現在の混雑と人数レンジ、ソウル市公式予測で最も混雑する時間、天気と周辺イベントを確認できます。すべて公式データです。`,
    }[locale];
  }
  const descriptions: Record<Exclude<SeoSlug, keyof typeof names>, Record<SeoLocale, string>> = {
    airport: { ko: "인천공항 전체·T1·T2의 공식 예상 출국객과 피크, 실제 출발 운항과 집중 게이트, 현재 출국장 대기, 월별 공식 실적을 확인하세요.", en: "Official expected departures and peak, physical departing flights and busiest gates, current departure-hall waits and official monthly history for all terminals, T1 and T2.", zh: "查看仁川机场整体、T1、T2的官方预计出境人数与高峰、实际出发航班与集中登机口、当前出境区等候，以及月度官方实绩。", ja: "仁川空港全体・T1・T2の公式予想出国者とピーク、実出発便と集中ゲート、現在の出国場待ち、月次公式実績を確認できます。" },
    forecast: { ko: "각 지표가 무엇을 뜻하는지, 높으면 어떤 상황인지, 어떤 공식 자료에서 왔는지를 설명과 함께 확인하세요. T1·T2 비중과 지역 외국인 생활인구 흐름을 포함합니다.", en: "Every figure with what it means, what a high value indicates and which official record it came from — including T1/T2 share and area foreign-population history.", zh: "每个指标都附含义、数值偏高时的情况与官方出处说明，包含T1/T2占比与各地区外国人生活人口趋势。", ja: "各指標の意味・高いときの状況・出典を説明付きで確認できます。T1・T2の比率とエリア別外国人生活人口の推移を含みます。" },
    business: { ko: "지금의 공식 혼잡·예측·날씨를 매장 준비 관점으로 읽고, 뷰티·패션·식음료 등 6개 업종별 점검 목록을 확인하세요.", en: "Read the current official crowding, forecast and weather for store preparation, with checklists for six retail business types.", zh: "以门店准备视角解读当前官方拥挤、预测与天气，并查看美妆、时尚、餐饮等6个业态的检查清单。", ja: "現在の公式混雑・予測・天気を店舗準備の視点で読み、ビューティー・ファッション・飲食など6業種のチェックリストを確認できます。" },
    about: { ko: "KORETAIL이 무엇인지, 누구를 위한 서비스인지, 어떤 공식 데이터를 쓰는지, 실시간·예상·과거 데이터가 어떻게 다른지 설명합니다.", en: "What KORETAIL is, who it is for, which official data it uses, and how live, forecast and past data differ.", zh: "介绍 KORETAIL 是什么、面向哪些人、使用哪些官方数据，以及实时、预测与历史数据的区别。", ja: "KORETAIL とは何か、誰のためのサービスか、どの公式データを使うか、リアルタイム・予測・過去データの違いを説明します。" },
    more: { ko: "KORETAIL의 데이터 출처, 무료·키 필요 여부, Demo·공식 이력 구분, 예측 방법론과 데이터 상태를 확인하세요.", en: "Review KORETAIL data sources, access conditions, Demo/official-history labels, methodology and data health.", zh: "查看KORETAIL数据来源、接入条件、演示与官方历史区分、方法和数据状态。", ja: "KORETAILのデータ出典、接続条件、デモ・公式履歴の区別、方法論、データ状況を確認できます。" },
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
      title, description, url: path, siteName: "KORETAIL", type: "website",
      locale: locale === "ko" ? "ko_KR" : locale === "zh" ? "zh_CN" : locale === "ja" ? "ja_JP" : "en_US",
      images: [{ url: "/assets/retailpulse-korea-og.jpg", width: 1200, height: 630, alt: `${localeName[locale]} · KORETAIL` }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/assets/retailpulse-korea-og.jpg"] },
  };
}
