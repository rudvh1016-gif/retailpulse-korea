export type AirportAudience = 'passenger' | 'staff';

/** Explicit choices win; existing store links keep their destination. */
export function airportAudience(search: string): AirportAudience {
  const params = new URLSearchParams(search);
  if (params.get('audience') === 'staff') return 'staff';
  if (params.get('audience') === 'passenger') return 'passenger';
  return params.get('section') === 'mystore' ? 'staff' : 'passenger';
}

export function airportAudienceUrl(url: URL, audience: AirportAudience): string {
  const next = new URL(url);
  next.searchParams.set('audience', audience);
  // A section anchor in the other screen must not leave the new screen scrolled away.
  next.hash = '';
  return next.pathname + next.search;
}

const copy = {
  ko: { choice: '공항 화면 선택', passenger: '승객용', staff: '직원용', intro: '터미널 확인부터 탑승까지, 내 출국 순서를 확인하세요.', flights: '항공편 확인', flightNote: '항공권의 출발 터미널을 선택하고 항공편을 검색하세요.', facilities: '매장·시설 확인', facilityNote: '터미널별 기존 시설 안내를 확인하세요.' },
  en: { choice: 'Choose airport view', passenger: 'Passengers', staff: 'Staff', intro: 'Follow your departure steps, from finding your terminal to boarding.', flights: 'Find a flight', flightNote: 'Select the departure terminal on your ticket and search for your flight.', facilities: 'Stores and facilities', facilityNote: 'Browse the existing facility guide by terminal.' },
  zh: { choice: '选择机场页面', passenger: '旅客', staff: '工作人员', intro: '从确认航站楼到登机，查看您的出境步骤。', flights: '查询航班', flightNote: '选择机票上的出发航站楼并搜索航班。', facilities: '店铺与设施', facilityNote: '按航站楼查看现有设施指南。' },
  ja: { choice: '空港画面を選択', passenger: '搭乗者向け', staff: 'スタッフ向け', intro: 'ターミナルの確認から搭乗まで、出国の手順を確認しましょう。', flights: 'フライトを確認', flightNote: '航空券の出発ターミナルを選び、フライトを検索してください。', facilities: '店舗・施設を確認', facilityNote: 'ターミナル別の施設案内を確認できます。' },
};

export function airportAudienceCopy(lang: string) {
  return copy[lang as keyof typeof copy] ?? copy.en;
}
