/**
 * Words for the airport departure map, in the four product languages. The
 * screen and the copied text both call these, so a number reads one way.
 *
 * The map counts aircraft departures by gate. It never says people, shoppers,
 * crowding or walking flow, and a destination is never a nationality.
 */
import type { DepartureMap, GroupRow, MapFlight, MapWindow } from "./airport-departure-map";
import { leadCouldFlip, sideLead, windowLabel } from "./airport-departure-map";
import type { DestinationGroup } from "./airport-destinations";

type Lang = "ko" | "en" | "zh" | "ja";
type Row = Record<Lang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });
const locale = { ko: "ko-KR", en: "en-US", zh: "zh-CN", ja: "ja-JP" } as const;
const num = (value: number, lang: Lang) => new Intl.NumberFormat(locale[lang]).format(value);
const unit = row("편", "", "班", "便");
const flights = (value: number, lang: Lang) => lang === "en" ? `${num(value, lang)} ${value === 1 ? "flight" : "flights"}` : `${num(value, lang)}${unit[lang]}`;

export const mapCopy = {
  title: row("공항 출발편 지도", "Airport departure map", "机场出发航班地图", "空港出発便マップ"),
  open: row("공항 출발편 지도 열기", "Open the departure map", "打开出发航班地图", "出発便マップを開く"),
  intro: row(
    "탑승구 위치에 출발 항공편 수를 표시한 배치도입니다. 사람 수, 보행 흐름, 매장 방문객이 아닙니다.",
    "A schematic of departing flights at their gates. It does not show people, walking flow or shop visitors.",
    "在登机口位置标出出发航班数的示意图。不是人数、人流或门店客流。",
    "搭乗口の位置に出発便の数を示した概略図です。人数、人の流れ、店舗の来店客ではありません。",
  ),
  loading: row("항공편 자료를 불러오는 중입니다.", "Loading the flight records.", "正在读取航班资料。", "便の資料を読み込んでいます。"),
  failed: row("항공편 자료를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.", "The flight records could not be loaded. Please try again shortly.", "未能读取航班资料，请稍后再试。", "便の資料を読み込めませんでした。しばらくしてからお試しください。"),
  empty: row("이 날짜·시간에 확인된 출발편이 없습니다.", "No departures are recorded for this date and time.", "该日期和时段没有已确认的出发航班。", "この日付・時間に確認された出発便はありません。"),
  time: row("시간", "Time", "时段", "時間"),
  presets: {
    DAY: row("하루 전체", "Whole day", "全天", "終日"),
    NEXT1: row("지금부터 1시간", "Next 1 hour", "此后1小时", "今から1時間"),
    NEXT3: row("3시간", "3 hours", "3小时", "3時間"),
    NEXT6: row("6시간", "6 hours", "6小时", "6時間"),
    CUSTOM: row("직접 선택", "Choose hours", "自选时段", "時間を選ぶ"),
  },
  from: row("시작", "From", "开始", "開始"),
  to: row("끝", "To", "结束", "終了"),
  scheduled: row("예정 출발 시각 기준, 분 단위", "By scheduled departure time, to the minute", "按计划出发时间，精确到分钟", "予定出発時刻基準、分単位"),
  nextDayMissing: row(
    "자정 이후 부분은 다음 날 자료가 아직 없어 포함하지 않았습니다.",
    "The part after midnight is not included: the next day's records are not available yet.",
    "午夜以后的部分因次日资料尚未提供而未计入。",
    "午前0時以降の部分は翌日の資料がまだないため含めていません。",
  ),
  nextDayCovered: row(
    "자정 이후 부분은 다음 날 자료(공식 출발 예정표 또는 운항 기록)로 이었습니다.",
    "The part after midnight uses the next day's records (official departure schedule or flight records).",
    "午夜以后的部分使用次日资料（官方出发时刻表或运行记录）。",
    "午前0時以降の部分は翌日の資料（公式出発予定表または運航記録）でつないでいます。",
  ),
  side: {
    EAST: row("동편", "East", "东侧", "東側"),
    WEST: row("서편", "West", "西侧", "西側"),
    CENTER: row("중앙", "Centre", "中央", "中央"),
    UNVERIFIED: row("위치 미확인", "Side not confirmed", "位置未确认", "位置未確認"),
  },
  concourse: row("탑승동", "Concourse", "登机楼", "搭乗棟"),
  building: { T1: row("T1 본관", "T1 main building", "T1主楼", "T1本館"), T2: row("T2", "T2", "T2", "T2"), CONCOURSE: row("탑승동", "Concourse", "登机楼", "搭乗棟") },
  unknownBuilding: row("건물 미확인", "Building unknown", "所在建筑未确认", "建物未確認"),
  axis: row("서편 ← → 동편 (업무용 구분)", "West ← → East (KORETAIL working split)", "西侧 ← → 东侧（业务划分）", "西側 ← → 東側（業務用区分）"),
  schematic: row(
    "공항 공식 지도 자료의 탑승구 좌표로 그린 KORETAIL 배치도입니다. 거리·동선·혼잡을 나타내지 않습니다.",
    "KORETAIL's own schematic, drawn from gate coordinates in the airport's official map data. It shows no distance, route or crowding.",
    "根据机场官方地图资料中的登机口位置制作的KORETAIL示意图，不表示距离、动线或拥挤。",
    "空港公式地図資料の搭乗口の位置をもとに作ったKORETAILの概略図です。距離・動線・混雑は示しません。",
  ),
  gate: row("탑승구", "Gate", "登机口", "搭乗口"),
  noFlightsAtGate: row("선택한 시간에 이 탑승구 출발편이 없습니다.", "No departures from this gate in the chosen time.", "所选时段该登机口没有出发航班。", "選んだ時間にこの搭乗口の出発便はありません。"),
  unplacedTitle: row("지도에 위치를 표시할 수 없는 출발편", "Departures that cannot be placed on the map", "无法在地图上标出位置的出发航班", "地図に位置を示せない出発便"),
  noGate: row("탑승구 미배정", "No gate yet", "尚未分配登机口", "搭乗口未割当"),
  notOnMap: row("공식 지도에 위치가 없는 탑승구", "Gate not on the official map", "官方地图上没有位置的登机口", "公式地図に位置がない搭乗口"),
  destinations: row("목적지 지역별", "By destination region", "按目的地区域", "行き先地域別"),
  destinationNote: (total: number, unknown: number, lang: Lang) => row(
    `비율은 선택 시간 출발편 ${num(total, "ko")}편 기준(목적지 지역 미확인 ${num(unknown, "ko")}편 포함). 동·서 비율과 분모가 다릅니다. 목적지는 탑승객 국적이 아닙니다.`,
    `Shares are of ${flights(total, "en")} in the chosen time (including ${num(unknown, "en")} with the region not confirmed), a different base from the east/west ratio. A destination is not the passengers' nationality.`,
    `比例以所选时段的 ${num(total, "zh")} 班出发航班为基数（含目的地区域未确认 ${num(unknown, "zh")} 班），与东西比例的基数不同。目的地不是旅客国籍。`,
    `比率は選んだ時間の出発便${num(total, "ja")}便が基準（行き先地域未確認${num(unknown, "ja")}便を含む）で、東西の比率とは基準が異なります。行き先は乗客の国籍ではありません。`,
  )[lang],
  filter: row("선택한 목적지만 보기", "Show only this region", "只看该区域", "この地域だけ表示"),
  clearFilter: row("전체 목적지", "All destinations", "全部目的地", "すべての行き先"),
  filtered: row("목적지 필터", "Destination filter", "所选目的地", "選んだ行き先"),
  holidayNote: row("공휴일(참고)", "public holiday (reference)", "公共假日（参考）", "祝日（参考）"),
  flightList: row("선택 시간 출발편 목록", "Departures in the chosen time", "所选时段的出发航班", "選んだ時間の出発便"),
  copy: row("이 선택 문구 복사", "Copy this selection", "复制此选择", "この選択をコピー"),
  copied: row("복사했습니다.", "Copied.", "已复制。", "コピーしました。"),
  copyFailed: row("복사하지 못했습니다. 아래 문구를 직접 선택해 주세요.", "Could not copy. Please select the text below.", "未能复制，请手动选择下方文字。", "コピーできませんでした。下の文を選択してください。"),
  basisCollected: row("운항 기록 기준", "From collected flight records", "依据运行记录", "運航記録基準"),
  basisSchedule: row("공식 출발 예정표 기준", "From the official departure schedule", "依据官方出发时刻表", "公式出発予定表基準"),
  collected: row("마지막 변경 수집", "last changed record", "最近变更的采集", "最終変更の収集"),
  notPeople: row("항공편 수이며 사람 수나 매장 방문객이 아닙니다.", "Counts of flights, not of people or shop visitors.", "为航班数，并非人数或门店客流。", "便数であり、人数や店舗の来店客ではありません。"),
  groups: {
    JP: row("일본", "Japan", "日本", "日本"),
    CN: row("중국(본토)", "Mainland China", "中国大陆", "中国本土"),
    HK_MO_TW: row("홍콩·마카오·대만", "Hong Kong, Macao, Taiwan", "港澳台", "香港・マカオ・台湾"),
    SEA: row("동남아시아", "Southeast Asia", "东南亚", "東南アジア"),
    ASIA_OTHER: row("기타 아시아", "Other Asia", "亚洲其他", "その他アジア"),
    MIDDLE_EAST: row("중동", "Middle East", "中东", "中東"),
    EUROPE: row("유럽", "Europe", "欧洲", "ヨーロッパ"),
    AMERICAS: row("미주", "Americas", "美洲", "米州"),
    OCEANIA: row("대양주·태평양", "Oceania & Pacific", "大洋洲及太平洋", "オセアニア・太平洋"),
    AFRICA: row("아프리카", "Africa", "非洲", "アフリカ"),
    DOMESTIC: row("국내", "Domestic", "韩国国内", "韓国国内"),
    UNKNOWN: row("목적지 지역 미확인", "Region not confirmed", "目的地区域未确认", "行き先地域未確認"),
  } as Record<DestinationGroup, Row>,
};

/** "동편 12편 · 서편 9편 · 중앙 1편 · 위치 미확인 3편 · 탑승동 4편" for the window. */
export function windowCountsLine(map: DepartureMap, lang: Lang): string {
  const parts = (["EAST", "WEST", "CENTER", "UNVERIFIED"] as const).map((side) => `${mapCopy.side[side][lang]} ${flights(map.sides[side], lang)}`);
  if (map.concourse !== null) parts.push(`${mapCopy.concourse[lang]} ${flights(map.concourse, lang)}`);
  if (map.unknownBuilding > 0) parts.push(`${mapCopy.unknownBuilding[lang]} ${flights(map.unknownBuilding, lang)}`);
  return parts.join(" · ");
}

/**
 * "확인된 항공편 기준 동편이 3편 더 많음", with the caution kept in the sentence
 * itself when the unconfirmed flights alone could reverse it.
 */
export function leadLine(map: DepartureMap, lang: Lang): string {
  if (map.sides.total === 0 && map.unknownBuilding > 0) return row(
    `터미널 미확인 출발 예정 ${flights(map.unknownBuilding, "ko")} · 선택 터미널 배정 확인 중`,
    `${flights(map.unknownBuilding, "en")} scheduled with an unconfirmed terminal · selected-terminal assignment pending`,
    `航站楼待确认的计划出发 ${flights(map.unknownBuilding, "zh")} · 所选航站楼归属待确认`,
    `ターミナル未確認の出発予定${flights(map.unknownBuilding, "ja")} · 選択ターミナルへの割当未確認`,
  )[lang];
  const lead = sideLead(map.sides);
  if (!lead) return row("동·서 위치가 확인된 출발편이 없어 비교하지 않습니다.", "No departure has a confirmed side, so no comparison is made.", "没有东西位置已确认的出发航班，因此不作比较。", "東西の位置が確認できた出発便がないため比較しません。")[lang];
  const basis = row("확인된 항공편 기준", "Among confirmed flights", "按已确认的航班", "確認できた便の基準で");
  const body = lead.larger === "EQUAL"
    ? row("동편과 서편이 같음", "east and west are equal", "东西相同", "東西は同数")[lang]
    : row(
      `${mapCopy.side[lead.larger].ko}이 ${num(lead.by, "ko")}편 더 많음`,
      `${lead.larger === "EAST" ? "east" : "west"} has ${flights(lead.by, "en")} more`,
      `${mapCopy.side[lead.larger].zh}多 ${num(lead.by, "zh")} 班`,
      `${mapCopy.side[lead.larger].ja}が${num(lead.by, "ja")}便多い`,
    )[lang];
  const caution = leadCouldFlip(map.sides)
    ? row(
      ` (위치 미확인 ${num(map.sides.UNVERIFIED, "ko")}편에 따라 달라질 수 있음)`,
      ` (the ${num(map.sides.UNVERIFIED, "en")} with an unconfirmed side could change this)`,
      `（可能因位置未确认的 ${num(map.sides.UNVERIFIED, "zh")} 班而改变）`,
      `（位置未確認の${num(map.sides.UNVERIFIED, "ja")}便によって変わり得る）`,
    )[lang]
    : "";
  return lang === "en" ? `${basis.en}, ${body}${caution}` : `${basis[lang]} ${body}${caution}`;
}

export function windowText(window: MapWindow, lang: Lang): string {
  const label = windowLabel(window);
  return window.startMin === 0 && window.endMin === 1440 ? `${mapCopy.presets.DAY[lang]} (${label})` : label;
}

export function groupShare(row: GroupRow, total: number): number | null {
  return total > 0 ? Math.round((row.flights * 1000) / total) / 10 : null;
}

/** "일본 42편(31.1%) · 중국(본토) 20편(14.8%) · …" */
export function groupsLine(map: DepartureMap, lang: Lang): string {
  const total = map.flights.length;
  return map.groups.map((group) => {
    const share = groupShare(group, total);
    return `${mapCopy.groups[group.group][lang]} ${flights(group.flights, lang)}${share === null ? "" : ` (${share}%)`}`;
  }).join(" · ");
}

const STATUS: Record<string, Row> = {
  scheduled: row("예정", "scheduled", "计划", "予定"),
  on_time: row("정상", "on time", "正常", "定刻"),
  delayed: row("지연", "delayed", "延误", "遅延"),
  cancelled: row("결항", "cancelled", "取消", "欠航"),
};

/** The flight's stored status in words; anything else reads "status not confirmed". */
export function statusText(status: string, lang: Lang): string {
  return (STATUS[status] ?? row("상태 미확인", "status not confirmed", "状态未确认", "状態未確認"))[lang];
}

export function flightLine(flight: MapFlight, lang: Lang): string {
  const time = flight.scheduledAt.slice(11, 16);
  const destination = flight.destination ? (lang === "ko" ? flight.destination.name : flight.destination.en) : flight.destinationCode ?? "—";
  const place = flight.gate ? `${mapCopy.gate[lang]} ${flight.gate}` : mapCopy.noGate[lang];
  return `${time}${flight.day === "NEXT_DAY" ? " (+1)" : ""} ${flight.flightNumber} → ${destination} · ${place}`;
}

/** The copied text: date, terminal, window, filter, counts, lead, destinations, what could not be placed, and the limit. */
export function mapShareText(map: DepartureMap, input: { date: string; filter: DestinationGroup | null; basis: string; url: string }, lang: Lang): string {
  const lines = [
    `KORETAIL · ${mapCopy.title[lang]} · ${input.date} ${map.terminal} · ${windowText(map.window, lang)}`,
    windowCountsLine(map, lang),
    leadLine(map, lang),
    `${mapCopy.destinations[lang]}: ${groupsLine(map, lang) || "—"}`,
  ];
  if (input.filter) lines.push(`${mapCopy.filtered[lang]}: ${mapCopy.groups[input.filter][lang]}`);
  const unplaced = map.unplaced.noGate.length + map.unplaced.notOnMap.length;
  if (unplaced) lines.push(`${mapCopy.unplacedTitle[lang]}: ${flights(unplaced, lang)} (${mapCopy.noGate[lang]} ${flights(map.unplaced.noGate.length, lang)} · ${mapCopy.notOnMap[lang]} ${flights(map.unplaced.notOnMap.length, lang)})`);
  if (map.nextDay === "MISSING") lines.push(mapCopy.nextDayMissing[lang]);
  lines.push(`${input.basis} · ${mapCopy.notPeople[lang]}`);
  lines.push(input.url);
  return lines.join("\n");
}
