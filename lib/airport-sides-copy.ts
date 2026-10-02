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
    UNVERIFIED: row("탑승구 미정", "Gate not set", "登机口未定", "搭乗口未定"),
  } as Record<"EAST" | "WEST" | "CENTER" | "UNVERIFIED", Row>,
  coverage: row("동·서편이 정해진 출발편", "Departures with a gate on a known side", "已分东西侧的出发航班", "東西が決まった出発便"),
  sideCountsNote: row(
    "동편·서편 편수는 탑승구가 정해진 출발편만 센 값입니다. 탑승구 미정 편이 정해지면 달라질 수 있으니 동·서편 전체 규모나 가장 바쁜 시간으로 읽지 마세요.",
    "East and west counts include only departures that already have a gate. They can change once the unset gates are assigned, so do not read them as each side's full volume or busiest hour.",
    "东侧、西侧航班数只统计已分配登机口的出发航班。登机口未定的航班确定后数字会变，请勿视为各侧整体规模或最繁忙时段。",
    "東側・西側の便数は搭乗口が決まった出発便だけを数えた値です。搭乗口未定の便が決まると変わるため、東西全体の規模や最も忙しい時間として読まないでください。",
  ),
  reason: {
    NO_GATE: row("탑승구 미배정", "no gate assigned", "未分配登机口", "搭乗口未割当"),
    NOT_IN_TABLE: row("공식 지도에 없는 탑승구", "gate not on the official map", "官方地图上没有的登机口", "公式地図にない搭乗口"),
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
    "탑승구별 실제 인원은 공식 자료로 제공되지 않아 표시하지 않습니다. 사람 수로 바꾼 값은 맨 위 '예상 출국객' 참고 추정 하나뿐이며, 편당 승객 수가 같다고 가정했고 항공기 크기나 탑승률은 반영하지 않았습니다.",
    "No official source gives people per gate, so none is shown. The only figure in people is the reference estimate at the top, which assumes every flight carries the same number of passengers; aircraft size and load are not considered.",
    "官方没有提供各登机口的实际人数，因此不显示。以人数表示的只有顶部的参考估算，它假设每班航班旅客数相同，未计入机型大小和上座率。",
    "搭乗口ごとの実際の人数は公式に提供されていないため表示しません。人数で示すのは上部の参考推定だけで、1便あたりの乗客数が同じという前提としており、機材の大きさや搭乗率は反映していません。",
  ),
  // The departure map's own words live in lib/airport-departure-map-copy.ts, which loads with the map.
  overviewTitle: row("출발편 동·서편과 목적지 지역", "Departures by east/west side and destination region", "出发航班：东西侧与目的地地区", "出発便：東側・西側と行き先地域"),
  overviewIntro: row(
    "오늘 출발편이 동편·서편 어느 쪽 탑승구에서 더 많이 뜨는지, 어느 탑승구에 몰리는지, 어디로 가는지를 봅니다. 항공편 수이며 손님 수가 아닙니다.",
    "Which side's gates today's departures leave from, which gates they gather at, and where they fly. These are flights, not customers.",
    "看看今天的出发航班更多从东侧还是西侧登机口起飞、集中在哪些登机口、飞往哪里。这是航班数，不是顾客数。",
    "今日の出発便が東側・西側どちらの搭乗口から多く出るか、どの搭乗口に集まるか、どこへ飛ぶかを見ます。便数であり、お客様の数ではありません。",
  ),
  overviewSwitch: row("터미널 선택", "Choose a terminal", "选择航站楼", "ターミナルを選択"),
  overviewSwitchTo: row("아래에 표시:", "Show below:", "切换下方:", "下の表示:"),
  overviewJump: row("출발편 동·서편·목적지 지역 ↓", "Departures by east/west side and region ↓", "出发航班东西侧与目的地地区 ↓", "出発便の東西・行き先地域 ↓"),
  mapTitle: row("공항 출발편 지도", "Airport departure map", "机场出发航班地图", "空港出発便マップ"),
  radarLoading: row("오늘 달라진 것과 조건이 가까운 과거 날짜를 불러오는 중입니다.", "Loading what is different today and similar days.", "正在读取今天的不同之处和相近的日子。", "今日違うことと近かった日を読み込んでいます。"),
  mapLoading: row("출발편 지도를 불러오는 중입니다.", "Loading the departure map.", "正在读取出发航班地图。", "出発便マップを読み込んでいます。"),
  basisTitle: row("동·서편 기준과 공식 근거", "How east and west are set, with sources", "东西侧的划分依据与官方来源", "東西の区分基準と公式根拠"),
  basisHalls: row(
    "출국장: T1은 1·2·3번 동편, 4·5·6번 서편(3·4번 사이, G/H 체크인 사이가 중앙 축), T2는 2번 동편, 1번 서편(1·2번 사이, F/G 체크인 사이). 공항의 시설 위치 안내 문구와 공식 안내도에 따른 KORETAIL의 업무용 구분입니다.",
    "Halls: T1 1-3 east and 4-6 west (axis between halls 3 and 4, check-in G/H); T2 2 east and 1 west (axis between halls 1 and 2, check-in F/G). A KORETAIL working split that follows the airport's facility location text and official maps.",
    "出境大厅：T1的1·2·3号为东侧，4·5·6号为西侧（3、4号之间，G/H值机柜台之间为中轴）；T2的2号为东侧，1号为西侧（1、2号之间，F/G值机柜台之间）。这是依据机场设施位置说明和官方导览图的KORETAIL业务划分。",
    "出国場：T1は1・2・3番が東側、4・5・6番が西側（3・4番の間、G/Hチェックインの間が中央軸）、T2は2番が東側、1番が西側（1・2番の間、F/Gチェックインの間）。空港の施設位置案内の文言と公式案内図に基づくKORETAILの業務用区分です。",
  ),
  basisGates: row(
    "탑승구는 세 가지 근거로 구분합니다. ① 공항의 공식 위치 문구에 동편·서편·중앙이 쓰여 있는 탑승구(30곳). ② 공식 지도(airport.kr 지도)가 표시한 탑승구 위치: 건물마다 공식 문구의 서편·동편 탑승구를 연결하는 방향을 축으로 잡고, 가장 안쪽 공식 동편(서편) 탑승구보다 더 동쪽(서쪽)인 탑승구(92곳). ③ 그 사이에 남은 탑승구는 건물 중앙선(공식 문구 서편·동편 탑승구 평균의 중간)을 기준으로 동·서를 정하고, 중앙선 가까이(건물 너비의 ±15%)는 중앙으로 봅니다(34곳, 2026-10-02 소유자 지시). 지도에 없는 탑승구와 아직 탑승구가 정해지지 않은 항공편만 '탑승구 미정'으로 남습니다. 탑승동은 별도 건물로 셉니다.",
    "Gates are split on three bases. (1) Gates whose official location text says east, west or centre (30). (2) The gate's position on the airport's official map: in each building an axis runs from the officially west gates to the officially east gates, and a gate counts as east (west) when it lies beyond the innermost officially east (west) gate (92). (3) The gates left between those bounds take the side of the building's centre line (the midpoint between the mean official west and east gates), and gates within ±15% of the building's width of that line are centre (34, owner instruction 2026-10-02). Only gates not on the map, and flights with no gate yet, remain 'gate not set'. The Concourse is its own building.",
    "登机口按三种依据划分。① 机场官方位置说明中写明东侧、西侧或中央的登机口（30个）。② 机场官方地图上的登机口位置：每个建筑以官方文字中的西侧到东侧登机口连线为轴，比最里侧官方东侧（西侧）登机口更偏东（西）的登机口（92个）。③ 其余位于两界之间的登机口，以建筑中线（官方西侧与东侧登机口平均位置的中点）为准定东西，距中线建筑宽度±15%以内的为中央（34个，2026-10-02业主指示）。只有地图上没有的登机口和尚未分配登机口的航班保留为“登机口未定”。登机楼作为独立建筑统计。",
    "搭乗口は三つの根拠で分けます。① 空港の公式な位置の文言に東側・西側・中央と書かれた搭乗口（30か所）。② 空港の公式地図上の搭乗口の位置：建物ごとに公式文言の西側から東側の搭乗口を結ぶ方向を軸とし、最も内側の公式東側（西側）の搭乗口より東（西）にある搭乗口（92か所）。③ その間に残った搭乗口は建物の中心線（公式文言の西側・東側搭乗口の平均の中間）を基準に東西を決め、中心線の近く（建物幅の±15%）は中央とします（34か所、2026-10-02オーナー指示）。地図にない搭乗口と、まだ搭乗口が決まっていない便だけが「搭乗口未定」として残ります。搭乗棟は別の建物として数えます。",
  ),
  basisEstimate: row(
    "예상 출국객은 참고값입니다. 공항이 발표한 터미널 전체 예상 출국객을 그날의 모든 출발편(동편·서편·중앙·탑승구 미정)에 편마다 같은 수로 나눈 값입니다. 탑승구가 아직 정해지지 않은 편의 비중은 동편이나 서편에 더하지 않고 '탑승구 미정'으로 따로 표시합니다. T1 예상 출국객에는 탑승동으로 가는 승객이 포함된 것으로 보고(공항 출국 절차 기준) 탑승동 출발편도 함께 나누어 따로 표시합니다. T2에는 탑승동이 없습니다. 어느 건물인지 알 수 없는 출발편은 제외합니다. 항공기 크기와 탑승률은 반영하지 않고 100명 단위로 반올림합니다. 동·서 비율은 탑승구가 정해진 출발편만으로 냅니다. 출국장 번호로 사람을 나누지 않습니다.",
    "The expected passengers are a reference figure: the airport's published terminal-wide expected departures, divided equally over every departure of the day (east, west, centre and gate not set). The share of flights with no gate yet is not added to east or west; it is shown as its own item. The T1 figure is taken to include passengers bound for the Concourse (per the airport's departure procedure), so Concourse departures are divided too and shown separately (T2 has no Concourse). Departures whose building is unknown are left out. Aircraft size and load are not considered, and figures are rounded to the nearest 100. The east:west ratio uses only departures that already have a gate. People are never assigned to a side by departure-hall number.",
    "预计出境旅客是参考值：把机场发布的航站楼整体预计出境旅客，按当天全部出发航班（东侧、西侧、中央、登机口未定）每班相同地分配。登机口未定航班的份额不加到东侧或西侧，而是作为“登机口未定”单独显示。按机场出境流程，T1的预计人数视为包含前往登机楼的旅客，因此登机楼出发航班也一并分配并单独显示（T2没有登机楼）。无法确认所在建筑的出发航班不计入。未计入机型大小和上座率，并按100人取整。东西比例只用已分配登机口的出发航班计算。不按出境大厅编号把人分到东西两侧。",
    "出国予想客は参考値です。空港が発表したターミナル全体の出国予想客を、その日のすべての出発便（東側・西側・中央・搭乗口未定）に1便あたり同じ数で分けます。搭乗口がまだ決まっていない便の分は東西に加えず、「搭乗口未定」として別に示します。空港の出国手続きに基づき、T1の予想人数には搭乗棟へ向かう乗客が含まれるものとして、搭乗棟の出発便もあわせて分け、別に表示します（T2に搭乗棟はありません）。どの建物か分からない出発便は除きます。機材の大きさや搭乗率は反映せず、100人単位に四捨五入します。東西の比率は搭乗口が決まった出発便だけで出します。出国場の番号で人を東西に分けることはしません。",
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
