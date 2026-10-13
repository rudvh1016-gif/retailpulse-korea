"use client";
import { useSyncExternalStore } from 'react';
import { usePersonalPreferences } from './personal-preferences';
import { setAnalyticsConsent } from '../lib/personal-analytics';
const KEY = 'koretail-analytics-consent-v1';
const CHANGE = 'koretail-analytics-consent-changed';
let fallback: string | null = null;
let storageFailed = false;
function snapshot() {
  if (storageFailed) return fallback;
  try { return window.localStorage.getItem(KEY); } catch { return fallback; }
}
function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) { storageFailed = false; fallback = null; callback(); }
  };
  window.addEventListener(CHANGE, callback);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(CHANGE, callback); window.removeEventListener('storage', storage); };
}
export function useAnalyticsConsent() {
  const { ready, preferences } = usePersonalPreferences();
  const raw = useSyncExternalStore(subscribe, snapshot, () => undefined);
  return { ready: ready && raw !== undefined, enabled: raw === 'true' || (raw === null && preferences?.analytics === true), storageFailed };
}
function save(enabled: boolean) {
  fallback = String(enabled);
  try { window.localStorage.setItem(KEY, fallback); storageFailed = false; } catch { storageFailed = true; }
  setAnalyticsConsent(enabled);
  window.dispatchEvent(new Event(CHANGE));
}
const copy = {
  ko: ['선택적 이용 통계', 'Google Analytics로 페이지 조회와 이용 기능을 기록해 서비스 개선에 사용합니다 검색어·개인 입력·광고 추적은 제외하며 언제든 끌 수 있습니다', '기기 저장이 차단되어 이번 탭에서만 적용됩니다'],
  en: ['Optional usage analytics', 'Allow Google Analytics to record page views and feature use to improve the service No search terms, personal input or advertising tracking You can turn this off at any time', 'Storage is blocked This choice applies only in this tab'],
  zh: ['可选使用统计', '允许 Google Analytics 记录页面浏览和功能使用以改进服务 不包含搜索词、个人输入或广告跟踪 可随时关闭', '存储被阻止 此选择仅适用于当前标签页'],
  ja: ['任意の利用統計', 'Google Analytics でページ閲覧と機能の利用を記録しサービス改善に使用します 検索語・個人入力・広告追跡は含まずいつでも無効にできます', '保存がブロックされています このタブのみ有効です'],
} as const;
export default function AnalyticsConsent({ lang }: { lang: keyof typeof copy }) {
  const { ready, enabled, storageFailed: failed } = useAnalyticsConsent();
  const text = copy[lang];
  return <section className="preference-block" aria-labelledby="analytics-consent-title">
    <label id="analytics-consent-title"><input name="usage-analytics" aria-describedby="analytics-consent-description" type="checkbox" checked={enabled} disabled={!ready} onChange={event => save(event.target.checked)} /> {text[0]}</label>
    <p id="analytics-consent-description" className="truth-note">{text[1]}</p>
    {failed && <p role="status" className="truth-note">{text[2]}</p>}
  </section>;
}
