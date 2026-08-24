"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Locale = "ko" | "en" | "zh" | "ja";

export default function NotFound() {
  const [locale, setLocale] = useState<Locale>("ko");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = window.location.pathname.split("/")[1];
      const nextLocale = ["ko", "en", "zh", "ja"].includes(value) ? value as Locale : "ko";
      setLocale(nextLocale);
      document.documentElement.lang = { ko: "ko", en: "en", zh: "zh-CN", ja: "ja" }[nextLocale];
      document.title = {
        ko: "페이지를 찾을 수 없습니다 | RetailPulse Seoul",
        en: "Page not found | RetailPulse Seoul",
        zh: "找不到页面 | RetailPulse Seoul",
        ja: "ページが見つかりません | RetailPulse Seoul",
      }[nextLocale];
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const title = { ko: "길을 찾지 못했습니다.", en: "Page not found.", zh: "找不到该页面。", ja: "ページが見つかりません。" }[locale];
  const description = { ko: "요청한 페이지는 없거나 주소가 바뀌었습니다. 아래에서 다시 시작해 주세요.", en: "The page is missing or its address changed. Start again below.", zh: "该页面不存在或地址已更改，请从下方重新开始。", ja: "ページが存在しないか、URLが変更されました。下のリンクから再開してください。" }[locale];
  const areas = { ko: ["명동", "홍대", "성수"], en: ["Myeongdong", "Hongdae", "Seongsu"], zh: ["明洞", "弘大", "圣水"], ja: ["明洞", "弘大", "聖水"] }[locale];
  return <main className="not-found">
    <p className="eyebrow">404 · RETAILPULSE SEOUL</p>
    <h1>{title}</h1>
    <p>{description}</p>
    <nav aria-label="Recommended pages">
      <Link href={`/${locale}`}>HOME</Link><Link href={`/${locale}/myeongdong`}>{areas[0]}</Link><Link href={`/${locale}/hongdae`}>{areas[1]}</Link><Link href={`/${locale}/seongsu`}>{areas[2]}</Link><Link href={`/${locale}/airport`}>AIRPORT</Link>
    </nav>
  </main>;
}
