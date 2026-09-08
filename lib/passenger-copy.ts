/** A5 is departure-hall use. The XLS transfer metric is arrival security use. Arithmetic is not an official passenger total. */
export const passengerCopy = {
  summedToday: {ko:'금일 두 예고 수치 단순 합계',en:"Today's arithmetic sum of two forecasts",zh:'今日两项预报数值简单相加',ja:'本日の2つの予告値の単純合計'},
  summedSelected: {ko:'선택일 두 예고 수치 단순 합계',en:"Selected day's arithmetic sum of two forecasts",zh:'所选日期两项预报数值简单相加',ja:'選択日の2つの予告値の単純合計'},
  hallComponent: {ko:'출국장 예상',en:'Departure-hall forecast',zh:'出境大厅预计',ja:'出国場予想'},
  transferComponent: {ko:'환승 보안검색 예상',en:'Transfer security forecast',zh:'中转安检预计',ja:'乗継保安検査予想'},
  arithmeticNote: {ko:'환승은 도착 기준 · 중복 여부 미확인 · 전체 출발객 수 아님',en:'Transfers use arrival date · overlap unverified · not total departing passengers',zh:'中转按到达日 · 是否重复未确认 · 非全部出发旅客人数',ja:'乗継は到着基準・重複未確認・出発旅客総数ではありません'},
  today: {ko:'금일 출국장 공식 예상 승객',en:"Today's official departure-hall passenger forecast",zh:'今日出境大厅官方预计旅客',ja:'本日の出国場公式予想旅客'},
  selected: {ko:'선택일 출국장 공식 예상 승객',en:"Selected day's official departure-hall passenger forecast",zh:'所选日期出境大厅官方预计旅客',ja:'選択日の出国場公式予想旅客'},
  scope: {ko:'인천공항 출국장 이용 예상 기준 · 내·외국인 구분 없음',en:'Forecast use of Incheon departure halls · no nationality breakdown',zh:'按仁川机场出境大厅预计使用人数 · 不区分国籍',ja:'仁川空港出国場の利用予想・国籍別の区分なし'},
  limitation: {ko:'현재 사용하는 공개 승객예고 API에는 환승객 별도 예고 수치가 포함되지 않아 환승객을 합산한 전체 출발 여객 수는 아닙니다.',en:'The current public passenger-forecast API has no separate transfer forecast. This is not a total of departing passengers including transfers.',zh:'当前公开旅客预报API不提供单独的中转预报，因此该数值并非包含中转旅客的全部出发旅客人数。',ja:'現在の公開旅客予告APIには乗継客の個別予告値がないため、乗継客を合算した出発旅客総数ではありません。'},
  transfer: {ko:'환승 보안검색 이용 예상 · 도착 기준',en:'Transfer security forecast · arrival basis',zh:'中转安检预计人数 · 按到达日',ja:'乗継保安検査の利用予想・到着基準'},
  unavailable: {ko:'환승객 예고 · 별도 수치 확인되지 않음',en:'Transfer forecast · separate value not yet confirmed',zh:'中转旅客预报 · 尚未确认单独数值',ja:'乗継客予告・個別数値は未確認'},
  failed: {ko:'환승객 예고 · 이번 수집 실패',en:'Transfer forecast · collection failed',zh:'中转旅客预报 · 本次采集失败',ja:'乗継客予告・今回の収集失敗'},
  pending: {ko:'환승객 예고 · 17시 이후 발표·수집 예정',en:'Transfer forecast · publication and collection after 17:00 KST',zh:'中转旅客预报 · 韩国时间17时后发布和采集',ja:'乗継客予告・韓国時間17時以降に発表・収集予定'},
  noSum: {ko:'두 예고 수치의 단순 합계는 중복을 제거한 전체 출발 여객 수가 아닙니다.',en:'The arithmetic sum of the two forecasts is not a deduplicated total of departing passengers.',zh:'两项预报的简单相加并非去重后的全部出发旅客人数。',ja:'2つの予告値の単純合計は重複を除いた出発旅客総数ではありません。'},
} as const;
