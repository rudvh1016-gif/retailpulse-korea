import { test, expect, type Page } from "@playwright/test";

/**
 * The airport east/west block on the live business screen, clicked through
 * the way an airport store would use it. Read-only: the only storage touched
 * is this browser's own localStorage. Key texts are printed so the run log is
 * the record; screenshots go to the run's artifacts.
 */
const log = (label: string, value: unknown) => console.log(`LIVE ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

async function openAirport(page: Page, width: number) {
  await page.setViewportSize({ width, height: width < 500 ? 860 : 1000 });
  await page.goto("/ko/business");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator(".business-view .area-tabs").getByRole("tab", { name: "인천공항" }).click();
  const prep = page.getByTestId("business-prep");
  await expect(prep.getByTestId("airport-sides")).toBeVisible();
  return prep;
}

async function setConditions(page: Page, prep: ReturnType<Page["getByTestId"]>, terminal: "T1" | "T2", side: "동편" | "서편" | "터미널 전체", hours: [string, string] | null) {
  await prep.getByRole("button", { name: "조건 바꾸기" }).click();
  await prep.locator(".prep-terminal").first().getByLabel(terminal).check();
  await prep.getByTestId("prep-side").getByLabel(side).check();
  const whole = prep.getByLabel("영업시간 없이 하루 전체 보기");
  if (hours) {
    if (await whole.isChecked()) await whole.uncheck();
    const selects = prep.locator(".prep-hours select");
    await selects.nth(0).selectOption(hours[0]);
    await selects.nth(1).selectOption(hours[1]);
  } else if (!(await whole.isChecked())) await whole.check();
  await prep.getByRole("button", { name: "저장", exact: true }).click();
}

for (const width of [1280, 360]) {
  test(`live airport east/west block, clicked through at ${width}px`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const prep = await openAirport(page, width);
    const sides = prep.getByTestId("airport-sides");
    const states: Record<string, string> = {};
    log(`${width} notice`, await sides.getByTestId("sides-notice").textContent());
    log(`${width} halls`, (await sides.getByTestId("halls-withheld").count()) ? "WITHHELD" : await sides.getByTestId("halls-sides").textContent());

    for (const terminal of ["T1", "T2"] as const) {
      for (const side of ["터미널 전체", "동편", "서편"] as const) {
        await setConditions(page, prep, terminal, side, side === "동편" ? ["09:30", "18:00"] : null);
        await expect(prep.getByTestId("prep-place")).toContainText(`인천공항 ${terminal}`);
        // The comparison card is always present once the block is. Its state is
        // the API's own answer: OK when the day has flight records, otherwise a
        // designed empty state (for example just after midnight KST, before the
        // day's first collection). Both are asserted; neither is skipped.
        const card = sides.getByTestId("flight-split");
        await expect(card).toBeVisible();
        const state = await card.getAttribute("data-state");
        states[terminal] = String(state);
        log(`${width} ${terminal} ${side} split state`, `${state} | ${(await card.innerText()).replace(/\s+/g, " ")}`);
        if (state === "OK") {
          await expect(card.getByTestId("split-flights")).toContainText("동편");
          await expect(card.getByTestId("split-shares")).toContainText("동·서 위치가 확인된 항공편 기준");
          if (await card.getByTestId("split-estimate").count()) await expect(card.getByTestId("split-note")).toContainText("실제 동·서편 승객 수가 아닙니다");
          else await expect(card.getByTestId("split-no-estimate")).toBeVisible();
        } else {
          expect(["NONE", "STALE", "DATE_MISMATCH", "NO_TERMINAL_FLIGHTS"]).toContain(state);
          await expect(card.getByTestId("split-estimate")).toHaveCount(0);
          await expect(card.getByTestId("split-flights")).toHaveCount(0);
          await expect(prep.getByTestId("prep-facts")).not.toContainText("출발편(하루 전체)");
        }
        const gates = sides.getByTestId("gates-areas");
        log(`${width} ${terminal} ${side} place`, await prep.getByTestId("prep-place").textContent());
        if (await gates.count()) {
          log(`${width} ${terminal} ${side} areas`, await gates.textContent());
          log(`${width} ${terminal} ${side} sides`, await sides.getByTestId("gates-sides").textContent());
        } else log(`${width} ${terminal} ${side} gates`, await sides.getByTestId("gates-unavailable").textContent());
        const gateFact = prep.getByTestId("prep-facts").locator("li", { hasText: "탑승구" });
        log(`${width} ${terminal} ${side} gate fact`, (await gateFact.count()) ? await gateFact.first().textContent() : "NONE");
        const gateAction = prep.getByTestId("prep-actions").locator('li[data-rule="GATE_PEAK"]');
        log(`${width} ${terminal} ${side} gate action`, (await gateAction.count()) ? await gateAction.locator(".prep-action-title").textContent() : "NONE");
      }
    }
    await page.screenshot({ path: `production-visual-results/airport-sides-${width}.png`, fullPage: false });
    await sides.screenshot({ path: `production-visual-results/airport-sides-block-${width}.png` });

    const share = prep.getByTestId("prep-share");
    await share.getByRole("button", { name: "문구 복사" }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    log(`${width} share`, text);
    expect(text).toContain("인천공항 T2 서편");
    // The copied text carries the comparison exactly when the card shows it.
    if (states.T2 === "OK") expect(text).toContain("출발편(하루 전체)");
    else expect(text).not.toContain("출발편(하루 전체)");
    const download = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
    await share.getByRole("button", { name: "이미지 저장" }).click();
    const file = await download;
    log(`${width} png`, file ? file.suggestedFilename() : "NO_DOWNLOAD");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    log(`${width} page errors`, errors);
    expect(errors).toEqual([]);
  });
}
