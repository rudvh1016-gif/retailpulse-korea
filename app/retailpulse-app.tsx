"use client";
import {formatDisplayInteger} from "../lib/display-number";
import './airport-history-polish.css';
import {deviceAirportScope,saveAirportScope} from '../lib/airport-scope-preference';
import {UPDATE_NOTICE_OPEN_EVENT} from '../lib/update-notice-preference';
import {ConciseExplainer} from './concise-explainer';
import {ChangeRate} from './change-rate';
import './facility-guide.css';
import { passengerCopy } from "../lib/passenger-copy";
import dynamic from 'next/dynamic';
// SSR remains enabled. These inactive screens do not belong to the airport's
// first download; their initial content is still rendered on their own routes.
// Reaching for the airport glance tab starts its load the same way (see prepareAirportView).
// The glance routes pass the glance in from their server pages (see RetailPulseProps).
const loadAirportGlance=()=>import('./airport-focus-production').then(module=>({default:module.AirportFocusGlance}));
const AirportCountryFlow=dynamic(()=>import('./airport-focus-production').then(module=>module.AirportCountryFlow));
const LazyAirportPreparation=dynamic(()=>import('./airport-focus-production').then(module=>module.AirportPreparation));
const LazyAirportGlance=dynamic(loadAirportGlance);
const prepareAirportGlance=()=>{loadAirportGlance().catch(()=>{});};
const MonthlyRecordsView=dynamic(()=>import('./monthly-records').then(module=>module.MonthlyRecordsView));
const TourismDeskView=dynamic(()=>import('./tourism-desk').then(module=>module.TourismDeskView));
const PredictionEvidence=dynamic(()=>import('./prediction-evidence').then(module=>module.PredictionEvidence));
// The Seoul signals (./live-signals) load with the today and business screens.
// Their routes pass them in from their server pages (see RetailPulseProps);
// elsewhere they load when those screens are reached for, or quietly once a
// screen has loaded and sits idle, like the industry guide. The header's date
// chip and the summary reader come from ./live-summary, so the other screens
// (the home among them) no longer download the Seoul signals up front.
let liveSignalsModule: typeof import('./live-signals') | undefined;
const loadLiveSignals=()=>import('./live-signals').then(module=>(liveSignalsModule=module));
const LazyTodaySignals=dynamic(()=>loadLiveSignals().then(module=>module.TodaySignals));
const LazyDateNavigator=dynamic(()=>loadLiveSignals().then(module=>module.DateNavigator));
const LazyAreaCurrentBrief=dynamic(()=>loadLiveSignals().then(module=>module.AreaCurrentBrief));
const prepareTodaySignals=()=>{loadLiveSignals().catch(()=>{});};
/** Like OnDemandBusinessPrep below: rendered directly once the module has arrived. */
function OnDemandTodaySignals(props: ComponentProps<typeof TodaySignalsComponent>) {
  const [Loaded] = useState(() => typeof window === 'undefined' ? undefined : liveSignalsModule?.TodaySignals);
  return Loaded ? <Loaded {...props} /> : <LazyTodaySignals {...props} />;
}
function OnDemandDateNavigator(props: ComponentProps<typeof DateNavigatorComponent>) {
  const [Loaded] = useState(() => typeof window === 'undefined' ? undefined : liveSignalsModule?.DateNavigator);
  return Loaded ? <Loaded {...props} /> : <LazyDateNavigator {...props} />;
}
function OnDemandAreaCurrentBrief(props: ComponentProps<typeof AreaCurrentBriefComponent>) {
  const [Loaded] = useState(() => typeof window === 'undefined' ? undefined : liveSignalsModule?.AreaCurrentBrief);
  return Loaded ? <Loaded {...props} /> : <LazyAreaCurrentBrief {...props} />;
}
// The Seoul glance and spending screens (./seoul-comparison) load the same way:
// their routes pass them in, elsewhere they load when reached for or once idle.
let seoulComparisonModule: typeof import('./seoul-comparison') | undefined;
const loadSeoulComparison=()=>import('./seoul-comparison').then(module=>(seoulComparisonModule=module));
const LazyWhereToView=dynamic(()=>loadSeoulComparison().then(module=>module.WhereToView));
const LazyConsumptionView=dynamic(()=>loadSeoulComparison().then(module=>module.ConsumptionView));
const prepareSeoulComparison=()=>{loadSeoulComparison().catch(()=>{});};
function OnDemandWhereToView(props: ComponentProps<typeof WhereToViewComponent>) {
  const [Loaded] = useState(() => typeof window === 'undefined' ? undefined : seoulComparisonModule?.WhereToView);
  return Loaded ? <Loaded {...props} /> : <LazyWhereToView {...props} />;
}
function OnDemandConsumptionView(props: ComponentProps<typeof ConsumptionViewComponent>) {
  const [Loaded] = useState(() => typeof window === 'undefined' ? undefined : seoulComparisonModule?.ConsumptionView);
  return Loaded ? <Loaded {...props} /> : <LazyConsumptionView {...props} />;
}
// The business screen's briefing and industry guide load with that screen, as do
// its date navigator and area brief (./live-signals). The More screen, the way
// to it on a phone, starts that load once it is idle, and reaching for the
// desktop link does the same (see prepareBusinessView).
let businessPrepModule: typeof import('./business-prep') | undefined;
let industryGuideModule: typeof import('./industry-guide') | undefined;
const loadBusinessPrep=()=>import('./business-prep').then(module=>(businessPrepModule=module));
const loadIndustryGuide=()=>import('./industry-guide').then(module=>(industryGuideModule=module));
const LazyBusinessPrep=dynamic(()=>loadBusinessPrep().then(module=>module.BusinessPrep));
const LazyIndustryGuide=dynamic(()=>loadIndustryGuide().then(module=>module.IndustryGuide));
const prepareBusinessView=()=>{loadBusinessPrep().catch(()=>{});loadIndustryGuide().catch(()=>{});prepareTodaySignals();};
/** Like OnDemandAirportView, for in-app navigation. The business route's server
 * page passes both components in instead (see RetailPulseProps), so hydration
 * there keeps the server HTML; elsewhere the server never renders them, and the
 * `typeof window` guard keeps the server and hydration on the same lazy path. */
function OnDemandBusinessPrep(props: ComponentProps<typeof LazyBusinessPrep>) {
  const [Loaded] = useState(() => typeof window === 'undefined' ? undefined : businessPrepModule?.BusinessPrep);
  return Loaded ? <Loaded {...props} /> : <LazyBusinessPrep {...props} />;
}
function OnDemandIndustryGuide(props: ComponentProps<typeof LazyIndustryGuide>) {
  const [Loaded] = useState(() => typeof window === 'undefined' ? undefined : industryGuideModule?.IndustryGuide);
  return Loaded ? <Loaded {...props} /> : <LazyIndustryGuide {...props} />;
}
// The airport routes pass AirportView in from their server pages (see RetailPulseProps);
// on a Seoul route the airport code loads only when the airport is reached for.
let airportViewModule: {AirportView:typeof AirportViewComponent} | undefined;
const loadAirportView=()=>Promise.all([import('./airport-focus-production'),import('./airport-view')]).then(([module])=>(airportViewModule={AirportView:module.AirportFocusStatus}));
const LazyAirportView=dynamic(()=>loadAirportView().then(module=>module.AirportView));
// Pointing at, touching or focusing a way to the airport starts that same load,
// so the tap does not wait for it. Visitors who never reach for it load nothing.
const prepareAirportView=()=>{loadAirportView().catch(()=>{});};
/** Once the airport code has arrived it renders directly: a component that
 * suspends first would hold the finished screen back by React's reveal delay.
 * The choice is fixed for the visit, so a mounted view never swaps components. */
function OnDemandAirportView(props: ComponentProps<typeof AirportViewComponent>) {
  const [Loaded] = useState(() => airportViewModule?.AirportView);
  return Loaded ? <Loaded {...props} /> : <LazyAirportView {...props} />;
}
import { recordText } from './monthly-records-copy';
import { activeSourceCatalog,sourceName,sourceUse,CollectionStatus } from "./source-status";

import { useEffect, useState, type ComponentProps, type ComponentType } from "react";
import {useBottomNavigationViewport} from "./use-bottom-navigation-viewport";
import {NavigationIcon} from "./navigation-icon";
import {useGlassNavigation} from "./use-glass-navigation";
import "./glass-navigation.css";
import { industryLabels, type IndustryId } from "../lib/industry-ids";
import {
  airportMonthly,
  airportValue,
  foreignJulyDetail,
  foreignMonthly,
  formatCount,
  type Lang,
  type Terminal,
} from "./retailpulse-data";
import { localText } from "./local-text";
import { MonthRangePicker } from "./month-range-picker";
import type { AirportView as AirportViewComponent } from "./airport-view";
import type AirportGlanceComponent from "./airport-glance-preview";
import type { IndustryGuide as IndustryGuideComponent } from "./industry-guide";
import type { BusinessPrep as BusinessPrepComponent } from "./business-prep";
import { canonicalSlug, pageDescription, pageTitle, seoLocales, seoSlugs, siteOrigin, type SeoSlug } from "./seo-config";
import { KstTodayChip } from "./live-summary";
import type { AreaCurrentBrief as AreaCurrentBriefComponent, DateNavigator as DateNavigatorComponent, TodaySignals as TodaySignalsComponent } from "./live-signals";
import AnalyticsConsent from './analytics-consent';
import { InstallAppButton } from "./install-app";
import type {WhereToView as WhereToViewComponent,ConsumptionView as ConsumptionViewComponent} from './seoul-comparison';
// Their stylesheet ships with the shell, at the place the screens' import held,
// so the cascade on every page is unchanged (it also styles the bottom bar).
import './seoul-comparison.css';
import { parsePreferences, PREFERENCE_KEY } from "../lib/personal-choices";
import { SiteUsageGuide } from "./site-usage-guide";
// The industry guide's stylesheet still ships with the shell, as it did before
// the guide's code was split out, so no route's styles change.
import './industry-scenes.css';
// The airport screens' stylesheets stay in the shared stylesheet, in the order
// the shell imported them before the airport view was split out, so the
// global cascade is byte-for-byte unchanged on every route.
import './airport-split-details.css';
import './airport-visual.css';
import './airport-scene-model.css';
import './airport-zone-countries.module.css';
import './compact-disclosure.module.css';
import './departure-guide-entry.module.css';
import { AirportDutyFreeExchange } from './airport-duty-free-exchange';
import './airport-tax-refund-guide.css';
import { saveBusinessPreferences, useBusinessPreferences } from "./business-preferences";
import { areaAnswerText, type TodayAnswer, type TodayAnswerArea } from "../lib/today-answer-text";

const betaSignupEnabled = process.env.NEXT_PUBLIC_ENABLE_BETA_SIGNUP === "true";


type View = "airport-countries" | "airport-prepare" | "airport-glance" | "today" | "airport" | "business" | "forecast" | "where-to" | "consumption" | "tourism-desk" | "about" | "more";
type AirportSection = "now" | "arrivals" | "flights" | "stores" | "history";
type AreaId = "myeongdong" | "hongdae" | "seongsu" | "itaewon";

// Area identity only. There is deliberately no "best time" here: a recommended
// hour would be a claim about demand, and the only hour KORETAIL can stand
// behind is the one Seoul's own official forecast names.
const areaInfo = {
  myeongdong: { en: "MYEONGDONG", ko: "명동", zh: "明洞", ja: "明洞" },
  hongdae: { en: "HONGDAE", ko: "홍대", zh: "弘大", ja: "弘大" },
  seongsu: { en: "SEONGSU", ko: "성수", zh: "圣水", ja: "聖水" },
  itaewon: { en: "ITAEWON", ko: "이태원", zh: "梨泰院", ja: "梨泰院" },
};

function areaLocalName(id: AreaId, lang: Lang) {
  return areaInfo[id][lang];
}

const copy = {
  ko: {
    hero: "지금 서울은\n어떻게 움직이고 있나요?",
    sub: "공식 데이터만 모아 명동·홍대·성수·이태원와 인천공항의 지금과 다음을 보여줍니다.",
    'airport-countries':'국가별 흐름', 'airport-prepare':'미리 준비', 'airport-glance': '한눈에', today: "서울", airport: "공항현황", business: "매장", forecast: "기록", 'where-to': "서울 한눈에", consumption:"요즘 뜨는 소비", "tourism-desk": "관광안내", about: "소개", more: "더보기",
    kst: "모든 시간은 한국 표준시(KST)입니다.",
    truth: "공식 발표값과 KORETAIL의 비교·참고 예상을 구분하며, 확인되지 않은 값은 만들어 채우지 않습니다.",
  },
  en: {
    hero: "How is Seoul\nmoving right now?",
    sub: "Official data only, showing what Myeongdong, Hongdae, Seongsu, Itaewon and Incheon Airport look like now and next.",
    'airport-countries':'Country trends', 'airport-prepare':'Prepare ahead', 'airport-glance': 'Airport glance', today: "Seoul", airport: "Airport", business: "Business", forecast: "Records", 'where-to': "Seoul at a glance", consumption:"Consumption", "tourism-desk": "Guide Desk", about: "About", more: "More",
    kst: "All times are Korea Standard Time (KST).",
    truth: "Official figures are distinguished from KORETAIL comparisons and reference estimates. Nothing unverified is filled in.",
  },
  zh: {
    hero: "此刻的首尔\n正在如何流动？",
    sub: "仅汇总官方数据，呈现明洞、弘大、圣水、梨泰院与仁川机场的当前与接下来。",
    'airport-countries':'国家趋势', 'airport-prepare':'提前准备', 'airport-glance': '机场一览', today: "首尔", airport: "机场", business: "门店", forecast: "记录", 'where-to': "首尔一览", consumption:"近期消费", "tourism-desk": "旅游咨询", about: "关于", more: "更多",
    kst: "所有时间均为韩国标准时间（KST）。",
    truth: "官方发布值与KORETAIL的比较及参考预测分别标明，不填补未经确认的数值。",
  },
  ja: {
    hero: "いまソウルは\nどう動いていますか？",
    sub: "公式データだけを集め、明洞・弘大・聖水・梨泰院と仁川空港の現在とこれからを表示します。",
    'airport-countries':'国別の動向', 'airport-prepare':'事前準備', 'airport-glance': '空港一覧', today: "ソウル", airport: "空港", business: "店舗", forecast: "記録", 'where-to': "ソウルひと目で", consumption:"最近の消費", "tourism-desk": "観光案内", about: "紹介", more: "その他",
    kst: "すべての時刻は韓国標準時（KST）です。",
    truth: "公式発表値とKORETAILの比較・参考予測を区別し、確認できない値は作って埋めません。",
  },
} as const;


/**
 * One metric, explained in the four things a first-time reader actually asks:
 * what it is, what a high value means, where the number came from, and why it
 * is worth looking at. Every metric on the insights screen carries one, which
 * is what stops a bare "86" from being the whole story.
 */
function MetricExplainer({ lang, summary, what, high, source, why }: { lang: Lang; summary?: string; what: string; high: string; source: string; why: string }) {
  const labels = {
    what: localText(lang, { ko: "무엇인가요", en: "What it is", zh: "这是什么", ja: "これは何か" }),
    high: localText(lang, { ko: "높으면", en: "When it is high", zh: "数值高时", ja: "高いとき" }),
    source: localText(lang, { ko: "출처", en: "Source", zh: "来源", ja: "出典" }),
    why: localText(lang, { ko: "왜 보나요", en: "Why look at it", zh: "为何要看", ja: "なぜ見るのか" }),
  };
  const explanation = <dl className="metric-explainer">
    <div><dt>{labels.what}</dt><dd>{what}</dd></div>
    <div><dt>{labels.high}</dt><dd>{high}</dd></div>
    <div><dt>{labels.source}</dt><dd>{source}</dd></div>
    <div><dt>{labels.why}</dt><dd>{why}</dd></div>
  </dl>;
  return summary ? <ConciseExplainer summary={summary}>{explanation}</ConciseExplainer> : explanation;
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
          email, segment, locale: lang, sourcePath: window.location.pathname, consent,
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
      <p className="eyebrow">PUBLIC BETA</p>
      <h2 data-heading="section" id="beta-signup-title"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "공개 베타 소식 받기", en: "GET PUBLIC BETA UPDATES", zh: "接收公开测试更新", ja: "公開ベータの更新を受け取る" })}</h2>
      <p>{localText(lang, {
        ko: "공개 베타와 중요한 데이터 업데이트만 이메일로 안내합니다.",
        en: "Get public-beta and material data updates by email.",
        zh: "仅通过邮件通知公开测试与重要数据更新。",
        ja: "公開ベータと重要なデータ更新だけをメールでお知らせします。",
      })}</p>
    </div>
    <form onSubmit={submit}>
      <label className="sr-only" htmlFor="beta-email">Email</label>
      <input id="beta-email" type="email" required value={email} placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
      {/* Honeypot: a real person never fills this, so a submission that does is a bot. */}
      <input id="signup-honeypot" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only" />
      <div className="beta-segments" role="group">
        {(Object.keys(segmentLabels) as SignupSegment[]).map((id) => <button key={id} type="button" className={segment === id ? "active" : ""} onClick={() => setSegment(id)} aria-pressed={segment === id}>{segmentLabels[id]}</button>)}
      </div>
      <label className="beta-consent" htmlFor="signup-consent"><input id="signup-consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{localText(lang, { ko: "이메일 수신에 동의합니다.", en: "I agree to receive these emails.", zh: "我同意接收这些邮件。", ja: "メールの受信に同意します。" })}</label>
      <button type="submit" className="primary" disabled={status === "sending" || !consent}>{status === "success" ? localText(lang, { ko: "신청 완료", en: "SUBSCRIBED", zh: "已订阅", ja: "登録完了" }) : localText(lang, { ko: "신청", en: "SUBSCRIBE", zh: "订阅", ja: "登録" })}</button>
      {status === "error" && <p role="alert">{localText(lang, { ko: "잠시 후 다시 시도해 주세요.", en: "Please try again shortly.", zh: "请稍后重试。", ja: "しばらくしてからお試しください。" })}</p>}
    </form>
  </section>;
}

type RetailPulseProps = {
  initialLang?: Lang;
  initialView?: View;
  initialArea?: AreaId;
  initialRoute?: boolean;
  /**
   * "airport-home" is `/{lang}`: the airport glance start page.
   * "home" is a legacy component scope; explicit Seoul routes use "area".
   * "area" is `/{lang}/{area}`: that area's own page, with its own H1 and
   * without the overview list, so the two routes are no longer the same page
   * under two URLs.
   */
  initialScope?: "home" | "airport-home" | "area";
  /**
   * The airport screen component. The airport routes' server pages pass it so
   * the route server-renders and preloads it; other routes leave it unset and
   * the shell loads it on demand when the reader switches to the airport tab.
   */
  AirportView?: ComponentType<ComponentProps<typeof AirportViewComponent>>;
  /**
   * The airport glance, passed the same way by the glance routes' server pages
   * so hydration does not wait on a lazy chunk and discard the server HTML.
   */
  AirportGlance?: ComponentType<ComponentProps<typeof AirportGlanceComponent>>;
  AirportPreparation?: ComponentType<{lang:Lang}>;
  /**
   * The industry guide, passed the same way by the business route's server
   * page; elsewhere the business screen loads it with its other code.
   */
  IndustryGuide?: ComponentType<ComponentProps<typeof IndustryGuideComponent>>;
  /** The business briefing, passed the same way by the business route's server page. */
  BusinessPrep?: ComponentType<ComponentProps<typeof BusinessPrepComponent>>;
  /** The today screen's Seoul signals, passed the same way by the area routes' server pages. */
  TodaySignals?: ComponentType<ComponentProps<typeof TodaySignalsComponent>>;
  /** The business screen's date navigator and area brief, passed the same way by the business route's server page. */
  DateNavigator?: ComponentType<ComponentProps<typeof DateNavigatorComponent>>;
  AreaCurrentBrief?: ComponentType<ComponentProps<typeof AreaCurrentBriefComponent>>;
  /** The Seoul glance and spending screens, passed the same way by their routes' server pages. */
  WhereToView?: ComponentType<ComponentProps<typeof WhereToViewComponent>>;
  ConsumptionView?: ComponentType<ComponentProps<typeof ConsumptionViewComponent>>;
  /**
   * Today's answer, read on the server (lib/today-answer.ts) so the first HTML
   * already states it. Absent or null renders nothing.
   */
  todayAnswer?: TodayAnswer | null;
};

const areaHeadline: Record<Lang, (name: string) => string> = {
  ko: (name) => `${name}, 지금`,
  // areaInfo keeps the English name upper-case for the tab strip; a heading
  // is a sentence, so it is title-cased here ("Myeongdong, now").
  en: (name) => `${name.charAt(0)}${name.slice(1).toLowerCase()}, now`,
  zh: (name) => `${name}，现在`,
  ja: (name) => `${name}、いま`,
};

const htmlLang: Record<Lang, string> = { ko: "ko", en: "en", zh: "zh-CN", ja: "ja" };

function routeFor(lang: Lang, view: View, area: AreaId) {
  const base = `/${lang}`;
  if (view === "airport-glance") return base;
  if (view === "today") return `${base}/${area}`;
  if (view === "tourism-desk") return `${base}/tourism-desk/${area}`;
  return `${base}/${view}`;
}

export default function Home({ initialLang = "ko", initialView = "today", initialArea = "myeongdong", initialRoute = false, initialScope = "home", todayAnswer = null, AirportView = OnDemandAirportView, AirportGlance = LazyAirportGlance, AirportPreparation = LazyAirportPreparation, IndustryGuide = OnDemandIndustryGuide, BusinessPrep = OnDemandBusinessPrep, TodaySignals = OnDemandTodaySignals, DateNavigator = OnDemandDateNavigator, AreaCurrentBrief = OnDemandAreaCurrentBrief, WhereToView = OnDemandWhereToView, ConsumptionView = OnDemandConsumptionView }: RetailPulseProps = {}) {
  const bottomNavigationRef = useBottomNavigationViewport();
  // Airport routes already carry the airport code; only the on-demand copy needs preparing.
  const prepareAirport = AirportView === OnDemandAirportView ? prepareAirportView : undefined;
  const [lang, setLang] = useState<Lang>(initialLang);
  const [view, setView] = useState<View>(initialView);
  const [homeVisible, setHomeVisible] = useState(initialScope === "airport-home" || (initialScope === "home" && initialView === "today"));
  const [selected, setSelected] = useState<AreaId>(initialArea);
  const [terminal, setTerminal] = useState<Terminal>("all");
  const [concourse,setConcourse]=useState(false);
  const [airportSection, setAirportSection] = useState<AirportSection>("now");
  const [industry, setIndustry] = useState<IndustryId>("beauty");
  const [preferencesReady, setPreferencesReady] = useState(false);
  // null means "whatever today is in KST, as the server reports it" — the
  // client never guesses a date from the device clock.
  const [serviceDate, setServiceDate] = useState<string | null>(null);
  useGlassNavigation(bottomNavigationRef,view);
  const t = copy[lang];
  const navLabel=(item:View)=>item==='consumption'?localText(lang,{ko:'소비 흐름',en:'Spending',zh:'消费',ja:'消費'}):t[item];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("retailpulse-preferences");
        if (saved) {
          const value = JSON.parse(saved) as Partial<{ lang: Lang; area: AreaId; terminal: Terminal; industry: IndustryId }>;
          if (!initialRoute && value.lang && ["ko", "en", "zh", "ja"].includes(value.lang)) setLang(value.lang);
          if ((!initialRoute || ((initialScope === "home" && initialView === "today") || initialScope === "airport-home")) && value.area && Object.hasOwn(areaInfo, value.area)) setSelected(value.area);
          if (value.terminal && ["all", "T1", "T2"].includes(value.terminal)) setTerminal(value.terminal);
          if (value.industry && Object.hasOwn(industryLabels, value.industry)) setIndustry(value.industry);
        }
        const personal = parsePreferences(window.localStorage.getItem(PREFERENCE_KEY));
        if ((initialScope === "home" || initialScope === "airport-home") && personal && Object.hasOwn(areaInfo, personal.location)) setSelected(personal.location as AreaId);
      } catch {
        // Device-local preferences are optional; the product works without storage.
      } finally {
        const query = new URLSearchParams(window.location.search);
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.get('date') ?? '')) setServiceDate(query.get('date'));
        if (query.get('area') && Object.hasOwn(areaInfo,query.get('area')!)) setSelected(query.get('area') as AreaId);
        const airportScope=deviceAirportScope();
        setTerminal(airportScope==='CONCOURSE'?'T1':airportScope);
        setConcourse(airportScope==='CONCOURSE');
        if (query.get('section') === 'mystore' || window.location.hash === '#mystore') setAirportSection('stores');
        setPreferencesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRoute, initialScope, initialView]);

  useEffect(() => {
    document.documentElement.lang = htmlLang[lang];
    if (!preferencesReady) return;
    try {
      window.localStorage.setItem("retailpulse-preferences", JSON.stringify({ lang, area: selected, terminal, industry }));
    } catch {
      // Storage is a convenience only.
    }
  }, [lang, selected, terminal, industry, preferencesReady]);

  // The industry guide left the shell's first download (lib/industry-ids.ts
  // carries the names), but the airport and business screens still need it.
  // Seoul views prepare their adjacent screens while idle. Airport visits do
  // not download inactive Seoul/store code; intent and More still prepare it.
  useEffect(() => {
    if (!preferencesReady || ["airport-glance","airport","airport-countries","airport-prepare"].includes(view)) return;
    let live = true, idle = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => { if (!live) return; if ("requestIdleCallback" in window) idle = requestIdleCallback(() => { loadIndustryGuide().catch(() => {}); prepareTodaySignals(); prepareSeoulComparison(); }, { timeout: 4000 }); else timer = setTimeout(() => { loadIndustryGuide().catch(() => {}); prepareTodaySignals(); prepareSeoulComparison(); }, 1500); };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    return () => { live = false; window.removeEventListener("load", start); if (idle) cancelIdleCallback(idle); clearTimeout(timer); };
  }, [preferencesReady,view]);

  useEffect(() => {
    const [, , pathSlug, pathArea] = window.location.pathname.split("/");
    const slug = seoSlugs.includes(pathSlug as SeoSlug) ? pathSlug as SeoSlug : undefined;
    const tourismArea = slug === "tourism-desk" && pathArea && Object.hasOwn(areaInfo, pathArea)
      ? pathArea as AreaId
      : undefined;
    const title = pageTitle(lang, slug, tourismArea);
    const description = pageDescription(lang, slug, tourismArea);
    // Same canonical as the server HTML: a home-equivalent slug names the home.
    const canonical = canonicalSlug(slug);
    const suffix = canonical ? `/${canonical}${tourismArea ? `/${tourismArea}` : ""}` : "";
    const canonicalPath = `/${lang}${suffix}`;

    document.title = title;
    const setMeta = (selector: string, value: string) => {
      document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", value);
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', "KORETAIL");
    setMeta('meta[property="og:url"]', `${siteOrigin}${canonicalPath}`);
    setMeta('meta[name="twitter:title"]', "KORETAIL");
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", `${siteOrigin}${canonicalPath}`);

    const languageTags: Record<(typeof seoLocales)[number], string> = { ko: "ko-KR", en: "en", zh: "zh-CN", ja: "ja-JP" };
    seoLocales.forEach((locale) => {
      document.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${languageTags[locale]}"]`)
        ?.setAttribute("href", `${siteOrigin}/${locale}${suffix}`);
    });
    document.querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="x-default"]')
      ?.setAttribute("href", `${siteOrigin}/en${suffix}`);
  }, [lang, view, selected, homeVisible]);

  useEffect(() => {
    const onPopState = () => {
      const query = new URLSearchParams(window.location.search);
      setServiceDate(/^\d{4}-\d{2}-\d{2}$/.test(query.get('date') ?? '') ? query.get('date') : null);
      if (query.get('area') && Object.hasOwn(areaInfo,query.get('area')!)) setSelected(query.get('area') as AreaId);
      const airportScope=deviceAirportScope();
      setTerminal(airportScope==='CONCOURSE'?'T1':airportScope);
      setConcourse(airportScope==='CONCOURSE');
      const [, locale, slug, routeArea] = window.location.pathname.split("/");
      setHomeVisible(!slug);
      if (!slug) { setView("airport-glance"); setAirportSection("now"); }
      if (["ko", "en", "zh", "ja"].includes(locale)) setLang(locale as Lang);
      if (slug && Object.hasOwn(areaInfo, slug)) { setSelected(slug as AreaId); setView("today"); }
      else if (slug === "tourism-desk" && routeArea && Object.hasOwn(areaInfo, routeArea)) {
        setSelected(routeArea as AreaId);
        setView("tourism-desk");
      } else if (slug==='predictions') setView('where-to');
      else if (["airport-countries", "airport-prepare", "airport-glance", "today", "forecast", "where-to", "consumption", "airport", "business", "about", "more"].includes(slug)) setView(slug as View);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function updateUrl(nextLang: Lang, nextView: View, nextArea: AreaId, nextTerminal: Terminal = terminal, preserveHome = false, nextConcourse=concourse) {
    const params = new URLSearchParams();
    if (serviceDate && nextView!=='where-to' && nextView!=='consumption') params.set('date',serviceDate);
    if (nextView === 'consumption' || nextView === 'forecast') {params.set('area',nextArea);const month=new URLSearchParams(window.location.search).get('month');if(month)params.set('month',month);}
    if(nextView==='airport'&&nextConcourse)params.set('building','CONCOURSE');
    else if ((nextView === 'airport' || nextView === 'airport-glance') && nextTerminal !== 'all') params.set('terminal',nextTerminal);
    const paramsText = params.toString(); // not .size: older Safari/Chrome lack URLSearchParams.size
    const nextPath = (preserveHome ? `/${nextLang}` : routeFor(nextLang, nextView, nextArea)) + (paramsText ? `?${paramsText}` : '');
    if (window.location.pathname + window.location.search !== nextPath) window.history.pushState({}, "", nextPath);
  }

  function navigationHref(next:View){
    const params=new URLSearchParams();
    if(serviceDate&&next!=='where-to'&&next!=='consumption')params.set('date',serviceDate);
    if(next==='consumption'||next==='forecast')params.set('area',selected);
    if(next==='airport'&&concourse)params.set('building','CONCOURSE');
    else if((next==='airport'||next==='airport-glance')&&terminal!=='all')params.set('terminal',terminal);
    return routeFor(lang,next,selected)+(params.toString()?`?${params}`:'');
  }

  function changeDate(next: string | null) {
    setServiceDate(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('date', next); else url.searchParams.delete('date');
    window.history.pushState({}, '', url.pathname + url.search + url.hash);
  }

  function changeLanguage(next: Lang) {
    setLang(next);
    if (/^\/(?:ko|en|zh|ja)(?:\/|$)/.test(window.location.pathname)) {
      const path=window.location.pathname.replace(/^\/(?:ko|en|zh|ja)(?=\/|$)/,`/${next}`);
      window.history.pushState({}, "", path+window.location.search+window.location.hash);
    } else if (homeVisible) window.history.pushState({}, "", `/${next}${window.location.search}`);
    else updateUrl(next, view, selected);
  }

  function selectArea(next: AreaId) {
    setHomeVisible(false);
    setSelected(next);
    if (view === "today" || view === "tourism-desk" || view === "consumption" || view === "forecast") updateUrl(lang, view, next);
  }

  function navigate(next: View, nextTerminal: Terminal = terminal, nextConcourse=concourse) {
    setHomeVisible(false);
    setView(next);
    setConcourse(next==='airport'&&nextConcourse);
    updateUrl(lang, next, selected, nextTerminal,false,nextConcourse);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function goHome() {
    setHomeVisible(true);
    setView('airport-glance');
    setAirportSection('now');
    setConcourse(false);
    const homePath=`/${lang}${serviceDate ? `?date=${serviceDate}` : ''}`;
    if(window.location.pathname+window.location.search!==homePath)window.history.pushState({},'',homePath);
    window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }

  function openAirport(section: AirportSection, preferredTerminal?: Terminal) {
    if (preferredTerminal) setTerminal(preferredTerminal);
    setAirportSection(section);
    navigate("airport", preferredTerminal ?? terminal,false);
  }

  return (
    <div className={"app lang-" + lang} data-hydrated={preferencesReady ? "true" : "false"}>
      <div className="site-header">
      <header className="topbar">
        <button className="brand brand-button" onClick={() => goHome()} onPointerEnter={prepareAirportGlance} onFocus={prepareAirportGlance} aria-label="KORETAIL home">
          <span>KORETAIL</span><span className="brand-descriptor">Retail Demand Signals for Korea</span>
        </button>
        <nav className="top-nav" aria-label="Primary">
          {(["airport-glance", "airport", "airport-countries", "airport-prepare", "more"] as View[]).map((item) => (
            <a key={item} href={navigationHref(item)} className={view === item || (item === "more" && ["today","where-to","consumption","business","tourism-desk","forecast","about"].includes(view)) ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate(item); }} onPointerEnter={item === "airport" ? prepareAirport : item === "airport-glance" ? prepareAirportGlance : item === "business" ? prepareBusinessView : item === "today" ? prepareTodaySignals : item === "where-to" || item === "consumption" ? prepareSeoulComparison : undefined} onFocus={item === "airport" ? prepareAirport : item === "airport-glance" ? prepareAirportGlance : item === "business" ? prepareBusinessView : item === "today" ? prepareTodaySignals : item === "where-to" || item === "consumption" ? prepareSeoulComparison : undefined} aria-current={view === item ? "page" : item === "more" && ["today","where-to","consumption","business","tourism-desk","forecast","about"].includes(view) ? "location" : undefined}>{navLabel(item)}</a>
          ))}
        </nav>
        <div className="header-meta">
          <KstTodayChip lang={lang} date={view==='where-to'||view==='consumption'?null:serviceDate} />
          <InstallAppButton lang={lang} />
          <AirportDutyFreeExchange lang={lang} date={serviceDate}/>
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
      </div>

      <main className="page-shell">
        {view === "airport-glance" && <AirportGlance lang={lang} published selectedDate={serviceDate} onDateChange={changeDate} artworkSrc="/images/airport-glance/approved-v1-1448.webp"/>}
        {view === "today" && (
          <>
            <section className="hero demand-hero" aria-labelledby="hero-title">
              <div className="hero-copy">
                <h1 data-heading="page" id="hero-title"><span className="heading-marker" aria-hidden="true"/>{homeVisible ? localText(lang, {ko:"서울과 공항의 흐름",en:"Seoul & airport, at a glance",zh:"首尔与机场的流动",ja:"ソウルと空港の流れ"}) : areaHeadline[lang](areaLocalName(selected, lang))}</h1>
                <p className="hero-line">{localText(lang,{ko:"서울 4개 상권과 인천공항, 지금과 앞으로의 흐름",en:"Four Seoul districts and Incheon Airport. Now and next.",zh:"首尔4个商圈与仁川机场，当前与未来趋势",ja:"ソウル4商圏と仁川空港、現在とこれからの流れ"})}</p>
                <TodayAnswerLines lines={[areaAnswerText(todayAnswer, lang, homeVisible ? undefined : selected as TodayAnswerArea)]} />
              </div>
            </section>
            {!homeVisible && (
              <div className="area-tabs" role="tablist" aria-label={localText(lang, { ko: "지역 선택", en: "Select an area", zh: "选择地区", ja: "エリアを選択" })}>
                {(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => selectArea(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}
              </div>
            )}
            <TodaySignals lang={lang} date={serviceDate} onDateChange={changeDate} historyHref={`/${lang}/forecast?area=${selected}#prediction-score`} homeVisible={homeVisible} selected={selected} onSelect={setSelected} />
            {betaSignupEnabled && <BetaSignup lang={lang} />}
          </>
        )}

        {view === "airport" && (
          <AirportView
            industry={industry}
            setIndustry={setIndustry}
            lang={lang}
            terminal={terminal}
            setTerminal={next => { saveAirportScope(next);setConcourse(false);setTerminal(next); updateUrl(lang, "airport", selected, next, homeVisible,false); }}
            concourse={concourse}
            setConcourse={next=>{saveAirportScope(next?'CONCOURSE':terminal);setConcourse(next);updateUrl(lang,'airport',selected,terminal,homeVisible,next);}}
            section={airportSection}
            setSection={setAirportSection}
            date={serviceDate}
            setDate={changeDate}
          />
        )}
        {view === "airport-countries" && <AirportCountryFlow lang={lang} date={serviceDate}/>}
        {view === "airport-prepare" && <AirportPreparation lang={lang}/>}
        {view === "business" && <BusinessView lang={lang} selected={selected} setSelected={selectArea} industry={industry} setIndustry={setIndustry} date={serviceDate} setDate={changeDate} IndustryGuide={IndustryGuide} BusinessPrep={BusinessPrep} DateNavigator={DateNavigator} AreaCurrentBrief={AreaCurrentBrief} />}
        {view === 'where-to' && <WhereToView lang={lang}/>}
        {view === 'consumption' && <ConsumptionView lang={lang} area={selected} onArea={selectArea}/>}
        {view === "forecast" && <InsightsView lang={lang} selected={selected} setSelected={selectArea} />}
        {view === "tourism-desk" && <TourismDeskView lang={lang} area={selected} onAreaChange={selectArea} />}
        {view === "about" && <AboutView lang={lang} onAirport={() => openAirport("now")} onSeoul={() => navigate("today")} />}
        {view === "more" && <MoreView
          lang={lang}
          setLang={changeLanguage}
          selected={selected}
          terminal={terminal}
          industry={industry}
          onAbout={() => navigate("about")}
          onNavigate={navigate}
        />}

        <footer className="site-footer">
          <p>{t.truth}</p><p>{t.kst}</p>
          <nav className="footer-links" aria-label="KORETAIL sections">
            <a href={`/${lang}`}>HOME</a>
            {(Object.keys(areaInfo) as AreaId[]).map((id) => <a key={id} href={routeFor(lang, "today", id)}>{areaLocalName(id, lang)}</a>)}
            <a href={routeFor(lang, "airport", selected)}>{t.airport}</a>
            <a href={routeFor(lang, "business", selected)}>{t.business}</a>
            <a href={routeFor(lang, "where-to", selected)}>{t['where-to']}</a>
            <a href={routeFor(lang, "consumption", selected)}>{t.consumption}</a>
            <a href={routeFor(lang, "forecast", selected)}>{t.forecast}</a>
            <a href={routeFor(lang, "tourism-desk", selected)}>{localText(lang, { ko: "관광안내 데스크", en: "Tourism desk", zh: "旅游咨询台", ja: "観光案内デスク" })}</a>
            <a href={routeFor(lang, "about", selected)}>{t.about}</a>
          </nav>
          <span>{lang === "ko" ? "코리테일 KORETAIL" : "KORETAIL"} · RETAIL DEMAND SIGNALS FOR KOREA</span>
        </footer>
      </main>

      <nav ref={bottomNavigationRef} className="bottom-nav glass-nav" aria-label="Primary" style={{gridTemplateColumns:"repeat(5,minmax(0,1fr))"}}>
        <span className="glass-nav-indicator" aria-hidden="true" style={{width:"calc((100% - 14px)/5)"}}/>
        {(["airport-glance", "airport", "airport-countries", "airport-prepare", "more"] as View[]).map((item) => (
          <a
            key={item}
            href={navigationHref(item)}
            className={(view === item || (["today","where-to","consumption","business","tourism-desk","forecast","about"].includes(view) && item === "more")) ? "active" : ""}
            onClick={(event) => { if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(item); }}
            onPointerEnter={item === "airport" ? prepareAirport : item === "airport-glance" ? prepareAirportGlance : item === "today" ? prepareTodaySignals : item === "where-to" || item === "consumption" ? prepareSeoulComparison : undefined}
            onFocus={item === "airport" ? prepareAirport : item === "airport-glance" ? prepareAirportGlance : item === "today" ? prepareTodaySignals : item === "where-to" || item === "consumption" ? prepareSeoulComparison : undefined}
            aria-current={view === item ? "page" : ["today","where-to","consumption","business","tourism-desk","forecast","about"].includes(view) && item === "more" ? "location" : undefined}
            aria-label={navLabel(item)}
          >
            <NavigationIcon name={item==='airport-countries'?'where-to':item==='airport-prepare'?'today':item} />
            <span>{item==='where-to'?localText(lang,{ko:'서울 한눈에',en:'Seoul glance',zh:'首尔一览',ja:'ソウル一覧'}):item==='consumption'?localText(lang,{ko:'소비 흐름',en:'Spending',zh:'消费',ja:'消費'}):t[item].toUpperCase()}</span>
          </a>
        ))}
      </nav>

    </div>
  );
}

function BusinessView({
  lang, selected, setSelected, industry, setIndustry, date, setDate, IndustryGuide, BusinessPrep, DateNavigator, AreaCurrentBrief,
}: {
  lang: Lang; selected: AreaId; setSelected: (id: AreaId) => void;
  industry: IndustryId; setIndustry: (id: IndustryId) => void;
  date: string | null; setDate: (value: string | null) => void;
  IndustryGuide: ComponentType<ComponentProps<typeof IndustryGuideComponent>>;
  BusinessPrep: ComponentType<ComponentProps<typeof BusinessPrepComponent>>;
  DateNavigator: ComponentType<ComponentProps<typeof DateNavigatorComponent>>;
  AreaCurrentBrief: ComponentType<ComponentProps<typeof AreaCurrentBriefComponent>>;
}) {
  const [mode, setMode] = useState<"briefing" | "history">("briefing");
  // The airport is a place for the briefing only; the area tab keeps its own
  // choice so the history tab and the area pages are unaffected.
  const { preferences: business } = useBusinessPreferences();
  const atAirport = business.place === "airport";
  const chooseArea = (id: AreaId) => {
    if (atAirport) saveBusinessPreferences({ ...business, place: "area" });
    setSelected(id);
  };

  return (
    <section className="view-section business-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">KORETAIL FOR BUSINESS</p>
          <h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "지금 무엇을\n준비하면 좋을까요?", en: "What should you\nprepare right now?", zh: "现在应该\n准备什么？", ja: "いま何を\n準備すればいい？" })}</h1>
          <p>{localText(lang, {
            ko: "인천공항 흐름과 업종별 점검 목록을 확인합니다. 서울 지역 참고자료도 함께 제공합니다. 일반 운영 안내이며 매출이나 방문객 수를 예측하지 않습니다.",
            en: "Review Incheon Airport flows and industry checklists, with additional Seoul-area reference data. General operating guidance, not a sales or visitor forecast.",
            zh: "查看仁川机场客流与各业态检查清单，并参考首尔地区资料。此为一般运营指南，不预测销售额或访客人数。",
            ja: "仁川空港の動向と業種別チェックリストを確認できます。ソウル地域の参考資料も提供します。一般的な運営案内であり、売上や来訪者数の予測ではありません。",
          })}</p>
        </div>
      </div>

      <div className="business-mode" role="tablist">
        <button className={mode === "briefing" ? "active" : ""} onClick={() => setMode("briefing")} role="tab" aria-selected={mode === "briefing"}>{localText(lang, { ko: "지금 브리핑", en: "CURRENT BRIEFING", zh: "当前简报", ja: "現在のブリーフ" })}</button>
        <button className={mode === "history" ? "active" : ""} onClick={() => setMode("history")} role="tab" aria-selected={mode === "history"}>{localText(lang, { ko: "공식 과거 흐름", en: "OFFICIAL HISTORY", zh: "官方历史趋势", ja: "公式の過去推移" })}</button>
      </div>

      {mode === "history" ? <BusinessHistoryView lang={lang} selected={selected} setSelected={setSelected} /> : <>
        <div className="area-tabs" role="tablist">
          {(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={!atAirport && selected === id ? "active" : ""} onClick={() => chooseArea(id)} role="tab" aria-selected={!atAirport && selected === id}>{areaLocalName(id, lang)}</button>)}
          <button className={atAirport ? "active" : ""} onClick={() => { if (!atAirport) saveBusinessPreferences({ ...business, place: "airport" }); }} role="tab" aria-selected={atAirport}>{localText(lang, { ko: "인천공항", en: "Incheon Airport", zh: "仁川机场", ja: "仁川空港" })}</button>
        </div>
        <DateNavigator lang={lang} date={date} onChange={setDate} />
        {/* Order for a reader about to open: conditions, the facts inside
            their hours, at most three actions, then the graphs and the
            standing guide. */}
        <BusinessPrep lang={lang} area={selected} industry={industry} onIndustryChange={setIndustry} date={date} />
        {atAirport
          ? <a className="current-brief-link business-airport-link" href={routeFor(lang, "airport", selected)}>{localText(lang, { ko: "공항 전체 신호 보기", en: "All airport signals", zh: "查看机场全部信号", ja: "空港の全シグナルを見る" })} →</a>
          : <AreaCurrentBrief
            lang={lang}
            area={selected}
            date={date}
            linkHref={routeFor(lang, "today", selected)}
            linkLabel={localText(lang, { ko: `${areaLocalName(selected, lang)} 전체 신호 보기`, en: `All ${areaLocalName(selected, lang)} signals`, zh: `查看${areaLocalName(selected, lang)}全部信号`, ja: `${areaLocalName(selected, lang)}の全シグナルを見る` })}
          />}

        <IndustryGuide lang={lang} industry={industry} onIndustryChange={setIndustry} airport={atAirport ? { terminal: business.terminal, direction: "departure" } : undefined} />

      </>}
    </section>
  );
}

/** Areas the precomputed monthly foreign history (retailpulse-data.ts) covers. */
type ForeignHistoryAreaId = keyof typeof foreignJulyDetail;
function hasForeignHistory(id: AreaId): id is ForeignHistoryAreaId {
  return id in foreignJulyDetail;
}

/**
 * The monthly foreign history was computed once from Seoul's monthly
 * administrative-dong files for the first three areas. Itaewon has not been
 * computed yet, so it says so instead of showing another area's figures.
 */
function ForeignHistoryPending({ lang, id }: { lang: Lang; id: AreaId }) {
  const name = areaLocalName(id, lang);
  return <p className="section-intro">{localText(lang, {
    ko: `${name}의 월별 외국인 생활인구 기록은 아직 준비되지 않았습니다. 명동·홍대·성수와 같은 서울시 월별 행정동 자료로 계산한 뒤 추가합니다.`,
    en: `${name}'s monthly foreign-population record is not ready yet. It will be added once computed from the same Seoul monthly administrative-dong files as the other areas.`,
    zh: `${name}的月度外国人生活人口记录尚未准备好。将以与其他地区相同的首尔市月度行政洞资料计算后加入。`,
    ja: `${name}の月別外国人生活人口の記録はまだ準備できていません。他のエリアと同じソウル市の月別行政洞資料で算出後に追加します。`,
  })}</p>;
}

function BusinessHistoryView({ lang, selected, setSelected }: { lang: Lang; selected: AreaId; setSelected: (id: AreaId) => void }) {
  if (hasForeignHistory(selected)) return <BusinessHistoryBody lang={lang} selected={selected} setSelected={setSelected} />;
  return <section className="business-history">
    <div className="area-tabs" role="tablist">{(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}</div>
    <ForeignHistoryPending lang={lang} id={selected} />
  </section>;
}

function BusinessHistoryBody({ lang, selected, setSelected }: { lang: Lang; selected: ForeignHistoryAreaId; setSelected: (id: AreaId) => void }) {
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

  return <section className="business-history">
    <div className="area-tabs" role="tablist">{(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}</div>
    <div className="section-head">
      <div><p className="eyebrow">OFFICIAL HISTORICAL · SEOUL SHORT-STAY FOREIGN POPULATION</p><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: `${area.ko} 외국인 생활인구 흐름`, en: `${area.en} foreign population history`, zh: `${area.zh}外国人生活人口趋势`, ja: `${area.ja}の外国人生活人口推移` })}</h2></div>
      <span className="official-label">OFFICIAL HISTORICAL</span>
    </div>
    <MetricExplainer
      summary={localText(lang, { ko: "월별 단기체류 외국인 · 시간당 평균 · 방문·매출 아님", en: "Monthly short-stay foreign presence · hourly mean, not visits or sales", zh: "月度短期停留外国人 · 每小时平均，非访问量或销售额", ja: "月別の短期滞在外国人・時間平均（訪問数・売上ではありません）" })}
      lang={lang}
      what={localText(lang, { ko: "서울시가 집계한 월별·시간당 평균 단기체류 외국인 수입니다.", en: "Seoul's monthly average hourly count of short-stay foreign residents.", zh: "首尔市统计的月度每小时平均短期停留外国人数。", ja: "ソウル市が集計した月別・時間当たり平均の短期滞在外国人数です。" })}
      high={localText(lang, { ko: "그 지역에 머무는 외국인이 평소보다 많았다는 뜻입니다.", en: "More foreign visitors were present in that area than usual.", zh: "表示该地区停留的外国人多于平常。", ja: "その地域に滞在した外国人が普段より多かったことを意味します。" })}
      source={localText(lang, { ko: "서울 열린데이터광장 단기체류 외국인 생활인구", en: "Seoul Open Data — short-stay foreign living population", zh: "首尔开放数据广场 短期停留外国人生活人口", ja: "ソウル オープンデータ広場 短期滞在外国人生活人口" })}
      why={localText(lang, { ko: "방문자 수나 매출이 아니라 '얼마나 머물렀는가'를 보여주므로, 계절 흐름을 비교할 때 유용합니다.", en: "It shows presence rather than visits or sales, which makes it useful for comparing seasonal patterns.", zh: "它显示的是停留情况而非访问量或销售额，适合比较季节性趋势。", ja: "訪問数や売上ではなく滞在の度合いを示すため、季節の流れを比較するのに役立ちます。" })}
    />
    <div className="history-controls">
      <div role="tablist" aria-label="Period">
        {(["3m", "6m", "12m", "all"] as const).map((item) => <button key={item} className={period === item ? "active" : ""} onClick={() => { setPeriod(item); setRangeOpen(false); }}>{item === "3m" ? localText(lang, { ko: "3개월", en: "3M", zh: "3个月", ja: "3か月" }) : item === "6m" ? localText(lang, { ko: "6개월", en: "6M", zh: "6个月", ja: "6か月" }) : item === "12m" ? localText(lang, { ko: "12개월", en: "12M", zh: "12个月", ja: "12か月" }) : localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全期間" })}</button>)}
        <button className={(period === "custom" ? "active " : "") + "range-trigger"} onClick={() => { setDraftStart(rangeStart); setDraftEnd(rangeEnd); setRangeOpen((open) => !open); }} aria-expanded={rangeOpen}>＋ {localText(lang, { ko: "기간 설정", en: "CUSTOM", zh: "自定义", ja: "期間指定" })}</button>
      </div>
    </div>
    {rangeOpen && <MonthRangePicker lang={lang} start={draftStart} end={draftEnd} min={foreignMonthly[0].month} max={foreignMonthly.at(-1)!.month} onStart={setDraftStart} onEnd={setDraftEnd} onCancel={() => setRangeOpen(false)} onApply={(nextStart, nextEnd) => { setRangeStart(nextStart); setRangeEnd(nextEnd); setPeriod("custom"); setRangeOpen(false); }} />}
    <div className="history-kpis">
      <div><span>{localText(lang, { ko: "선택 기간 월평균", en: "PERIOD MONTHLY AVG.", zh: "所选期间月均", ja: "選択期間の月平均" })}</span><strong>{formatCount(lang, periodAverage)}</strong><small>{periodLabel}</small></div>
      <div><span>{localText(lang, { ko: "기간 처음 대비", en: "START-TO-END CHANGE", zh: "期初至期末变化", ja: "期間初比" })}</span><strong>{<ChangeRate value={periodChange} lang={lang}/>}</strong><small>{startRow?.month ?? "—"} → {endRow?.month ?? "—"}</small></div>
      <div><span>{localText(lang, { ko: "최고 월", en: "PEAK MONTH", zh: "峰值月", ja: "ピーク月" })}</span><strong>{peakRow?.month ?? "—"}</strong><small>{peakRow ? formatCount(lang, peakRow[selected]) : "—"}</small></div>
    </div>
    <ol className="history-bars" aria-label={localText(lang, { ko: "월별 추이", en: "Monthly trend", zh: "月度趋势", ja: "月次推移" })}>
      {rows.map((row) => <li key={row.month} className={peakRow?.month === row.month ? "peak" : ""}>
        <span>{row.month}</span>
        <i style={{ width: `${Math.max(2, row[selected] / max * 100)}%` }} />
        <b>{formatCount(lang, row[selected])}</b>
      </li>)}
    </ol>
    <div className="detail-strip">
      <p className="eyebrow">2026-07 · {area.en}</p>
      <ol>
        <li><span>{localText(lang, { ko: "월평균", en: "Monthly average", zh: "月均", ja: "月平均" })}</span><b>{formatCount(lang, detail.average)}</b></li>
        <li><span>{localText(lang, { ko: "중국 국적", en: "Chinese nationality", zh: "中国国籍", ja: "中国籍" })}</span><b>{formatCount(lang, detail.china)} · {formatDisplayInteger(detail.chinaShare, lang)}%</b></li>
        <li><span>{localText(lang, { ko: "가장 많은 시간대", en: "Highest hour", zh: "人数最多时段", ja: "最も多い時間帯" })}</span><b>{detail.peakHour}</b></li>
      </ol>
    </div>
  </section>;
}

function ForeignHistoryStats({ lang, selected }: { lang: Lang; selected: ForeignHistoryAreaId }) {
  const foreignRecent = foreignMonthly.at(-1)!;
  const foreignPrior = foreignMonthly.at(-2)!;
  const foreignChange = foreignPrior[selected] ? (foreignRecent[selected] - foreignPrior[selected]) / foreignPrior[selected] * 100 : null;
  const twelve = foreignMonthly.slice(-12);
  const twelveAverage = Math.round(twelve.reduce((sum, row) => sum + row[selected], 0) / twelve.length);
  const vsAverage = twelveAverage ? (foreignRecent[selected] - twelveAverage) / twelveAverage * 100 : null;
  const twelveMax = Math.max(...twelve.map((row) => row[selected]));
  const twelveMin = Math.min(...twelve.map((row) => row[selected]));
  const maxRow = twelve.find((row) => row[selected] === twelveMax)!;
  const minRow = twelve.find((row) => row[selected] === twelveMin)!;
  return <>
    <div className="stat-rows">
      <div><span>{localText(lang, { ko: "최신 월", en: "Latest month", zh: "最新月份", ja: "最新月" })}</span><b>{foreignRecent.month}</b><i>{formatCount(lang, foreignRecent[selected])}</i></div>
      <div><span>{localText(lang, { ko: "전월 대비 신장률", en: "Vs. previous month", zh: "环比", ja: "前月比" })}</span><b>{<ChangeRate value={foreignChange} lang={lang}/>}</b><i>{foreignPrior.month} → {foreignRecent.month}</i></div>
      <div><span>{localText(lang, { ko: "최근 12개월 평균 대비", en: "Vs. 12-month average", zh: "较近12个月平均", ja: "直近12か月平均比" })}</span><b>{<ChangeRate value={vsAverage} lang={lang}/>}</b><i>{formatCount(lang, twelveAverage)}</i></div>
      <div><span>{localText(lang, { ko: "12개월 최고 / 최저", en: "12-month high / low", zh: "12个月最高／最低", ja: "12か月の最高／最低" })}</span><b>{maxRow.month} / {minRow.month}</b><i>{formatCount(lang, twelveMax)} / {formatCount(lang, twelveMin)}</i></div>
    </div>
  </>;
}

/**
 * Insights.
 *
 * The old screen led with a large fabricated 0–100 index, which told a reader
 * nothing they could act on or check. Every block here is an official figure
 * with a plain-language explanation of what it means and where it came from.
 */
function InsightsView({ lang, selected, setSelected }: { lang: Lang; selected: AreaId; setSelected: (id: AreaId) => void }) {
  const recentAirport = airportMonthly.slice(-3);
  const priorAirport = airportMonthly.slice(-6, -3);
  const recentAirportTotal = recentAirport.reduce((sum, item) => sum + airportValue(item, "all", "departure"), 0);
  const recentT2Total = recentAirport.reduce((sum, item) => sum + airportValue(item, "T2", "departure"), 0);
  const priorAirportTotal = priorAirport.reduce((sum, item) => sum + airportValue(item, "all", "departure"), 0);
  const priorT2Total = priorAirport.reduce((sum, item) => sum + airportValue(item, "T2", "departure"), 0);
  const recentT2Share = recentT2Total / recentAirportTotal * 100;
  const priorT2Share = priorT2Total / priorAirportTotal * 100;
  const shareDelta = recentT2Share - priorT2Share;
  const recentMonths = `${recentAirport[0].month} — ${recentAirport.at(-1)!.month}`;
  const priorMonths = `${priorAirport[0].month} — ${priorAirport.at(-1)!.month}`;


  return (
    <section className="view-section insights-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">OFFICIAL RECORDS</p>
          <h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>{recordText('title', lang)}</h1>
          <p>{recordText('intro', lang)}</p>
        </div>
      </div>

      <MonthlyRecordsView lang={lang} area={selected} onArea={setSelected} />
      <PredictionEvidence lang={lang} area={selected}/>

      <details className="records-reference records-details"><summary>{recordText('reference', lang)}</summary>
      <section className="insight-block" aria-labelledby="insight-terminal-title">
        <div className="section-head">
          <div><p className="eyebrow">02 · T1 VS T2 · OFFICIAL HISTORICAL</p><h2 data-heading="section" id="insight-terminal-title"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "터미널별 출국객 비중", en: "Departure share by terminal", zh: "各航站楼出境占比", ja: "ターミナル別の出国者比率" })}</h2></div>
          <span className="official-label">OFFICIAL HISTORICAL</span>
        </div>
        <MetricExplainer
          lang={lang}
          what={localText(lang, { ko: "인천공항 과거 출국 여객 통계에서 각 터미널이 차지한 비율입니다.", en: "The share of all Incheon departures handled by each terminal.", zh: "各航站楼在仁川机场全部出境旅客中所占的比例。", ja: "仁川空港の全出国者のうち各ターミナルが占める割合です。" })}
          high={localText(lang, { ko: "그 터미널로 출국 수요가 더 몰렸다는 뜻입니다.", en: "More departure demand was concentrated at that terminal.", zh: "表示出境需求更集中于该航站楼。", ja: "その ターミナルに出国需要がより集中したことを意味します。" })}
          source={localText(lang, { ko: "인천국제공항공사 공식 월별 통계", en: "Incheon International Airport Corporation monthly statistics", zh: "仁川国际机场公社官方月度统计", ja: "仁川国際空港公社 公式月次統計" })}
          why={localText(lang, { ko: "이용할 터미널이 최근 더 붐비는 쪽인지 미리 가늠할 수 있습니다.", en: "It tells you in advance whether your terminal is the busier one lately.", zh: "可提前判断您将使用的航站楼近期是否更为繁忙。", ja: "利用するターミナルが最近混んでいる側かを事前に把握できます。" })}
        />
        <div className="compare-bars">
          <div><span>T1</span><i style={{ width: `${100 - recentT2Share}%` }} /><b>{formatDisplayInteger(100 - recentT2Share, lang)}%</b></div>
          <div><span>T2</span><i style={{ width: `${recentT2Share}%` }} /><b>{formatDisplayInteger(recentT2Share, lang)}%</b></div>
        </div>
        <ul className="reading-notes">
          <li><span>{localText(lang, { ko: "기준 기간", en: "Period", zh: "统计期间", ja: "対象期間" })}</span><b>{recentMonths}</b></li>
          <li><span>{localText(lang, { ko: "직전 3개월", en: "Previous three months", zh: "此前3个月", ja: "直前3か月" })}</span><b>{priorMonths} · T2 {formatDisplayInteger(priorT2Share, lang)}%</b></li>
          <li><span>{localText(lang, { ko: "T2 변화", en: "T2 change", zh: "T2变化", ja: "T2の変化" })}</span><b><ChangeRate value={shareDelta} lang={lang} unit="%p"/></b></li>
        </ul>
      </section>

      <section className="insight-block" aria-labelledby="insight-foreign-title">
        <div className="section-head">
          <div><p className="eyebrow">03 · AREA · OFFICIAL HISTORICAL</p><h2 data-heading="section" id="insight-foreign-title"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "지역 외국인 생활인구", en: "Foreign living population by area", zh: "各地区外国人生活人口", ja: "エリア別の外国人生活人口" })}</h2></div>
          <span className="official-label">OFFICIAL HISTORICAL</span>
        </div>
        <div className="area-tabs" role="tablist">
          {(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}
        </div>
        <MetricExplainer
          lang={lang}
          what={localText(lang, { ko: "해당 지역에 머문 단기체류 외국인의 시간당 평균 인원입니다.", en: "The average hourly number of short-stay foreign visitors present in the area.", zh: "该地区停留的短期外国访客的每小时平均人数。", ja: "その地域に滞在した短期滞在外国人の時間当たり平均人数です。" })}
          high={localText(lang, { ko: "평소보다 많은 외국인이 그 지역에 머물렀다는 뜻입니다.", en: "More foreign visitors than usual were present in that area.", zh: "表示该地区停留的外国人多于平常。", ja: "普段より多くの外国人がその地域に滞在したことを意味します。" })}
          source={localText(lang, { ko: "서울 열린데이터광장 · 매월 지연 공개", en: "Seoul Open Data · published monthly with a delay", zh: "首尔开放数据广场 · 每月延迟发布", ja: "ソウル オープンデータ広場 · 毎月遅れて公開" })}
          why={localText(lang, { ko: "실시간 값이 아니라 이미 확정된 기록이므로, 계절과 추세를 비교하는 기준으로 삼을 수 있습니다.", en: "It is a settled record rather than a live value, so it works as a baseline for seasonal comparison.", zh: "它是已确定的记录而非实时值，可作为季节性比较的基准。", ja: "リアルタイム値ではなく確定した記録のため、季節や傾向を比較する基準になります。" })}
        />
        {hasForeignHistory(selected) ? <ForeignHistoryStats lang={lang} selected={selected} /> : <ForeignHistoryPending lang={lang} id={selected} />}
      </section>

      <section className="insight-block" aria-labelledby="insight-accuracy-title">
        <div className="section-head">
          <div><p className="eyebrow">04 · TRACK RECORD</p><h2 data-heading="section" id="insight-accuracy-title"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "예측 성적표는 아직 없습니다", en: "There is no accuracy record yet", zh: "目前还没有预测成绩", ja: "予測の成績はまだありません" })}</h2></div>
        </div>
        <p className="section-intro">{localText(lang, {
          ko: "서울 지역 상세의 앞으로 시간대는 서울시 공식 예상입니다. 별도의 예측 메뉴는 서울 한눈에로 바뀌었으며, 기존 예상·관측·계산 기록은 그대로 보존합니다. 정확도 성적은 주장하지 않습니다.",
          en: "Upcoming hours in Seoul area details use Seoul’s official forecast. Seoul at a glance replaces the separate Outlook menu; existing forecast, observation and calculation records are preserved. No accuracy claim is made.",
          zh: "首尔地区详情的后续时段使用首尔市官方预报。首尔一览取代独立预测菜单，原预测、观测与计算记录保留，不声称准确率。",
          ja: "ソウルのエリア詳細の今後の時間帯はソウル市公式予報です。別の予測メニューはソウルひと目でに変わり、既存の予測・観測・計算記録は保全。精度は主張しません。",
        })}</p>
        <p className="section-intro">{localText(lang, {
          ko: "언젠가 자체 예측을 내놓게 되면, 결과가 나오기 전에 저장해 둔 예측만으로 성적을 계산합니다. 과거 데이터를 나중에 끼워 맞춰 정확도를 만들어내지 않습니다.",
          en: "If we ever publish our own forecast, the record will be built only from predictions saved before the outcome existed. We will not manufacture accuracy by fitting past data after the fact.",
          zh: "若将来发布自有预测，成绩只会基于结果出现前已保存的预测计算，不会事后用历史数据拼凑准确率。",
          ja: "将来自前の予測を出す場合も、結果が判明する前に保存した予測だけで成績を算出します。後から過去データを当てはめて精度を作ることはしません。",
        })}</p>
      </section>
      </details>
    </section>
  );
}

/**
 * About — written for a first-time visitor, not for an engineer.
 */
function AboutView({ lang, onAirport, onSeoul }: { lang: Lang; onAirport: () => void; onSeoul: () => void }) {
  const sections = [
    {
      eyebrow: "01 · WHAT",
      title: localText(lang, { ko: "KORETAIL은 무엇인가요?", en: "What is KORETAIL?", zh: "KORETAIL 是什么？", ja: "KORETAIL とは？" }),
      body: localText(lang, {
        ko: "서울의 대표 쇼핑 지역과 인천공항에 관한 공개 공식 자료와 출처가 표시된 참조자료를 한 화면에 모읍니다. 원자료와 KORETAIL이 계산한 비교값을 구분해 표시하며, 과거 예상·실제 관측 비교는 기록 화면에서 확인할 수 있습니다.",
        en: "KORETAIL brings public official data and clearly labelled reference data about Seoul’s main shopping areas and Incheon Airport into one view. Source values and KORETAIL-calculated comparisons are identified separately; historical-baseline estimates are separately labelled.",
        zh: "KORETAIL 将首尔主要购物区与仁川机场的公开官方数据及明确标注来源的参考资料汇总到一个页面。来源数值与 KORETAIL 计算的比较值会分开标示，历史基线参考预测另行标注。",
        ja: "KORETAILは、ソウルの主要ショッピングエリアと仁川空港について、公開された公式データと出典を明記した参照データを一画面にまとめます。出典の数値とKORETAILが算出した比較値を区別し、過去記録に基づく参考予測は別に表示します。",
      }),
    },
    {
      eyebrow: "02 · WHO",
      title: localText(lang, { ko: "누구를 위한 서비스인가요?", en: "Who is it for?", zh: "面向哪些人？", ja: "誰のためのサービス？" }),
      body: localText(lang, {
        ko: "서울을 방문해 어디를 언제 갈지 정하려는 분, 인천공항 출국 흐름을 미리 확인하려는 분, 그리고 명동·홍대·성수·이태원에서 매장을 운영하며 오늘의 준비를 결정해야 하는 분을 위해 만들었습니다.",
        en: "For visitors deciding where and when to go in Seoul, for travellers checking Incheon's departure flow before they leave, and for people running a shop in Myeongdong, Hongdae, Seongsu or Itaewon who need to decide today's preparation.",
        zh: "适合正在决定首尔行程的访客、出发前想确认仁川出境情况的旅客，以及在明洞、弘大、圣水、梨泰院经营门店、需要决定当日准备的经营者。",
        ja: "ソウルでどこへいつ行くか決めたい方、出発前に仁川の出国状況を確認したい方、そして明洞・弘大・聖水・梨泰院で店舗を運営し当日の準備を決める方のために作りました。",
      }),
    },
    {
      eyebrow: "03 · SEOUL",
      title: localText(lang, { ko: "서울에서는 무엇을 보나요?", en: "What do you see for Seoul?", zh: "在首尔能看到什么？", ja: "ソウルでは何が見られる？" }),
      body: localText(lang, {
        ko: "명동·홍대·성수·이태원 각각의 현재 혼잡 상태와 현재 추정 인구 범위, 서울시 공식 예측 기준 앞으로 가장 붐빌 시간, 날씨에 따른 준비사항을 봅니다. 인근 행사는 공식 행사기간에 오늘이 포함되거나 앞으로 시작할 때 표시합니다.",
        en: "For Myeongdong, Hongdae, Seongsu and Itaewon, see current crowd conditions and the official estimated population range, the busiest hour ahead in Seoul’s official forecast, and weather implications. Nearby events are shown when their official dates include today or start later.",
        zh: "针对明洞、弘大、圣水、梨泰院，可查看当前拥挤状况与官方推定人口区间、首尔市官方预测中接下来最拥挤的时段，以及天气带来的准备事项。附近活动仅在官方活动日期包含今日或之后开始时显示。",
        ja: "明洞・弘大・聖水・梨泰院それぞれの現在の混雑状況と公式の推定人口レンジ、ソウル市公式予測で今後最も混雑する時間帯、天気に応じた準備を確認できます。周辺イベントは、公式開催期間に本日が含まれるもの、または今後開始予定のものを表示します。",
      }),
    },
    {
      eyebrow: "04 · AIRPORT",
      title: localText(lang, { ko: "공항에서는 무엇을 보나요?", en: "What do you see for the airport?", zh: "在机场能看到什么？", ja: "空港では何が見られる？" }),
      body: localText(lang, {
        ko: "인천공항의 출국장 공식 예상 승객과 피크 시간, 실제 출발 운항 편수와 게이트 집중 순위, 그리고 현재 출국장별 대기시간과 대기인원을 봅니다. 전체·T1·T2를 따로 볼 수 있습니다.",
        en: "Incheon's official departure-hall passenger forecast and peak hour, the number of physical departing flights with the busiest gates, and the current wait time and queue size at each departure checkpoint. All terminals, T1 and T2 can be viewed separately.",
        zh: "仁川机场的出境大厅官方预计人数与高峰时段、实际出发航班数与登机口集中排名，以及各出境检查点当前的等候时间与等候人数。可分别查看全部、T1 与 T2。",
        ja: "仁川空港の出国場公式予想旅客数とピーク時間、実際の出発便数とゲート集中ランキング、各出国場の現在の待ち時間と待機人数を表示します。全体・T1・T2 を分けて確認できます。",
      }) + " " + passengerCopy.scope[lang] + ". " + passengerCopy.limitation[lang] + " " + passengerCopy.noSum[lang],
    },
    {
      eyebrow: "05 · DATA",
      title: localText(lang, { ko: "어떤 데이터를 쓰나요?", en: "Which data do you use?", zh: "使用哪些数据？", ja: "どのデータを使う？" }),
      body: localText(lang, {
        ko: "서울시 실시간 도시데이터, 서울시 단기체류 외국인 생활인구, 서울시 상권분석 추정매출, 기상청 단기예보, 한국관광공사, 인천국제공항공사의 운항·출국장 혼잡도·승객 예고 자료를 사용합니다. 모두 공개된 공식 자료입니다.",
        en: "Seoul real-time city data, Seoul's short-stay foreign living population, Seoul's commercial-district sales estimates, KMA short-term weather forecasts, KTO events, and Incheon Airport's flight, departure-hall congestion and passenger forecast datasets. All are public official sources.",
        zh: "首尔实时城市数据、首尔短期停留外国人生活人口、首尔商圈分析推算销售额、气象厅短期预报、韩国观光公社 活动，以及仁川机场的航班、出境区拥挤度与旅客预告数据。全部为公开的官方资料。",
        ja: "ソウルリアルタイム都市データ、ソウル短期滞在外国人生活人口、ソウル商圏分析の推定売上、気象庁短期予報、韓国観光公社、仁川空港の運航・出国場混雑度・旅客予告データを使用します。すべて公開された公式資料です。",
      }),
    },
    {
      eyebrow: "06 · KINDS",
      title: localText(lang, { ko: "실시간·예상·과거는 어떻게 다른가요?", en: "How do live, forecast and past differ?", zh: "实时、预测与历史有何不同？", ja: "リアルタイム・予測・過去の違いは？" }),
      body: localText(lang, {
        ko: "'실시간'은 방금 관측된 값이고, '공식 예상'은 서울시나 인천공항이 앞날에 대해 발표한 예측이며, '과거 기록'은 이미 확정되어 바뀌지 않는 값입니다. 이 세 가지를 절대 하나의 숫자로 합치지 않습니다.",
        en: "\"Live\" is something just observed, \"official forecast\" is what Seoul or Incheon Airport published about the future, and \"past record\" is settled and will not change. These three are never merged into one number.",
        zh: "「实时」是刚刚观测到的值，「官方预测」是首尔市或仁川机场就未来发布的预测，「历史记录」则是已确定且不会改变的值。这三者绝不会被合并为一个数字。",
        ja: "「リアルタイム」は直前に観測された値、「公式予測」はソウル市や仁川空港が将来について発表した予測、「過去の記録」はすでに確定して変わらない値です。この3つを1つの数値にまとめることはありません。",
      }),
    },
    {
      eyebrow: "07 · TIME",
      title: localText(lang, { ko: "'○시 기준'은 무슨 뜻인가요?", en: "What does \"as of\" mean?", zh: "「截至○时」是什么意思？", ja: "「○時時点」とは？" }),
      body: localText(lang, {
        ko: "그 값이 실제로 관측되거나 발표된 시각입니다. 데이터마다 갱신 주기가 달라서 화면의 모든 숫자가 같은 시각의 값은 아니며, 그래서 항목마다 기준시각을 따로 적어 둡니다. 모든 시각은 한국 표준시입니다.",
        en: "It is the moment that value was actually observed or published. Different datasets update on different cycles, so not every number on screen shares one timestamp — which is why each item carries its own. All times are Korea Standard Time.",
        zh: "指该数值实际被观测或发布的时刻。不同数据的更新周期不同，因此页面上的数字并非同一时刻的值，故每一项都单独标注基准时间。所有时间均为韩国标准时间。",
        ja: "その値が実際に観測または発表された時刻です。データごとに更新周期が異なるため、画面上のすべての数値が同じ時刻のものではなく、項目ごとに基準時刻を記載しています。時刻はすべて韓国標準時です。",
      }),
    },
    {
      eyebrow: "08 · LIMITS",
      title: localText(lang, { ko: "무엇을 주의해야 하나요?", en: "What should you keep in mind?", zh: "需要注意什么？", ja: "注意点は？" }),
      body: localText(lang, {
        ko: "여기 숫자는 매출이나 방문자 수가 아닙니다. 공항 출국장 이용 예상은 외국인 수가 아니고, 게이트에 편수가 몰린다고 출국장이 붐빈다는 뜻도 아닙니다. 원본 기관의 발표가 늦어지면 저희 화면도 함께 늦어지며, 그때는 값을 지어내는 대신 '확인 불가'로 표시합니다.",
        en: "These numbers are not sales or visitor counts. The departure-hall forecast is not a count of foreign visitors, and flights concentrating at a gate does not mean the departure hall is crowded. When a source publishes late, this screen is late too — and in that case we show \"unavailable\" instead of inventing a value.",
        zh: "这些数字并非销售额或访客数。出境区预计旅客数不等于外国人数，航班集中于某登机口也不代表出境区拥挤。若来源机构发布延迟，本页面也会延迟，此时我们会显示「暂无法确认」而不是编造数值。",
        ja: "ここの数値は売上や来訪者数ではありません。出国場の予想旅客数は外国人数ではなく、ゲートに便が集中しても出国場が混雑しているという意味ではありません。提供元の発表が遅れれば本画面も遅れ、その際は値を作らず「確認不可」と表示します。",
      }),
    },
  ];

  const visibleSections = lang === 'ko' ? [
    {eyebrow:'01 · KORETAIL',title:'누구를 위한 서비스인가요?',body:'인천공항 판매·식음료 직원과 영업·현장 관리자가 공항의 오늘과 달라진 흐름을 살펴보는 서비스입니다. 서울 지역 자료도 이용할 수 있습니다.'},
    {eyebrow:'02 · AIRPORT',title:'어떤 정보를 볼 수 있나요?',body:'한눈에에서 예상 인원과 출발편을 확인하고 시간대·요일·터미널·연휴 전후를 비교합니다. 공항현황은 대기와 출발편, 국가별 흐름은 목적지별 여객과 항공편, 미리 준비는 휴일과 반입 안내를 제공합니다.'},
    {eyebrow:'03 · READING',title:'숫자와 색은 어떻게 읽나요?',body:'파란색 +는 신장, 빨간색 △는 역신장입니다. 비교 기간·단위·포함 날짜를 함께 확인하세요. 표시 숫자는 반올림하며 계산은 원래 값으로 합니다.'},
    {eyebrow:'04 · LIMITS',title:'자료를 볼 때 주의할 점',body:'예상은 실제 인원이나 매출이 아닙니다. 목적지 국가는 승객 국적이 아닙니다. '+passengerCopy.limitation.ko+' '+passengerCopy.noSum.ko+' 자료가 없을 때는 확인 불가로 표시합니다.'},
  ] : sections;

  return (
    <section className="view-section about-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">ABOUT KORETAIL</p>
          <h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "인천공항의 흐름을\n한눈에", en: "Official data only,\nexactly as published", zh: "只用官方数据，\n如实呈现", ja: "公式データだけを、\nありのままに" })}</h1>
          <p>{localText(lang, { ko: "인천공항 항공편·여객 흐름과 여행 준비 정보를 중심으로 제공하는 코리테일 KORETAIL은 Korea와 Retail을 합친 이름입니다. 자료별 기준일과 출처를 함께 안내합니다.", en: "KORETAIL combines Korea and Retail, focusing on Incheon Airport flights, passenger trends and travel preparation, with source dates and references.", zh: "KORETAIL 由 Korea 与 Retail 组合而成，以仁川机场航班、旅客趋势与出行准备为中心，并标明资料日期和来源。", ja: "KORETAIL は Korea と Retail を組み合わせた名前です。仁川空港のフライト・旅客動向・旅行準備を中心に、資料の日付と出典を案内します。" })}</p>
        </div>
      </div>

      <div className="about-sections">
        {visibleSections.map((section) => <section key={section.eyebrow} className="about-section">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{section.title}</h2>
          <p>{section.body}</p>
        </section>)}
      </div>

      <div className="about-actions">
        <button onClick={onSeoul}>{localText(lang, { ko: "서울 화면 보기", en: "Open Seoul", zh: "查看首尔页面", ja: "ソウル画面を見る" })} ↗</button>
        <button onClick={onAirport}>{localText(lang, { ko: "공항 화면 보기", en: "Open Airport", zh: "查看机场页面", ja: "空港画面を見る" })} ↗</button>
      </div>
    </section>
  );
}

function MoreView({
  lang, setLang, selected, terminal, industry, onAbout, onNavigate,
}: {
  lang: Lang; setLang: (value: Lang) => void; selected: AreaId; terminal: Terminal; industry: IndustryId;
  onAbout: () => void;
  onNavigate: (view: View) => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // On a phone this screen is the way to 매장, so its code loads once the
  // screen's own fonts have arrived and the screen is idle.
  useEffect(() => {
    let live = true, idle = 0, timer: ReturnType<typeof setTimeout> | undefined;
    void document.fonts.ready.then(() => {
      if (!live) return;
      if ("requestIdleCallback" in window) idle = requestIdleCallback(prepareBusinessView, { timeout: 1000 });
      else timer = setTimeout(prepareBusinessView, 200);
    });
    return () => { live = false; if (idle) cancelIdleCallback(idle); clearTimeout(timer); };
  }, []);
  return (
    <section className="view-section more-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">SETTINGS &amp; SOURCES</p>
          <h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "설정과 데이터 출처", en: "Settings and sources", zh: "设置与数据来源", ja: "設定とデータ出典" })}</h1>
        </div>
      </div>

      <p className="truth-note" data-testid="change-reading-guide">{localText(lang, { ko: "수치 읽는 법: 파란색 +는 증가, 빨간색 △는 감소입니다. 비교 기간과 단위를 함께 확인하세요. 인원·비율은 소수 첫째 자리 5 이상 올림, 5 미만 버림으로 표시합니다. 계산은 원본값 기준이며, 0%로 표시돼도 작은 증감이 있을 수 있습니다.", en: "Reading changes: blue + means increase; red △ means decrease. Check the comparison period and unit together. People and percentages are rounded to whole numbers: a fractional part of 0.5 or more rounds up in magnitude, otherwise down. Calculations use original values; 0% may still represent a small change.", zh: "数值读法：蓝色 + 表示增加，红色 △ 表示减少。请同时确认比较时段和单位。人数及百分比按绝对值四舍五入到整数；计算使用原始值，显示0%仍可能存在小幅变化。", ja: "数値の読み方：青の + は増加、赤の △ は減少です。比較期間と単位も確認してください。人数・比率は絶対値の小数第1位を四捨五入して整数表示します。計算は元の値を使い、0%表示でも小さな増減がある場合があります。" })}</p>

      <nav className="more-section-links" aria-label={localText(lang,{ko:'서비스 메뉴',en:'Service sections',zh:'服务菜单',ja:'サービスメニュー'})}>
        <button type="button" className="update-notice-trigger" aria-haspopup="dialog" onClick={()=>window.dispatchEvent(new Event(UPDATE_NOTICE_OPEN_EVENT))}>{localText(lang,{ko:'공지사항 보기',en:'View update notice',zh:'查看更新公告',ja:'更新のお知らせ'})}</button>
        {lang === "ko" && <button type="button" className="update-notice-trigger" onClick={() => { const guide = document.getElementById("airport-usage-guide"); if (guide instanceof HTMLDetailsElement) { guide.open = true; guide.scrollIntoView({ behavior: "smooth", block: "start" }); } }}>인천공항 이용 방법</button>}
        {(['where-to','today','consumption','business','tourism-desk','forecast','about'] as const).map(item=><a key={item} href={routeFor(lang,item,selected)} onPointerEnter={item==='business'?prepareBusinessView:undefined} onFocus={item==='business'?prepareBusinessView:undefined} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onNavigate(item);}}}>{copy[lang][item]}</a>)}
      </nav>
      <AnalyticsConsent lang={lang} />
      <SiteUsageGuide lang={lang} />
      <CollectionStatus lang={lang} />

      <section className="preference-block" aria-labelledby="preference-title">
        <div className="section-head"><div><p className="eyebrow">SAVED ON THIS DEVICE</p><h2 data-heading="section" id="preference-title"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "저장된 설정", en: "Saved preferences", zh: "已保存的设置", ja: "保存された設定" })}</h2></div></div>
        <ul className="preference-rows">
          <li><span>{localText(lang, { ko: "언어", en: "Language", zh: "语言", ja: "言語" })}</span><b>{lang === "ko" ? "한국어" : lang === "en" ? "English" : lang === "zh" ? "简体中文" : "日本語"}</b></li>
          <li><span>{localText(lang, { ko: "지역", en: "Area", zh: "地区", ja: "エリア" })}</span><b>{areaLocalName(selected, lang)}</b></li>
          <li><span>{localText(lang, { ko: "터미널", en: "Terminal", zh: "航站楼", ja: "ターミナル" })}</span><b>{terminal === "all" ? localText(lang, { ko: "전체", en: "All", zh: "全部", ja: "全体" }) : terminal}</b></li>
          <li><span>{localText(lang, { ko: "업종", en: "Business type", zh: "业态", ja: "業種" })}</span><b>{industryLabels[industry][lang]}</b></li>
        </ul>
        <div className="language-choices" role="group" aria-label="Language">
          {(["ko", "en", "zh", "ja"] as Lang[]).map((item) => <button key={item} className={lang === item ? "active" : ""} onClick={() => setLang(item)}>{item === "ko" ? "한국어" : item === "en" ? "English" : item === "zh" ? "简体中文" : "日本語"}</button>)}
        </div>
        <p className="truth-note">{localText(lang, { ko: "설정은 이 기기에만 저장되며 서버로 보내지 않습니다.", en: "Preferences are stored on this device only and are never sent to a server.", zh: "设置仅保存在本设备，不会发送至服务器。", ja: "設定はこの端末にのみ保存され、サーバーには送信されません。" })}</p>
      </section>

      <section className="about-link-block">
        <div><p className="eyebrow">ABOUT</p><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "KORETAIL이 처음이신가요?", en: "New to KORETAIL?", zh: "第一次使用 KORETAIL？", ja: "KORETAIL は初めてですか？" })}</h2><p>{localText(lang, { ko: "무엇을 보여주는 서비스인지, 어떤 데이터를 쓰는지 소개 페이지에 정리했습니다.", en: "The About page explains what this service shows and which data it uses.", zh: "关于页面介绍了本服务展示的内容与所用数据。", ja: "紹介ページで、何を表示するサービスかと使用データを説明しています。" })}</p></div>
        <button onClick={onAbout}>{localText(lang, { ko: "소개 보기", en: "READ ABOUT", zh: "查看介绍", ja: "紹介を見る" })} ↗</button>
      </section>

      <section className="source-block" aria-labelledby="source-title">
        <div className="section-head"><div><p className="eyebrow">DATA SOURCES</p><h2 data-heading="section" id="source-title"><span className="heading-marker" aria-hidden="true"/>{localText(lang, { ko: "사용 중인 공식 자료", en: "Official sources in use", zh: "使用中的官方资料", ja: "利用中の公式資料" })}</h2></div>
          <button className="source-toggle" onClick={() => setSourcesOpen((open) => !open)} aria-expanded={sourcesOpen}>{sourcesOpen ? localText(lang, { ko: "접기", en: "COLLAPSE", zh: "收起", ja: "閉じる" }) : localText(lang, { ko: "전체 보기", en: "SHOW ALL", zh: "查看全部", ja: "すべて見る" })}</button>
        </div>
        <ol className="source-rows">
          {(sourcesOpen ? activeSourceCatalog : activeSourceCatalog.slice(0, 6)).map((row, index) => <li key={row.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{sourceName(row.id,lang)}</strong></div>
            <p>{sourceUse(row,lang)}</p>
          </li>)}
        </ol>
      </section>
    </section>
  );
}

/** Server-read answer lines; nothing renders when there is no answer. */
function TodayAnswerLines({ lines }: { lines: Array<string | null> }) {
  const shown = lines.filter((line): line is string => Boolean(line));
  if (!shown.length) return null;
  return <div className="today-answer">{shown.map((line) => <p key={line}>{line}</p>)}</div>;
}
