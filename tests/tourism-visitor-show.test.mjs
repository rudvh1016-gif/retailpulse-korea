import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import React, { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TourismVisitorShow } from "../app/tourism-visitor-show.tsx";

const content = {
  officialEventTitleKo: "서울 공식 봄 행사",
  officialEventPeriod: "2026-09-01–2026-09-07",
  officialEventAddressKo: "서울특별시 중구 공식로 1",
  officialEventUrl: "https://example.go.kr/event/1",
  officialEventSource: "공식 행사 제공기관",
  deterministicWeatherNote: {
    ko: "비 가능성이 있어 우산을 챙기세요.",
    en: "Bring an umbrella because rain is possible.",
    zh: "可能下雨，请携带雨伞。",
    ja: "雨の可能性があるため、傘をお持ちください。",
  },
};

function render(initialLanguage = "ko", nextContent = content) {
  return renderToStaticMarkup(React.createElement(TourismVisitorShow, {
    open: false,
    content: nextContent,
    triggerRef: createRef(),
    onRequestClose: () => {},
    initialLanguage,
  }));
}

test("visitor show is one labelled native dialog with four real language controls", () => {
  const html = render();
  assert.match(html, /^<dialog /);
  assert.match(html, /aria-labelledby="[^"]+-visitor-show-title"/);
  assert.match(html, /aria-describedby="[^"]+-visitor-show-description"/);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 4);
  assert.match(html, /lang="ko" aria-pressed="true"/);
  for (const label of ["한국어", "English", "中文", "日本語"]) assert.ok(html.includes(label));
});

test("foreign-language mode keeps official Korean proper names unchanged", () => {
  const html = render("en");
  assert.match(html, /^<dialog [^>]*lang="en"/);
  assert.match(html, /An official foreign-language name has not been verified/);
  assert.match(html, /<dd lang="ko">서울 공식 봄 행사<\/dd>/);
  assert.match(html, /<dd lang="ko">서울특별시 중구 공식로 1<\/dd>/);
  assert.ok(html.includes(content.deterministicWeatherNote.en));
  assert.ok(!html.includes(content.deterministicWeatherNote.ko), "weather guidance must not fall back to another language");
});

test("the rendered surface contains only safe hand-across-the-desk fields", () => {
  const html = render("en");
  for (const expected of [
    content.officialEventTitleKo,
    content.officialEventPeriod,
    content.officialEventAddressKo,
    content.officialEventSource,
    content.deterministicWeatherNote.en,
  ]) assert.ok(html.includes(expected));

  assert.doesNotMatch(html, /population|ridership|debug|tourist count|currently open|open now/i);
  assert.doesNotMatch(html, /생활인구|승하차|관광객 수|운영 중/);
});

test("every language says the official period does not prove actual operation or opening hours", () => {
  const caveats = {
    ko: "공식 행사기간만으로 실제 운영 여부나 운영시간을 확인할 수 없습니다. 공식 안내를 확인하세요.",
    en: "The official event period does not confirm actual operation or opening hours. Check the official notice.",
    zh: "官方活动期间并不能确认实际是否开放或开放时间。请查看官方公告。",
    ja: "公式イベント期間だけでは、実際の開催状況や開催時間は確認できません。公式案内をご確認ください。",
  };
  for (const [language, caveat] of Object.entries(caveats)) {
    assert.ok(render(language).includes(caveat), `${language}: operation caveat must remain visible`);
  }
});

test("only absolute HTTP(S) official links are exposed", () => {
  assert.match(render(), /href="https:\/\/example\.go\.kr\/event\/1"/);
  const unsafe = render("ko", { ...content, officialEventUrl: "javascript:alert(1)" });
  assert.doesNotMatch(unsafe, /javascript:|href=/);
});

test("dialog lifecycle uses showModal, Escape/cancel and trigger focus restoration without changing the site URL", async () => {
  const source = await readFile(new URL("../app/tourism-visitor-show.tsx", import.meta.url), "utf8");
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /onCancel=/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /dialog\.close\(\)/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  assert.match(source, /onClose=/);
  assert.match(source, /const language = selectedLanguage \?\? initialLanguage/);
  assert.match(source, /onClose=\{\(\) => \{\s*setSelectedLanguage\(null\)/);
  assert.doesNotMatch(source, /window\.location|history\.(?:push|replace)State|router\.(?:push|replace)/);
});

test("the component API cannot receive statistical or inferred-operating fields", async () => {
  const source = await readFile(new URL("../app/tourism-visitor-show.tsx", import.meta.url), "utf8");
  const interfaceBody = /interface TourismVisitorShowContent \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
  assert.match(interfaceBody, /officialEventTitleKo/);
  assert.match(interfaceBody, /officialEventPeriod/);
  assert.match(interfaceBody, /officialEventAddressKo/);
  assert.match(interfaceBody, /officialEventUrl/);
  assert.match(interfaceBody, /officialEventSource/);
  assert.match(interfaceBody, /deterministicWeatherNote/);
  assert.doesNotMatch(interfaceBody, /population|ridership|crowding|visitorCount|touristCount|openNow|running|debug/i);
});
