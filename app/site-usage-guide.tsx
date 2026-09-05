import type { Lang } from "./retailpulse-data";

const copy = {
  ko: {
    title: "누가, 어떻게 쓰면 좋을까요?",
    intro: "KORETAIL은 명동·홍대·성수와 인천공항의 공식 자료를 모아, 방문과 근무 준비에 필요한 흐름을 보여주는 사이트입니다.",
    uses: [
      ["공항·면세점 근무자", "공항에서 터미널을 고른 뒤 예상 출국객, 피크 시간, 출발편과 출국장 대기를 함께 확인해 근무와 휴게 시간을 준비하세요."],
      ["서울 매장 운영자", "지역의 현재 인구·내국인 카드 소비·날씨·행사를 함께 보고, 매장 화면의 업종별 점검 목록으로 오픈을 준비하세요."],
      ["방문객·관광안내 직원", "방문할 지역의 현재 혼잡과 공식 예측·날씨를 확인하세요. 관광안내 화면에서는 지역별 안내 자료를 모아 볼 수 있습니다."],
    ],
    methodTitle: "숫자는 이렇게 읽어주세요",
    method: "기관이 발표한 자료를 지역·날짜·터미널별로 정리합니다. 현재 관측, 앞으로의 공식 예상, 이미 지난 실적은 서로 다른 값입니다. 예상 출국객은 실제 대기인원이 아니며, 내국인 카드 소비는 외국인 소비나 전체 매출이 아닙니다. 비교 수치는 같은 대상·기간의 자료가 있을 때만 계산합니다.",
    updateTitle: "언제 새 자료가 보이나요?",
    updates: "서울 인구·카드 소비와 공항 대기는 약 15분 간격으로 수집을 시도합니다. 공항 예상 승객은 시간별, 항공편·행사 등은 자료별 정기 수집, 월별·분기별 실적은 기관의 발표 이후 갱신됩니다. 기관 발표 주기와 KORETAIL 수집 주기는 다릅니다. 화면의 관측 기준과 수집 시각을 함께 확인하세요.",
    limit: "정해진 시간이 지나도 공급자 지연이나 장애로 갱신이 늦을 수 있습니다. 마지막으로 확인한 값은 기준시각과 함께 남기고, 자료가 없으면 확인 불가로 표시합니다. 수치만으로 매출이나 현장 업무량을 단정하지 마세요.",
  },
  en: {
    title: "Who is this for, and how do I use it?",
    intro: "KORETAIL brings official data for Myeongdong, Hongdae, Seongsu and Incheon Airport together to help you prepare for visits and work.",
    uses: [
      ["Airport and duty-free staff", "Select a terminal and read expected departures, peak hours, departing flights and departure-hall waits together when preparing shifts and breaks."],
      ["Seoul store operators", "Read local population, domestic-card activity, weather and events together, then prepare opening with the store checklist for your business type."],
      ["Visitors and tourism-information staff", "Check current crowding, official forecasts and weather for your area. The guide desk brings area-specific information together."],
    ],
    methodTitle: "How to read the numbers",
    method: "We organize provider-published data by area, date and terminal. Current observations, official forecasts and historical actuals are different measures. Expected passengers are not queue counts; domestic-card activity is neither foreign spending nor total sales. Changes are calculated only when comparable periods and scopes are available.",
    updateTitle: "When is data updated?",
    updates: "We attempt collection of Seoul population/card activity and airport queues about every 15 minutes, airport passenger forecasts hourly, and flights/events on their source-specific schedules. Monthly and quarterly records follow provider publication. Provider refresh and KORETAIL collection are different: check both the observation and collection time.",
    limit: "Provider delays or outages can postpone an update. Last-known values keep their timestamps; missing data is marked unavailable. A number alone does not establish sales or actual workload.",
  },
  zh: {
    title: "适合谁用，怎么用？",
    intro: "KORETAIL汇集明洞、弘大、圣水与仁川机场的官方资料，帮助您安排到访与工作。",
    uses: [["机场及免税店员工", "选择航站楼，同时查看预计出境人数、高峰时段、出发航班与出境区等候，准备工作与休息安排。"], ["首尔门店经营者", "结合地区当前人口、境内消费者刷卡、天气及活动，并使用门店页面的业态检查清单准备开店。"], ["游客及旅游咨询人员", "查看目的地当前拥挤、官方预测与天气；旅游咨询页面汇集各地区的咨询资料。"]],
    methodTitle: "如何理解数字", method: "按地区、日期和航站楼整理机构公布的资料。当前观测、官方预测与历史实绩并不相同。预计旅客不是排队人数，境内消费者刷卡不是外国人消费或全部销售额。仅在范围与时段可比时计算变化。",
    updateTitle: "何时更新？", updates: "首尔人口、刷卡与机场排队约每15分钟尝试采集，机场预计旅客每小时采集，航班和活动按各自定期计划采集。月度、季度资料在机构发布后更新。机构更新与本站采集不是同一时间，请同时查看观测与采集时刻。",
    limit: "来源延迟或故障可能推迟更新。保留最近确认的值及时间，缺失资料显示无法确认。请勿仅凭数字判断销售或现场工作量。",
  },
  ja: {
    title: "誰が、どう使うと便利ですか？",
    intro: "KORETAILは明洞・弘大・聖水と仁川空港の公式資料をまとめ、訪問や勤務の準備に役立つ動きを示します。",
    uses: [["空港・免税店のスタッフ", "ターミナルを選び、予想出国者・ピーク時間・出発便・出国場の待ちを併せて確認し、勤務や休憩を準備します。"], ["ソウルの店舗運営者", "現在人口・国内カード決済・天気・イベントを併せて読み、店舗画面の業種別チェックリストで開店を準備します。"], ["訪問者・観光案内スタッフ", "訪問先の現在の混雑・公式予測・天気を確認します。観光案内画面では地域別の案内資料をまとめて見られます。"]],
    methodTitle: "数字の読み方", method: "機関の公表資料を地域・日付・ターミナル別に整理します。現在観測、公式予測、過去実績は別の指標です。予想旅客数は待機人数ではなく、国内カード決済は外国人消費や全売上ではありません。対象・期間が比較可能な場合のみ増減を計算します。",
    updateTitle: "いつ更新されますか？", updates: "ソウル人口・カード決済と空港の待ちは約15分ごと、空港の予想旅客は毎時、フライト・イベント等は資料別の定期収集を試みます。月次・四半期資料は機関の公表後に更新します。提供元の更新とKORETAILの収集は別なので、観測と取得の時刻を確認してください。",
    limit: "提供元の遅延や障害で更新が遅れることがあります。最後に確認した値には時刻を残し、資料がない場合は確認不可と表示します。数字だけで売上や現場の業務量を断定しないでください。",
  },
};

export function SiteUsageGuide({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <section className="site-usage-guide" aria-labelledby="site-usage-title">
    <h2 id="site-usage-title">{t.title}</h2>
    <p>{t.intro}</p>
    <dl>{t.uses.map(([who, how]) => <div key={who}><dt>{who}</dt><dd>{how}</dd></div>)}</dl>
    <h3>{t.methodTitle}</h3><p>{t.method}</p>
    <h3>{t.updateTitle}</h3><p>{t.updates}</p>
    <p className="site-usage-limit">{t.limit}</p>
  </section>;
}
