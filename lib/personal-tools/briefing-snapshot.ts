import {shiftWindow, type ShiftBriefing} from '../shift-briefing';
import type {BriefingSnapshot, ShiftPattern} from './model';

/** Capture only the briefing fields displayed by the local preview. Never
 * retain raw API bodies, infer absent counts, or refresh a historical snapshot. */
export function captureBriefingSnapshot(briefing: ShiftBriefing, pattern: ShiftPattern, capturedAt: string): BriefingSnapshot {
  const clock=Date.parse(capturedAt), window=shiftWindow(briefing.day,pattern);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(capturedAt) || !Number.isFinite(clock)
    || briefing.scope.terminal!==pattern.terminal || briefing.scope.side!==pattern.side
    || !window || !briefing.window || window.startAt!==briefing.window.startAt || window.endAt!==briefing.window.endAt) {
    throw new Error('PERSONAL_SNAPSHOT_SELECTION_MISMATCH');
  }
  const current=briefing.current;
  return {capturedAt,day:briefing.day,terminal:pattern.terminal,side:pattern.side,open:pattern.open,close:pattern.close,
    status:current.status,reason:current.reason,total:current.total,confirmed:current.confirmed,
    retrievedAt:current.retrievedAt,checkedAt:current.checkedAt,basis:current.basis,provisional:current.provisional,
    topDestinations:current.destinations?current.destinations.countries.slice(0,6).map(row=>({...row})):null};
}
