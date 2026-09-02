# Locale Font Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every public locale one explicit primary UI typeface and limit rendered UI text to supported 400/600 weights.

**Architecture:** `app/globals.css` owns one `--font-ui` variable and two semantic weight variables. KO/EN inherit Pretendard; `.app.lang-ja` and `.app.lang-zh` override the primary family with their bundled Noto face. Static and browser tests pin the font policy without changing page structure or data behavior.

**Tech Stack:** CSS custom properties, React locale root classes, Node test runner, Playwright, self-hosted WOFF2 assets.

## Global Constraints

- Keep content, localization, layout, spacing, colors, responsive behavior, D1, Edge Cache, five Crons, source health, Demand Index, and A5 arrival/departure behavior unchanged.
- Add no font file, remote font request, package dependency, provider call, paid service, or runtime LLM.
- Preserve `pretendard-variable.woff2`, Noto Sans JP 400/600, and Noto Sans SC 400/600 as bounded local assets.
- Public UI weights must resolve to exactly `400` or `600`; `@font-face` descriptors retain their real numeric ranges.
- Keep the preserved `feat/workers-edge-cache` residual files out of this branch.

---

### Task 1: Pin the locale-aware two-weight policy

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: locale root classes emitted as `.app.lang-ko`, `.app.lang-en`, `.app.lang-zh`, and `.app.lang-ja`.
- Produces: `--font-ui`, `--weight-regular`, and `--weight-strong` CSS variables used by every public component.

- [ ] **Step 1: Write the failing static regression test**

Extend the existing font-asset test in `tests/rendered-html.test.mjs` with a separate test:

```js
test("uses one locale-aware font family and only supported UI weights", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /--font-ui:\s*"Pretendard Variable"/);
  assert.match(css, /\.app\.lang-ja\s*{[^}]*--font-ui:\s*"Noto Sans JP Variable"/s);
  assert.match(css, /\.app\.lang-zh\s*{[^}]*--font-ui:\s*"Noto Sans SC Variable"/s);
  assert.match(css, /--weight-regular:\s*400/);
  assert.match(css, /--weight-strong:\s*600/);

  const uiCss = css.replace(/@font-face\s*{[^}]*}/gs, "");
  const declarations = [...uiCss.matchAll(/font-weight:\s*([^;]+);/g)]
    .map((match) => match[1].trim());
  assert.ok(declarations.length > 20, "the guard must inspect the real UI stylesheet");
  assert.deepEqual(
    [...new Set(declarations)].sort(),
    ["var(--weight-regular)", "var(--weight-strong)"],
  );
});
```

- [ ] **Step 2: Run the static test and verify the current CSS fails**

Run:

```bash
node --test tests/rendered-html.test.mjs
```

Expected: FAIL because `--font-ui`, locale overrides, and the two-weight declarations do not exist.

- [ ] **Step 3: Add the semantic font variables and locale overrides**

In the main `:root` block of `app/globals.css`, add:

```css
--font-ui: "Pretendard Variable", "Pretendard", system-ui, sans-serif;
--weight-regular: 400;
--weight-strong: 600;
```

Make `body` and `.app` use `font-family: var(--font-ui)`. Add explicit locale overrides beside `.app`:

```css
.app.lang-ja { --font-ui: "Noto Sans JP Variable", system-ui, sans-serif; }
.app.lang-zh { --font-ui: "Noto Sans SC Variable", system-ui, sans-serif; }
```

Keep KO and EN on the default Pretendard stack. Do not alter the five `@font-face` blocks.

- [ ] **Step 4: Normalize UI weight declarations**

Outside `@font-face`, replace every numeric `font-weight` declaration according to this exact rule:

```text
420, 450, 500, 550 -> var(--weight-regular)
600, 620, 650, 700, 750, 760, 780, 800, 850 -> var(--weight-strong)
```

This preserves hierarchy as regular versus emphasized while removing synthesized intermediate weights. Do not change font sizes, line heights, letter spacing, colors, borders, or layout declarations.

- [ ] **Step 5: Run the static suite**

Run:

```bash
node --test tests/rendered-html.test.mjs
```

Expected: all rendered HTML tests PASS.

- [ ] **Step 6: Commit the policy and static guard**

```bash
git add app/globals.css tests/rendered-html.test.mjs
git commit -m "fix: unify locale font families and weights"
```

---

### Task 2: Prove the policy in a real browser

**Files:**
- Modify: `e2e/production.spec.ts`

**Interfaces:**
- Consumes: `--font-ui`, `--weight-regular`, `--weight-strong`, and the four locale root classes from Task 1.
- Produces: browser-level proof of actual computed family and weight behavior.

- [ ] **Step 1: Replace the old load-only font test with locale policy checks**

Replace `project-local Korean, Japanese and Chinese fonts load` with:

```ts
const localeFonts = [
  ["ko", "Pretendard Variable"],
  ["en", "Pretendard Variable"],
  ["zh", "Noto Sans SC Variable"],
  ["ja", "Noto Sans JP Variable"],
] as const;

for (const [locale, primaryFamily] of localeFonts) {
  test(`${locale} uses its primary UI font with supported weights`, async ({ page }) => {
    await page.goto(`/${locale}/business`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    await page.evaluate(async () => document.fonts.ready);

    const family = await page.locator(".app").evaluate((element) =>
      getComputedStyle(element).fontFamily,
    );
    expect(family.split(",")[0]).toContain(primaryFamily);

    const weights = await page.locator("body *").evaluateAll((elements) =>
      [...new Set(elements
        .filter((element) => element.childElementCount === 0 && element.textContent?.trim())
        .map((element) => getComputedStyle(element).fontWeight))]
        .sort(),
    );
    expect(weights).toEqual(["400", "600"]);
  });
}
```

- [ ] **Step 2: Add a checklist-specific hierarchy assertion**

Add:

```ts
test("business checklist uses one regular and one strong weight", async ({ page }) => {
  await page.goto("/ko/business");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(".industry-tabs button").first()).toHaveCSS("font-weight", "600");
  await expect(page.locator(".checklist-rows p").first()).toHaveCSS("font-weight", "400");
  await expect(page.locator(".checklist-rows strong").first()).toHaveCSS("font-weight", "600");
});
```

- [ ] **Step 3: Run the focused browser tests**

Run:

```bash
npx playwright test e2e/production.spec.ts --grep "primary UI font|business checklist"
```

Expected: five tests PASS, covering KO, EN, ZH, JA, and the checklist hierarchy.

- [ ] **Step 4: Commit the browser guard**

```bash
git add e2e/production.spec.ts
git commit -m "test: verify locale typography in browser"
```

---

### Task 3: Full regression and delivery readiness

**Files:**
- Verify: `app/globals.css`
- Verify: `tests/rendered-html.test.mjs`
- Verify: `e2e/production.spec.ts`
- Verify: `docs/superpowers/specs/2026-09-02-locale-font-consistency-design.md`

**Interfaces:**
- Consumes: completed CSS and regression tests from Tasks 1–2.
- Produces: a clean, reviewable branch ready for push and a focused PR.

- [ ] **Step 1: Run non-browser checks**

```bash
npm run typecheck
npm run lint
npm run secret:scan
npm test
```

Expected: every command exits 0; the full Node suite reports zero failures.

- [ ] **Step 2: Run the full Playwright suite**

```bash
npx playwright test
```

Expected: all browser tests PASS at the existing desktop and mobile coverage.

- [ ] **Step 3: Inspect the final diff and branch state**

```bash
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted files, and only the design, CSS, and typography test commits.

- [ ] **Step 4: Push and complete the focused delivery sequence**

Push `fix/locale-font-consistency` without force, open one focused PR, wait for green CI, merge normally, deploy merged `main`, run Production Site Smoke, and verify KO/EN/JA/ZH computed font families and `400`/`600` weights on Production. Phase 2 begins only after this Production gate passes.
