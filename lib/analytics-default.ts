/**
 * Whether usage analytics starts ON for a visitor who has not chosen yet.
 *
 * Until 2026-10-14 the Google tag loaded only after a visitor ticked the
 * analytics checkbox on 더보기, so GA counted almost nobody (3 active users in
 * 28 days on the owner's GA report). The owner then chose "on by default, and
 * it can be turned off" (docs/approvals/ga4-default-on-20261014.json).
 *
 * It still starts OFF, until the visitor turns it on, where prior consent is
 * expected or the browser asks not to be tracked:
 * - an EU/EEA, UK or Swiss time zone (GDPR and ePrivacy expect consent before
 *   analytics cookies); the browser's IANA time zone is the only region signal
 *   available without another request;
 * - no readable time zone;
 * - Global Privacy Control or Do Not Track switched on.
 *
 * An explicit choice on 더보기 always wins over this default.
 */
const OPT_IN_TIME_ZONES = /^(?:Europe\/.+|Atlantic\/(?:Azores|Madeira|Canary|Faroe|Faeroe|Reykjavik)|Arctic\/Longyearbyen|Asia\/(?:Nicosia|Famagusta)|Africa\/Ceuta|America\/(?:Guadeloupe|Martinique|Cayenne|Marigot|St_Barthelemy)|Indian\/(?:Reunion|Mayotte))$/;

export interface AnalyticsDefaultSignals {
  timeZone?: string | null;
  globalPrivacyControl?: boolean | null;
  doNotTrack?: string | null;
}

export function analyticsOptInTimeZone(timeZone: string | null | undefined): boolean {
  return !timeZone || OPT_IN_TIME_ZONES.test(timeZone);
}

export function analyticsOnByDefault(signals: AnalyticsDefaultSignals): boolean {
  if (signals.globalPrivacyControl === true) return false;
  if (signals.doNotTrack === '1' || signals.doNotTrack === 'yes') return false;
  return !analyticsOptInTimeZone(signals.timeZone);
}

let browserDefault: boolean | undefined;
/** The default for this browser; false outside a browser. */
export function browserAnalyticsDefault(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (browserDefault !== undefined) return browserDefault;
  let timeZone: string | null = null;
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { timeZone = null; }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const doNotTrack = nav.doNotTrack ?? (window as Window & { doNotTrack?: string }).doNotTrack ?? nav.msDoNotTrack ?? null;
  browserDefault = analyticsOnByDefault({ timeZone, globalPrivacyControl: nav.globalPrivacyControl ?? null, doNotTrack });
  return browserDefault;
}
