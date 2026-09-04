import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  detectInstallPlatform,
  installGuide,
  orderedSections,
} from "../lib/install-guide.ts";

const LANGS = ["ko", "en", "zh", "ja"];
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("every locale gets a complete guide, with nothing left blank", () => {
  for (const lang of LANGS) {
    const guide = installGuide(lang);
    for (const field of ["buttonLabel", "title", "intro", "promptLabel", "promptNote",
      "installedTitle", "installedBody", "questionsTitle", "closeLabel", "doneTitle", "doneBody"]) {
      assert.ok(guide[field] && guide[field].trim().length > 0, `${lang}.${field} must say something`);
    }
    assert.ok(guide.benefits.length >= 3, `${lang} must say why installing is worth it`);
    assert.ok(guide.questions.length >= 3, `${lang} must answer where readers get stuck`);
    assert.deepEqual(
      guide.sections.map((section) => section.key),
      ["android-chrome", "android-samsung", "ios-safari", "desktop"],
      `${lang} must cover both Galaxy browsers, the iPhone and the desktop`,
    );
    for (const section of guide.sections) {
      assert.ok(section.heading.trim().length > 0);
      assert.ok(section.steps.length >= 3, `${lang}/${section.key} needs real steps, not a summary`);
      for (const step of section.steps) {
        assert.ok(step.action.trim().length > 0, `${lang}/${section.key} has a step with no action`);
        assert.ok(step.detail === null || step.detail.trim().length > 0,
          "a detail is either written or omitted, never an empty string");
      }
    }
  }
});

/**
 * The honesty line this feature could most easily cross.
 *
 * "앱처럼 설치" is a home-screen web app, not a Play Store or App Store
 * download. A reader who expects a store listing and lands in a browser
 * menu has been misled, so every locale must say what this is up front.
 */
test("the guide says plainly that this is a web app, not a store download", () => {
  for (const [lang, marker] of [
    ["ko", /플레이스토어|앱스토어/],
    ["en", /Play Store|App Store/],
    ["zh", /应用商店/],
    ["ja", /ストア/],
  ]) {
    assert.match(installGuide(lang).intro, marker,
      `${lang} must name the store it is NOT, so nobody goes looking for one`);
  }
});

/**
 * The label a reader actually sees depends on their browser version, so the
 * guide names both rather than one that will be wrong for half of them.
 */
test("Android steps offer both menu labels, because Chrome shows one or the other", () => {
  const chrome = installGuide("ko").sections.find((section) => section.key === "android-chrome");
  const text = chrome.steps.map((step) => `${step.action} ${step.detail ?? ""}`).join(" ");
  assert.match(text, /앱 설치/);
  assert.match(text, /홈 화면에 추가/);
});

test("the iPhone steps insist on Safari and point at the share button", () => {
  const ios = installGuide("ko").sections.find((section) => section.key === "ios-safari");
  const text = ios.steps.map((step) => `${step.action} ${step.detail ?? ""}`).join(" ");
  assert.match(text, /사파리/);
  assert.match(text, /공유/);
  assert.match(text, /홈 화면에 추가/);
  assert.match(ios.note ?? "", /사파리/,
    "iPhone readers who use Chrome must be told this one step needs Safari");
  // The in-app browser trap: a link opened inside a messenger cannot install.
  assert.match(text, /카카오톡|인스타그램/);
});

test("a platform is read from the user agent, and an unknown one falls back to desktop", () => {
  assert.equal(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari"), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Linux; Android 14; SM-S928N) Chrome"), "android");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome"), "desktop");
  assert.equal(detectInstallPlatform(""), "desktop");
});

/**
 * Detection may be wrong — an old user agent, a rewritten one, a reader
 * installing for someone else's phone. It may therefore reorder, never
 * hide: every section survives whatever platform is guessed.
 */
test("detection only reorders the sections; it never removes one", () => {
  const guide = installGuide("ko");
  for (const platform of ["ios", "android", "desktop"]) {
    const ordered = orderedSections(guide, platform);
    assert.equal(ordered.length, guide.sections.length, "no reader loses the steps that would have worked");
    assert.deepEqual(
      [...ordered].map((section) => section.key).sort(),
      [...guide.sections].map((section) => section.key).sort(),
    );
    assert.equal(ordered[0].platform, platform, "the reader's own device is listed first");
  }
});

/**
 * Installability, not just instructions.
 *
 * Android will only build a real app (a WebAPK, with an app-drawer entry)
 * when the manifest offers a raster icon of at least 192px; with an SVG
 * alone it degrades to a browser shortcut. A `maskable` icon is what stops
 * the launcher letterboxing the mark inside a white square.
 */
test("the manifest offers the raster and maskable icons an install actually needs", async () => {
  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.name && manifest.start_url && manifest.scope);
  const png = manifest.icons.filter((icon) => icon.type === "image/png");
  assert.ok(png.some((icon) => icon.sizes === "192x192"), "Android needs a 192px raster icon");
  assert.ok(png.some((icon) => icon.sizes === "512x512"), "a 512px icon is needed for the splash screen");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"),
    "without a maskable icon the launcher crops or letterboxes the mark");
});

test("the icon files exist and really are the sizes the manifest claims", async () => {
  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  const claimed = manifest.icons.filter((icon) => icon.type === "image/png")
    .map((icon) => [icon.src, icon.sizes]);
  claimed.push(["/apple-touch-icon.png", "180x180"]);
  for (const [src, sizes] of claimed) {
    const bytes = await readFile(new URL(`../public${src}`, import.meta.url));
    // PNG header: 8-byte signature, then the IHDR length/type, then w/h.
    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `${src} must be a real PNG`);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(`${width}x${height}`, sizes, `${src} is not the size it is declared as`);
  }
});

test("iOS is given its own icon and a standalone app title", async () => {
  const layout = await read("../app/layout.tsx");
  assert.match(layout, /apple: \[\{ url: "\/apple-touch-icon\.png"/,
    "iOS ignores manifest icons when adding to the home screen");
  assert.match(layout, /appleWebApp: \{ capable: true, title: "KORETAIL"/);
});

/**
 * The offline promise nobody made.
 *
 * KORETAIL has no service worker, so an installed home-screen app still
 * needs the network — and every figure on screen is live official data
 * anyway. The guide says so. If a service worker is ever added, this test
 * fails and forces the guide to be corrected at the same time.
 */
test("the guide's offline answer matches the fact that there is no service worker", async () => {
  for (const path of ["../app/install-app.tsx", "../app/layout.tsx", "../app/retailpulse-app.tsx"]) {
    assert.doesNotMatch(await read(path), /serviceWorker\.register/,
      "adding a service worker changes the offline answer this guide gives");
  }
  for (const [lang, marker] of [
    ["ko", /인터넷 연결이 필요/],
    ["en", /internet connection is needed/],
    ["zh", /需要联网/],
    ["ja", /インターネット接続が必要/],
  ]) {
    const answers = installGuide(lang).questions.map((item) => item.answer).join(" ");
    assert.match(answers, marker, `${lang} must not imply the app works offline`);
  }
});

/** No login, no payment, no ads — said in the guide because it is asked. */
test("the guide promises nothing the product does not do", () => {
  for (const [lang, marker] of [
    ["ko", /가입.*결제|결제.*가입/],
    ["en", /no sign-up, no payment/],
    ["zh", /注册、付费/],
    ["ja", /登録・支払い/],
  ]) {
    const answers = installGuide(lang).questions.map((item) => item.answer).join(" ");
    assert.match(answers, marker, `${lang} must answer the cost question outright`);
  }
});

test("the button sits beside the date chip in the header, on every screen size", async () => {
  const app = await read("../app/retailpulse-app.tsx");
  const css = await read("../app/globals.css");
  assert.match(app, /<KstTodayChip lang=\{lang\} date=\{serviceDate\} \/>\s*\n\s*<InstallAppButton lang=\{lang\} \/>/,
    "the owner asked for it next to the date");
  assert.match(css, /\.install-app-button \{/);
  // The date chip is hidden below 820px; the install button must not be,
  // because a phone is where installing matters.
  const narrow = css.slice(css.indexOf("@media (max-width: 820px)"));
  assert.doesNotMatch(narrow, /\.install-app-button \{[^}]*display: none/);
});
