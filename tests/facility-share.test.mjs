import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildFacilityCopyText, COPY_DISCLAIMER } from "../lib/facility-share.ts";

const LANGS = ["ko", "en", "zh", "ja"];

const labels = {
  location: "공식 위치", hours: "공식 영업시간 기준", brands: "취급 품목·브랜드",
  phone: "전화", unknown: "확인 불가",
};

/** The card the owner photographed, as the provider actually publishes it. */
const shilla = {
  name: "[신라면세점] SK-II(플래그십)",
  facilityItem: "화장품",
  terminalLabel: "제2여객터미널",
  floor: "F3",
  areaLabel: "면세구역",
  sideLabel: "출국장",
  locationRaw: "제2여객터미널 3층 면세지역 252번 게이트 부근",
  businessHoursRaw: "06:30 ~ 21:30",
  goodsBrands: "화장품/향수",
  phone: "032-000-0000",
};

test("the copied text carries the official facts a reader needs", () => {
  const text = buildFacilityCopyText(shilla, "ko", labels);
  for (const fragment of [
    "[신라면세점] SK-II(플래그십)", "화장품",
    "제2여객터미널 · F3 · 면세구역 · 출국장",
    "공식 위치: 제2여객터미널 3층 면세지역 252번 게이트 부근",
    "공식 영업시간 기준: 06:30 ~ 21:30",
    "취급 품목·브랜드: 화장품/향수", "전화: 032-000-0000",
  ]) assert.ok(text.includes(fragment), `${fragment} must be copied`);
});

test("both caveats and the source travel inside the copied text, in every language", () => {
  // Copying is the moment a fact leaves the screen that framed it. Pasted into
  // a message, the reader has no page telling them what they are looking at.
  for (const lang of LANGS) {
    const text = buildFacilityCopyText(shilla, lang, labels);
    assert.ok(text.includes(COPY_DISCLAIMER[lang].basis), `${lang}: published-hours basis must travel`);
    assert.ok(text.includes(COPY_DISCLAIMER[lang].staleness), `${lang}: the freshness caveat must travel`);
    assert.ok(text.includes(COPY_DISCLAIMER[lang].source), `${lang}: the source must travel`);
    assert.ok(text.includes("15095064"), `${lang}: the dataset id must travel`);
  }
});

test("a missing field is omitted, never invented — but hours always state their basis", () => {
  const sparse = buildFacilityCopyText({ name: "무인 보관함" }, "ko", labels);
  assert.ok(sparse.includes("무인 보관함"));
  assert.equal(sparse.includes("전화:"), false, "no phone means no phone line");
  assert.equal(sparse.includes("취급 품목"), false);
  assert.equal(sparse.includes("공식 위치:"), false);
  // Hours are the one field that always appears: a copied card with no hours
  // line at all could be read as "open whenever".
  assert.ok(sparse.includes("공식 영업시간 기준: 확인 불가"));
  assert.ok(sparse.includes(COPY_DISCLAIMER.ko.staleness));
});

test("the same facility always copies to the same text", () => {
  assert.equal(buildFacilityCopyText(shilla, "ko", labels), buildFacilityCopyText(shilla, "ko", labels));
});

test("the freshness caveat is shown on screen too, in all four languages", async () => {
  const signals = await readFile(new URL("../app/live-signals.tsx", import.meta.url), "utf8");
  for (const lang of LANGS) {
    assert.ok(signals.includes(COPY_DISCLAIMER[lang].staleness), `${lang} caveat must be on screen`);
  }
  // Both surfaces that show a facility show it: the directory and My Store.
  assert.equal((signals.match(/className="facility-staleness"/g) ?? []).length, 2,
    "the directory and the selected-store header must both carry it");
});

test("a copy that fails says so instead of pretending it worked", async () => {
  const signals = await readFile(new URL("../app/live-signals.tsx", import.meta.url), "utf8");
  assert.match(signals, /catch \{\s*setState\("failed"\);/);
  assert.match(signals, /state === "failed" \? facilityText\.copyFailed\[lang\]/);
  // Screen-reader users get the outcome too, not just sighted ones.
  assert.match(signals, /role="status" aria-live="polite"/);
});
