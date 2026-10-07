'use client';

import { useEffect, useState } from 'react';
import type { Lang } from './retailpulse-data';
import type { PrepArea, PrepPlace } from '../lib/business-prep';
import type { UsualComparison } from '../lib/usual-comparison';
import { LAST_CHECK_KEY, diffSnapshots, findPrevious, parseLedger, withSnapshot, type CheckSnapshot } from '../lib/last-check';
import { changeLine, compareCopy, lastCheckHeadline, usualDetail, usualHeadline } from '../lib/compare-copy';
import { prepCopy } from '../lib/business-prep-copy';
import styles from './compact-disclosure.module.css';

// One request per area per five minutes, shared by every mount; a failed
// request is remembered for a minute so a broken endpoint is not hammered.
const usualCache = new Map<string, { value: UsualComparison | null; until: number }>();
const usualPending = new Map<string, Promise<UsualComparison | null>>();

function loadUsual(area: PrepArea): Promise<UsualComparison | null> {
  const cached = usualCache.get(area);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.value);
  let pending = usualPending.get(area);
  if (!pending) {
    pending = fetch(`/api/live/usual?area=${area}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
      .then(async (response) => (response.ok ? await response.json() as UsualComparison : null))
      .then((value) => (value && value.area === area && typeof value.basis === 'string' ? value : null))
      .catch(() => null)
      .then((value) => {
        usualCache.set(area, { value, until: Date.now() + (value ? 300_000 : 60_000) });
        usualPending.delete(area);
        return value;
      });
    usualPending.set(area, pending);
  }
  return pending;
}

export function useUsualComparison(area: PrepArea | null): UsualComparison | null | undefined {
  const [state, setState] = useState<{ area: PrepArea | null; value: UsualComparison | null | undefined }>({ area, value: undefined });
  useEffect(() => {
    if (!area) return;
    let active = true;
    void loadUsual(area).then((value) => { if (active) setState({ area, value }); });
    return () => { active = false; };
  }, [area]);
  return state.area === area ? state.value : undefined;
}

export function UsualComparisonBlock({ lang, place, today }: { lang: Lang; place: PrepPlace; today: boolean }) {
  const area = place.kind === 'area' && today ? place.area : null;
  const result = useUsualComparison(area);
  if (place.kind === 'airport') return null;
  let body;
  if (!today) body = <p className="prep-note">{compareCopy.noCurrent[lang]}</p>;
  else if (result === undefined) body = <p className="prep-note" role="status">{prepCopy.loading[lang]}</p>;
  else if (result === null) body = <p className="prep-note">{compareCopy.unavailable[lang]}</p>;
  else body = <>
    <p className="prep-compare-headline" data-testid="usual-headline" data-basis={result.basis} data-verdict={result.verdict ?? ''}>{usualHeadline(result, lang)}</p>
    {result.basis !== 'NO_CURRENT' && <details className="prep-evidence"><summary>{prepCopy.evidence[lang]}</summary>
      <ul className="prep-compare-detail">{usualDetail(result, lang).map((line, index) => <li key={index}>{line}</li>)}</ul>
    </details>}
  </>;
  if (!today || !result || result.basis === 'NO_CURRENT' || result.basis === 'COLLECTING') {
    const status = !today ? compareCopy.noData[lang] : result === null ? compareCopy.loadFailed[lang]
      : result === undefined ? prepCopy.loading[lang] : compareCopy.noData[lang];
    return <details className={`prep-evidence prep-compare ${styles.disclosure}`} data-testid="usual-comparison">
      <summary>{compareCopy.usualTitle[lang]} · {status}<span className={styles.toggle} aria-hidden="true" /></summary>
      {body}
    </details>;
  }
  return <div className="prep-block prep-compare" data-testid="usual-comparison">
    <h3>{compareCopy.usualTitle[lang]}</h3>
    {body}
  </div>;
}

function readLedger(): CheckSnapshot[] | null {
  try { return parseLedger(window.localStorage.getItem(LAST_CHECK_KEY)); } catch { return null; }
}

function writeLedger(ledger: CheckSnapshot[]) {
  try { window.localStorage.setItem(LAST_CHECK_KEY, JSON.stringify(ledger)); } catch { /* storage is a convenience only */ }
}

/**
 * Reads the previous snapshot for these conditions once, then keeps this
 * visit's snapshot current (on a new value, and every ten minutes while
 * open). When storage is blocked it reports that nothing can be compared.
 */
function useLastCheck(snapshot: CheckSnapshot | null) {
  const identity = snapshot ? `${snapshot.place}|${snapshot.date}|${snapshot.hours}` : null;
  const fingerprint = snapshot ? JSON.stringify(snapshot.signature) : null;
  const bucket = snapshot ? Math.floor(Date.parse(snapshot.checkedAt) / 600_000) : null;
  const [state, setState] = useState<{ identity: string; previous: CheckSnapshot | null; available: boolean } | null>(null);
  useEffect(() => {
    if (!snapshot || !identity) return;
    const timer = window.setTimeout(() => {
      const ledger = readLedger();
      setState((current) => {
        if (current?.identity === identity) return current;
        return { identity, previous: ledger ? findPrevious(ledger, snapshot) : null, available: ledger !== null };
      });
      if (ledger) writeLedger(withSnapshot(ledger, snapshot));
    }, 0);
    return () => window.clearTimeout(timer);
    // The snapshot object changes identity every render; its meaning is the three keys below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, fingerprint, bucket]);
  return state?.identity === identity ? state : null;
}

export function LastCheckBlock({ lang, snapshot, serviceDate, nowIso }: { lang: Lang; snapshot: CheckSnapshot | null; serviceDate: string; nowIso: string }) {
  const state = useLastCheck(snapshot);
  if (!snapshot || !state || !state.available) return null;
  const previous = state.previous;
  const changes = previous ? diffSnapshots(previous, snapshot, nowIso) : [];
  const body = !previous
      ? <p className="prep-note" data-testid="last-check-first">{compareCopy.first[lang]}</p>
      : <>
        <p className="prep-compare-headline" data-testid="last-check-headline">{lastCheckHeadline(changes, previous.checkedAt, serviceDate, lang)}</p>
        {changes.length > 0 && <ul className="prep-facts" data-testid="last-check-changes">{changes.map((change, index) => <li key={index}>{changeLine(change, serviceDate, lang)}</li>)}</ul>}
      </>;
  const deviceNote = <p className="prep-note">{compareCopy.deviceOnly[lang]}</p>;
  if (!changes.length) return <details className={`prep-evidence prep-last-check ${styles.disclosure}`} data-testid="last-check">
    <summary>{compareCopy.lastTitle[lang]}<span className={styles.toggle} aria-hidden="true" /></summary>
    {body}
    {deviceNote}
  </details>;
  return <div className="prep-block prep-last-check" data-testid="last-check">
    <h3>{compareCopy.lastTitle[lang]}</h3>
    {body}
    <details className={`prep-evidence ${styles.disclosure}`}><summary>{prepCopy.evidence[lang]}<span className={styles.toggle} aria-hidden="true" /></summary>{deviceNote}</details>
  </div>;
}
