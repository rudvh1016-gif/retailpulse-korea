'use client';

import { useId, useState } from 'react';
import type { Lang, Terminal } from './retailpulse-data';
import { checklistPhaseLabels, checklistPhaseOrder, industryProfiles, type IndustryId } from '../lib/industry-guidance';
import { airportStoreAreas, industryPlaybooks, type AirportStoreArea } from '../lib/industry-playbooks';
import './airport-models.css';
import './industry-scenes.css';

const text = (lang: Lang, ko: string, en: string, zh: string, ja: string) => ({ ko, en, zh, ja })[lang];

export function IndustryGuide({ lang, industry, onIndustryChange, airport }: {
  lang: Lang;
  industry: IndustryId;
  onIndustryChange: (value: IndustryId) => void;
  airport?: { terminal: Terminal; direction: 'departure' | 'arrival' };
}) {
  const id = useId();
  const [storeArea, setStoreArea] = useState<AirportStoreArea>(airport?.direction === 'arrival' ? 'arrival' : 'landside');
  const profile = industryProfiles[industry];
  const playbook = industryPlaybooks[industry];
  const area = airportStoreAreas[storeArea];
  const hasNewScene = industry === 'beauty' || industry === 'convenience';
  return <section id={airport ? 'airport-industry-guide' : 'store-industry-guide'} className="industry-section operating-guide" data-testid="industry-guide" aria-labelledby={`${id}-title`}>
    <div className="section-head"><div>
      <p className="eyebrow">KORETAIL · {text(lang, '상시 운영 참고', 'GENERAL OPERATING GUIDE', '日常运营参考', '日常運営の参考')}</p>
      <h2 id={`${id}-title`}>{airport
        ? text(lang, '공항 매장, 이렇게 준비하세요', 'Prepare your airport store', '机场店铺准备指南', '空港店舗の準備ガイド')
        : text(lang, '우리 업종에 맞는 실행 가이드', 'Put the signals to work for your store', '适合本业态的执行指南', '業種に合った実行ガイド')}</h2>
    </div></div>
    <p className="truth-note">{text(lang, '일반 운영 제안이며 매출·방문자 수 예측이 아닙니다.', 'General operating suggestions, not sales or store-visitor forecasts.', '一般运营建议，并非销售额或到店人数预测。', '一般的な運営提案であり、売上・来店人数の予測ではありません。')}</p>
    <div className="industry-tabs" role="group" aria-label={text(lang, '업종 선택', 'Select a business type', '选择业态', '業種を選択')}>
      {(Object.keys(industryProfiles) as IndustryId[]).map(value => <button key={value} type="button" className={industry === value ? 'active' : ''} aria-pressed={industry === value} onClick={() => onIndustryChange(value)}>{industryProfiles[value].label[lang]}</button>)}
    </div>
    {airport && <figure className="airport-shop-model">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/airport-models/shop-${industry}.webp`} width="1200" height="900" alt="" loading="lazy" decoding="async"/>
      <figcaption className="prep-note">{text(lang, '업종별 개념 매장 모형 · 실제 공항 매장 위치가 아닙니다.', 'Concept store model by business type, not an actual airport store location.', '行业概念店铺模型，并非实际机场店铺位置。', '業種別の概念店舗模型です。実際の空港店舗の位置ではありません。')}</figcaption>
    </figure>}
    {airport && <div className="airport-operating-context">
      <div className="operating-location">
        <label htmlFor={`${id}-location`}>{text(lang, '내 매장 위치', 'My store area', '我的店铺区域', '店舗の区域')}</label>
        <select id={`${id}-location`} value={storeArea} onChange={event => setStoreArea(event.target.value as AirportStoreArea)}>
          {(Object.keys(airportStoreAreas) as AirportStoreArea[]).map(value => <option key={value} value={value}>{airportStoreAreas[value].label[lang]}</option>)}
        </select>
      </div>
      <p>{area.action[lang]}</p>
      <p className="airport-industry-note">{playbook.airport[lang]}</p>
      <div className="operating-links">
        <a href="https://www.airport.kr/ap_ko/905/subview.do" target="_blank" rel="noopener noreferrer">{text(lang, '인천공항 반입 제한 안내 (한국어)', 'Airport carriage guidance (Korean)', '机场携带限制指南（韩语）', '空港持込制限案内（韓国語）')} ↗</a>
        <a href="https://www.airport.kr/ap_ko/1014/subview.do" target="_blank" rel="noopener noreferrer">{text(lang, '면세 액체류·환승 FAQ (한국어)', 'Duty-free liquids / transfer FAQ (Korean)', '免税液体与转机常见问题（韩语）', '免税液体・乗継FAQ（韓国語）')} ↗</a>
      </div>
    </div>}
    {!airport && <div className="store-operating-scene" key={`${industry}-scene`}>
      <figure className="store-industry-model">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hasNewScene ? `/visuals/industry/v1/${industry}-960.webp` : `/airport-models/shop-${industry}.webp`}
          srcSet={hasNewScene ? `/visuals/industry/v1/${industry}-480.webp 480w, /visuals/industry/v1/${industry}-960.webp 960w` : undefined}
          sizes="(max-width: 760px) calc(100vw - 48px), 440px" width="960" height="720" alt="" loading="lazy" decoding="async"/>
        <figcaption className="prep-note">{text(lang, '운영 공간 예시 · 실제 매장 배치가 아닙니다.', 'Example operating space, not an actual store layout.', '运营空间示意，并非实际店铺布局。', '運営空間の例です。実際の店舗配置ではありません。')}</figcaption>
      </figure>
      <div className="operating-focus"><h3>{profile.label[lang]}</h3><p>{playbook.focus[lang]}</p></div>
    </div>}
    {airport && <div className="operating-focus"><p>{playbook.focus[lang]}</p></div>}
    <div className="operating-priorities" key={industry}>
      {playbook.priorities.map((priority, index) => <article className="operating-priority" key={index}>
        <h4>{priority.title[lang]}</h4>
        {airport ? <><p>{priority.action[lang]}</p>
          <details><summary>{text(lang, '판단 근거와 주의점', 'Reasoning and limits', '判断依据与注意点', '判断の理由と注意点')}</summary><p>{priority.reason[lang]}</p></details></>
          : <details><summary>{text(lang, '실행 방법과 주의점', 'Steps and limits', '执行方法与注意点', '実行方法と注意点')}</summary>
            <p>{priority.action[lang]}</p><p>{priority.reason[lang]}</p></details>}
      </article>)}
    </div>
    {airport ? <div className="operating-record"><h4>{text(lang, '마감 때 남길 기록', 'What to record at close', '打烊时记录', '閉店時に残す記録')}</h4><p>{playbook.record[lang]}</p></div>
      : <details className="operating-record" key={`${industry}-record`}><summary>{text(lang, '마감 때 남길 기록', 'What to record at close', '打烊时记录', '閉店時に残す記録')}</summary><p>{playbook.record[lang]}</p></details>}
    <details className="operating-checklist" key={`${industry}-checklist`}>
      <summary>{text(lang, '오픈 전 · 혼잡 시간 · 마감 체크리스트', 'Opening · busy period · closing checklist', '开店前·繁忙时段·打烊清单', '開店前・混雑時・閉店のチェックリスト')}</summary>
      <div className="checklist-groups">{checklistPhaseOrder.map(phase => <section className="checklist-phase" key={phase}>
        <h3>{checklistPhaseLabels[phase][lang]}</h3>
        <ul className="checklist-rows">{profile.checklist[lang].filter(row => row[0] === phase).map(([, label, action]) => <li key={label}><strong>{label}</strong><p>{action}</p></li>)}</ul>
      </section>)}</div>
    </details>
  </section>;
}
