'use client';

import { useState } from 'react';
import type { BusinessPreferences } from '../lib/business-preferences';
import type { IndustryId } from '../lib/industry-ids';
import {
  SHIFT_PREVIEW_DAY,
  SHIFT_PREVIEW_PREFERENCES,
  SHIFT_PREVIEW_PREVIOUS,
  SHIFT_PREVIEW_MOBILE_SIZES,
  shiftPreviewResults,
  type ShiftPreviewState,
  type ShiftPreviewWidth,
  type ShiftPreviewMobileSize,
} from '../lib/shift-briefing-preview-data';
import type { Lang } from './retailpulse-data';
import { ShiftBriefingView } from './shift-briefing';
import './shift-briefing-preview.css';

const states: Array<{ id: ShiftPreviewState; label: string }> = [
  { id: 'first', label: '처음 방문' },
  { id: 'saved', label: '설정 완료' },
  { id: 'unchanged', label: '변화 없음' },
  { id: 'missing', label: '자료 없음' },
  { id: 'partial', label: '일부 자료' },
];

function PreviewHeader() {
  return <header className="shift-review-site-header" aria-label="기존 사이트 위치 참고">
    <div className="shift-review-brand"><strong>KORETAIL</strong><span>Retail Demand Signals for Korea</span></div>
    <div className="shift-review-nav" aria-label="기존 메뉴 미리보기">
      <span className="is-current">한눈에</span><span>공항현황</span><span>국가별 흐름</span>
      <span>미리 준비</span><span>외국인은 뭘 살까?</span><span>더보기</span>
    </div>
    <span className="shift-review-header-date">11월 1일 (일) · KST</span>
  </header>;
}

function PreviewOverview() {
  return <section className="shift-review-overview" aria-labelledby="review-overview-title" data-testid="shift-preview-overview">
    <h2 id="review-overview-title" data-heading="section"><span className="heading-marker" aria-hidden="true"/>출근 후 30초 확인</h2>
    <div className="shift-review-overview-grid">
      <div className="shift-review-numbers">
        <div><p className="shift-review-small">2026-11-01 · T2</p><h3>출국객 수 <span>(환승객 포함)</span></h3>
          <p className="shift-review-small">예상 인원 · 단순합계</p><strong className="shift-review-value">54,946<span>명</span></strong>
          <p className="shift-review-delta is-down"><strong>① △ 2,891명 (△ 5%)</strong></p>
          <p className="shift-review-small">지난주 같은 요일 57,837명 대비</p>
          <p className="shift-review-delta is-up"><strong>② +228명/일 (+0%)</strong></p>
          <p className="shift-review-small">10월 수집분 일평균 54,718명 대비</p>
        </div>
        <div><p className="shift-review-small">선택일 전체</p><h3>출발 예정편</h3>
          <p className="shift-review-small">예정 출발시각 기준</p><strong className="shift-review-value">258<span>편</span></strong>
          <p className="shift-review-delta is-down"><strong>① △ 5편 (△ 2%)</strong></p>
          <p className="shift-review-small">지난주 같은 요일 263편 대비</p>
          <p className="shift-review-delta is-down"><strong>② △ 3.9편/일 (△ 1%)</strong></p>
          <p className="shift-review-small">10월 수집분 일평균 261.9편 대비</p>
        </div>
      </div>
      <div className="shift-review-next-week"><h3>다음 주 <span>11/2–11/8</span></h3>
        <p><strong>필리핀 · 만성절·위령의 날</strong><span>11/01–11/02</span></p>
        <p><strong>일본 · 문화의 날</strong><span>11/03</span></p>
      </div>
    </div>
    <div className="shift-review-overview-change"><h3>주목할 변화</h3><p>중국행 <strong>45편</strong>, 10월 일평균보다 <strong className="is-down">약 5편 감소 (△ 10%)</strong></p></div>
  </section>;
}

function PreviewFlow() {
  return <section className="shift-review-flow" aria-labelledby="review-flow-title" data-testid="shift-preview-following">
    <h2 id="review-flow-title" data-heading="section"><span className="heading-marker" aria-hidden="true"/>주목할 공항 흐름</h2>
    <div className="shift-review-flow-grid">
      <div><h3>가장 긴 출국장 대기</h3><p>T2 출국장 1A · <strong>6분</strong></p><span>08:20 KST · 예시 관측</span></div>
      <div><h3>출발편 집중 시간</h3><p>09:00–10:00 · <strong>24편</strong></p><span>T2 · 출발 예정편 기준</span></div>
      <div><h3>다가오는 국가별 휴일</h3><p>일본 · <strong>문화의 날</strong></p><span>11월 3일</span></div>
    </div>
  </section>;
}

export default function ShiftBriefingPreview({
  lang: initialLang = 'ko', initialState = 'saved', initialWidth = 'desktop', initialFocus = false, initialMobileSize = 390, initialLongDestinations = false,
}: { lang?: Lang; initialState?: ShiftPreviewState; initialWidth?: ShiftPreviewWidth; initialFocus?:boolean; initialMobileSize?:ShiftPreviewMobileSize; initialLongDestinations?:boolean }) {
  const [lang,setLang]=useState<Lang>(initialLang);
  const [state, setState] = useState<ShiftPreviewState>(initialState);
  const [width, setWidth] = useState<ShiftPreviewWidth>(initialWidth);
  const [mobileSize,setMobileSize]=useState<ShiftPreviewMobileSize>(initialMobileSize);
  const [longDestinations,setLongDestinations]=useState(initialLongDestinations);
  const [focus,setFocus]=useState(initialFocus);
  const [preferences, setPreferences] = useState<BusinessPreferences>(initialState === 'first' ? {...SHIFT_PREVIEW_PREFERENCES,side:null,hours:null} : SHIFT_PREVIEW_PREFERENCES);
  const [industry, setIndustry] = useState<IndustryId | null>(initialState === 'first' ? null : 'fashion');
  const [configured, setConfigured] = useState(initialState !== 'first');
  const [revision, setRevision] = useState(0);
  const [savedMessage, setSavedMessage] = useState('');
  const { result, areaReference } = shiftPreviewResults(preferences, state, longDestinations);

  const chooseState = (next: ShiftPreviewState) => {
    setState(next);
    setPreferences(next === 'first' ? {...SHIFT_PREVIEW_PREFERENCES,side:null,hours:null} : SHIFT_PREVIEW_PREFERENCES);
    setIndustry(next === 'first' ? null : 'fashion');
    setConfigured(next !== 'first');
    setSavedMessage('');
    setRevision(value => value + 1);
  };
  const save = (next: BusinessPreferences, nextIndustry: IndustryId | null) => {
    setPreferences(next);
    setIndustry(nextIndustry);
    setConfigured(true);
    if (state === 'first' || state === 'unchanged') setState('saved');
    setSavedMessage('이 미리보기에서 근무 조건을 저장했습니다');
  };

  return <div className="shift-review" data-testid="shift-briefing-preview" data-review-state={state} data-review-width={width} data-review-focus={focus} data-mobile-size={mobileSize}>
    <a className="shift-review-skip" href="#shift-preview-content">미리보기 본문으로 이동</a>
    <div className="shift-review-toolbar" aria-label="디자인 검토 도구">
      <div className="shift-review-toolbar-heading"><h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>내 근무 브리핑 · 디자인 확인</h1><p>모든 숫자는 화면 확인용 예시 자료입니다</p></div>
      <div className="shift-review-toolbar-controls">
        <div className="shift-review-width" role="group" aria-label="화면 너비">
          <button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')} data-testid="shift-preview-desktop">PC</button>
          <button type="button" aria-pressed={width === 'mobile'} onClick={() => setWidth('mobile')} data-testid="shift-preview-mobile">모바일</button>
          <label>너비<select aria-label="모바일 화면 너비" value={mobileSize} onChange={event=>{setMobileSize(Number(event.target.value) as ShiftPreviewMobileSize);setWidth('mobile');}}>{SHIFT_PREVIEW_MOBILE_SIZES.map(size=><option value={size} key={size}>{size}px</option>)}</select></label>
        </div>
        <div className="shift-review-states" role="group" aria-label="브리핑 상태">
          {states.map(item => <button key={item.id} type="button" aria-pressed={state === item.id} onClick={() => chooseState(item.id)} data-testid={`shift-preview-state-${item.id}`}>{item.label}</button>)}
        </div>
        <label className="shift-review-language">브리핑 언어<select aria-label="브리핑 언어" value={lang} onChange={event=>setLang(event.target.value as Lang)}><option value="ko">한국어</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option></select></label>
        <label className="shift-review-long"><input type="checkbox" checked={longDestinations} onChange={event=>setLongDestinations(event.target.checked)}/>긴 목적지명 예시</label>
        <button type="button" onClick={()=>setFocus(true)}>브리핑만 크게 보기</button>
      </div>
    </div>
    <div className="shift-review-stage">
      <div className="shift-review-frame" data-testid="shift-preview-frame" data-width={width} style={width==='mobile'?{width:mobileSize}:undefined}>
        <PreviewHeader/>
        <main className="shift-review-main" id="shift-preview-content">
          {focus&&<div className="shift-review-focus-label"><span>시안용 예시 자료</span><button type="button" onClick={()=>setFocus(false)}>전체 배치 보기</button></div>}
          <h2 className="shift-review-page-title" data-heading="section"><span className="heading-marker" aria-hidden="true"/>인천공항 한눈에</h2>
          <div className="shift-review-view-tabs" aria-label="기존 분석 탭 미리보기"><span className="is-current">공항한눈에</span><span>언제 몰렸나요?</span><span>항공편 주말이 더 많나요?</span><span>어느 터미널이 달라졌나요?</span><span>연휴에는 늘었나요?</span></div>
          <div className="shift-review-context"><div><span>전체</span><span>T1 본관</span><span>탑승동</span><strong>T2</strong></div><span>2026. 11. 01. · KST</span></div>
          <PreviewOverview/>
          <div className="shift-review-briefing" data-testid="shift-preview-insertion">
            <ShiftBriefingView
              key={revision}
              lang={lang}
              day={SHIFT_PREVIEW_DAY}
              preferences={preferences}
              industry={industry}
              configured={configured}
              result={configured ? result : null}
              areaReference={configured ? areaReference : null}
              onSave={save}
              previousCheck={state === 'unchanged' ? { unchanged: true, checkedAt: SHIFT_PREVIEW_PREVIOUS } : null}
              preview
            />
          </div>
          <p className="shift-review-save-status" role="status" aria-live="polite">{savedMessage}</p>
          <PreviewFlow/>
          <p className="shift-review-footnote">화면 위치를 확인하기 위해 기존 상단 요약과 아래 흐름을 함께 표시했습니다</p>
        </main>
      </div>
    </div>
  </div>;
}
