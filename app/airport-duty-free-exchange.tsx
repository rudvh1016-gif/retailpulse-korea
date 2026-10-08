'use client';
import { useEffect, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { dutyFreePresentation, dutyFreeSources, kstExchangeDate, nextKstExchangeMidnight, type DutyFreeExchangeSnapshot } from '../lib/duty-free-exchange';
import './airport-duty-free-exchange.css';

const copy = {
  ko: { title: '면세환율', internet: '인터넷점 참고', checked: '확인', source: '공식 출처', unavailable: '선택한 날짜의 확인 환율 없음', caution: '인터넷점 표시 환율입니다. 공항 현장 매장의 동일 적용 여부는 확인되지 않았으며, 최종 결제 금액은 달라질 수 있습니다.', shilla: '신라', shinsegae: '신세계' },
  en: { title: 'Duty-free exchange', internet: 'Online-shop reference', checked: 'Checked', source: 'Official sources', unavailable: 'No verified rate for the selected date', caution: 'Displayed online-shop rates. The same rate at airport stores is unverified; the final payment may differ.', shilla: 'Shilla', shinsegae: 'Shinsegae' },
  zh: { title: '免税汇率', internet: '网上店参考', checked: '确认', source: '官方来源', unavailable: '所选日期暂无已确认汇率', caution: '网上店显示汇率。尚未确认机场实体店是否适用相同汇率，最终支付金额可能不同。', shilla: '新罗', shinsegae: '新世界' },
  ja: { title: '免税レート', internet: 'オンライン店の参考', checked: '確認', source: '公式出典', unavailable: '選択日の確認済みレートなし', caution: 'オンライン店の表示レートです。空港実店舗での同率適用は未確認で、最終決済額は異なる場合があります。', shilla: '新羅', shinsegae: '新世界' },
} as const;
const locales = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' } as const;
const unavailableShort = { ko: '확인 환율 없음', en: 'No verified rate', zh: '暂无确认汇率', ja: '確認レートなし' } as const;

const autoCopy = {
  ko: {pending:'확인 중',previous:'이전 확인값',previousShort:'이전환율',automatic:'자동 수집',failed:'최근 수집 실패',readFailed:'새 자료 조회 실패. 이전 확인값을 표시합니다.',never:'아직 자동 확인값이 없습니다.',attempt:'수집 시도'},
  en: {pending:'Checking',previous:'Previously verified',previousShort:'Previous rate',automatic:'Automatic collection',failed:'Latest collection failed',readFailed:'Refresh failed. Previous verification is retained.',never:'No automated verification yet.',attempt:'Attempt'},
  zh: {pending:'确认中',previous:'上次确认值',previousShort:'上次汇率',automatic:'自动采集',failed:'最近采集失败',readFailed:'新数据读取失败，保留上次确认值。',never:'暂无自动确认值。',attempt:'采集时间'},
  ja: {pending:'確認中',previous:'前回確認値',previousShort:'前回レート',automatic:'自動収集',failed:'直近の収集に失敗',readFailed:'更新できません。前回の確認値を表示しています。',never:'自動確認値はまだありません。',attempt:'収集時刻'},
} as const;

export function AirportDutyFreeExchange({ lang, date }: { lang: Lang; date: string | null }) {
  // Start withheld on server and first client render; reserve the header control's space.
  const [now, setNow] = useState<number | null>(null);
  const [snapshot,setSnapshot]=useState<DutyFreeExchangeSnapshot|null>(null);
  const [readFailed,setReadFailed]=useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let disposed=false,inFlight=false,lastRequestAt=0;
    let controller:AbortController|null=null;
    const schedule=()=>{
      clearTimeout(timer);
      if(disposed||document.visibilityState!=='visible')return;
      const at=Date.now();timer=setTimeout(()=>void refresh(true),Math.min(15*60_000,nextKstExchangeMidnight(at)-at+50));
    };
    const refresh=async(force=false)=>{
      const at=Date.now();if(disposed)return;setNow(at);
      const dayChanged=kstExchangeDate(lastRequestAt)!==kstExchangeDate(at);
      if(document.visibilityState!=='visible'||inFlight||(!force&&!dayChanged&&at-lastRequestAt<5*60_000)){schedule();return;}
      lastRequestAt=at;inFlight=true;const requestController=new AbortController();controller=requestController;
      const requestTimeout=setTimeout(()=>requestController.abort(),12_000);schedule();
      try{
        const response=await fetch('/api/live/duty-free-exchange',{signal:requestController.signal});
        if(!response.ok)throw new Error('rate_read_failed');
        const data=await response.json() as DutyFreeExchangeSnapshot;
        if(data?.mode!=='duty-free-exchange'||data.collectionMode!=='AUTOMATED'||!Array.isArray(data.sources)
          ||data.sources.length!==2||new Set(data.sources.map(source=>source?.vendor)).size!==2
          ||data.sources.some(source=>!source||!Object.hasOwn(dutyFreeSources,source.vendor)))throw new Error('rate_shape_invalid');
        if(data.sources.some(source=>source.errorCode==='STORAGE_UNAVAILABLE'))throw new Error('rate_storage_unavailable');
        if(!disposed){setSnapshot(data);setReadFailed(false);setNow(Date.now());}
      }catch{if(!disposed)setReadFailed(true);}
      finally{clearTimeout(requestTimeout);inFlight=false;if(!disposed)setNow(Date.now());schedule();}
    };
    void refresh(true);
    const focused=()=>void refresh();
    const visible=()=>{if(document.visibilityState==='visible')void refresh();else clearTimeout(timer);};
    window.addEventListener('focus',focused);document.addEventListener('visibilitychange',visible);
    return()=>{disposed=true;clearTimeout(timer);controller?.abort();window.removeEventListener('focus',focused);document.removeEventListener('visibilitychange',visible);};
  }, []);
  const rows = (now===null?[]:dutyFreePresentation(snapshot,now,date)).map(row=>({...row,current:row.current&&!readFailed}));
  const words = copy[lang],auto=autoCopy[lang];
  const number = new Intl.NumberFormat(locales[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clock = new Intl.DateTimeFormat(locales[lang], { timeZone: 'Asia/Seoul', year:'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const common = rows.length>0&&rows.every(row=>row.krwPerUnit===rows[0].krwPerUnit&&row.current===rows[0].current);
  const previous=rows.length>0&&!rows.some(row=>row.current);
  return <aside className="airport-duty-free-exchange" data-testid="airport-duty-free-exchange" data-state={rows.length ? (previous?'PREVIOUS_VERIFIED':'VERIFIED_TODAY') : 'UNAVAILABLE'} aria-label={words.title}>
    <details className="duty-free-rate-sources" onKeyDown={event => {
      if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
    }}>
      <summary>
        <span className="duty-free-rate-line" aria-live="polite">
          <strong>{previous?auto.previousShort:words.title}</strong>
          {common ? <span className="duty-free-rate" data-testid="duty-free-rate">1 USD <span className="duty-free-rate-equals">=</span> <span className="duty-free-rate-value">{number.format(rows[0].krwPerUnit)}{lang==='ko'?'원':' KRW'}</span></span>
            : <span className="prep-note" aria-label={rows.length ? undefined : words.unavailable}>{rows.length ? rows.map(row => words[row.vendor]).join('·') : (!snapshot&&!readFailed?auto.pending:unavailableShort[lang])}</span>}
        </span>
      </summary>
      <div className="duty-free-rate-detail">
        <p className="prep-note">{auto.automatic} · {words.internet} · {words.source}</p>
        {readFailed&&<p className="prep-note" role="status">{auto.readFailed}</p>}
        {!common && rows.map(row => <p className="duty-free-rate" data-testid="duty-free-rate" key={row.vendor}>{words[row.vendor]} · 1 USD = {number.format(row.krwPerUnit)} KRW</p>)}
        <p className="prep-note">{words.caution}</p>
        <ul>{(Object.keys(dutyFreeSources) as Array<keyof typeof dutyFreeSources>).map(vendor => {
          const row = rows.find(value => value.vendor === vendor);
          const source=snapshot?.sources.find(value=>value.vendor===vendor);
          const failed=source?.lastAttemptStatus==='ERROR'||source?.lastAttemptStatus==='BLOCKED';
          return <li key={vendor}><a href={dutyFreeSources[vendor]} target="_blank" rel="noopener noreferrer">{words[vendor]}</a>{row&&<> · {row.current?words.checked:auto.previous} <time dateTime={row.verifiedAt}>{clock.format(new Date(row.verifiedAt))} KST</time></>}
            {failed&&<p className="prep-note">{auto.failed}{source?.lastAttemptAt&&Number.isFinite(Date.parse(source.lastAttemptAt))&&<> · {auto.attempt} <time dateTime={source.lastAttemptAt}>{clock.format(new Date(source.lastAttemptAt))} KST</time></>}</p>}
            {!row&&!failed&&<p className="prep-note">{auto.never}</p>}
          </li>;
        })}</ul>
        {!rows.length && <p className="prep-note">{words.unavailable}</p>}
      </div>
    </details>
  </aside>;
}
