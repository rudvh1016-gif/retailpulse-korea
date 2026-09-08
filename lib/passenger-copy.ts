/** A5 is departure-hall use. The XLS transfer metric is arrival security use. Never sum. */
export const passengerCopy = {
  today: {ko:'금일 출국장 공식 예상 승객',en:"Today's official departure-hall passenger forecast",zh:'今日出境大厅官方预计旅客',ja:'本日の出国場公式予想旅客'},
  selected: {ko:'선택일 출국장 공식 예상 승객',en:"Selected day's official departure-hall passenger forecast",zh:'所选日期出境大厅官方预计旅客',ja:'選択日の出国場公式予想旅客'},
  scope: {ko:'인천공항 출국장 이용 예상 기준 · 내·외국인 구분 없음',en:'Forecast use of Incheon departure halls · no nationality breakdown',zh:'按仁川机场出境大厅预计使用人数 · 不区分国籍',ja:'仁川空港出国場の利用予想・国籍別の区分なし'},
  limitation: {ko:'현재 사용하는 공개 승객예고 API에는 환승객 별도 예고 수치가 포함되지 않아 환승객을 합산한 전체 출발 여객 수는 아닙니다.',en:'The current public passenger-forecast API has no separate transfer forecast. This is not a total of departing passengers including transfers.',zh:'当前公开旅客预报API不提供单独的中转预报，因此该数值并非包含中转旅客的全部出发旅客人数。',ja:'現在の公開旅客予告APIには乗継客の個別予告値がないため、乗継客を合算した出発旅客総数ではありません。'},
  transfer: {ko:'환승 보안검색 이용 예상 · 도착 기준',en:'Transfer security forecast · arrival basis',zh:'中转安检预计人数 · 按到达日',ja:'乗継保安検査の利用予想・到着基準'},
  unavailable: {ko:'환승객 예고 · 별도 수치 확인되지 않음',en:'Transfer forecast · separate value not yet confirmed',zh:'中转旅客预报 · 尚未确认单独数值',ja:'乗継客予告・個別数値は未確認'},
  failed: {ko:'환승객 예고 · 이번 수집 실패',en:'Transfer forecast · collection failed',zh:'中转旅客预报 · 本次采集失败',ja:'乗継客予告・今回の収集失敗'},
  pending: {ko:'환승객 예고 · 17시 이후 발표·수집 예정',en:'Transfer forecast · publication and collection after 17:00 KST',zh:'中转旅客预报 · 韩国时间17时后发布和采集',ja:'乗継客予告・韓国時間17時以降に発表・収集予定'},
  noSum: {ko:'공식 Excel의 도착 기준 환승 보안검색 예고입니다. 출국장 예상과 기준이 달라 합산하지 않습니다.',en:'Official Excel forecast for arrival-based transfer security. Its basis differs from departure halls, so the values are not added.',zh:'官方Excel按到达日预测中转安检人数，与出境大厅口径不同，不相加。',ja:'公式Excelの到着基準の乗継保安検査予告です。出国場予想とは基準が異なるため合算しません。'},
} as const;
