"use client";
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import type { Lang } from './retailpulse-data';
import { searchToilets, toiletSnapshot, type SeoulFacilityArea, type SeoulToiletSnapshot } from '../lib/seoul-toilets';

const copy = {
  title: {ko:'화장실·물품보관함',en:'Toilets and lockers',zh:'洗手间与储物柜',ja:'トイレ・ロッカー'},
  toilets: {ko:'공식 개방 화장실',en:'Published public toilets',zh:'官方开放洗手间',ja:'公開トイレ'},
  lockers: {ko:'지하철 물품보관함',en:'Metro lockers',zh:'地铁储物柜',ja:'地下鉄ロッカー'},
  unknown: {ko:'현재 빈칸·운영 상태 확인 불가',en:'Current vacancy and operating status unavailable',zh:'当前空位及运营状态无法确认',ja:'現在の空き・営業状況は未確認'},
  posted: {ko:'게시 운영시간 · 현재 개방 여부가 아닙니다.',en:'Published hours; not confirmation that it is open now.',zh:'公布的开放时间，并非当前开放确认。',ja:'掲載の開放時間・現在の開放確認ではありません。'},
  boundary: {ko:'해당 자치구 전체 목록 · 상권 경계나 가까운 순서가 아닙니다.',en:'Whole district list; not a commercial-area boundary or distance ranking.',zh:'所属行政区完整列表，并非商圈边界或距离排序。',ja:'該当区全体の一覧・商圏の境界や距離順ではありません。'},
  snapshot: {ko:'공식 파일 확보일',en:'Official file snapshot',zh:'官方文件获取日期',ja:'公式ファイル取得日'},
  search: {ko:'건물명·주소 검색',en:'Search building or address',zh:'搜索建筑名称或地址',ja:'建物名・住所を検索'},
  loading: {ko:'목록을 불러오는 중입니다.',en:'Loading the list.',zh:'正在读取列表。',ja:'一覧を読み込み中です。'},
  failed: {ko:'목록을 불러오지 못했습니다. 공식 자료를 확인해 주세요.',en:'The list could not be loaded. Check the official source.',zh:'未能读取列表，请查看官方资料。',ja:'一覧を読み込めませんでした。公式資料をご確認ください。'},
  empty: {ko:'검색 결과가 없습니다.',en:'No matching entries.',zh:'没有匹配结果。',ja:'検索結果はありません。'},
  more: {ko:'20곳 더 보기',en:'Show 20 more',zh:'再查看20处',ja:'さらに20件を見る'},
  details: {ko:'주소·시설 상세',en:'Address and facilities',zh:'地址与设施详情',ja:'住所・設備の詳細'},
  coordinates: {ko:'공식 좌표',en:'Published coordinates',zh:'官方坐标',ja:'公開座標'},
  accessible: {ko:'장애인 화장실 게시 정보',en:'Published accessible toilet information',zh:'公布的无障碍洗手间信息',ja:'掲載のバリアフリートイレ情報'},
  absent: {ko:'미기재',en:'Not published',zh:'未公布',ja:'未掲載'},
  source: {ko:'서울시 공식 자료',en:'Official Seoul data',zh:'首尔市官方资料',ja:'ソウル市公式資料'},
  lockerNote: {ko:'위치·크기별 빈칸·기준시각을 아직 확인하지 못했습니다. 공식 안내에서 확인해 주세요.',en:'Location, vacancies by size and source time are not yet verified. Check the official information.',zh:'位置、各尺寸空位及基准时刻尚未确认，请查看官方信息。',ja:'位置・サイズ別の空き・基準時刻は未確認です。公式案内をご確認ください。'},
  concept: {ko:'시설 개념 모형 · 실제 배치도가 아닙니다.',en:'Facility concept model; not an actual floor plan.',zh:'设施概念模型，并非实际平面图。',ja:'設備の概念模型・実際の配置図ではありません。'},
  parking: {ko:'공항 주차',en:'Airport parking',zh:'机场停车',ja:'空港の駐車'},
  parkingNote: {ko:'현재 주차 가능 대수 확인 불가 · 공식 주차 안내에서 터미널별 상황을 확인해 주세요.',en:'Current available spaces are unavailable here. Check each terminal in the official parking information.',zh:'此处无法确认当前可用车位，请在官方停车信息中查看各航站楼情况。',ja:'現在の駐車可能台数は未確認です。公式の駐車案内でターミナル別の状況をご確認ください。'},
  parkingLink: {ko:'인천공항 공식 주차 안내',en:'Official airport parking information',zh:'仁川机场官方停车信息',ja:'仁川空港の公式駐車案内'},
} satisfies Record<string,Record<Lang,string>>;

function Symbol({name,lang}: {name:'toilets'|'lockers'|'parking';lang:Lang}) {
  return <figure className="facility-symbol"><Image src={`/visuals/facilities/v1/${name}-256.webp`} width={96} height={96} sizes="96px" loading="lazy" unoptimized alt="" /><figcaption>{copy.concept[lang]}</figcaption></figure>;
}

function ToiletDirectory({area,lang}: {area:SeoulFacilityArea;lang:Lang}) {
  const [open,setOpen]=useState(false);
  const [loaded,setLoaded]=useState<{area:SeoulFacilityArea;data:SeoulToiletSnapshot|null}|null>(null);
  const [query,setQuery]=useState('');
  const [limit,setLimit]=useState(10);
  useEffect(()=>{
    if(!open || loaded?.area===area) return;
    let active=true;
    fetch(`/data/seoul-toilets/${area}.json`,{headers:{accept:'application/json'}})
      .then(async response=>response.ok ? await response.json() as unknown : null)
      .catch(()=>null).then(value=>{if(active)setLoaded({area,data:toiletSnapshot(value,area)});});
    return ()=>{active=false;};
  },[open,area,loaded?.area]);
  const data=loaded?.area===area ? loaded.data : null;
  const rows=useMemo(()=>searchToilets(data?.rows??[],query),[data,query]);
  return <details className="facility-toilets" data-testid="seoul-toilets" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{copy.toilets[lang]}</summary>
    {open && <>
      <Symbol name="toilets" lang={lang}/><p>{copy.boundary[lang]}</p><p>{copy.posted[lang]}</p>
      {loaded?.area!==area ? <p role="status">{copy.loading[lang]}</p> : !data ? <p role="status">{copy.failed[lang]}</p> : <>
        <p className="facility-source">{data.district} · {copy.snapshot[lang]} {data.snapshotDate} · {data.rows.length.toLocaleString(lang)} / {data.sourceRows.toLocaleString(lang)} · OA-22586</p>
        <label className="facility-search">{copy.search[lang]}<input type="search" value={query} onChange={event=>{setQuery(event.target.value);setLimit(10);}} /></label>
        <p className="facility-result-count" aria-live="polite">{Math.min(limit,rows.length)} / {rows.length}</p>
        {!rows.length && <p role="status">{copy.empty[lang]}</p>}
        <ol className="facility-toilet-rows">{rows.slice(0,limit).map(row=><li key={row.id}>
          <strong>{row.name || row.address}</strong><p>{row.address || row.lotAddress}</p><p>{row.hours || copy.absent[lang]}</p>
          <details><summary>{copy.details[lang]}</summary><p>{row.lotAddress}</p><p>{row.type} · {row.facilities}</p><p>{copy.accessible[lang]}: {row.accessible || copy.absent[lang]}</p>{row.equipment && <p>{row.equipment}</p>}{row.phone && <p>{row.phone}</p>}{row.notes && <p>{row.notes}</p>}<p>{copy.coordinates[lang]}: {row.latitude!==null && row.longitude!==null ? `${row.latitude}, ${row.longitude}` : copy.absent[lang]}</p></details>
        </li>)}</ol>
        {limit<rows.length && <button type="button" onClick={()=>setLimit(value=>value+20)}>{copy.more[lang]}</button>}
      </>}
      <a href="https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do" target="_blank" rel="noopener noreferrer">{copy.source[lang]} ↗</a>
    </>}
  </details>;
}

export function SeoulFacilityGuide({area,lang}: {area:SeoulFacilityArea;lang:Lang}) {
  return <section className="facility-guide" aria-labelledby={`facility-guide-${area}`} data-testid="seoul-facility-guide">
    <h3 id={`facility-guide-${area}`}>{copy.title[lang]}</h3>
    <ToiletDirectory key={area} area={area} lang={lang}/>
    <details data-testid="seoul-lockers"><summary>{copy.lockers[lang]}</summary><Symbol name="lockers" lang={lang}/><p>{copy.unknown[lang]}</p><p>{copy.lockerNote[lang]}</p><a href="https://data.seoul.go.kr/dataList/OA-22731/A/1/datasetView.do" target="_blank" rel="noopener noreferrer">{copy.source[lang]} ↗</a></details>
  </section>;
}

export function AirportParkingGuide({lang}: {lang:Lang}) {
  return <section className="facility-guide airport-parking-guide" data-testid="airport-parking-guide"><details><summary>{copy.parking[lang]}</summary><Symbol name="parking" lang={lang}/><p>{copy.parkingNote[lang]}</p><a href="https://www.airport.kr/ap_ko/955/subview.do" target="_blank" rel="noopener noreferrer">{copy.parkingLink[lang]} ↗</a></details></section>;
}
