import { holidayComparisonCopy } from './holiday-comparison-copy';
import { localHolidayName } from './holiday-calendar';
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

export function shortDayLabel(day:string,reference:string,lang:Lang):string {
 if(lang==='ko'){
  const weekday=new Intl.DateTimeFormat(locale.ko,{timeZone:'Asia/Seoul',weekday:'short'}).format(new Date(day+'T12:00:00+09:00'));
  return `${day.slice(0,4)!==reference.slice(0,4)?Number(day.slice(0,4))+'년 ':''}${Number(day.slice(5,7))}월 ${Number(day.slice(8,10))}일(${weekday})`;
 }
 return new Intl.DateTimeFormat(locale[lang],{timeZone:'Asia/Seoul',...(day.slice(0,4)!==reference.slice(0,4)?{year:'numeric' as const}:{}),month:'numeric',day:'numeric',weekday:'short'}).format(new Date(day+'T12:00:00+09:00'));
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
  conciseSimilarTitle:row('오늘과 비슷한 항공편 구성','Flight mixes similar to today','与今天相似的航班构成','今日と似た便の構成'),
  selectedSimilarTitle:row('선택일과 비슷한 항공편 구성','Flight mixes similar to the selected date','与所选日期相似的航班构成','選択日と似た便の構成'),
  conciseCompare:row('자세히 비교','Compare details','详细比较','詳しく比較'),
  incomplete: row("항공편 기록이 일부만 도착해 날짜를 비교할 수 없습니다.", "Flight records are incomplete, so these dates cannot be compared.", "航班记录尚未完整，无法比较这些日期。", "便の記録が一部しか届いていないため、日付を比較できません。"),
  noAlike: row("큰 공통점 없음", "No strong match", "没有明显的相同点", "目立つ共通点なし"),
  noDiffer: row("두드러진 차이 없음", "No notable difference", "没有明显差异", "目立つ違いなし"),
  missingComparison: row("자료가 없어 비교에서 제외", "Excluded because data is unavailable", "因资料缺失未纳入比较", "資料がないため比較から除外"),
  holidayEvidence: row("중국·일본 공휴일 자료", "China/Japan holiday records", "中国和日本的节假日资料", "中国・日本の祝日資料"),
  similarScope: (selected: string, from: string | null, to: string | null, count: number, lang: Lang) => {
    const date = dayLabel(selected, lang);
    if (!from || !to) return row(
      `선택일 ${date} · 비교 가능한 과거 기록이 없습니다.`,
      `Selected ${date} · no comparable past records.`,
      `所选日期 ${date} · 没有可比较的历史记录。`,
      `選択日 ${date} · 比較できる過去の記録はありません。`,
    )[lang];
    return row(
      `선택일 ${date} · 과거 기록 ${from}~${to} 중 비교 가능한 ${count}일을 출발편 수와 시간대 분포 등으로 비교했습니다. 같은 요일만 고른 것은 아닙니다.`,
      `Selected ${date} · ${count} comparable days from ${from} to ${to}, ranked by flight counts, hourly spread and other available signals. The days need not share a weekday.`,
      `所选日期 ${date} · 比较 ${from} 至 ${to} 之间 ${count} 天可用记录的航班数、时段分布等；不只选同一星期。`,
      `選択日 ${date} · ${from}〜${to}の比較可能な${count}日を便数・時間帯の分布などで比較しました。同じ曜日だけを選んだものではありません。`,
    )[lang];
  },
  radarTitle: row("오늘 달라진 것", "What is different today", "今天的不同之处", "今日違うこと"),
  similarTitle: row("오늘과 조건이 가까운 과거 날짜", "Days with conditions like today", "条件与今天相近的日子", "今日と条件が近かった日"),
  loading: row("과거 기록과 비교하는 중입니다.", "Comparing with past records.", "正在与过去的记录比较。", "過去の記録と比べています。"),
  failed: row("과거 기록을 불러오지 못해 비교하지 않았습니다.", "Past records could not be loaded, so nothing is compared.", "未能读取过去的记录，因此不作比较。", "過去の記録を読み込めなかったため比較していません。"),
  noCurrent: row("이 날짜의 항공편 기록을 확인하지 못해 비교할 수 없습니다.", "No flight record is confirmed for this date, so it cannot be compared.", "未能确认该日期的航班记录，因此无法比较。", "この日付の便の記録を確認できないため、比較できません。"),
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
    "비교 점수는 출발편 수 차이, 시간대 분포, 동편 비중(같은 게이트 위치표일 때), 목적지 지역 구성의 차이를 같은 비중으로 합칩니다. 요일 일치 여부와 두 나라 중 한 곳이라도 공식 공휴일인지 여부는 각각 절반 비중입니다. 확인된 공휴일 차이는 나라·날짜·휴일명으로 표시합니다. 자료가 없는 항목은 점수에서 제외하며, 점수는 날짜 순위용이지 예측 정확도가 아닙니다.",
    "The ranking combines differences in flight count, hourly spread, east share (only with the same gate table) and destination mix at equal weight. Weekday match and whether either China or Japan has an official holiday each carry half weight. A confirmed holiday difference names the country, date and holiday. Missing data is omitted; the score ranks past days and is not predictive accuracy.",
    "排序同等计入航班数、时段分布、东侧比例（仅限相同登机口位置表）和目的地区域构成的差异。星期是否相同，以及中国或日本是否至少一国为官方假日，各按一半权重计算。已确认的假日差异会注明国家、日期和名称。缺失资料不计入；分数只用于排序，并非预测准确率。",
    "順位には便数、時間帯の分布、東側の割合（同じゲート位置表の場合）、行き先地域の構成差を同じ重みで使います。曜日の一致と、中国か日本のどちらかが公式の祝日かどうかは、それぞれ半分の重みです。確認できた祝日の違いは国・日付・名称を示します。欠けた資料は除き、点数は順位用で予測精度ではありません。",
  ),
  similarNone: (n: number, lang: Lang) => row(
    `비교 가능한 과거 날짜가 ${n}일이라 가까운 날을 표시할 수 없습니다.`,
    `No similar day can be shown: ${n} comparable past day(s).`,
    `无法显示相近日期：可比较的历史记录为 ${n} 天。`,
    `近い日を表示できません。比較可能な過去の記録は${n}日です。`,
  )[lang],
  similarLabel: row("가까운 날", "Similar day", "相近的日子", "近かった日"),
  alike: row("가까운 날로 고른 이유", "Why this day is similar", "与这天相似的原因", "この日と似ている理由"),
  differ: row("다른 점", "Different", "不同之处", "違う点"),
  busiest: row("그날 기록에서 가장 많은 출발 시간대", "Busiest departure hour in that day's record", "当天记录中出发航班最多的时段", "その日の記録で最も出発便が多い時間帯"),
  compareTable: row("비교표와 시간대 분포 보기", "Open the comparison and hourly spread", "查看比较表和时段分布", "比較表と時間帯分布を見る"),
  today: row("오늘", "Today", "今天", "今日"),
  thatDay: row("그날", "That day", "当天", "その日"),
  rows: {
    total: row("출발편 수", "Departures", "出发航班数", "出発便数"),
    east: row("동편 비중(확인된 항공편 기준)", "East share (confirmed flights)", "东侧比例（按已确认航班）", "東側比率（確認できた便基準）"),
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
  const range = s.min===s.max ? unit(s.min) : `${unit(s.min)}–${unit(s.max)}`;
  const more = s.verdict === "ABOVE";
  const difference=more?s.value-s.max:s.min-s.value;
  return row(
    `${label} · 과거 같은 요일 ${n}일 ${range} · 오늘 ${unit(s.value)}, ${unit(difference)} ${more?'많음':'적음'}`,
    `${label} · ${n} stored same-weekday day(s): ${range} · today ${unit(s.value)}, ${unit(difference)} ${more?'above':'below'} that range`,
    `${label} · 已有同星期${n}天 ${range} · 今天${unit(s.value)}，${more?'多':'少'}${unit(difference)}`,
    `${label}・保存済み同曜日${n}日 ${range}・今日${unit(s.value)}、${unit(difference)}${more?'多い':'少ない'}`,
  )[lang];
}

export function radarLine(item: RadarItem, terminal: string, lang: Lang, checkedClock: (iso: string) => string, selectedDay?: string): string {
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
      return `${selectedDay ? `${dayLabel(selectedDay, lang)} · ` : ''}${(dayCopy.country[item.country] ?? row(item.country, item.country, item.country, item.country))[lang]} ${item.country === 'CN' || item.country === 'JP' ? localHolidayName(item.name, lang, item.country) : item.name} · ${dayCopy.holidayRef[lang]}`;
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
  const detail = (name: SimilarDay["components"][number]["name"], alike: boolean) => {
    if (name === "HOLIDAY") return holidayComparisonCopy(current.day, item.day.day, lang);
    const label = dayCopy.component[name][lang];
    if (name === "WEEKDAY") return `${label}(${dayLabel(current.day, lang)} / ${dayLabel(item.day.day, lang)})`;
    if (name === "TOTAL") return `${label}(${current.day} ${num(current.total, lang)} · ${item.day.day} ${num(item.day.total, lang)})`;
    if (name === "EAST_SHARE") {const same=eastShare(current)===eastShare(item.day);return row(`동편 출발 비율이 ${same?'같아요':alike?'차이가 작아요':'달라요'}: ${current.day} ${share(current)} · ${item.day.day} ${share(item.day)}`,`East departure shares are ${same?'equal':alike?'similar':'different'}: ${current.day} ${share(current)} · ${item.day.day} ${share(item.day)}`,`东侧出发比例${same?'相同':alike?'相近':'不同'}：${current.day} ${share(current)} · ${item.day.day} ${share(item.day)}`,`東側出発割合が${same?'同じ':alike?'近い':'異なります'}：${current.day} ${share(current)}・${item.day.day} ${share(item.day)}`)[lang];}
    if (name === "DESTINATIONS") return alike ? row('목적지 지역 구성이 가까워요','Flights depart to similar regions','前往相似地区','似た地域へ出発しています')[lang] : row('출발 목적지의 지역 구성이 달라요','The destination-region mix differs','目的地区域构成不同','行き先地域の構成が異なります')[lang];
    if (name === "HOURS") return alike ? row('항공편이 몰리는 시간대가 가까워요','Flights cluster at similar hours','航班集中的时段相近','便が集中する時間帯が似ています')[lang] : row('항공편이 몰리는 시간대가 달라요','Flights cluster at different hours','航班集中的时段不同','便が集中する時間帯が異なります')[lang];
    return label;
  };
  const sorted = [...item.components].sort((a, b) => a.distance - b.distance);
  // Measured parts first: a shared weekday or holiday status is listed after them.
  const calendar = (name: string) => name === "WEEKDAY" || name === "HOLIDAY";
  const alike = sorted.filter((component) => component.distance <= 0.15 && component.name !== "HOLIDAY")
    .sort((a, b) => Number(calendar(a.name)) - Number(calendar(b.name)) || a.distance - b.distance).slice(0, 3);
  const differ = [...sorted].reverse().filter((component) => component.distance > 0.15).slice(0, 2);
  const peak = busiestHour(item.day);
  return {
    alike: alike.length ? alike.map((component) => detail(component.name, true)).join(", ") : dayCopy.noAlike[lang],
    differ: differ.length ? differ.map((component) => detail(component.name, false)).join(", ") : dayCopy.noDiffer[lang],
    busiest: peak ? `${hourSpan(peak.hour, lang)} ${fl(peak.flights, lang)}` : null,
  };
}

export function topGroups(day: TerminalDay, lang: Lang): string {
  return Object.entries(day.groups).filter(([group]) => group !== "UNKNOWN").sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3)
    .map(([group, count]) => `${GROUP[group as DestinationGroup][lang]} ${fl(count ?? 0, lang)}`).join(" · ") || "—";
}

export { hourSpan as dayHourSpan, share as dayEastShare };
/** At most three measured facts. Unknown destinations never prove a match. */
export function similarHighlights(item:SimilarDay,current:TerminalDay,lang:Lang) {
 const has=(name:SimilarDay['components'][number]['name'])=>item.components.find(component=>component.name===name);
 const facts:Array<{label:string;current:string;previous:string}|{text:string}>=[];
 if(has('TOTAL'))facts.push({label:dayCopy.rows.total[lang],current:fl(current.total,lang),previous:fl(item.day.total,lang)});
 if(has('EAST_SHARE')&&item.day.sidesVersion===current.sidesVersion&&eastShare(current)!==null&&eastShare(item.day)!==null)
  facts.push({label:row('동편 비중','East share','东侧占比','東側割合')[lang],current:share(current),previous:share(item.day)});
 const known=(day:TerminalDay)=>Object.entries(day.groups).filter(([key])=>key!=='UNKNOWN').reduce((sum,[,count])=>sum+(count??0),0);
 if((has('DESTINATIONS')?.distance??1)<=.15&&known(current)>0&&known(item.day)>0)
  facts.push({text:row('확인된 목적지 지역 구성도 비슷','Known destination-region mix is also similar','已确认目的地区域构成也相近','確認できた目的地地域の構成も似ています')[lang]});
 else if((has('HOURS')?.distance??1)<=.15)facts.push({text:row('시간대별 출발편 분포도 비슷','Hourly departure mix is also similar','各小时出发航班分布也相近','時間帯別の出発便分布も似ています')[lang]});
 return facts.slice(0,3);
}
