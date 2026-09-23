'use client';

import { useId, useState } from 'react';
import type { Lang, Terminal } from './retailpulse-data';
import { checklistPhaseLabels, checklistPhaseOrder, industryProfiles, type IndustryId } from '../lib/industry-guidance';
import { airportStoreAreas, industryPlaybooks, type AirportStoreArea } from '../lib/industry-playbooks';

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
  return <section id={airport ? 'airport-industry-guide' : 'store-industry-guide'} className="industry-section operating-guide" data-testid="industry-guide" aria-labelledby={`${id}-title`}>
    <div className="section-head"><div>
      <p className="eyebrow">KORETAIL · {text(lang, '상시 운영 참고', 'GENERAL OPERATING GUIDE', '日常运营参考', '日常運営の参考')}</p>
      <h2 id={`${id}-title`}>{airport
        ? text(lang, '공항 매장, 이렇게 준비하세요', 'Prepare your airport store', '机场店铺准备指南', '空港店舗の準備ガイド')
        : text(lang, '우리 업종에 맞는 실행 가이드', 'Put the signals to work for your store', '适合本业态的执行指南', '業種に合った実行ガイド')}</h2>
    </div></div>
    <p className="truth-note">{text(lang, '아래는 일반 운영 제안이며 매출·방문자 수 예측이 아닙니다. 선택한 날짜의 공식 자료와 실제 매장 기록을 함께 확인하세요.', 'These are general operating suggestions, not sales or store-visitor forecasts. Check official data for the selected date alongside your own store records.', '以下为一般运营建议，并非销售额或到店人数预测。请结合所选日期的官方资料与门店实际记录判断。', '一般的な運営提案であり、売上・来店人数の予測ではありません。選択日の公式資料と自店の記録を併せて確認してください。')}</p>
    <div className="industry-tabs" role="group" aria-label={text(lang, '업종 선택', 'Select a business type', '选择业态', '業種を選択')}>
      {(Object.keys(industryProfiles) as IndustryId[]).map(value => <button key={value} type="button" className={industry === value ? 'active' : ''} aria-pressed={industry === value} onClick={() => onIndustryChange(value)}>{industryProfiles[value].label[lang]}</button>)}
    </div>
    {airport && <div className="airport-operating-context">
      <div className="operating-location">
        <label htmlFor={`${id}-location`}>{text(lang, '내 매장 위치', 'My store area', '我的店铺区域', '店舗の区域')}</label>
        <select id={`${id}-location`} value={storeArea} onChange={event => setStoreArea(event.target.value as AirportStoreArea)}>
          {(Object.keys(airportStoreAreas) as AirportStoreArea[]).map(value => <option key={value} value={value}>{airportStoreAreas[value].label[lang]}</option>)}
        </select>
      </div>
      <p className="truth-note">{text(lang, '위치별 안내를 선택하는 메뉴입니다. 위의 터미널·출국/입국 자료 선택은 바뀌지 않습니다.', 'This selects location guidance only. It does not change the terminal or departure/arrival data above.', '此菜单仅选择区域说明，不改变上方航站楼或出入境数据。', '区域別案内の選択です。上のターミナル・出入国データ選択は変わりません。')}</p>
      <p><strong>{text(lang, '확인할 자료', 'What to read', '查看资料', '確認する資料')}</strong>{area.signal[lang]}</p>
      <p>{area.action[lang]}</p>
      <p className="airport-industry-note"><strong>{profile.label[lang]}</strong>{playbook.airport[lang]}</p>
      <div className="operating-links">
        <a href="https://www.airport.kr/ap_ko/905/subview.do" target="_blank" rel="noopener noreferrer">{text(lang, '인천공항 반입 제한 안내 (한국어)', 'Airport carriage guidance (Korean)', '机场携带限制指南（韩语）', '空港持込制限案内（韓国語）')} ↗</a>
        <a href="https://www.airport.kr/ap_ko/1014/subview.do" target="_blank" rel="noopener noreferrer">{text(lang, '면세 액체류·환승 FAQ (한국어)', 'Duty-free liquids / transfer FAQ (Korean)', '免税液体与转机常见问题（韩语）', '免税液体・乗継FAQ（韓国語）')} ↗</a>
      </div>
    </div>}
    <div className="operating-focus"><h3>{profile.label[lang]}</h3><p>{playbook.focus[lang]}</p></div>
    <div className="operating-priorities" key={industry}>
      {playbook.priorities.map((priority, index) => <article className="operating-priority" key={index}>
        <h4>{priority.title[lang]}</h4>
        <p>{priority.action[lang]}</p>
        <details><summary>{text(lang, '판단 근거와 주의점', 'Reasoning and limits', '判断依据与注意点', '判断の理由と注意点')}</summary><p>{priority.reason[lang]}</p></details>
      </article>)}
    </div>
    <div className="operating-record"><h4>{text(lang, '마감 때 남길 기록', 'What to record at close', '打烊时记录', '閉店時に残す記録')}</h4><p>{playbook.record[lang]}</p></div>
    <details className="operating-checklist" key={`${industry}-checklist`}>
      <summary>{text(lang, '오픈 전 · 혼잡 시간 · 마감 체크리스트', 'Opening · busy period · closing checklist', '开店前·繁忙时段·打烊清单', '開店前・混雑時・閉店のチェックリスト')}</summary>
      <div className="checklist-groups">{checklistPhaseOrder.map(phase => <section className="checklist-phase" key={phase}>
        <h3>{checklistPhaseLabels[phase][lang]}</h3>
        <ul className="checklist-rows">{profile.checklist[lang].filter(row => row[0] === phase).map(([, label, action]) => <li key={label}><strong>{label}</strong><p>{action}</p></li>)}</ul>
      </section>)}</div>
    </details>
  </section>;
}
