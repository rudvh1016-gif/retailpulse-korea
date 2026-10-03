'use client';

import { useMemo, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { useFlights } from './flights-client';
import { departureMap } from '../lib/airport-departure-map';
import { rankMapGates, leadingGates, type RankedGate } from '../lib/airport-gate-ranking';
import { mapCopy } from '../lib/airport-departure-map-copy';
import { kstStamp } from '../lib/demand-presentation';
import './airport-models.css';

const copy = {
  title: { ko: '출발편이 가장 많은 게이트', en: 'Gates with the most departures', zh: '出发航班最多的登机口', ja: '出発便が最も多いゲート' },
  all: { ko: '전체 게이트 보기', en: 'View all gates', zh: '查看全部登机口', ja: 'すべてのゲートを見る' },
  search: { ko: '게이트·터미널 검색', en: 'Search gate or terminal', zh: '搜索登机口或航站楼', ja: 'ゲート・ターミナル検索' },
  leaders: { ko: '공동 1위', en: 'Joint leaders', zh: '并列第一', ja: '同率1位' },
  note: { ko: '높이는 출발편 수에 비례합니다. 실제 위치·승객·대기 수가 아닙니다. 편수 비교 모형입니다.', en: 'Height is proportional to departures. This comparison model is not a map or a passenger or queue count.', zh: '高度与出发航班数成正比。这是比较模型，不代表实际位置、旅客或排队人数。', ja: '高さは出発便数に比例します。実際の位置・旅客数・待機人数を示す模型ではありません。' },
  partial: { ko: 'API가 일부 항공편만 반환했습니다. 전체 순위와 동률을 확정할 수 없습니다.', en: 'The API returned partial flight records. Complete rankings and ties cannot be established.', zh: 'API仅返回部分航班，无法确认完整排名或并列情况。', ja: 'APIが一部の便のみ返しました。全順位・同率を確定できません。' },
  unknown: { ko: '게이트 미정', en: 'Gate unassigned', zh: '登机口未定', ja: 'ゲート未定' },
  unknownBuilding: { ko: '건물 미정 (터미널 비교 제외)', en: 'Building unknown (outside terminal comparison)', zh: '建筑未定（不计入航站楼比较）', ja: '建物未定（ターミナル比較対象外）' },
  zone: { ko: '구역', en: 'Zone', zh: '区域', ja: '区域' },
  allZones: { ko: '전체 구역', en: 'All zones', zh: '全部区域', ja: '全区域' },
  details: { ko: '항공편 상세', en: 'Flight details', zh: '航班详情', ja: '便の詳細' },
};

function Pillar({ item, max, lang, onSelect }: { item: RankedGate; max: number; lang: Lang; onSelect: () => void }) {
  const height = max > 0 ? item.flights / max * 104 : 0;
  const y = 146 - height;
  return <button type="button" className="gate-pillar" onClick={onSelect} aria-label={`${item.building} ${mapCopy.gate[lang]} ${item.gate}, ${item.flights}${lang === 'en' ? ' flights' : lang === 'ko' ? '편' : lang === 'zh' ? '班' : '便'}`} data-flights={item.flights} data-gate={item.gate}>
    <svg viewBox="0 0 82 176" width="82" height="176" aria-hidden="true">
      <path d="M6 151 L63 151 L78 141 L22 141 Z" fill="#eef2f4"/>
      {height > 0 && <><path d={`M18 ${y} L59 ${y} L59 146 L18 146 Z`} fill={item.side === 'EAST' ? '#b5d8d0' : '#a9d5ec'}/>
        <path d={`M59 ${y} L69 ${y - 7} L69 139 L59 146 Z`} fill="#81b3cd"/>
        <path d={`M18 ${y} L28 ${y - 7} L69 ${y - 7} L59 ${y} Z`} fill="#e5f5fc"/></>}
      <text x="41" y="165" textAnchor="middle" fill="#000" fontSize="12">{item.gate}</text>
      <text x="41" y={Math.max(16, y - 14)} textAnchor="middle" fill="#000" fontSize="14">{item.flights}</text>
    </svg>
  </button>;
}

export default function AirportGatePillars({ lang, terminal, date }: { lang: Lang; terminal: 'all' | 'T1' | 'T2'; date: string }) {
  const loaded = useFlights(date);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('ALL');
  const [selected, setSelected] = useState<string | null>(null);
  const maps = useMemo(() => loaded?.status === 'OK' ? (terminal === 'all' ? ['T1', 'T2'] as const : [terminal]).map(t => departureMap({ date, nextDate: date, terminal: t, window: { startMin: 0, endMin: 1440 }, rows: loaded.payload.flights })) : [], [loaded, date, terminal]);
  const gates = useMemo(() => rankMapGates(maps), [maps]);
  const leaders = leadingGates(gates);
  const max = leaders[0]?.flights ?? 0;
  const locale = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[lang];
  const unit = { ko: '편', en: ' flights', zh: '班', ja: '便' }[lang];
  const query = search.trim().toLowerCase();
  const list = gates.filter(g => (zone === 'ALL' || g.side === zone || g.building === zone) && (!query || `${g.building} ${g.gate}`.toLowerCase().includes(query)));
  const flights = maps.flatMap(map => map.flights);
  const selectedFlights = flights.filter(f => `${f.building}:${f.gate}` === selected);
  const picked = gates.find(g => g.key === selected);
  const select = (key: string) => { setSelected(selected === key ? null : key); };
  return <div className="airport-gate-model" key={`${terminal}:${date}`} data-testid="gate-pillar-model">
    <h4>{copy.title[lang]}</h4>
    {!loaded ? <p role="status">{mapCopy.loading[lang]}</p> : loaded.status === 'FAILED' ? <p role="status">{mapCopy.failed[lang]}</p> : <>
      {loaded.payload.truncated ? <p role="status">{copy.partial[lang]}</p> : <>
        {leaders.length ? <><p className="gate-leader-number"><strong>{max.toLocaleString(locale)}</strong>{unit} <span>{copy.leaders[lang]} {leaders.length}</span></p>
          <div className="gate-leader-zones">{(['WEST', 'CENTER', 'EAST', 'UNVERIFIED'] as const).map(side => {
            const rows = leaders.filter(g => g.side === side);
            return rows.length > 0 && <section key={side}><h5>{mapCopy.side[side][lang]}</h5><div className="gate-pillar-row">{rows.map(item => <div key={item.key}><small>{item.building}</small><Pillar item={item} max={max} lang={lang} onSelect={() => select(item.key)}/></div>)}</div></section>;
          })}</div></> : <p>{mapCopy.empty[lang]}</p>}
      </>}
      <p className="prep-note">{copy.note[lang]}</p>
      <details open={open} onToggle={event => setOpen(event.currentTarget.open)} data-testid="gate-all-list"><summary>{copy.all[lang]} ({gates.length})</summary>
        {open && <><div className="gate-search"><label>{copy.search[lang]}<input type="search" name="gate-search" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)}/></label>
          <label>{copy.zone[lang]}<select value={zone} onChange={e => setZone(e.target.value)}><option value="ALL">{copy.allZones[lang]}</option>{(['WEST', 'CENTER', 'EAST', 'UNVERIFIED'] as const).map(side => <option key={side} value={side}>{mapCopy.side[side][lang]}</option>)}<option value="CONCOURSE">{mapCopy.building.CONCOURSE[lang]}</option></select></label></div>
          <ul className="gate-full-list">{list.map(gate => <li key={gate.key}><button type="button" onClick={() => select(gate.key)} aria-pressed={selected === gate.key}>{gate.building} · {gate.gate} · {mapCopy.side[gate.side][lang]}<strong>{gate.flights}{unit}</strong></button></li>)}</ul>{!list.length && <p role="status">{mapCopy.empty[lang]}</p>}
        </>}
      </details>
      {picked && <section className="gate-selected" data-testid="gate-selected" aria-live="polite"><h5>{picked.building} · {picked.gate} · {copy.details[lang]}</h5><Pillar item={picked} max={Math.max(max, picked.flights)} lang={lang} onSelect={() => select(picked.key)}/><ul>{selectedFlights.map(f => <li key={`${f.day}:${f.id}`}>{f.flightNumber} · {f.scheduledAt.slice(11, 16)} KST · {f.destinationCode ?? '—'}</li>)}</ul>{!selectedFlights.length && <p>{mapCopy.noFlightsAtGate[lang]}</p>}</section>}
      <p className="prep-note">{copy.unknown[lang]}: {flights.filter(f => !f.gate).length}{unit} · {loaded.payload.basis === 'OFFICIAL_DEPARTURE_SCHEDULE' ? mapCopy.basisSchedule[lang] : mapCopy.basisCollected[lang]}{loaded.payload.retrievedAt ? ` · ${kstStamp(loaded.payload.retrievedAt)} KST` : ''}</p>
      <p className="prep-note">{copy.unknownBuilding[lang]}: {maps[0]?.unknownBuilding ?? 0}{unit}</p>
      <a href="https://www.airport.kr/geomap/ap_ko/view.do" target="_blank" rel="noopener noreferrer">{mapCopy.axis[lang]}</a>
    </>}
  </div>;
}
