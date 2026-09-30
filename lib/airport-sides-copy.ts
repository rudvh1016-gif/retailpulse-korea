/**
 * Words for the airport east/west block, in the four product languages.
 * Hall figures are always "expected" and always at the departure halls;
 * flight figures are always counts of flights at gates. Neither is ever
 * called visitors, actual departures or people in the airport.
 */
import type { PrepLang } from "./business-prep-copy";

type Row = Record<PrepLang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });

export const sidesCopy = {
  hallTitle: row("출국장 기준 예상 이용객", "Expected passengers at the departure halls", "出境大厅预计旅客", "出国場基準の予想利用客"),
  gateTitle: row("탑승구 기준 출발편", "Departures by gate", "按登机口的出发航班", "搭乗口基準の出発便"),
  notice: row(
    "인원은 출국장 이용 예상치이며, 항공편은 탑승구 위치 기준입니다. 특정 매장 방문객 수를 뜻하지 않습니다.",
    "Passenger figures are expected departure-hall use; flights are by gate location. Neither is a count of visitors to any store.",
    "人数为出境大厅的预计使用人数，航班按登机口位置统计。两者都不代表某家店铺的到店人数。",
    "人数は出国場の利用予想で、便は搭乗口の位置基準です。特定の店舗の来店客数ではありません。",
  ),
  withheld: row(
    "동·서편별 예상 이용객은 공항의 안내문구 협의 조건을 확인한 뒤 공개합니다. 터미널 전체 예고와 공식 조회 페이지는 지금 볼 수 있습니다.",
    "Expected passengers by side will be published once the airport's notice-wording condition is confirmed. The terminal-wide notice and the official page are available now.",
    "东西侧预计旅客将在确认机场的提示文案协商条件后公开。整个航站楼的预告与官方查询页面现已可查看。",
    "東西別の予想利用客は、空港の案内文言の協議条件を確認した後に公開します。ターミナル全体の予告と公式の照会ページは今すぐ見られます。",
  ),
  officialPage: row("공항 예상 혼잡도 (공식)", "Airport expected congestion (official)", "机场预计拥挤度（官方）", "空港の予想混雑度（公式）"),
  expected: row("예상", "expected", "预计", "予想"),
  people: row("명", "", "人", "人"),
  flights: row("편", " flight(s)", "班", "便"),
  total: row("합계", "Total", "合计", "合計"),
  wholeDay: row("하루 전체", "Whole day", "全天", "終日"),
  confirmedOnly: row("확인된 시간대만 합계", "Sum of confirmed hours only", "仅已确认时段合计", "確認できた時間帯のみ合計"),
  hoursOf: row("시간대", "hours", "个时段", "時間帯"),
  yourHours: row("영업시간 안", "Inside your hours", "营业时间内", "営業時間内"),
  yourHoursBoundary: row(
    "영업 시작·종료 시각이 들어 있는 시간대는 나누지 않고 따로 표시합니다.",
    "An hour cut by your opening or closing time is shown on its own, never split.",
    "被营业开始或结束时间切开的时段不拆分，单独显示。",
    "開店・閉店時刻がかかる時間帯は分けずに別に表示します。",
  ),
  boundary: row("경계 시간대", "Boundary hour", "边界时段", "境界の時間帯"),
  upcoming: row("지금 이후", "From now", "此后", "これから"),
  showAll: row("하루 전체 보기", "Show the whole day", "查看全天", "終日を見る"),
  sideCompare: row("T1·T2 하루 비교", "T1 and T2, whole day", "T1·T2全天比较", "T1・T2の終日比較"),
  area: {
    T1: row("T1 본관", "T1 main building", "T1主楼", "T1本館"),
    T2: row("T2", "T2", "T2", "T2"),
    CONCOURSE: row("탑승동", "Concourse", "登机楼", "搭乗棟"),
    UNKNOWN: row("터미널 미확인", "Terminal unknown", "航站楼未确认", "ターミナル未確認"),
  } as Record<"T1" | "T2" | "CONCOURSE" | "UNKNOWN", Row>,
  side: {
    EAST: row("동편", "East", "东侧", "東側"),
    WEST: row("서편", "West", "西侧", "西側"),
    CENTER: row("중앙", "Centre", "中央", "中央"),
    UNVERIFIED: row("위치 미확인", "Side not confirmed", "位置未确认", "位置未確認"),
  } as Record<"EAST" | "WEST" | "CENTER" | "UNVERIFIED", Row>,
  coverage: row("위치가 확인된 탑승구의 편수", "Flights at a gate with a confirmed side", "位置已确认登机口的航班", "位置が確認できた搭乗口の便"),
  sideCountsNote: row(
    "동편·서편 편수는 위치가 확인된 탑승구만 센 일부 값입니다. 동·서편 전체 규모나 가장 바쁜 시간으로 읽지 마세요.",
    "East and west counts cover only gates with a confirmed side. Do not read them as each side's full volume or busiest hour.",
    "东侧、西侧航班数只统计位置已确认的登机口，是部分数值，请勿视为各侧整体规模或最繁忙时段。",
    "東側・西側の便数は位置が確認できた搭乗口だけを数えた一部の値です。東西全体の規模や最も忙しい時間として読まないでください。",
  ),
  reason: {
    NO_GATE: row("탑승구 미배정", "no gate assigned", "未分配登机口", "搭乗口未割当"),
    NOT_IN_TABLE: row("위치표에 없는 탑승구", "gate not in the side table", "位置表中没有的登机口", "位置表にない搭乗口"),
    CONFLICT: row("터미널·탑승구 불일치", "terminal and gate disagree", "航站楼与登机口不一致", "ターミナルと搭乗口の不一致"),
    NO_TERMINAL: row("터미널 미확인", "terminal unknown", "航站楼未确认", "ターミナル未確認"),
  } as Record<"NO_GATE" | "NOT_IN_TABLE" | "CONFLICT" | "NO_TERMINAL", Row>,
  cancelled: row("결항편은 합계에서 제외했습니다", "Cancelled flights are left out of the totals", "取消航班已从合计中扣除", "欠航便は合計から除きました"),
  scheduledHour: row("예정 출발 시각 기준", "By scheduled departure time", "按计划出发时间", "予定出発時刻基準"),
  collected: row("수집된 운항 기록 기준 · 마지막 수집", "From collected flight records · last collected", "按已收集的航班记录 · 最后收集", "収集した運航記録基準 · 最終収集"),
  schedule: row("공식 출발 예정표 기준 · 수집", "From the official departure schedule · collected", "按官方出发时刻表 · 收集", "公式の出発予定表基準 · 収集"),
  capped: row("오늘 운항 기록이 한 번에 읽는 한도를 넘어 하루 전체로 셀 수 없습니다.", "Today's flight records reached the read limit, so a whole day cannot be counted.", "今日航班记录达到读取上限，无法按全天统计。", "本日の運航記録が読み取り上限に達したため、終日としては数えられません。"),
  noFlights: row("이 날짜의 운항 기록이 아직 없습니다.", "No flight records for this date yet.", "该日期尚无航班记录。", "この日付の運航記録はまだありません。"),
  noHalls: row("이 날짜의 출국장 예고가 아직 없습니다.", "No departure-hall notice for this date yet.", "该日期尚无出境大厅预告。", "この日付の出国場予告はまだありません。"),
  passengerPerGate: row(
    "탑승구별 실제 인원은 공식 자료로 제공되지 않아 표시하지 않습니다. 사람 수로 바꾼 값은 맨 위 '예상 출국객' 참고 추정 하나뿐이며, 항공기 크기나 탑승률은 반영하지 않았습니다.",
    "No official source gives people per gate, so none is shown. The only figure in people is the reference estimate at the top, split by flight ratio; aircraft size and load are not considered.",
    "官方没有提供各登机口的实际人数，因此不显示。以人数表示的只有顶部按航班比例分配的参考估算，未计入机型大小和上座率。",
    "搭乗口ごとの実際の人数は公式に提供されていないため表示しません。人数で示すのは上部の便数比率による参考推定だけで、機材の大きさや搭乗率は反映していません。",
  ),
  basisTitle: row("동·서편 기준과 공식 근거", "How east and west are set, with sources", "东西侧的划分依据与官方来源", "東西の区分基準と公式根拠"),
  basisHalls: row(
    "출국장: T1은 1·2·3번 동편, 4·5·6번 서편(3·4번 사이, G/H 체크인 사이가 중앙 축), T2는 2번 동편, 1번 서편(1·2번 사이, F/G 체크인 사이). 공항의 시설 위치 안내 문구와 공식 안내도에 따른 KORETAIL의 업무용 구분입니다.",
    "Halls: T1 1-3 east and 4-6 west (axis between halls 3 and 4, check-in G/H); T2 2 east and 1 west (axis between halls 1 and 2, check-in F/G). A KORETAIL working split that follows the airport's facility location text and official maps.",
    "出境大厅：T1的1·2·3号为东侧，4·5·6号为西侧（3、4号之间，G/H值机柜台之间为中轴）；T2的2号为东侧，1号为西侧（1、2号之间，F/G值机柜台之间）。这是依据机场设施位置说明和官方导览图的KORETAIL业务划分。",
    "出国場：T1は1・2・3番が東側、4・5・6番が西側（3・4番の間、G/Hチェックインの間が中央軸）、T2は2番が東側、1番が西側（1・2番の間、F/Gチェックインの間）。空港の施設位置案内の文言と公式案内図に基づくKORETAILの業務用区分です。",
  ),
  basisGates: row(
    "탑승구는 두 가지 근거로만 구분합니다. ① 공항의 공식 위치 문구에 동편·서편·중앙이 쓰여 있는 탑승구(30곳). ② 공식 지도(airport.kr 지도)가 표시한 탑승구 위치를 KORETAIL이 계산한 것: 건물마다 공식 문구의 서편·동편 탑승구를 연결하는 방향을 축으로 잡고, 공식 문구의 가장 안쪽 동편(서편) 탑승구보다 더 동쪽(서쪽)에 있는 탑승구만 동편(서편)으로 봅니다(92곳). 두 경계 사이의 탑승구와 지도에 없는 탑승구는 번호로 짐작하지 않고 '위치 미확인'으로 둡니다. 탑승동은 별도 건물로 셉니다.",
    "Gates are split on two bases only. (1) Gates whose official location text says east, west or centre (30). (2) The position of the gate on the airport's official map, calculated by KORETAIL: in each building an axis runs from the officially west gates to the officially east gates, and a gate counts as east (west) only if it lies further east (west) than the innermost officially east (west) gate (92). Gates between the two bounds, and gates not on the map, stay 'side not confirmed' rather than guessed from their number. The Concourse is counted as its own building.",
    "登机口只按两种依据划分。① 机场官方位置说明中写明东侧、西侧或中央的登机口（30个）。② 机场官方地图上登机口的位置，由KORETAIL计算：每个建筑以官方文字中的西侧到东侧登机口连线为轴，只有比官方文字中最里侧的东侧（西侧）登机口更偏东（西）的登机口才算东侧（西侧）（92个）。两条界线之间的登机口以及地图上没有的登机口，不按编号推测，标为“位置未确认”。登机楼作为独立建筑统计。",
    "搭乗口は次の二つの根拠だけで分けます。① 空港の公式な位置の文言に東側・西側・中央と書かれた搭乗口（30か所）。② 空港の公式地図上の搭乗口の位置をKORETAILが計算したもの：建物ごとに公式文言の西側から東側の搭乗口を結ぶ方向を軸とし、公式文言で最も内側の東側（西側）の搭乗口より東（西）にある搭乗口だけを東側（西側）とします（92か所）。二つの境界の間の搭乗口と地図にない搭乗口は、番号から推測せず「位置未確認」とします。搭乗棟は別の建物として数えます。",
  ),
  basisEstimate: row(
    "예상 출국객 참고 추정: 공항이 발표한 터미널 전체 예상 출국객을, 이 터미널 탑승구에서 출발하는 항공편 중 동·서편 위치가 확인된 편수 비율로 나눈 값입니다. 중앙·위치 미확인 항공편과 탑승동으로 가는 승객도 같은 비율로 들어 있고, 항공기 크기와 탑승률은 반영하지 않았습니다. 출국장 번호로 사람을 나누지 않습니다.",
    "Reference estimate of departing passengers: the airport's published terminal-wide expected departures, split by the share of flights from this terminal's gates whose east or west side is confirmed. Passengers of centre and unconfirmed flights, and of those bound for the Concourse, are folded in at the same ratio; aircraft size and load are not considered. People are never assigned to a side by departure-hall number.",
    "预计出境旅客参考估算：把机场发布的航站楼整体预计出境旅客，按本航站楼登机口出发航班中东西位置已确认的航班数比例分配。中央、位置未确认航班及前往登机楼的旅客也按同一比例计入，未计入机型大小和上座率。不按出境大厅编号把人分到东西两侧。",
    "出国予想客の参考推定：空港が発表したターミナル全体の出国予想客を、このターミナルの搭乗口から出る便のうち東西の位置が確認できた便数の比率で分けた値です。中央・位置未確認の便や搭乗棟に向かう乗客も同じ比率で含まれ、機材の大きさや搭乗率は反映していません。出国場の番号で人を東西に分けることはしません。",
  ),
  basisLinks: row("공식 출처", "Official sources", "官方来源", "公式出典"),
};

export const OFFICIAL_LINKS = [
  { href: "https://www.airport.kr/ap_ko/908/subview.do", label: row("출국장 안내도", "Departure hall maps", "出境大厅导览图", "出国場の案内図") },
  { href: "https://www.airport.kr/ap_ko/1008/subview.do", label: row("시설 위치 안내", "Facility locations", "设施位置", "施設の位置案内") },
  { href: "https://www.airport.kr/ap_ko/886/subview.do", label: row("탑승구 번호 안내", "Gate numbers", "登机口编号", "搭乗口番号") },
  { href: "https://www.airport.kr/geomap/ap_ko/view.do?alertType=0&tmnlId=P01&type=2", label: row("공항 공식 지도", "Official airport map", "机场官方地图", "空港の公式地図") },
  { href: "https://www.airport.kr/ap_ko/883/subview.do", label: row("공항 예상 혼잡도", "Expected congestion", "预计拥挤度", "予想混雑度") },
] as const;

const hh = (hour: number) => String(hour).padStart(2, "0");
export function hourSpan(hour: number, lang: PrepLang): string {
  return lang === "en" ? `${hh(hour)}:00–${hh(hour + 1)}:00` : `${hh(hour)}–${hh(hour + 1)}${row("시", "", "时", "時")[lang]}`;
}

export function count(value: number, lang: PrepLang): string {
  return new Intl.NumberFormat(lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US", { maximumFractionDigits: 0 }).format(value);
}
