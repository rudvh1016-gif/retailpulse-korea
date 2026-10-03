type Lang = 'ko' | 'en' | 'zh' | 'ja';
export function airportCompositionCopy(lang: Lang, relation: 'TODAY' | 'PAST' | 'FUTURE', date: string, scope: string) {
  const future = relation === 'FUTURE';
  const title = relation === 'TODAY'
    ? {ko:'오늘 출발편 구성',en:"Today's departure composition",zh:'今日出发航班构成',ja:'今日の出発便構成'}[lang]
    : {ko:'선택일 출발편 구성',en:'Selected-date departure composition',zh:'所选日期出发航班构成',ja:'選択日の出発便構成'}[lang];
  const basis = future
    ? {ko:'수집된 출발 예정편',en:'Collected scheduled departures',zh:'已采集的计划出发航班',ja:'収集済みの出発予定便'}[lang]
    : {ko:'수집된 출발편 기록',en:'Collected departure records',zh:'已采集的出发航班记录',ja:'収集済みの出発便記録'}[lang];
  const intro = {ko:'탑승 게이트·운항 항공사·항공사 등록 국가별 편수입니다. 공동운항은 실제 운항사 기준 한 편으로 셉니다.',en:'Flight counts by boarding gate, operating airline and airline registration country. Codeshares count once for their operator.',zh:'按登机口、实际承运航空公司及其注册国统计班次。代码共享按实际承运方计一次。',ja:'搭乗ゲート・運航会社・航空会社の登録国別の便数です。コードシェアは運航会社の1便として数えます。'}[lang];
  return {title, scope:`${scope} · ${date} KST · ${basis}`, intro};
}
