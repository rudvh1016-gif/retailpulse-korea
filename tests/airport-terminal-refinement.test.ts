import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
register(new URL('./helpers/static-css-loader.mjs', import.meta.url));
const { AirportView } = await import('../app/airport-view');

for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
  for (const scope of ['all', 'T1', 'T2', 'CONCOURSE'] as const) {
    test(`terminal ${scope} exposes one selected choice and localized descriptions in ${lang}`, () => {
      const markup = renderToStaticMarkup(createElement(AirportView, {
        lang, terminal: scope === 'CONCOURSE' ? 'T1' : scope, concourse: scope === 'CONCOURSE',
        section: 'history', date: null, industry: null,
        setTerminal() {}, setConcourse() {}, setSection() {}, setDate() {}, setIndustry() {},
      }));
      const rail = markup.split('id="airport-data-flow"')[1]?.split('</div>')[0] ?? '';
      assert.equal((rail.match(/class="terminal-choice-description"/g) ?? []).length, 4,
        'All four choices must expose their building scope instead of unexplained abbreviations');
      assert.equal((rail.match(/aria-selected="true"/g) ?? []).length, 1);
      assert.equal((rail.match(/tabindex="0"/g) ?? []).length, 1);
      assert.equal((rail.match(/aria-describedby=/g) ?? []).length, 4);
      assert.equal((rail.match(/class="terminal-choice-check"/g) ?? []).length, 1,
        'The selected choice needs a non-color selection mark');
      assert.match(rail, /aria-label="T1"/);
      assert.match(rail, /aria-label="T2"/);
      if (lang !== 'ko') assert.doesNotMatch(rail, /[가-힣]/);
      const buttons = rail.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
      const activeIndex = ['all', 'T1', 'T2', 'CONCOURSE'].indexOf(scope);
      assert.match(buttons[activeIndex], /aria-selected="true"/);
      assert.match(buttons[activeIndex], /terminal-choice-check/);
    });
  }
}
