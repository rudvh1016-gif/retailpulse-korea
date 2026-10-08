'use client';
import { useEffect, useState } from 'react';
import type { Lang } from './retailpulse-data';
import records from '../config/duty-free-exchange-observations.json';
import { currentDutyFreeExchange, dutyFreeSources, nextKstExchangeMidnight } from '../lib/duty-free-exchange';
import './airport-duty-free-exchange.css';

const copy = {
  ko: { title: '면세환율', internet: '인터넷점 참고', checked: '확인', source: '공식 출처', unavailable: '선택한 날짜의 확인 환율 없음', caution: '인터넷점 표시 환율입니다. 공항 현장 매장의 동일 적용 여부는 확인되지 않았으며, 최종 결제 금액은 달라질 수 있습니다.', shilla: '신라', shinsegae: '신세계' },
  en: { title: 'Duty-free exchange', internet: 'Online-shop reference', checked: 'Checked', source: 'Official sources', unavailable: 'No verified rate for the selected date', caution: 'Displayed online-shop rates. The same rate at airport stores is unverified; the final payment may differ.', shilla: 'Shilla', shinsegae: 'Shinsegae' },
  zh: { title: '免税汇率', internet: '网上店参考', checked: '确认', source: '官方来源', unavailable: '所选日期暂无已确认汇率', caution: '网上店显示汇率。尚未确认机场实体店是否适用相同汇率，最终支付金额可能不同。', shilla: '新罗', shinsegae: '新世界' },
  ja: { title: '免税レート', internet: 'オンライン店の参考', checked: '確認', source: '公式出典', unavailable: '選択日の確認済みレートなし', caution: 'オンライン店の表示レートです。空港実店舗での同率適用は未確認で、最終決済額は異なる場合があります。', shilla: '新羅', shinsegae: '新世界' },
} as const;
const locales = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' } as const;
const unavailableShort = { ko: '확인 환율 없음', en: 'No verified rate', zh: '暂无确认汇率', ja: '確認レートなし' } as const;

export function AirportDutyFreeExchange({ lang, date }: { lang: Lang; date: string | null }) {
  // Start withheld on server and first client render; reserve the header control's space.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const at = Date.now(); setNow(at); clearTimeout(timer);
      timer = setTimeout(refresh, nextKstExchangeMidnight(at) - at + 50);
    };
    refresh();
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  const rows = now === null ? [] : currentDutyFreeExchange(records.observations, now, date);
  const words = copy[lang];
  const number = new Intl.NumberFormat(locales[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clock = new Intl.DateTimeFormat(locales[lang], { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const common = rows.length > 0 && rows.every(row => row.krwPerUnit === rows[0].krwPerUnit);
  return <aside className="airport-duty-free-exchange" data-testid="airport-duty-free-exchange" data-state={rows.length ? 'VERIFIED_TODAY' : 'UNAVAILABLE'} aria-label={words.title}>
    <details className="duty-free-rate-sources" onKeyDown={event => {
      if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
    }}>
      <summary>
        <span className="duty-free-rate-line" aria-live="polite">
          <strong>{words.title}</strong>
          {common ? <span className="duty-free-rate" data-testid="duty-free-rate">1 USD = <span className="duty-free-rate-value">{number.format(rows[0].krwPerUnit)} KRW</span></span>
            : <span className="prep-note" aria-label={rows.length ? undefined : words.unavailable}>{rows.length ? rows.map(row => words[row.vendor]).join('·') : unavailableShort[lang]}</span>}
        </span>
      </summary>
      <div className="duty-free-rate-detail">
        <p className="prep-note">{words.internet} · {words.source}</p>
        {!common && rows.map(row => <p className="duty-free-rate" data-testid="duty-free-rate" key={row.vendor}>{words[row.vendor]} · 1 USD = {number.format(row.krwPerUnit)} KRW</p>)}
        <p className="prep-note">{words.caution}</p>
        <ul>{(Object.keys(dutyFreeSources) as Array<keyof typeof dutyFreeSources>).map(vendor => {
          const row = rows.find(value => value.vendor === vendor);
          return <li key={vendor}><a href={dutyFreeSources[vendor]} target="_blank" rel="noopener noreferrer">{words[vendor]}</a>{row && <> · {words.checked} <time dateTime={row.verifiedAt}>{clock.format(new Date(row.verifiedAt))} KST</time></>}</li>;
        })}</ul>
        {!rows.length && <p className="prep-note">{words.unavailable}</p>}
      </div>
    </details>
  </aside>;
}
