/**
 * Words for "what is different today" and "days like today" (four languages).
 * Every sentence says what was compared with what, and how many days; none
 * says why, and a destination is never a nationality or a sales signal.
 */
import type { RadarItem, SimilarDay, Standing, TerminalDay } from "./airport-day-compare";
import { busiestHour, eastShare } from "./airport-day-compare";
import type { DestinationGroup } from "./airport-destinations";

type Lang = "ko" | "en" | "zh" | "ja";
type Row = Record<Lang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });
const locale = { ko: "ko-KR", en: "en-US", zh: "zh-CN", ja: "ja-JP" } as const;
const num = (value: number, lang: Lang) => new Intl.NumberFormat(locale[lang], { maximumFractionDigits: 1 }).format(value);
const fl = (value: number, lang: Lang) => lang === "en" ? `${num(value, lang)} ${value === 1 ? "flight" : "flights"}` : `${num(value, lang)}${({ ko: "편", zh: "班", ja: "便" } as const)[lang]}`;
const hourSpan = (hour: number, lang: Lang) => lang === "en" ? `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00` : `${String(hour).padStart(2, "0")}–${String(hour + 1).padStart(2, "0")}${({ ko: "시", zh: "时", ja: "時" } as const)[lang]}`;

export function dayLabel(day: string, lang: Lang): string {
  const weekday = new Intl.DateTimeFormat(locale[lang], { weekday: "short", timeZone: "Asia/Seoul" }).format(new Date(`${day}T12:00:00+09:00`));
  return `${day} (${weekday})`;
}

const GROUP: Record<DestinationGroup, Row> = {
  JP: row("일본행", "To Japan", "飞往日本", "日本行き"),
  CN: row("중국(본토)행", "To mainland China", "飞往中国大陆", "中国本土行き"),
  HK_MO_TW: row("홍콩·마카오·대만행", "To Hong Kong, Macao, Taiwan", "飞往港澳台", "香港・マカオ・台湾行き"),
  SEA: row("동남아시아행", "To Southeast Asia", "飞往东南亚", "東南アジア行き"),
  ASIA_OTHER: row("기타 아시아행", "To other Asia", "飞往亚洲其他地区", "その他アジア行き"),
  MIDDLE_EAST: row("중동행", "To the Middle East", "飞往中东", "中東行き"),
  EUROPE: row("유럽행", "To Europe", "飞往欧洲", "ヨーロッパ行き"),
  AMERICAS: row("미주행", "To the Americas", "飞往美洲", "米州行き"),
  OCEANIA: row("대양주·태평양행", "To Oceania & Pacific", "飞往大洋洲及太平洋", "オセアニア・太平洋行き"),
  AFRICA: row("아프리카행", "To Africa", "飞往非洲", "アフリカ行き"),
  DOMESTIC: row("국내행", "Domestic legs", "韩国国内航段", "韓国国内行き"),
  UNKNOWN: row("목적지 지역 미확인", "Region not confirmed", "目的地区域未确认", "行き先地域未確認"),
};

export const dayCopy = {
  radarTitle: row("오늘 달라진 것", "What is different today", "今天的不同之处", "今日違うこと"),
  similarTitle: row("오늘과 조건이 가까운 과거 날짜", "Days with conditions like today", "条件与今天相近的日子", "今日と条件が近かった日"),
  loading: row("과거 기록과 비교하는 중입니다.", "Comparing with past records.", "正在与过去的记录比较。", "過去の記録と比べています。"),
  failed: row("과거 기록을 불러오지 못해 비교하지 않았습니다.", "Past records could not be loaded, so nothing is compared.", "未能读取过去的记录，因此不作比较。", "過去の記録を読み込めなかったため比較していません。"),
  noCurrent: row("이 날짜의 출발편 기록이 아직 없어 비교하지 않습니다.", "No departures are recorded for this date yet, so nothing is compared.", "该日期尚无出发航班记录，因此不作比较。", "この日付の出発便記録がまだないため比較しません。"),
  noHistory: (stored: number, lang: Lang) => row(
    `비교할 과거 기록이 부족합니다(완료된 날 ${stored}일). 날마다 쌓이면 비교가 시작됩니다.`,
    `Not enough past records to compare (${stored} complete day(s)). Comparison starts as days accumulate.`,
    `可比较的过去记录不足（已完成 ${stored} 天）。随着天数累积将开始比较。`,
    `比べられる過去の記録が足りません（完了した日 ${stored}日）。日ごとに蓄積されると比較が始まります。`,
  )[lang],
  withinRange: (n: number, lang: Lang) => row(
    `같은 요일 ${n}일과 비교해 범위를 벗어난 값은 없습니다.`,
    `Nothing is outside the range of the same weekday on ${n} day(s).`,
    `与同一星期几的 ${n} 天相比，没有超出范围的值。`,
    `同じ曜日の${n}日と比べて範囲を外れた値はありません。`,
  )[lang],
  evidence: row("비교 근거", "How this was compared", "比较依据", "比較の根拠"),
  rule: row(
    "선택 규칙: ① 같은 요일(최근 8주, 완료된 날)의 범위를 벗어난 값, 벗어난 정도가 큰 순 ② 이 기기에서 지난번 확인한 뒤 달라진 값 ③ 중국·일본 공식 공휴일(참고) ④ 오늘 기록 안에서 가장 많은 시간대. 최대 3개. 범위 안의 값은 표시하지 않습니다.",
    "Rule: (1) values outside the same-weekday range (last 8 weeks, complete days), largest gap first; (2) values that changed since this device last looked; (3) official CN/JP holidays (reference); (4) the busiest hour in today's own record. At most 3. Values inside the range are not listed.",
    "选择规则：① 超出同一星期几（最近8周、已完成的日子）范围的值，偏离大的优先 ② 本设备上次查看后发生变化的值 ③ 中国、日本官方公共假日（参考）④ 今天记录中最多的时段。最多3项。范围内的值不列出。",
    "選び方：① 同じ曜日（直近8週、完了した日）の範囲を外れた値、外れ方の大きい順 ② この端末で前回確認した後に変わった値 ③ 中国・日本の公式祝日（参考）④ 今日の記録の中で最も多い時間帯。最大3件。範囲内の値は載せません。",
  ),
  basis: row(
    "운항 기록 기준 · 공동운항은 1편, 취소편 제외 · T1은 탑승동 포함 · 동·서 비중은 확인된 항공편만, 같은 위치표로 분류된 날끼리만 비교 · 항공편 수이며 사람 수·매출이 아닙니다.",
    "From flight records · codeshares once, cancelled excluded · T1 includes the concourse · east/west share of confirmed flights only, compared only between days classified with the same gate table · counts of flights, not people or sales.",
    "依据运行记录 · 代码共享航班计1班，不含取消航班 · T1含登机楼 · 东西比例仅按已确认航班，且只在使用同一位置表分类的日子之间比较 · 为航班数，不是人数或销售额。",
    "運航記録基準 · 共同運航は1便、欠航便は除外 · T1は搭乗棟を含む · 東西の比率は確認できた便のみ、同じ位置表で分類した日どうしだけを比較 · 便数であり、人数や売上ではありません。",
  ),
  similarNote: row(
    "과거 조건이 가까운 날이 있다고 해서 오늘 같은 일이 일어난다는 뜻은 아닙니다. 항공편 분포의 비교이며 매장 혼잡이나 매출이 아닙니다.",
    "Being similar in the past does not mean the same will happen today. This compares flight patterns, not shop crowding or sales.",
    "过去相近并不意味着今天会发生同样的事。这是航班分布的比较，不是门店拥挤或销售额。",
    "過去に近かったからといって今日も同じことが起きるわけではありません。便の分布の比較であり、店舗の混雑や売上ではありません。",
  ),
  similarRule: row(
    "비교 항목(각 0~1): 출발편 수 차이 비율, 시간대 분포 차이, 동편 비중 차이(같은 위치표일 때), 목적지 지역 구성 차이는 같은 비중, 요일 같음 여부와 중국·일본 공휴일 여부는 절반 비중. 비교할 수 없는 항목은 0으로 채우지 않고 제외합니다. 점수는 순서를 정하는 데만 쓰며 정확도가 아닙니다.",
    "Compared (each 0–1): relative difference in departures, difference in hourly spread, difference in east share (same gate table) and difference in destination mix at equal weight; same weekday or not and CN/JP holiday or not at half weight. What cannot be compared is left out, never filled with 0. The number only orders the days; it is not an accuracy.",
    "比较项目（各0~1）：出发航班数的差异比例、时段分布差异、东侧比例差异（同一位置表时）、目的地区域构成差异权重相同；是否同一星期几、是否中国或日本公共假日为一半权重。无法比较的项目不以0填补而是剔除。分数只用于排序，并非准确度。",
    "比較項目（各0〜1）：出発便数の差の割合、時間帯分布の差、東側比率の差（同じ位置表のとき）、行き先地域の構成の差は同じ重み、同じ曜日かどうかと中国・日本の祝日かどうかは半分の重み。比べられない項目は0で埋めずに除きます。数値は順番を決めるためだけのもので、精度ではありません。",
  ),
  similarNone: (n: number, lang: Lang) => row(
    `비교할 수 있는 완료된 과거 날짜가 ${n}일이라 가까운 날을 고르지 않았습니다.`,
    `Only ${n} complete past day(s) can be compared, so no similar day is chosen.`,
    `可比较的已完成过去日期只有 ${n} 天，因此未选出相近的日子。`,
    `比べられる完了した過去の日付が${n}日のため、近い日は選んでいません。`,
  )[lang],
  similarLabel: row("가까운 날", "Similar day", "相近的日子", "近かった日"),
  alike: row("가까운 점", "Alike", "相近之处", "近い点"),
  differ: row("다른 점", "Different", "不同之处", "違う点"),
  busiest: row("그날 기록에서 가장 많은 출발 시간대", "Busiest departure hour in that day's record", "当天记录中出发航班最多的时段", "その日の記録で最も出発便が多い時間帯"),
  compareTable: row("비교표와 시간대 분포 보기", "Open the comparison and hourly spread", "查看比较表和时段分布", "比較表と時間帯分布を見る"),
  today: row("오늘", "Today", "今天", "今日"),
  thatDay: row("그날", "That day", "当天", "その日"),
  rows: {
    total: row("출발편 수", "Departures", "出发航班数", "出発便数"),
    east: row("동편 비중(탑승구가 정해진 출발편 기준)", "East share (departures with a gate)", "东侧比例（按已分配登机口的出发航班）", "東側比率（搭乗口が決まった出発便基準）"),
    peak: row("가장 많은 시간대", "Busiest hour", "最多时段", "最も多い時間帯"),
    groups: row("목적지 지역 상위", "Top destination regions", "主要目的地区域", "上位の行き先地域"),
  },
  component: {
    TOTAL: row("출발편 수", "departures", "出发航班数", "出発便数"),
    HOURS: row("시간대 분포", "hourly spread", "时段分布", "時間帯分布"),
    EAST_SHARE: row("동편 비중", "east share", "东侧比例", "東側比率"),
    DESTINATIONS: row("목적지 지역 구성", "destination mix", "目的地区域构成", "行き先地域の構成"),
    WEEKDAY: row("요일", "weekday", "星期几", "曜日"),
    HOLIDAY: row("중국·일본 공휴일 여부", "CN/JP holiday", "中国日本公共假日", "中国・日本の祝日かどうか"),
  },
  holidayRef: row("공휴일(참고, 항공편 수와의 관계는 계산하지 않음)", "public holiday (reference; its link to flight numbers is not calculated)", "公共假日（参考，未计算与航班数的关系）", "祝日（参考、便数との関連は計算していません）"),
  country: { CN: row("중국", "China", "中国", "中国"), JP: row("일본", "Japan", "日本", "日本") } as Record<string, Row>,
};

function standingSentence(label: string, s: Standing, unit: (value: number) => string, lang: Lang, n: number): string {
  const range = `${unit(s.min)}–${unit(s.max)}`;
  const more = s.verdict === "ABOVE";
  if (s.usual) {
    return row(
      `${label} ${unit(s.value)}: 평소(같은 요일 최근 ${n}일, ${range})보다 ${more ? "많음" : "적음"}`,
      `${label} ${unit(s.value)}: ${more ? "above" : "below"} the usual range (same weekday, last ${n} days: ${range})`,
      `${label} ${unit(s.value)}：${more ? "高于" : "低于"}平时（同一星期几最近 ${n} 天：${range}）`,
      `${label} ${unit(s.value)}：いつも（同じ曜日の直近${n}日：${range}）より${more ? "多い" : "少ない"}`,
    )[lang];
  }
  return row(
    `${label} ${unit(s.value)}: 확인된 같은 요일 ${n}일과 오늘 중 ${s.rank}번째로 많음 (${range})`,
    `${label} ${unit(s.value)}: ranks ${s.rank} of ${s.of} among today and the ${n} confirmed same-weekday day(s) (${range})`,
    `${label} ${unit(s.value)}：在今天与已确认的同一星期几 ${n} 天中排第 ${s.rank} 多（${range}）`,
    `${label} ${unit(s.value)}：今日と確認できた同じ曜日${n}日の中で${s.rank}番目に多い（${range}）`,
  )[lang];
}

export function radarLine(item: RadarItem, terminal: string, lang: Lang, checkedClock: (iso: string) => string): string {
  switch (item.kind) {
    case "WEEKDAY_TOTAL":
      return standingSentence(`${terminal} ${dayCopy.rows.total[lang]}`, item.standing, (value) => fl(value, lang), lang, item.days.length);
    case "WEEKDAY_EAST_SHARE":
      return standingSentence(dayCopy.rows.east[lang], item.standing, (value) => `${num(value, lang)}%`, lang, item.days.length);
    case "WEEKDAY_GROUP":
      return standingSentence(GROUP[item.group][lang], item.standing, (value) => fl(value, lang), lang, item.days.length);
    case "SINCE_LAST": {
      const what = (key: string) => key === "TOTAL" ? dayCopy.rows.total[lang] : key === "EAST" ? row("동편", "East", "东侧", "東側")[lang] : key === "WEST" ? row("서편", "West", "西侧", "西側")[lang] : GROUP[key as DestinationGroup][lang];
      const list = item.changes.map((change) => `${what(change.what)} ${num(change.before, lang)}→${num(change.after, lang)}`).join(", ");
      return row(`이 기기에서 지난번 확인(${checkedClock(item.checkedAt)}) 이후 달라진 값: ${list}`, `Changed since this device last looked (${checkedClock(item.checkedAt)}): ${list}`, `本设备上次查看（${checkedClock(item.checkedAt)}）后变化的值：${list}`, `この端末で前回確認（${checkedClock(item.checkedAt)}）した後に変わった値：${list}`)[lang];
    }
    case "HOLIDAY":
      return `${(dayCopy.country[item.country] ?? row(item.country, item.country, item.country, item.country))[lang]} ${item.name} · ${dayCopy.holidayRef[lang]}`;
    case "WITHIN_DAY_PEAK":
      return row(
        `오늘 기록에서 가장 많은 출발 시간대: ${hourSpan(item.hour, lang)} ${fl(item.flights, lang)} (오늘 안에서의 비교)`,
        `Busiest departure hour in today's record: ${hourSpan(item.hour, lang)}, ${fl(item.flights, lang)} (within today only)`,
        `今天记录中出发航班最多的时段：${hourSpan(item.hour, lang)} ${fl(item.flights, lang)}（仅在今天之内比较）`,
        `今日の記録で最も出発便が多い時間帯：${hourSpan(item.hour, lang)} ${fl(item.flights, lang)}（今日の中での比較）`,
      )[lang];
  }
}

const share = (day: TerminalDay) => {
  const value = eastShare(day);
  return value === null ? "—" : `${Math.round(value * 100)}%`;
};

/** "가까운 점: 출발편 수(오늘 575 · 그날 580), 시간대 분포" / "다른 점: …" */
export function similarLines(item: SimilarDay, current: TerminalDay, lang: Lang): { alike: string; differ: string; busiest: string | null } {
  const detail = (name: SimilarDay["components"][number]["name"]) => {
    const label = dayCopy.component[name][lang];
    if (name === "TOTAL") return `${label}(${dayCopy.today[lang]} ${num(current.total, lang)} · ${dayCopy.thatDay[lang]} ${num(item.day.total, lang)})`;
    if (name === "EAST_SHARE") return `${label}(${dayCopy.today[lang]} ${share(current)} · ${dayCopy.thatDay[lang]} ${share(item.day)})`;
    return label;
  };
  const sorted = [...item.components].sort((a, b) => a.distance - b.distance);
  // Measured parts first: a shared weekday or holiday status is listed after them.
  const calendar = (name: string) => name === "WEEKDAY" || name === "HOLIDAY";
  const alike = sorted.filter((component) => component.distance <= 0.15)
    .sort((a, b) => Number(calendar(a.name)) - Number(calendar(b.name)) || a.distance - b.distance).slice(0, 3);
  const differ = [...sorted].reverse().filter((component) => component.distance > 0.15).slice(0, 2);
  const peak = busiestHour(item.day);
  return {
    alike: alike.length ? alike.map((component) => detail(component.name)).join(", ") : "—",
    differ: differ.length ? differ.map((component) => detail(component.name)).join(", ") : "—",
    busiest: peak ? `${hourSpan(peak.hour, lang)} ${fl(peak.flights, lang)}` : null,
  };
}

export function topGroups(day: TerminalDay, lang: Lang): string {
  return Object.entries(day.groups).filter(([group]) => group !== "UNKNOWN").sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3)
    .map(([group, count]) => `${GROUP[group as DestinationGroup][lang]} ${fl(count ?? 0, lang)}`).join(" · ") || "—";
}

export { hourSpan as dayHourSpan, share as dayEastShare };
