import { interests, locations, roles, terminals } from './personal-briefing';
const names = ['onboarding_started','role_selected','location_selected','interests_selected','briefing_preference_selected','onboarding_completed','briefing_viewed','briefing_helpful_yes','briefing_helpful_no','briefing_used_for_work_yes','briefing_used_for_work_no','pwa_install_prompt_seen','pwa_installed'] as const;
type EventName = typeof names[number];
type Params = Record<string, unknown>;
export function validMeasurementId(value: string | undefined) { return /^G-[A-Z0-9]{4,20}$/.test(value ?? '') && !/^G-X+$/.test(value ?? '') ? value : undefined; }
export function safeAnalyticsParams(params: Params): Record<string,string> {
  const result: Record<string,string> = {};
  const enums: Record<string, readonly string[]> = {role:roles,location:locations,terminal:terminals,day:['yesterday','today','tomorrow'],language:['ko','en','zh','ja']};
  for(const [key,values] of Object.entries(enums)) if(typeof params[key] === 'string' && values.includes(params[key])) result[key] = params[key];
  if(Array.isArray(params.interests)) result.interests = interests.filter(i=>(params.interests as unknown[]).includes(i)).join(',');
  return result;
}
type AnalyticsWindow = Window & {dataLayer?: unknown[]; gtag?: (...args: unknown[])=>void} & Record<string,unknown>;
// Enable only after the owner has disabled ALL Enhanced Measurement in GA4.
// Those automatic events bypass the custom event allowlist, including URL search terms.
const measurementId = process.env.NEXT_PUBLIC_GA4_ENABLED === 'true'
  ? validMeasurementId(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID) : undefined;
let consent: boolean | null = null;
let initialized = false;
const pending: Array<{name: EventName; params: Record<string,string>}> = [];
function init() {
  if(!measurementId || !consent || typeof window === 'undefined') return false;
  const w = window as unknown as AnalyticsWindow;
  w[`ga-disable-${measurementId}`] = false;
  if(initialized) return true;
  initialized = true;
  w.dataLayer ??= [];
  w.gtag = function() {
    // Google tag consumes an Arguments object, as in its official bootstrap.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  w.gtag('js',new Date());
  // Never send referrer, queries, fragments, titles, user properties or automatic page views.
  w.gtag('config',measurementId,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:window.location.origin,page_referrer:'',page_title:'KORETAIL'});
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.dataset.koretailAnalytics = 'true';
  document.head.append(script);
  return true;
}
export function setAnalyticsConsent(enabled: boolean) {
  consent = enabled;
  if(typeof window !== 'undefined' && measurementId) {
    const w = window as unknown as AnalyticsWindow;
    w[`ga-disable-${measurementId}`] = !enabled;
    if(initialized) w.gtag?.('consent','update',{analytics_storage:enabled?'granted':'denied'});
  }
  if(enabled && init()) {
    for(const event of pending.splice(0)) trackPersonalEvent(event.name,event.params);
  } else if(!enabled) pending.length = 0;
}
export function trackPersonalEvent(name: EventName, params: Params = {}) {
  if(!measurementId || typeof window === 'undefined' || !names.includes(name)) return;
  const safe = safeAnalyticsParams(params);
  if(consent === null) { if(pending.length < 20) pending.push({name,params:safe}); return; }
  if(!consent) return;
  if(!init()) { if(pending.length < 20) pending.push({name,params:safe}); return; }
  (window as unknown as AnalyticsWindow).gtag?.('event',name,{...safe,send_to:measurementId,page_location:window.location.origin,page_referrer:'',page_title:'KORETAIL'});
}
