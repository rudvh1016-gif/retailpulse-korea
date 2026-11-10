"use client";

import { useId, useRef, type KeyboardEvent } from 'react';
import type { Lang, Terminal } from './retailpulse-data';
import { localText } from './local-text';

type Scope = Terminal | 'CONCOURSE';
const scopes: Scope[] = ['all', 'T1', 'T2', 'CONCOURSE'];

/** The owner-approved terminal rail. URL and data state remain owned by the shell. */
export function AirportTerminalSelector({ lang, terminal, concourse, setTerminal, setConcourse }: {
  lang: Lang;
  terminal: Terminal;
  concourse: boolean;
  setTerminal: (terminal: Terminal) => void;
  setConcourse: (concourse: boolean) => void;
}) {
  const descriptionId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected: Scope = concourse ? 'CONCOURSE' : terminal;
  const allLabel = localText(lang, { ko: '전체', en: 'ALL', zh: '全部', ja: '全体' });
  const concourseLabel = localText(lang, { ko: '탑승동', en: 'Concourse', zh: '登机楼', ja: '搭乗棟' });
  const descriptions = {
    all: 'T1 · T2',
    T1: localText(lang, { ko: '제1터미널', en: 'Terminal 1', zh: '1号航站楼', ja: '第1ターミナル' }),
    T2: localText(lang, { ko: '제2터미널', en: 'Terminal 2', zh: '2号航站楼', ja: '第2ターミナル' }),
    CONCOURSE: localText(lang, { ko: 'Concourse', en: 'Boarding gates', zh: '登机区域', ja: '搭乗エリア' }),
  };

  function select(scope: Scope) {
    if (scope === selected) return;
    if (scope === 'CONCOURSE') setConcourse(true);
    else setTerminal(scope);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = event.key === 'ArrowRight' ? (index + 1) % scopes.length
      : event.key === 'ArrowLeft' ? (index + scopes.length - 1) % scopes.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? scopes.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    buttons.current[target]?.focus();
    select(scopes[target]);
  }

  return <>
    <p className="airport-menu-label" id="airport-terminal-label">{localText(lang, {
      ko: '터미널', en: 'Terminal', zh: '航站楼', ja: 'ターミナル',
    })}</p>
    <div id="airport-data-flow" className="terminal-selector terminal-choice-rail" role="tablist" aria-labelledby="airport-terminal-label" lang={lang}>
      {scopes.map((scope, index) => {
        const active = selected === scope;
        const label = scope === 'all' ? allLabel : scope === 'CONCOURSE' ? concourseLabel : scope;
        return <button key={scope} type="button" className={active ? 'active' : ''}
          ref={node => { buttons.current[index] = node; }}
          role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
          aria-label={scope === 'all' ? `${allLabel} T1·T2` : label}
          aria-describedby={`${descriptionId}-${scope}`}
          onClick={() => select(scope)} onKeyDown={event => navigate(event, index)}>
          <span className="terminal-choice-title">{label}{active && <svg className="terminal-choice-check" aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="m2 6 2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>
          <small className="terminal-choice-description" id={`${descriptionId}-${scope}`}>{descriptions[scope]}</small>
        </button>;
      })}
    </div>
  </>;
}
