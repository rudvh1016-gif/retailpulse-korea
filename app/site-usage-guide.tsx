/* eslint-disable @next/next/no-html-link-for-pages -- A full navigation initializes the site's custom route shell. */
import { passengerCopy } from "../lib/passenger-copy";
import type { Lang } from "./retailpulse-data";

const copy = {
  ko: {
    title: "누가, 어떻게 쓰면 좋을까요?",
    intro: "인천공항에서 일하며 오늘의 상황과 평소와 달라진 흐름을 확인하는 곳입니다. 먼저 한눈에에서 오늘을 보고, 변화가 궁금할 때 기간을 비교하세요. 서울 지역 자료는 더보기에서 계속 이용할 수 있습니다.",
    uses: [
      ["판매사원·식음료 매장 근무자", "한눈에에서 근무 터미널과 날짜를 고르세요. 오늘의 출발편·예상 인원·대기를 확인하고, 앞으로 1·3·6시간에 어느 구역과 목적지의 출발편이 많은지 살펴보세요."],
      ["영업관리자·현장 관리자", "한눈에의 비교 탭에서 기준 시작·끝과 비교 시작·끝을 정하세요. 시간대·주말·터미널의 차이를 일평균으로 확인하고, 국가별 흐름에서는 여객 월 실적과 항공편 변화를 따로 확인하세요."],
      ["고객 안내·공항 운영 직원", "공항현황에서 시간대·터미널과 대기를 확인하세요. 미리 준비에서는 국가별 휴일과 도착국 반입 면세한도를 보고, 고객 안내 전 공식 출처와 확인 날짜를 확인하세요."],
    ],
    methodTitle: "숫자는 이렇게 읽어주세요",
    method: "+는 신장, △는 역신장입니다. 기간 길이가 다르면 합계 대신 실제 포함일수로 나눈 하루 평균을 비교합니다. 빠진 날짜는 0으로 계산하지 않으므로 포함일수도 함께 보세요. 비중 감소와 편수 감소는 다를 수 있습니다. 국가별 출국 여객은 공항 전체 공식 월 실적이며, 항공편의 날짜별 비교와 터미널별 월 집계는 범위가 다릅니다. 목적지 국가는 승객 국적이 아닙니다. 현재 관측·공식 예상·과거 실적을 구분하고, 항공편을 매장 방문·매출로 해석하지 마세요.",
    updateTitle: "언제 새 자료가 보이나요?",
    updates: "공항 대기·예상 인원·항공편은 각 자료의 정기 수집 뒤 갱신됩니다. 기간 비교는 이미 저장된 완료 기록만 사용하고, 월 여객은 공항공사의 발표 이후 반영합니다. 화면의 기준시각·수집시각·포함 날짜를 함께 확인하세요.",
    limit: "자료가 없으면 확인 불가로 표시합니다. 연휴 전후의 차이는 연휴가 만든 효과를 입증하지 않습니다. 공개 자료는 상황 파악을 위한 참고이며 매출·적정 인원·재고 수량을 예측하지 않습니다.",
  },
  en: {
    title: "Who is this for, and how do I use it?",
    intro: "KORETAIL focuses on Incheon Airport flights, passenger trends and travel preparation. Seoul-area reference data remains available on separate screens.",
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
    intro: "KORETAIL以仁川机场航班、旅客趋势与出行准备为中心。首尔地区参考资料可在独立页面查看。",
    uses: [["机场及免税店员工", "选择航站楼，同时查看预计出境人数、高峰时段、出发航班与出境区等候，准备工作与休息安排。"], ["首尔门店经营者", "结合地区当前人口、境内消费者刷卡、天气及活动，并使用门店页面的业态检查清单准备开店。"], ["游客及旅游咨询人员", "查看目的地当前拥挤、官方预测与天气；旅游咨询页面汇集各地区的咨询资料。"]],
    methodTitle: "如何理解数字", method: "按地区、日期和航站楼整理机构公布的资料。当前观测、官方预测与历史实绩并不相同。预计旅客不是排队人数，境内消费者刷卡不是外国人消费或全部销售额。仅在范围与时段可比时计算变化。",
    updateTitle: "何时更新？", updates: "首尔人口、刷卡与机场排队约每15分钟尝试采集，机场预计旅客每小时采集，航班和活动按各自定期计划采集。月度、季度资料在机构发布后更新。机构更新与本站采集不是同一时间，请同时查看观测与采集时刻。",
    limit: "来源延迟或故障可能推迟更新。保留最近确认的值及时间，缺失资料显示无法确认。请勿仅凭数字判断销售或现场工作量。",
  },
  ja: {
    title: "誰が、どう使うと便利ですか？",
    intro: "KORETAILは仁川空港のフライト・旅客動向・旅行準備を中心に案内します。ソウル地域の参考資料は別画面で確認できます。",
    uses: [["空港・免税店のスタッフ", "ターミナルを選び、予想出国者・ピーク時間・出発便・出国場の待ちを併せて確認し、勤務や休憩を準備します。"], ["ソウルの店舗運営者", "現在人口・国内カード決済・天気・イベントを併せて読み、店舗画面の業種別チェックリストで開店を準備します。"], ["訪問者・観光案内スタッフ", "訪問先の現在の混雑・公式予測・天気を確認します。観光案内画面では地域別の案内資料をまとめて見られます。"]],
    methodTitle: "数字の読み方", method: "機関の公表資料を地域・日付・ターミナル別に整理します。現在観測、公式予測、過去実績は別の指標です。予想旅客数は待機人数ではなく、国内カード決済は外国人消費や全売上ではありません。対象・期間が比較可能な場合のみ増減を計算します。",
    updateTitle: "いつ更新されますか？", updates: "ソウル人口・カード決済と空港の待ちは約15分ごと、空港の予想旅客は毎時、フライト・イベント等は資料別の定期収集を試みます。月次・四半期資料は機関の公表後に更新します。提供元の更新とKORETAILの収集は別なので、観測と取得の時刻を確認してください。",
    limit: "提供元の遅延や障害で更新が遅れることがあります。最後に確認した値には時刻を残し、資料がない場合は確認不可と表示します。数字だけで売上や現場の業務量を断定しないでください。",
  },
};

function ReadingParagraphs({ text }: { text: string }) {
  const sentences = text.split(/(?<=[.!?。])\s*/).filter(Boolean);
  const paragraphs = sentences.reduce<string[]>((all, sentence, index) => {
    if (index % 2 === 0) all.push(sentence);
    else all[all.length - 1] += ` ${sentence}`;
    return all;
  }, []);
  const keywords = /(현재 관측|공식 예상|과거.*?실적|같은 대상·기간|관측 기준과 수집 시각|약 15분|every 15 minutes|Current observations|official forecasts|historical actuals|comparable periods and scopes|observation and collection time|当前观测|官方预测|历史实绩|約?15分|15分钟|観測と取得の時刻|現在観測|公式予測|過去実績)/gi;
  return <>{paragraphs.map((paragraph, index) => <p key={index}>{paragraph.split(keywords).map((part, at) => at % 2 ? <strong key={at}>{part}</strong> : part)}</p>)}</>;
}

export function SiteUsageGuide({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const examples = { ko: "활용 예시", en: "Usage examples", zh: "使用示例", ja: "活用例" }[lang];
  const disclosureStyle = { minHeight: 44, boxSizing: "border-box" as const, padding: "12px 0", cursor: "pointer" };
  return <section className="site-usage-guide" aria-labelledby="site-usage-title">
    <h2 data-heading="section" id="site-usage-title"><span className="heading-marker" aria-hidden="true"/>{t.title}</h2>
    <p>{t.intro}</p>
    {lang==='ko'&&<details id="airport-usage-guide" data-testid="airport-usage-guide"><summary style={disclosureStyle}>인천공항 이용 방법</summary>
      <dl>
        <div><dt><a href="/ko">공항한눈에</a></dt><dd>오늘 예상 인원·출발편을 확인하고, 두 기간의 시간대·요일·터미널 변화를 비교합니다</dd></div>
        <div><dt><a href="/ko/airport">공항현황</a></dt><dd>근무 터미널을 선택해 출국장 대기와 시간대별 출발편을 확인합니다</dd></div>
        <div><dt><a href="/ko/airport-countries">국가별 흐름</a></dt><dd>공항 전체의 국가별 월 여객과 터미널별 항공편 변화를 각각 확인합니다</dd></div>
        <div><dt><a href="/ko/airport-prepare">미리 준비</a></dt><dd>국가별 휴일과 도착국 반입 면세한도를 확인합니다</dd></div>
      </dl>
    </details>}
    <details data-testid="usage-examples"><summary style={disclosureStyle}>{examples}</summary>
      <dl>{t.uses.map(([who, how]) => <div key={who}><dt>{who}</dt><dd>{how}</dd></div>)}</dl>
    </details>
    <h3 data-heading="subsection"><span className="heading-marker" aria-hidden="true"/>{t.methodTitle}</h3><details data-testid="usage-method"><summary style={disclosureStyle}>{{ko:'집계 기준 보기',en:'Counting methodology',zh:'查看统计口径',ja:'集計基準を見る'}[lang]}</summary><ReadingParagraphs text={t.method}/></details><p>{lang==='ko'?'한눈에의 예상 인원은 출국장 예고와 별도 환승 예고의 단순 합계입니다. 출국장 예고에는 내·외국인 구분이 없습니다.':<>{passengerCopy.scope[lang]} · {passengerCopy.limitation[lang]}</>}</p><p>{passengerCopy.noSum[lang]}</p>
    <details data-testid="usage-updates"><summary style={disclosureStyle}>{t.updateTitle}</summary>
      <ReadingParagraphs text={t.updates}/>
    </details>
    <p className="site-usage-limit">{t.limit}</p>
  </section>;
}
