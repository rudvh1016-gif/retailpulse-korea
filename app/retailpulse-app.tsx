"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { checklistPhaseLabels, checklistPhaseOrder, type IndustryId, industryProfiles } from "../lib/industry-guidance";
import {
  airportAnnual,
  airportMonthly,
  airportValue,
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
import LiveSignals, {
  AirportTodaySummary,
  AreaCurrentBrief,
  DateNavigator,
  DateScopeNote,
  FacilityDirectory,
  MyStoreBriefing,
  FlightBoard,
  HomeTodayBrief,
  KstTodayChip,
} from "./live-signals";
import { TourismDeskView } from "./tourism-desk";

const betaSignupEnabled = process.env.NEXT_PUBLIC_ENABLE_BETA_SIGNUP === "true";

type View = "today" | "airport" | "business" | "forecast" | "tourism-desk" | "about" | "more";
type AirportSection = "now" | "flights" | "stores" | "mystore" | "history";
type AreaId = "myeongdong" | "hongdae" | "seongsu";

// Area identity only. There is deliberately no "best time" here: a recommended
// hour would be a claim about demand, and the only hour KORETAIL can stand
// behind is the one Seoul's own official forecast names.
const areaInfo = {
  myeongdong: { en: "MYEONGDONG", ko: "명동", zh: "明洞", ja: "明洞" },
  hongdae: { en: "HONGDAE", ko: "홍대", zh: "弘大", ja: "弘大" },
  seongsu: { en: "SEONGSU", ko: "성수", zh: "圣水", ja: "聖水" },
};

function localText(lang: Lang, values: Record<Lang, string>) {
  return values[lang];
}

function areaLocalName(id: AreaId, lang: Lang) {
  return areaInfo[id][lang];
}

const copy = {
  ko: {
    hero: "지금 서울은\n어떻게 움직이고 있나요?",
    sub: "공식 데이터만 모아 명동·홍대·성수와 인천공항의 지금과 다음을 보여줍니다.",
    today: "서울", airport: "공항", business: "매장", forecast: "기록", "tourism-desk": "관광안내", about: "소개", more: "더보기",
    kst: "모든 시간은 한국 표준시(KST)입니다.",
    truth: "표시되는 값은 모두 공식 기관이 발표한 데이터이며, 확인되지 않은 값은 만들어 채우지 않습니다.",
  },
  en: {
    hero: "How is Seoul\nmoving right now?",
    sub: "Official data only, showing what Myeongdong, Hongdae, Seongsu and Incheon Airport look like now and next.",
    today: "Seoul", airport: "Airport", business: "Business", forecast: "Records", "tourism-desk": "Tourism", about: "About", more: "More",
    kst: "All times are Korea Standard Time (KST).",
    truth: "Every value shown is published by an official body. Nothing unverified is filled in.",
  },
  zh: {
    hero: "此刻的首尔\n正在如何流动？",
    sub: "仅汇总官方数据，呈现明洞、弘大、圣水与仁川机场的当前与接下来。",
    today: "首尔", airport: "机场", business: "门店", forecast: "记录", "tourism-desk": "旅游咨询", about: "关于", more: "更多",
    kst: "所有时间均为韩国标准时间（KST）。",
    truth: "所显示的数值均由官方机构发布，未经确认的数值不会被填充。",
  },
  ja: {
    hero: "いまソウルは\nどう動いていますか？",
    sub: "公式データだけを集め、明洞・弘大・聖水と仁川空港の現在とこれからを表示します。",
    today: "ソウル", airport: "空港", business: "店舗", forecast: "記録", "tourism-desk": "観光案内", about: "紹介", more: "その他",
    kst: "すべての時刻は韓国標準時（KST）です。",
    truth: "表示される値はすべて公式機関が発表したものです。確認できない値は作って埋めません。",
  },
} as const;


function Icon({ name }: { name: View }) {
  const paths: Record<View, string> = {
    today: "M4 13h4v7H4zM10 8h4v12h-4zM16 4h4v16h-4z",
    airport: "M2 15l20-7-6 12-3-4-4 3z",
    business: "M4 20V9l8-5 8 5v11H4zm6 0v-6h4v6",
    forecast: "M3 17l5-6 4 4 4-7 5 5",
    about: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 5v1m0 3v5",
    "tourism-desk": "M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z",
    more: "M5 12h.01M12 12h.01M19 12h.01",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}

function MonthRangePicker({
  lang, start, end, min, max, onStart, onEnd, onApply, onCancel,
}: {
  lang: Lang; start: string; end: string; min: string; max: string;
  onStart: (value: string) => void; onEnd: (value: string) => void;
  onApply: (start: string, end: string) => void; onCancel: () => void;
}) {
  const monthChoices = useMemo(() => {
    const months: string[] = [];
    const [minYear, minMonth] = min.split("-").map(Number);
    const [maxYear, maxMonth] = max.split("-").map(Number);
    for (let year = minYear, month = minMonth; year < maxYear || (year === maxYear && month <= maxMonth);) {
      months.push(`${year}-${String(month).padStart(2, "0")}`);
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return months;
  }, [min, max]);
  const invalid = end < start;
  const monthLabel = (month: string) => {
    const [year, value] = month.split("-");
    return lang === "en" ? `${year}-${value}` : `${year}.${value}`;
  };
  return <form className="month-range" onSubmit={(event) => { event.preventDefault(); if (!invalid) onApply(start, end); }}>
    <div className="month-range-head">
      <p className="eyebrow">{localText(lang, { ko: "기간 설정", en: "CUSTOM RANGE", zh: "自定义期间", ja: "期間指定" })}</p>
      <p>{localText(lang, {
        ko: "이 사이트가 보유한 공식 월별 데이터 범위 안에서 시작월과 종료월을 선택하세요.",
        en: "Choose a start and end month within the official monthly data held in this site.",
        zh: "请在本站已收录的官方月度数据范围内选择开始月和结束月。",
        ja: "このサイトに収録された公式月次データの範囲内で開始月と終了月を選択してください。",
      })}</p>
    </div>
    <div className="month-range-fields">
      <label><span>{localText(lang, { ko: "시작월", en: "START MONTH", zh: "开始月", ja: "開始月" })}</span><select name="startMonth" aria-label={localText(lang, { ko: "시작월", en: "Start month", zh: "开始月", ja: "開始月" })} value={start} onChange={(event) => onStart(event.target.value)}>{monthChoices.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
      <span aria-hidden="true">→</span>
      <label><span>{localText(lang, { ko: "종료월", en: "END MONTH", zh: "结束月", ja: "終了月" })}</span><select name="endMonth" aria-label={localText(lang, { ko: "종료월", en: "End month", zh: "结束月", ja: "終了月" })} value={end} onChange={(event) => onEnd(event.target.value)}>{monthChoices.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
    </div>
    {invalid && <p className="month-range-error" role="alert">{localText(lang, { ko: "종료월을 시작월과 같거나 뒤로 선택하세요.", en: "Choose an end month on or after the start month.", zh: "请选择不早于开始月的结束月。", ja: "終了月を開始月以降に設定してください。" })}</p>}
    <div className="month-range-actions">
      <button type="button" onClick={onCancel}>{localText(lang, { ko: "취소", en: "CANCEL", zh: "取消", ja: "キャンセル" })}</button>
      <button type="submit" className="primary" disabled={invalid}>{localText(lang, { ko: "이 기간 보기", en: "VIEW THIS PERIOD", zh: "查看该期间", ja: "この期間を見る" })}</button>
    </div>
    <small className="month-range-coverage">{localText(lang, { ko: "선택 가능", en: "AVAILABLE", zh: "可选范围", ja: "選択可能" })} · {min} — {max}</small>
  </form>;
}

/**
 * One metric, explained in the four things a first-time reader actually asks:
 * what it is, what a high value means, where the number came from, and why it
 * is worth looking at. Every metric on the insights screen carries one, which
 * is what stops a bare "86" from being the whole story.
 */
function MetricExplainer({ lang, what, high, source, why }: { lang: Lang; what: string; high: string; source: string; why: string }) {
  const labels = {
    what: localText(lang, { ko: "무엇인가요", en: "What it is", zh: "这是什么", ja: "これは何か" }),
    high: localText(lang, { ko: "높으면", en: "When it is high", zh: "数值高时", ja: "高いとき" }),
    source: localText(lang, { ko: "출처", en: "Source", zh: "来源", ja: "出典" }),
    why: localText(lang, { ko: "왜 보나요", en: "Why look at it", zh: "为何要看", ja: "なぜ見るのか" }),
  };
  return <dl className="metric-explainer">
    <div><dt>{labels.what}</dt><dd>{what}</dd></div>
    <div><dt>{labels.high}</dt><dd>{high}</dd></div>
    <div><dt>{labels.source}</dt><dd>{source}</dd></div>
    <div><dt>{labels.why}</dt><dd>{why}</dd></div>
  </dl>;
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
      <h2 id="beta-signup-title">{localText(lang, { ko: "공개 베타 소식 받기", en: "GET PUBLIC BETA UPDATES", zh: "接收公开测试更新", ja: "公開ベータの更新を受け取る" })}</h2>
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
   * "home" is `/{lang}`: the Seoul overview with the three-area brief list.
   * "area" is `/{lang}/{area}`: that area's own page, with its own H1 and
   * without the overview list, so the two routes are no longer the same page
   * under two URLs.
   */
  initialScope?: "home" | "area";
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
  if (view === "today") return `${base}/${area}`;
  return `${base}/${view}`;
}

export default function Home({ initialLang = "ko", initialView = "today", initialArea = "myeongdong", initialRoute = false, initialScope = "home" }: RetailPulseProps = {}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [view, setView] = useState<View>(initialView);
  const [selected, setSelected] = useState<AreaId>(initialArea);
  const [terminal, setTerminal] = useState<Terminal>("all");
  const [airportSection, setAirportSection] = useState<AirportSection>("now");
  const [industry, setIndustry] = useState<IndustryId>("beauty");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  // null means "whatever today is in KST, as the server reports it" — the
  // client never guesses a date from the device clock.
  const [serviceDate, setServiceDate] = useState<string | null>(null);
  const t = copy[lang];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("retailpulse-preferences");
        if (saved) {
          const value = JSON.parse(saved) as Partial<{ lang: Lang; area: AreaId; terminal: Terminal; industry: IndustryId }>;
          if (!initialRoute && value.lang && ["ko", "en", "zh", "ja"].includes(value.lang)) setLang(value.lang);
          if (!initialRoute && value.area && Object.hasOwn(areaInfo, value.area)) setSelected(value.area);
          if (value.terminal && ["all", "T1", "T2"].includes(value.terminal)) setTerminal(value.terminal);
          if (value.industry && Object.hasOwn(industryProfiles, value.industry)) setIndustry(value.industry);
        }
      } catch {
        // Device-local preferences are optional; the product works without storage.
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
      window.localStorage.setItem("retailpulse-preferences", JSON.stringify({ lang, area: selected, terminal, industry }));
    } catch {
      // Storage is a convenience only.
    }
  }, [lang, selected, terminal, industry, preferencesReady]);

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
      else if (["today", "forecast", "airport", "business", "about", "more"].includes(slug)) setView(slug as View);
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
        <nav className="top-nav" aria-label="Primary">
          {(["today", "airport", "business", "forecast", "about", "more"] as View[]).map((item) => (
            <a key={item} href={routeFor(lang, item, selected)} className={view === item ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate(item); }} aria-current={view === item ? "page" : undefined}>{t[item]}</a>
          ))}
        </nav>
        <div className="header-meta">
          <KstTodayChip lang={lang} date={serviceDate} />
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
        {view === "today" && (
          <>
            <section className="hero" aria-labelledby="hero-title">
              <div className="hero-copy">
                <p className="eyebrow">OFFICIAL DEMAND SIGNALS · SEOUL</p>
                {/* The line break is a real <br>, not a block span: a span per
                    line left the accessible name and crawled text as one run
                    ("How is Seoulmoving right now?"). */}
                <h1 id="hero-title">{initialScope === "area"
                  ? areaHeadline[lang](areaLocalName(selected, lang))
                  : t.hero.split("\n").map((line, index) => <Fragment key={line}>{index > 0 && " "}{index > 0 && <br />}{line}</Fragment>)}</h1>
                <p className="hero-line">{t.sub}</p>
              </div>
            </section>

            {initialScope === "area" && (
              <div className="area-tabs" role="tablist" aria-label={localText(lang, { ko: "지역 선택", en: "Select an area", zh: "选择地区", ja: "エリアを選択" })}>
                {(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => selectArea(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}
              </div>
            )}
            <DateNavigator lang={lang} date={serviceDate} onChange={setServiceDate} />
            <DateScopeNote lang={lang} date={serviceDate} />
            {initialScope === "home" && <HomeTodayBrief lang={lang} selected={selected} onSelect={selectArea} date={serviceDate} />}
            <LiveSignals lang={lang} area={selected} date={serviceDate} />
            {/*
              * The pilot's way in, offered only where it applies. Myeongdong
              * is the one area it covers, so showing it on Hongdae or
              * Seongsu would promise a screen that does not exist for them.
              */}
            {selected === "myeongdong" && <p className="desk-entry">
              <a href={routeFor(lang, "tourism-desk", selected)} onClick={(event) => { event.preventDefault(); navigate("tourism-desk"); }}>
                {localText(lang, { ko: "관광안내 데스크 브리핑 보기 →", en: "Open the tourism desk briefing →", zh: "查看旅游咨询台简报 →", ja: "観光案内デスクのブリーフィングを見る →" })}
              </a>
              <small>{localText(lang, {
                ko: "명동 관광안내 근무자를 위한 시험 운영 화면입니다",
                en: "A pilot screen for Myeongdong tourism-information staff",
                zh: "面向明洞旅游咨询工作人员的试运行页面",
                ja: "明洞の観光案内担当者向けの試験運用画面です",
              })}</small>
            </p>}
            {betaSignupEnabled && <BetaSignup lang={lang} />}
          </>
        )}

        {view === "airport" && (
          <AirportView
            lang={lang}
            terminal={terminal}
            setTerminal={setTerminal}
            section={airportSection}
            setSection={setAirportSection}
            date={serviceDate}
            setDate={setServiceDate}
          />
        )}
        {view === "business" && <BusinessView lang={lang} selected={selected} setSelected={selectArea} industry={industry} setIndustry={setIndustry} date={serviceDate} setDate={setServiceDate} setProOpen={setProOpen} />}
        {view === "forecast" && <InsightsView lang={lang} selected={selected} setSelected={selectArea} date={serviceDate} />}
        {view === "tourism-desk" && <TourismDeskView lang={lang} />}
        {view === "about" && <AboutView lang={lang} onAirport={() => openAirport("now")} onSeoul={() => navigate("today")} />}
        {view === "more" && <MoreView lang={lang} setLang={changeLanguage} selected={selected} terminal={terminal} industry={industry} onAbout={() => navigate("about")} />}

        <footer className="site-footer">
          <p>{t.truth}</p><p>{t.kst}</p>
          <nav className="footer-links" aria-label="KORETAIL sections">
            <a href={`/${lang}`}>HOME</a>
            {(Object.keys(areaInfo) as AreaId[]).map((id) => <a key={id} href={routeFor(lang, "today", id)}>{areaLocalName(id, lang)}</a>)}
            <a href={routeFor(lang, "airport", selected)}>{t.airport}</a>
            <a href={routeFor(lang, "business", selected)}>{t.business}</a>
            <a href={routeFor(lang, "forecast", selected)}>{t.forecast}</a>
            <a href={routeFor(lang, "tourism-desk", selected)}>{localText(lang, { ko: "관광안내 데스크", en: "Tourism desk", zh: "旅游咨询台", ja: "観光案内デスク" })}</a>
            <a href={routeFor(lang, "about", selected)}>{t.about}</a>
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

function AirportView({
  lang, terminal, setTerminal, section, setSection, date, setDate,
}: {
  lang: Lang; terminal: Terminal; setTerminal: (value: Terminal) => void;
  section: AirportSection; setSection: (value: AirportSection) => void;
  date: string | null; setDate: (value: string | null) => void;
}) {
  const [direction, setDirection] = useState<AirportDirection>("departure");
  const [historyPeriod, setHistoryPeriod] = useState<"6m" | "12m" | "all" | "custom">("6m");
  const [historyRangeOpen, setHistoryRangeOpen] = useState(false);
  const [historyStart, setHistoryStart] = useState(airportMonthly.at(-6)!.month);
  const [historyEnd, setHistoryEnd] = useState(airportMonthly.at(-1)!.month);
  const [draftHistoryStart, setDraftHistoryStart] = useState(airportMonthly.at(-6)!.month);
  const [draftHistoryEnd, setDraftHistoryEnd] = useState(airportMonthly.at(-1)!.month);

  const historyRows = historyPeriod === "6m" ? airportMonthly.slice(-6)
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

  const directionLabels = {
    departure: localText(lang, { ko: "출국", en: "DEPARTURES", zh: "出境", ja: "出国" }),
    arrival: localText(lang, { ko: "입국", en: "ARRIVALS", zh: "入境", ja: "入国" }),
    total: localText(lang, { ko: "전체여객", en: "TOTAL", zh: "总旅客", ja: "全旅客" }),
  };

  return (
    <section className="view-section airport-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">INCHEON AIRPORT · OFFICIAL · KST</p>
          <h1>{localText(lang, { ko: "인천공항", en: "Incheon Airport", zh: "仁川机场", ja: "仁川空港" })}</h1>
          <p>{localText(lang, { ko: "공식 예상 출국객, 실제 출발 운항, 현재 출국장 대기를 서로 섞지 않고 따로 보여줍니다.", en: "Official expected departures, physical departing flights and current departure-hall waits—kept separate, never blended.", zh: "分别显示官方预计出境人数、实际出发航班与当前出境区等候，互不混用。", ja: "公式予想出国者・実出発便・現在の出国場待ちを混ぜずに分けて表示します。" })}</p>
        </div>
      </div>

      <div className="terminal-selector" role="tablist" aria-label="Terminal">
        {(["all", "T1", "T2"] as Terminal[]).map((item) => <button key={item} className={terminal === item ? "active" : ""} onClick={() => setTerminal(item)} role="tab" aria-selected={terminal === item}>{item === "all" ? localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全体" }) : item}</button>)}
      </div>

      <nav className="airport-context-nav" aria-label={localText(lang, { ko: "공항 정보 구분", en: "Airport sections", zh: "机场信息分类", ja: "空港情報の分類" })}>
        {(["now", "flights", "stores", "mystore", "history"] as AirportSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)} aria-current={section === item ? "page" : undefined}>
          {item === "now" ? localText(lang, { ko: "지금", en: "NOW", zh: "现在", ja: "現在" })
            : item === "flights" ? localText(lang, { ko: "항공편", en: "FLIGHTS", zh: "航班", ja: "フライト" })
              : item === "stores" ? localText(lang, { ko: "매장·시설", en: "STORES", zh: "店铺·设施", ja: "店舗・施設" })
                : item === "mystore" ? localText(lang, { ko: "내 매장", en: "MY STORE", zh: "我的店铺", ja: "自分の店舗" })
                  : localText(lang, { ko: "과거", en: "HISTORY", zh: "历史", ja: "履歴" })}
        </button>)}
      </nav>

      {section !== "history" && section !== "stores" && section !== "mystore" && <>
        <DateNavigator lang={lang} date={date} onChange={setDate} />
        <DateScopeNote lang={lang} date={date} />
      </>}

      {section === "now" && <AirportTodaySummary lang={lang} terminal={terminal} date={date} />}
      {section === "flights" && <FlightBoard lang={lang} terminal={terminal} date={date} />}
      {section === "stores" && <FacilityDirectory lang={lang} terminal={terminal} />}
      {section === "mystore" && <MyStoreBriefing lang={lang} />}

      {section === "history" && <section className="airport-history" aria-labelledby="airport-history-title">
        <div className="section-head">
          <div><p className="eyebrow">OFFICIAL MONTHLY STATISTICS</p><h2 id="airport-history-title">{localText(lang, { ko: "공식 월별 여객 실적", en: "Official monthly passenger results", zh: "官方月度旅客实绩", ja: "公式月次旅客実績" })}</h2></div>
          <span className="official-label">OFFICIAL HISTORICAL</span>
        </div>
        <p className="section-intro">{localText(lang, {
          ko: "인천국제공항공사가 발표한 월별 실적입니다. 예측이 아니라 이미 확정된 과거 기록이며, 터미널 값은 공식 집계 그대로입니다.",
          en: "Monthly results published by Incheon International Airport Corporation. These are settled past records, not forecasts, and terminal values are the official figures as published.",
          zh: "由仁川国际机场公社发布的月度实绩。这是已确定的过去记录而非预测，航站楼数值为官方口径原值。",
          ja: "仁川国際空港公社が発表した月次実績です。予測ではなく確定した過去の記録で、ターミナル値は公式集計そのままです。",
        })}</p>

        <div className="history-controls">
          <div role="tablist" aria-label={directionLabels.total}>
            {(["departure", "arrival", "total"] as AirportDirection[]).map((item) => <button key={item} className={direction === item ? "active" : ""} onClick={() => setDirection(item)}>{directionLabels[item]}</button>)}
          </div>
          <div role="tablist" aria-label="Period">
            {(["6m", "12m", "all"] as const).map((item) => <button key={item} className={historyPeriod === item ? "active" : ""} onClick={() => { setHistoryPeriod(item); setHistoryRangeOpen(false); }}>{item === "6m" ? localText(lang, { ko: "6개월", en: "6M", zh: "6个月", ja: "6か月" }) : item === "12m" ? localText(lang, { ko: "12개월", en: "12M", zh: "12个月", ja: "12か月" }) : localText(lang, { ko: "전체", en: "ALL", zh: "全部", ja: "全期間" })}</button>)}
            <button className={(historyPeriod === "custom" ? "active " : "") + "range-trigger"} onClick={() => { setDraftHistoryStart(historyStart); setDraftHistoryEnd(historyEnd); setHistoryRangeOpen((open) => !open); }} aria-expanded={historyRangeOpen}>＋ {localText(lang, { ko: "기간 설정", en: "CUSTOM", zh: "自定义", ja: "期間指定" })}</button>
          </div>
        </div>
        {historyRangeOpen && <MonthRangePicker lang={lang} start={draftHistoryStart} end={draftHistoryEnd} min={airportMonthly[0].month} max={airportMonthly.at(-1)!.month} onStart={setDraftHistoryStart} onEnd={setDraftHistoryEnd} onCancel={() => setHistoryRangeOpen(false)} onApply={(nextStart, nextEnd) => { setHistoryStart(nextStart); setHistoryEnd(nextEnd); setHistoryPeriod("custom"); setHistoryRangeOpen(false); }} />}

        <div className="history-kpis">
          <div><span>{localText(lang, { ko: "선택 기간 합계", en: "PERIOD TOTAL", zh: "所选期间合计", ja: "選択期間の合計" })}</span><strong>{formatCount(lang, rangeTotal)}</strong><small>{periodLabel} · {terminal === "all" ? "ALL" : terminal}</small></div>
          <div><span>{localText(lang, { ko: "하루 평균", en: "DAILY AVERAGE", zh: "日均", ja: "1日平均" })}</span><strong>{formatCount(lang, rangeDailyAverage)}</strong><small>{rangeDays}{localText(lang, { ko: "일 기준", en: " days", zh: "天口径", ja: "日基準" })}</small></div>
          <div><span>{localText(lang, { ko: "기간 처음 대비", en: "START-TO-END CHANGE", zh: "期初至期末变化", ja: "期間初比" })}</span><strong>{rangeChange === null ? "—" : `${rangeChange >= 0 ? "+" : ""}${rangeChange.toFixed(1)}%`}</strong><small>{rangeStartRow?.month ?? "—"} → {rangeEndRow?.month ?? "—"}</small></div>
          <div><span>{localText(lang, { ko: "하루평균 최고 월", en: "PEAK MONTH BY DAILY AVG.", zh: "日均峰值月", ja: "日平均ピーク月" })}</span><strong>{peakRow?.month ?? "—"}</strong><small>{peakRow ? formatCount(lang, Math.round(airportValue(peakRow, terminal, direction) / monthDays(peakRow.month))) : "—"}</small></div>
        </div>

        <ol className="history-bars" aria-label={localText(lang, { ko: "월별 여객 추이", en: "Monthly passenger trend", zh: "月度旅客趋势", ja: "月次旅客推移" })}>
          {historyRows.map((row) => {
            const value = airportValue(row, terminal, direction);
            const isPeak = peakRow?.month === row.month;
            return <li key={row.month} className={isPeak ? "peak" : ""}>
              <span>{row.month}</span>
              <i style={{ width: `${Math.max(2, value / historyMax * 100)}%` }} />
              <b>{formatCount(lang, value)}</b>
            </li>;
          })}
        </ol>

        <div className="annual-strip">
          <p className="eyebrow">{localText(lang, { ko: "연간 여객", en: "ANNUAL PASSENGERS", zh: "年度旅客", ja: "年間旅客" })}</p>
          <ol>{airportAnnual.map((row) => <li key={row.year}><span>{row.year}</span><b>{formatCount(lang, row.passengers)}</b></li>)}</ol>
        </div>
      </section>}
    </section>
  );
}

function BusinessView({
  lang, selected, setSelected, industry, setIndustry, date, setDate, setProOpen,
}: {
  lang: Lang; selected: AreaId; setSelected: (id: AreaId) => void;
  industry: IndustryId; setIndustry: (id: IndustryId) => void;
  date: string | null; setDate: (value: string | null) => void;
  setProOpen: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<"briefing" | "history">("briefing");
  const profile = industryProfiles[industry];

  return (
    <section className="view-section business-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">KORETAIL FOR BUSINESS</p>
          <h1>{localText(lang, { ko: "지금 무엇을\n준비하면 좋을까요?", en: "What should you\nprepare right now?", zh: "现在应该\n准备什么？", ja: "いま何を\n準備すればいい？" })}</h1>
          <p>{localText(lang, {
            ko: "공식 신호를 매장 준비 관점으로 다시 읽습니다. 아래 점검 목록은 일반 운영 가이드이며, 숫자를 예측하지 않습니다.",
            en: "The same official signals, read for store preparation. The checklists below are general operating guidance and do not predict any number.",
            zh: "以门店准备的视角重新解读官方信号。下方清单为一般运营指南，不预测任何数值。",
            ja: "同じ公式シグナルを店舗準備の視点で読み直します。以下のチェックリストは一般的な運用ガイドで、数値を予測するものではありません。",
          })}</p>
        </div>
      </div>

      <div className="business-mode" role="tablist">
        <button className={mode === "briefing" ? "active" : ""} onClick={() => setMode("briefing")} role="tab" aria-selected={mode === "briefing"}>{localText(lang, { ko: "지금 브리핑", en: "CURRENT BRIEFING", zh: "当前简报", ja: "現在のブリーフ" })}</button>
        <button className={mode === "history" ? "active" : ""} onClick={() => setMode("history")} role="tab" aria-selected={mode === "history"}>{localText(lang, { ko: "공식 과거 흐름", en: "OFFICIAL HISTORY", zh: "官方历史趋势", ja: "公式の過去推移" })}</button>
      </div>

      {mode === "history" ? <BusinessHistoryView lang={lang} selected={selected} setSelected={setSelected} /> : <>
        <div className="area-tabs" role="tablist">
          {(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}
        </div>
        <DateNavigator lang={lang} date={date} onChange={setDate} />
        {/* The store screen used to repeat the whole Seoul signal page above
            the checklist, pushing the one thing this screen is for about
            3,000px down. It now shows the area's short current brief and
            links to the full area page. */}
        <AreaCurrentBrief
          lang={lang}
          area={selected}
          date={date}
          linkHref={routeFor(lang, "today", selected)}
          linkLabel={localText(lang, { ko: `${areaLocalName(selected, lang)} 전체 신호 보기`, en: `All ${areaLocalName(selected, lang)} signals`, zh: `查看${areaLocalName(selected, lang)}全部信号`, ja: `${areaLocalName(selected, lang)}の全シグナルを見る` })}
        />

        <section className="industry-section" aria-labelledby="industry-title">
          <div className="section-head">
            <div><p className="eyebrow">OPERATING CHECKLIST · {profile.short}</p><h2 id="industry-title">{localText(lang, { ko: "업종별 점검 목록", en: "Checklist by business type", zh: "分业态检查清单", ja: "業種別チェックリスト" })}</h2></div>
          </div>
          <div className="industry-tabs" role="tablist" aria-label={localText(lang, { ko: "업종 선택", en: "Select a business type", zh: "选择业态", ja: "業種を選択" })}>
            {(Object.keys(industryProfiles) as IndustryId[]).map((id) => <button key={id} className={industry === id ? "active" : ""} onClick={() => setIndustry(id)} role="tab" aria-selected={industry === id}>{industryProfiles[id].label[lang]}</button>)}
          </div>
          <p className="industry-watch">
            <span>{localText(lang, { ko: "먼저 볼 신호", en: "READ FIRST", zh: "优先查看", ja: "先に見る指標" })}</span>
            <b>{profile.watch[lang]}</b>
          </p>
          {/* Grouped by when the work happens, so the operator reads only the
              block for the moment they are in rather than scanning one long list. */}
          <div className="checklist-groups">
            {checklistPhaseOrder.map((phase) => {
              const rows = profile.checklist[lang]
                .map((row, index) => ({ row, index }))
                .filter(({ row }) => row[0] === phase);
              if (!rows.length) return null;
              return (
                <section key={phase} className="checklist-phase">
                  <h3>{checklistPhaseLabels[phase][lang]}</h3>
                  <ol className="checklist-rows">
                    {rows.map(({ row: [, label, action], index }) => <li key={`${phase}-${label}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{label}</strong>
                      <p>{action}</p>
                    </li>)}
                  </ol>
                </section>
              );
            })}
          </div>
          <p className="truth-note">{localText(lang, {
            ko: "이 목록은 위의 공식 혼잡 시간대와 함께 보도록 만든 일반 가이드입니다. 매출이나 방문자 수를 예측하지 않습니다.",
            en: "This list is general guidance meant to be read alongside the official busy band above. It does not predict sales or visitor counts.",
            zh: "本清单为一般指南，应与上方官方拥挤时段一起阅读，不预测销售额或访客数。",
            ja: "このリストは上の公式混雑時間帯と併せて読むための一般ガイドです。売上や来訪者数を予測するものではありません。",
          })}</p>
        </section>

        <section className="business-pro">
          <div><p className="eyebrow">KORETAIL · NEXT</p><h2>{localText(lang, { ko: "매일 문 열기 전, 한 장으로", en: "One page before you open", zh: "每天开店前，一页简报", ja: "開店前に、一枚で" })}</h2><p>{localText(lang, { ko: "업종·지역별 알림과 내려받기를 준비하고 있습니다.", en: "Alerts and exports by business type and area are in preparation.", zh: "正在准备按业态与地区的提醒与导出功能。", ja: "業種・エリア別の通知とエクスポートを準備しています。" })}</p></div>
          <button onClick={() => setProOpen(true)}>{localText(lang, { ko: "미리보기 열기", en: "OPEN PREVIEW", zh: "打开预览", ja: "プレビューを開く" })} ↗</button>
        </section>
      </>}
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

  return <section className="business-history">
    <div className="area-tabs" role="tablist">{(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}</div>
    <div className="section-head">
      <div><p className="eyebrow">OFFICIAL HISTORICAL · SEOUL SHORT-STAY FOREIGN POPULATION</p><h2>{localText(lang, { ko: `${area.ko} 외국인 생활인구 흐름`, en: `${area.en} foreign population history`, zh: `${area.zh}外国人生活人口趋势`, ja: `${area.ja}の外国人生活人口推移` })}</h2></div>
      <span className="official-label">OFFICIAL HISTORICAL</span>
    </div>
    <MetricExplainer
      lang={lang}
      what={localText(lang, { ko: "서울시가 집계한 월별·시간당 평균 단기체류 외국인 수입니다.", en: "Seoul's monthly average hourly count of short-stay foreign residents.", zh: "首尔市统计的月度每小时平均短期停留外国人数。", ja: "ソウル市が集計した月別・時間当たり平均の短期滞在外国人数です。" })}
      high={localText(lang, { ko: "그 지역에 머무는 외국인이 평소보다 많았다는 뜻입니다.", en: "More foreign visitors were present in that area than usual.", zh: "表示该地区停留的外国人多于平常。", ja: "その地域に滞在した外国人が普段より多かったことを意味します。" })}
      source={localText(lang, { ko: "서울 열린데이터광장 단기체류 외국인 생활인구 (OA-23018)", en: "Seoul Open Data — short-stay foreign living population (OA-23018)", zh: "首尔开放数据广场 短期停留外国人生活人口 (OA-23018)", ja: "ソウル オープンデータ広場 短期滞在外国人生活人口 (OA-23018)" })}
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
      <div><span>{localText(lang, { ko: "기간 처음 대비", en: "START-TO-END CHANGE", zh: "期初至期末变化", ja: "期間初比" })}</span><strong>{periodChange === null ? "—" : `${periodChange >= 0 ? "+" : ""}${periodChange.toFixed(1)}%`}</strong><small>{startRow?.month ?? "—"} → {endRow?.month ?? "—"}</small></div>
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
        <li><span>{localText(lang, { ko: "중국 국적", en: "Chinese nationality", zh: "中国国籍", ja: "中国籍" })}</span><b>{formatCount(lang, detail.china)} · {detail.chinaShare}%</b></li>
        <li><span>{localText(lang, { ko: "가장 많은 시간대", en: "Highest hour", zh: "人数最多时段", ja: "最も多い時間帯" })}</span><b>{detail.peakHour}</b></li>
      </ol>
    </div>
  </section>;
}

/**
 * Insights.
 *
 * The old screen led with a large fabricated 0–100 index, which told a reader
 * nothing they could act on or check. Every block here is an official figure
 * with a plain-language explanation of what it means and where it came from.
 */
function InsightsView({ lang, selected, setSelected, date }: { lang: Lang; selected: AreaId; setSelected: (id: AreaId) => void; date: string | null }) {
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

  return (
    <section className="view-section insights-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">OFFICIAL RECORDS</p>
          <h1>{localText(lang, { ko: "숫자 하나가\n무슨 뜻인지부터", en: "Start with what\nthe number means", zh: "先弄清一个\n数字的含义", ja: "その数字が\n何を意味するかから" })}</h1>
          <p>{localText(lang, {
            ko: "각 지표마다 무엇을 뜻하는지, 높으면 어떤 상황인지, 어떤 공식 자료에서 왔는지를 함께 적었습니다.",
            en: "Every figure comes with what it means, what a high value indicates, and which official record it came from.",
            zh: "每个指标都附有含义说明、数值偏高时的情况，以及所依据的官方资料。",
            ja: "各指標に、意味・高いときの状況・出典の公式資料を併記しています。",
          })}</p>
        </div>
      </div>

      <section className="insight-block" aria-labelledby="insight-now-title">
        <div className="section-head">
          <div><p className="eyebrow">01 · RIGHT NOW</p><h2 id="insight-now-title">{localText(lang, { ko: "지금 지역 상황", en: "Areas right now", zh: "各地区当前状况", ja: "エリアの現在" })}</h2></div>
        </div>
        <HomeTodayBrief lang={lang} selected={selected} onSelect={setSelected} date={date} />
      </section>

      <section className="insight-block" aria-labelledby="insight-terminal-title">
        <div className="section-head">
          <div><p className="eyebrow">02 · T1 VS T2 · OFFICIAL HISTORICAL</p><h2 id="insight-terminal-title">{localText(lang, { ko: "터미널별 출국객 비중", en: "Departure share by terminal", zh: "各航站楼出境占比", ja: "ターミナル別の出国者比率" })}</h2></div>
          <span className="official-label">OFFICIAL HISTORICAL</span>
        </div>
        <MetricExplainer
          lang={lang}
          what={localText(lang, { ko: "인천공항 전체 출국객 가운데 각 터미널이 차지한 비율입니다.", en: "The share of all Incheon departures handled by each terminal.", zh: "各航站楼在仁川机场全部出境旅客中所占的比例。", ja: "仁川空港の全出国者のうち各ターミナルが占める割合です。" })}
          high={localText(lang, { ko: "그 터미널로 출국 수요가 더 몰렸다는 뜻입니다.", en: "More departure demand was concentrated at that terminal.", zh: "表示出境需求更集中于该航站楼。", ja: "その ターミナルに出国需要がより集中したことを意味します。" })}
          source={localText(lang, { ko: "인천국제공항공사 공식 월별 통계", en: "Incheon International Airport Corporation monthly statistics", zh: "仁川国际机场公社官方月度统计", ja: "仁川国際空港公社 公式月次統計" })}
          why={localText(lang, { ko: "이용할 터미널이 최근 더 붐비는 쪽인지 미리 가늠할 수 있습니다.", en: "It tells you in advance whether your terminal is the busier one lately.", zh: "可提前判断您将使用的航站楼近期是否更为繁忙。", ja: "利用するターミナルが最近混んでいる側かを事前に把握できます。" })}
        />
        <div className="compare-bars">
          <div><span>T1</span><i style={{ width: `${100 - recentT2Share}%` }} /><b>{(100 - recentT2Share).toFixed(1)}%</b></div>
          <div><span>T2</span><i style={{ width: `${recentT2Share}%` }} /><b>{recentT2Share.toFixed(1)}%</b></div>
        </div>
        <ul className="reading-notes">
          <li><span>{localText(lang, { ko: "기준 기간", en: "Period", zh: "统计期间", ja: "対象期間" })}</span><b>{recentMonths}</b></li>
          <li><span>{localText(lang, { ko: "직전 3개월", en: "Previous three months", zh: "此前3个月", ja: "直前3か月" })}</span><b>{priorMonths} · T2 {priorT2Share.toFixed(1)}%</b></li>
          <li><span>{localText(lang, { ko: "T2 변화", en: "T2 change", zh: "T2变化", ja: "T2の変化" })}</span><b>{shareDelta >= 0 ? "+" : ""}{shareDelta.toFixed(1)}%p</b></li>
        </ul>
      </section>

      <section className="insight-block" aria-labelledby="insight-foreign-title">
        <div className="section-head">
          <div><p className="eyebrow">03 · AREA · OFFICIAL HISTORICAL</p><h2 id="insight-foreign-title">{localText(lang, { ko: "지역 외국인 생활인구", en: "Foreign living population by area", zh: "各地区外国人生活人口", ja: "エリア別の外国人生活人口" })}</h2></div>
          <span className="official-label">OFFICIAL HISTORICAL</span>
        </div>
        <div className="area-tabs" role="tablist">
          {(Object.keys(areaInfo) as AreaId[]).map((id) => <button key={id} className={selected === id ? "active" : ""} onClick={() => setSelected(id)} role="tab" aria-selected={selected === id}>{areaLocalName(id, lang)}</button>)}
        </div>
        <MetricExplainer
          lang={lang}
          what={localText(lang, { ko: "해당 지역에 머문 단기체류 외국인의 시간당 평균 인원입니다.", en: "The average hourly number of short-stay foreign visitors present in the area.", zh: "该地区停留的短期外国访客的每小时平均人数。", ja: "その地域に滞在した短期滞在外国人の時間当たり平均人数です。" })}
          high={localText(lang, { ko: "평소보다 많은 외국인이 그 지역에 머물렀다는 뜻입니다.", en: "More foreign visitors than usual were present in that area.", zh: "表示该地区停留的外国人多于平常。", ja: "普段より多くの外国人がその地域に滞在したことを意味します。" })}
          source={localText(lang, { ko: "서울 열린데이터광장 (OA-23018) · 매월 지연 공개", en: "Seoul Open Data (OA-23018) · published monthly with a delay", zh: "首尔开放数据广场 (OA-23018) · 每月延迟发布", ja: "ソウル オープンデータ広場 (OA-23018) · 毎月遅れて公開" })}
          why={localText(lang, { ko: "실시간 값이 아니라 이미 확정된 기록이므로, 계절과 추세를 비교하는 기준으로 삼을 수 있습니다.", en: "It is a settled record rather than a live value, so it works as a baseline for seasonal comparison.", zh: "它是已确定的记录而非实时值，可作为季节性比较的基准。", ja: "リアルタイム値ではなく確定した記録のため、季節や傾向を比較する基準になります。" })}
        />
        <div className="stat-rows">
          <div><span>{localText(lang, { ko: "최신 월", en: "Latest month", zh: "最新月份", ja: "最新月" })}</span><b>{foreignRecent.month}</b><i>{formatCount(lang, foreignRecent[selected])}</i></div>
          <div><span>{localText(lang, { ko: "전월 대비", en: "Vs. previous month", zh: "环比", ja: "前月比" })}</span><b>{foreignChange === null ? "—" : `${foreignChange >= 0 ? "+" : ""}${foreignChange.toFixed(1)}%`}</b><i>{foreignPrior.month} → {foreignRecent.month}</i></div>
          <div><span>{localText(lang, { ko: "최근 12개월 평균 대비", en: "Vs. 12-month average", zh: "较近12个月平均", ja: "直近12か月平均比" })}</span><b>{vsAverage === null ? "—" : `${vsAverage >= 0 ? "+" : ""}${vsAverage.toFixed(1)}%`}</b><i>{formatCount(lang, twelveAverage)}</i></div>
          <div><span>{localText(lang, { ko: "12개월 최고 / 최저", en: "12-month high / low", zh: "12个月最高／最低", ja: "12か月の最高／最低" })}</span><b>{maxRow.month} / {minRow.month}</b><i>{formatCount(lang, twelveMax)} / {formatCount(lang, twelveMin)}</i></div>
        </div>
      </section>

      <section className="insight-block" aria-labelledby="insight-accuracy-title">
        <div className="section-head">
          <div><p className="eyebrow">04 · TRACK RECORD</p><h2 id="insight-accuracy-title">{localText(lang, { ko: "예측 성적표는 아직 없습니다", en: "There is no accuracy record yet", zh: "目前还没有预测成绩", ja: "予測の成績はまだありません" })}</h2></div>
        </div>
        <p className="section-intro">{localText(lang, {
          ko: "KORETAIL은 아직 자체 예측을 발표하지 않습니다. 지금 화면에 보이는 예측은 모두 서울시와 인천공항이 직접 발표한 공식 예측이며, 그 기관들의 정확도를 저희가 채점하지는 않습니다.",
          en: "KORETAIL does not publish its own forecast yet. Every forecast on screen is published directly by Seoul or Incheon Airport, and we do not grade those institutions' accuracy.",
          zh: "KORETAIL 目前尚未发布自有预测。屏幕上的预测均由首尔市与仁川机场直接发布，我们不对这些机构的准确率进行评分。",
          ja: "KORETAIL はまだ自前の予測を発表していません。画面上の予測はすべてソウル市と仁川空港が直接発表した公式予測で、その精度を当方が採点することはありません。",
        })}</p>
        <p className="section-intro">{localText(lang, {
          ko: "언젠가 자체 예측을 내놓게 되면, 결과가 나오기 전에 저장해 둔 예측만으로 성적을 계산합니다. 과거 데이터를 나중에 끼워 맞춰 정확도를 만들어내지 않습니다.",
          en: "If we ever publish our own forecast, the record will be built only from predictions saved before the outcome existed. We will not manufacture accuracy by fitting past data after the fact.",
          zh: "若将来发布自有预测，成绩只会基于结果出现前已保存的预测计算，不会事后用历史数据拼凑准确率。",
          ja: "将来自前の予測を出す場合も、結果が判明する前に保存した予測だけで成績を算出します。後から過去データを当てはめて精度を作ることはしません。",
        })}</p>
      </section>
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
        ko: "서울의 대표 쇼핑 지역과 인천공항이 지금 어떻게 움직이고 있는지를, 공식 기관이 발표한 데이터만 모아 한 화면에서 보여주는 서비스입니다. 저희가 값을 추정하거나 만들어내지 않습니다.",
        en: "KORETAIL gathers official data about Seoul's main shopping areas and Incheon Airport into one screen, so you can see how they are moving right now. We do not estimate or invent any value ourselves.",
        zh: "KORETAIL 将首尔主要购物区与仁川机场的官方数据汇总到一个页面，让您了解当前的实际情况。我们不自行推算或编造任何数值。",
        ja: "KORETAIL は、ソウルの主要ショッピングエリアと仁川空港の公式データだけを一画面に集め、いまどう動いているかを示すサービスです。数値を自ら推定したり作り出したりはしません。",
      }),
    },
    {
      eyebrow: "02 · WHO",
      title: localText(lang, { ko: "누구를 위한 서비스인가요?", en: "Who is it for?", zh: "面向哪些人？", ja: "誰のためのサービス？" }),
      body: localText(lang, {
        ko: "서울을 방문해 어디를 언제 갈지 정하려는 분, 인천공항 출국 흐름을 미리 확인하려는 분, 그리고 명동·홍대·성수에서 매장을 운영하며 오늘의 준비를 결정해야 하는 분을 위해 만들었습니다.",
        en: "For visitors deciding where and when to go in Seoul, for travellers checking Incheon's departure flow before they leave, and for people running a shop in Myeongdong, Hongdae or Seongsu who need to decide today's preparation.",
        zh: "适合正在决定首尔行程的访客、出发前想确认仁川出境情况的旅客，以及在明洞、弘大、圣水经营门店、需要决定当日准备的经营者。",
        ja: "ソウルでどこへいつ行くか決めたい方、出発前に仁川の出国状況を確認したい方、そして明洞・弘大・聖水で店舗を運営し当日の準備を決める方のために作りました。",
      }),
    },
    {
      eyebrow: "03 · SEOUL",
      title: localText(lang, { ko: "서울에서는 무엇을 보나요?", en: "What do you see for Seoul?", zh: "在首尔能看到什么？", ja: "ソウルでは何が見られる？" }),
      body: localText(lang, {
        ko: "명동·홍대·성수 각각에 대해 지금 얼마나 붐비는지(현재 인원 범위 포함), 서울시 공식 예측 기준으로 앞으로 가장 붐빌 시간, 날씨에 따른 준비사항, 그리고 인근에 진행 중인 행사를 봅니다.",
        en: "For Myeongdong, Hongdae and Seongsu: how busy each is right now including the current headcount range, the busiest hour ahead according to Seoul's own official forecast, what the weather means for your plans, and any events running nearby.",
        zh: "针对明洞、弘大、圣水：当前的拥挤程度（含现时人数区间）、依据首尔市官方预测的接下来最拥挤时段、天气带来的准备建议，以及附近正在举行的活动。",
        ja: "明洞・弘大・聖水それぞれについて、現在の混雑度（現時点の人数レンジを含む）、ソウル市公式予測によるこれから最も混雑する時間、天気に応じた準備、周辺で開催中のイベントを表示します。",
      }),
    },
    {
      eyebrow: "04 · AIRPORT",
      title: localText(lang, { ko: "공항에서는 무엇을 보나요?", en: "What do you see for the airport?", zh: "在机场能看到什么？", ja: "空港では何が見られる？" }),
      body: localText(lang, {
        ko: "인천공항의 공식 예상 출국객과 피크 시간, 실제 출발 운항 편수와 게이트 집중 순위, 그리고 현재 출국장별 대기시간과 대기인원을 봅니다. 전체·T1·T2를 따로 볼 수 있습니다.",
        en: "Incheon's official expected departures and peak hour, the number of physical departing flights with the busiest gates, and the current wait time and queue size at each departure checkpoint. All terminals, T1 and T2 can be viewed separately.",
        zh: "仁川机场的官方预计出境人数与高峰时段、实际出发航班数与登机口集中排名，以及各出境检查点当前的等候时间与等候人数。可分别查看全部、T1 与 T2。",
        ja: "仁川空港の公式予想出国者数とピーク時間、実際の出発便数とゲート集中ランキング、各出国場の現在の待ち時間と待機人数を表示します。全体・T1・T2 を分けて確認できます。",
      }),
    },
    {
      eyebrow: "05 · DATA",
      title: localText(lang, { ko: "어떤 데이터를 쓰나요?", en: "Which data do you use?", zh: "使用哪些数据？", ja: "どのデータを使う？" }),
      body: localText(lang, {
        ko: "서울시 실시간 도시데이터, 서울시 단기체류 외국인 생활인구, 서울시 상권분석 추정매출, 기상청 단기예보, 한국관광공사 TourAPI, 인천국제공항공사의 운항·출국장 혼잡도·승객 예고 자료를 사용합니다. 모두 공개된 공식 자료입니다.",
        en: "Seoul real-time city data, Seoul's short-stay foreign living population, Seoul's commercial-district sales estimates, KMA short-term weather forecasts, KTO TourAPI events, and Incheon Airport's flight, departure-hall congestion and passenger forecast datasets. All are public official sources.",
        zh: "首尔实时城市数据、首尔短期停留外国人生活人口、首尔商圈分析推算销售额、气象厅短期预报、韩国观光公社 TourAPI 活动，以及仁川机场的航班、出境区拥挤度与旅客预告数据。全部为公开的官方资料。",
        ja: "ソウルリアルタイム都市データ、ソウル短期滞在外国人生活人口、ソウル商圏分析の推定売上、気象庁短期予報、韓国観光公社 TourAPI、仁川空港の運航・出国場混雑度・旅客予告データを使用します。すべて公開された公式資料です。",
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
        ko: "여기 숫자는 매출이나 방문자 수가 아닙니다. 공항의 전체 승객 수는 외국인 수가 아니고, 게이트에 편수가 몰린다고 출국장이 붐빈다는 뜻도 아닙니다. 원본 기관의 발표가 늦어지면 저희 화면도 함께 늦어지며, 그때는 값을 지어내는 대신 '확인 불가'로 표시합니다.",
        en: "These numbers are not sales or visitor counts. Total airport passengers are not foreign visitors, and flights concentrating at a gate does not mean the departure hall is crowded. When a source publishes late, this screen is late too — and in that case we show \"unavailable\" instead of inventing a value.",
        zh: "这些数字并非销售额或访客数。机场总旅客数不等于外国人数，航班集中于某登机口也不代表出境区拥挤。若来源机构发布延迟，本页面也会延迟，此时我们会显示「暂无法确认」而不是编造数值。",
        ja: "ここの数値は売上や来訪者数ではありません。空港の総旅客数は外国人数ではなく、ゲートに便が集中しても出国場が混雑しているという意味ではありません。提供元の発表が遅れれば本画面も遅れ、その際は値を作らず「確認不可」と表示します。",
      }),
    },
  ];

  return (
    <section className="view-section about-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">ABOUT KORETAIL</p>
          <h1>{localText(lang, { ko: "공식 데이터만,\n있는 그대로", en: "Official data only,\nexactly as published", zh: "只用官方数据，\n如实呈现", ja: "公式データだけを、\nありのままに" })}</h1>
          <p>{localText(lang, { ko: "KORETAIL은 Korea와 Retail을 합친 이름입니다.", en: "KORETAIL combines Korea and Retail.", zh: "KORETAIL 由 Korea 与 Retail 组合而成。", ja: "KORETAIL は Korea と Retail を組み合わせた名前です。" })}</p>
        </div>
      </div>

      <div className="about-sections">
        {sections.map((section) => <section key={section.eyebrow} className="about-section">
          <p className="eyebrow">{section.eyebrow}</p>
          <h2>{section.title}</h2>
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
  lang, setLang, selected, terminal, industry, onAbout,
}: {
  lang: Lang; setLang: (value: Lang) => void; selected: AreaId; terminal: Terminal; industry: IndustryId; onAbout: () => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  return (
    <section className="view-section more-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">SETTINGS &amp; SOURCES</p>
          <h1>{localText(lang, { ko: "설정과 데이터 출처", en: "Settings and sources", zh: "设置与数据来源", ja: "設定とデータ出典" })}</h1>
        </div>
      </div>

      <section className="preference-block" aria-labelledby="preference-title">
        <div className="section-head"><div><p className="eyebrow">SAVED ON THIS DEVICE</p><h2 id="preference-title">{localText(lang, { ko: "저장된 설정", en: "Saved preferences", zh: "已保存的设置", ja: "保存された設定" })}</h2></div></div>
        <ul className="preference-rows">
          <li><span>{localText(lang, { ko: "언어", en: "Language", zh: "语言", ja: "言語" })}</span><b>{lang === "ko" ? "한국어" : lang === "en" ? "English" : lang === "zh" ? "简体中文" : "日本語"}</b></li>
          <li><span>{localText(lang, { ko: "지역", en: "Area", zh: "地区", ja: "エリア" })}</span><b>{areaLocalName(selected, lang)}</b></li>
          <li><span>{localText(lang, { ko: "터미널", en: "Terminal", zh: "航站楼", ja: "ターミナル" })}</span><b>{terminal === "all" ? localText(lang, { ko: "전체", en: "All", zh: "全部", ja: "全体" }) : terminal}</b></li>
          <li><span>{localText(lang, { ko: "업종", en: "Business type", zh: "业态", ja: "業種" })}</span><b>{industryProfiles[industry].label[lang]}</b></li>
        </ul>
        <div className="language-choices" role="group" aria-label="Language">
          {(["ko", "en", "zh", "ja"] as Lang[]).map((item) => <button key={item} className={lang === item ? "active" : ""} onClick={() => setLang(item)}>{item === "ko" ? "한국어" : item === "en" ? "English" : item === "zh" ? "简体中文" : "日本語"}</button>)}
        </div>
        <p className="truth-note">{localText(lang, { ko: "설정은 이 기기에만 저장되며 서버로 보내지 않습니다.", en: "Preferences are stored on this device only and are never sent to a server.", zh: "设置仅保存在本设备，不会发送至服务器。", ja: "設定はこの端末にのみ保存され、サーバーには送信されません。" })}</p>
      </section>

      <section className="about-link-block">
        <div><p className="eyebrow">ABOUT</p><h2>{localText(lang, { ko: "KORETAIL이 처음이신가요?", en: "New to KORETAIL?", zh: "第一次使用 KORETAIL？", ja: "KORETAIL は初めてですか？" })}</h2><p>{localText(lang, { ko: "무엇을 보여주는 서비스인지, 어떤 데이터를 쓰는지 소개 페이지에 정리했습니다.", en: "The About page explains what this service shows and which data it uses.", zh: "关于页面介绍了本服务展示的内容与所用数据。", ja: "紹介ページで、何を表示するサービスかと使用データを説明しています。" })}</p></div>
        <button onClick={onAbout}>{localText(lang, { ko: "소개 보기", en: "READ ABOUT", zh: "查看介绍", ja: "紹介を見る" })} ↗</button>
      </section>

      <section className="source-block" aria-labelledby="source-title">
        <div className="section-head"><div><p className="eyebrow">DATA SOURCES</p><h2 id="source-title">{localText(lang, { ko: "사용 중인 공식 자료", en: "Official sources in use", zh: "使用中的官方资料", ja: "利用中の公式資料" })}</h2></div>
          <button className="source-toggle" onClick={() => setSourcesOpen((open) => !open)} aria-expanded={sourcesOpen}>{sourcesOpen ? localText(lang, { ko: "접기", en: "COLLAPSE", zh: "收起", ja: "閉じる" }) : localText(lang, { ko: "전체 보기", en: "SHOW ALL", zh: "查看全部", ja: "すべて見る" })}</button>
        </div>
        <ol className="source-rows">
          {(sourcesOpen ? sourceCatalog : sourceCatalog.slice(0, 6)).map((row, index) => <li key={row.source}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{row.source}</strong><small>{row.provider}</small></div>
            <p>{lang === "ko" || lang === "ja" ? row.use.ko : lang === "zh" ? row.use.zh : row.use.en}</p>
          </li>)}
        </ol>
      </section>
    </section>
  );
}

function ProModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pro-title" onClick={onClose}>
    <div className="modal" onClick={(event) => event.stopPropagation()}>
      <p className="eyebrow">KORETAIL · NEXT</p>
      <h2 id="pro-title">{localText(lang, { ko: "준비 중인 기능", en: "In preparation", zh: "正在准备的功能", ja: "準備中の機能" })}</h2>
      <ul>
        <li>{localText(lang, { ko: "지역·터미널별 혼잡 알림", en: "Congestion alerts by area and terminal", zh: "按地区与航站楼的拥挤提醒", ja: "エリア・ターミナル別の混雑通知" })}</li>
        <li>{localText(lang, { ko: "공식 과거 기록 내려받기", en: "Official history export", zh: "官方历史记录导出", ja: "公式の過去記録のエクスポート" })}</li>
        <li>{localText(lang, { ko: "업종별 아침 브리핑", en: "Morning briefing by business type", zh: "分业态晨间简报", ja: "業種別の朝ブリーフ" })}</li>
      </ul>
      <p>{localText(lang, { ko: "일정은 아직 확정되지 않았습니다.", en: "No date is fixed yet.", zh: "时间尚未确定。", ja: "時期は未定です。" })}</p>
      <button onClick={onClose}>{localText(lang, { ko: "닫기", en: "CLOSE", zh: "关闭", ja: "閉じる" })}</button>
    </div>
  </div>;
}
