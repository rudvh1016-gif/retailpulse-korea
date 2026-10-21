// A new notice must not inherit the previous release's dismiss/snooze choice.
export const UPDATE_NOTICE_VERSION = 'airport-flow-20261021-v1';
export const UPDATE_NOTICE_SESSION_KEY = `koretail-notice:${UPDATE_NOTICE_VERSION}:closed`;
export const UPDATE_NOTICE_UNTIL_KEY = `koretail-notice:${UPDATE_NOTICE_VERSION}:until`;
export const UPDATE_NOTICE_OPEN_EVENT = 'koretail:open-update-notice';
export const NOTICE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export function noticeDeadline(value:string|null,now:number):number|null {
  if(!value||!/^\d+$/.test(value))return null;
  const until=Number(value);
  return Number.isSafeInteger(until)&&until>now?until:null;
}
