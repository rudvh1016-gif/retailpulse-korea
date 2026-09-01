import assert from "node:assert/strict";
import test from "node:test";

import {
  checklistPhaseLabels,
  checklistPhaseOrder,
  industryProfiles,
} from "../lib/industry-guidance.ts";

const LANGS = ["ko", "en", "zh", "ja"];
const ids = Object.keys(industryProfiles);

test("every business type carries the same guidance in all four languages", () => {
  assert.equal(ids.length, 6);
  for (const id of ids) {
    const profile = industryProfiles[id];
    for (const lang of LANGS) {
      assert.ok(profile.label[lang]?.trim(), `${id}.label.${lang} is empty`);
      assert.ok(profile.watch[lang]?.trim(), `${id}.watch.${lang} is empty`);
      assert.ok(profile.checklist[lang], `${id}.checklist.${lang} is missing`);
    }
    // A language must not silently ship a shorter list than the others: a
    // reader switching language would see the screen lose rows.
    const counts = new Set(LANGS.map((lang) => profile.checklist[lang].length));
    assert.equal(counts.size, 1, `${id} has different row counts per language: ${[...counts]}`);
    const phaseSequences = new Set(LANGS.map((lang) => profile.checklist[lang].map((row) => row[0]).join(",")));
    assert.equal(phaseSequences.size, 1, `${id} has different phase order per language`);
  }
});

test("every phase renders with at least one row so no column comes up empty", () => {
  // The section lays the three phases out as three columns. A phase with no
  // rows would render as a heading over blank space, which is the emptiness
  // this layout exists to remove.
  for (const id of ids) {
    for (const lang of LANGS) {
      for (const phase of checklistPhaseOrder) {
        const rows = industryProfiles[id].checklist[lang].filter((row) => row[0] === phase);
        assert.ok(rows.length > 0, `${id}/${lang} has no rows for phase ${phase}`);
        for (const [, label, action] of rows) {
          assert.ok(label.trim(), `${id}/${lang}/${phase} has an empty label`);
          assert.ok(action.trim().length > 8, `${id}/${lang}/${phase} action is too thin: ${action}`);
        }
      }
    }
  }
});

test("phase labels exist in every language and every used phase is a known one", () => {
  for (const phase of checklistPhaseOrder) {
    for (const lang of LANGS) {
      assert.ok(checklistPhaseLabels[phase][lang]?.trim(), `phase label ${phase}.${lang} is empty`);
    }
  }
  const known = new Set(checklistPhaseOrder);
  for (const id of ids) {
    for (const lang of LANGS) {
      for (const [phase] of industryProfiles[id].checklist[lang]) {
        assert.ok(known.has(phase), `${id}/${lang} uses unknown phase ${phase}`);
      }
    }
  }
});

test("no localized string carries characters from an unrelated script", () => {
  // A stray Cyrillic run shipped inside the Japanese luggage line and survived
  // because nothing read that string again. Scripts that belong to none of the
  // four supported languages are always a copy-paste accident.
  const foreignScript = /[Ѐ-ӿ԰-֏֐-׿؀-ۿ฀-๿]/;
  const walk = (value, path) => {
    if (typeof value === "string") {
      assert.ok(!foreignScript.test(value), `${path} contains characters from an unrelated script: ${value}`);
      return;
    }
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (value && typeof value === "object") {
      return Object.entries(value).forEach(([key, item]) => walk(item, `${path}.${key}`));
    }
  };
  walk(industryProfiles, "industryProfiles");
  walk(checklistPhaseLabels, "checklistPhaseLabels");
});

test("operating guidance never states a figure the product would have to predict", () => {
  // The whole product refuses to publish a number no official body published.
  // Guidance copy is the easiest place for an invented "expect 30% more" to
  // slip in, so any digit in this content has to be justified deliberately.
  for (const id of ids) {
    for (const lang of LANGS) {
      const strings = [industryProfiles[id].watch[lang], ...industryProfiles[id].checklist[lang].flatMap((row) => row.slice(1))];
      for (const value of strings) {
        assert.ok(!/[0-9]/.test(value), `${id}/${lang} guidance contains a figure: ${value}`);
      }
    }
  }
});
