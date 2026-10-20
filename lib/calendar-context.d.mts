export type CalendarScope = 'national' | 'regional' | 'local' | 'institutional';
export type CalendarKind = 'public_holiday' | 'school_break';
export interface CalendarEvent {
  id: string;
  country: string;
  region?: string;
  scope: CalendarScope;
  name: string;
  kind: CalendarKind;
  start: string;
  end: string;
  status: 'verified' | 'expired' | 'unverified' | 'superseded';
  sourceURL: string;
  verifiedAt: string;
  observedAt?: string;
  reviewValidUntil?: string;
}
export interface CalendarQuery {
  country: string;
  selectedMonth: string;
  actualDataMonths: readonly string[];
  asOf: string;
  includePreviousMonth?: boolean;
  includeOriginContext?: boolean;
  region?: string;
  kind?: CalendarKind;
}
export interface CalendarContext {
  eventId: string;
  country: string;
  region: string | null;
  scope: CalendarScope;
  kind: CalendarKind;
  role: 'origin' | 'route';
  month: string;
  relation: 'selected' | 'previous';
  start: string;
  end: string;
  text: string;
  sourceURL: string;
  verifiedAt: string;
}
export function isExactMonth(value: unknown): value is string;
export function isExactDate(value: unknown): value is string;
export function previousMonth(month: string): string | null;
export function matchCalendarContext(events: readonly CalendarEvent[], query: CalendarQuery): {
  summary: CalendarContext[];
  details: CalendarContext[];
};
