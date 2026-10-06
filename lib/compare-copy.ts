/**
 * Words for "compared with usual" and "since you last looked", in the four
 * product languages. Ranges stay ranges: nothing here states a percentage.
 */
import type { CheckChange } from "./last-check";
import type { UsualComparison } from "./usual-comparison";
import { actionText, levelName, prepTime, type PrepLang } from "./business-prep-copy";

type Row = Record<PrepLang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });

export const compareCopy = {
  noData: row("비교 자료 없음", "No comparison data", "无比较资料", "比較資料なし"),
  loadFailed: row("불러오기 실패", "Could not load", "加载失败", "読み込み失敗"),
  usualTitle: row("평소와 비교", "Compared with usual", "与平常相比", "普段との比較"),
  lastTitle: row("지난번 확인 이후", "Since you last looked", "自上次查看以来", "前回の確認以降"),
  collecting: row("평소 비교를 위한 기록을 모으고 있습니다.", "Still collecting records for a usual comparison.", "正在积累用于平常比较的记录。", "普段と比較するための記録を集めています。"),
  noCurrent: row("오늘 관측값이 있을 때만 평소와 비교합니다.", "Compared with usual only when there is a reading today.", "仅在今天有观测值时与平常比较。", "今日の観測値がある場合のみ普段と比較します。"),
  unavailable: row("비교 자료를 불러오지 못했습니다.", "Could not load the comparison.", "未能加载比较资料。", "比較資料を読み込めませんでした。"),
  airport: row("공항 자료는 관측 인구가 아니라 공식 예고여서 평소 비교를 하지 않습니다.", "The airport publishes forecasts, not observed population, so there is no usual comparison.", "机场仅有官方预告而非观测人口，因此不做平常比较。", "空港は観測人口ではなく公式予告のみのため、普段との比較はしません。"),
  holidayUnchecked: row("공휴일 자료가 없어 비교 날짜의 공휴일 여부를 확인하지 못했습니다.", "Holiday data is missing, so holidays could not be left out of the comparison dates.", "缺少假日资料，比较日期中未能剔除假日。", "祝日の資料がないため、比較日から祝日を除けませんでした。"),
  todayHoliday: row("오늘은 공휴일이라 비교한 날짜들과 조건이 다를 수 있습니다.", "Today is a public holiday, so conditions may differ from the compared dates.", "今天是公共假日，条件可能与比较日期不同。", "今日は祝日のため、比較した日と条件が異なる場合があります。"),
  rangeNote: row("범위는 측정 구역에 머무는 추정 인구입니다. 비율로 바꾸지 않았습니다.", "Ranges estimate people present in the measured zone; they are not turned into percentages.", "区间为测量区域内停留人口的估计，未换算为比例。", "範囲は測定区域に滞在する推定人口で、比率には換算していません。"),
  first: row("이 조건으로 처음 확인합니다. 다음에 다시 열면 달라진 점을 보여 드립니다.", "First look with these conditions. Next time, what changed will show here.", "首次以此条件查看。下次打开时将显示变化。", "この条件での初回確認です。次回開いたときに変化を表示します。"),
  deviceOnly: row("확인 기록은 이 기기에만 저장됩니다.", "Kept on this device only.", "查看记录仅保存在本设备。", "確認記録はこの端末にのみ保存されます。"),
};

const verdicts = {
  USUAL: {
    HIGHER: row("평소 비교 범위보다 높은 구간입니다.", "Higher than the usual range.", "高于平常的比较区间。", "普段の比較範囲より高い区間です。"),
    OVERLAPS: row("평소 비교 범위와 겹칩니다.", "Overlaps the usual range.", "与平常的比较区间重叠。", "普段の比較範囲と重なります。"),
    LOWER: row("평소 비교 범위보다 낮은 구간입니다.", "Lower than the usual range.", "低于平常的比较区间。", "普段の比較範囲より低い区間です。"),
  },
  LAST_WEEK: {
    HIGHER: row("지난주 같은 시간대보다 높은 구간입니다.", "Higher than the same time last week.", "高于上周同一时段。", "先週の同じ時間帯より高い区間です。"),
    OVERLAPS: row("지난주 같은 시간대와 겹칩니다.", "Overlaps the same time last week.", "与上周同一时段重叠。", "先週の同じ時間帯と重なります。"),
    LOWER: row("지난주 같은 시간대보다 낮은 구간입니다.", "Lower than the same time last week.", "低于上周同一时段。", "先週の同じ時間帯より低い区間です。"),
  },
} as const;

function people(value: number, lang: PrepLang): string {
  return new Intl.NumberFormat({ ko: "ko-KR", en: "en-US", zh: "zh-CN", ja: "ja-JP" }[lang]).format(value);
}

/** The headline for a comparison result. */
export function usualHeadline(result: UsualComparison, lang: PrepLang): string {
  if (result.basis === "NO_CURRENT") return compareCopy.noCurrent[lang];
  if (result.basis === "COLLECTING" || !result.verdict) return compareCopy.collecting[lang];
  return verdicts[result.basis][result.verdict][lang];
}

/** The numbers and dates behind it, for the expandable detail. */
export function usualDetail(result: UsualComparison, lang: PrepLang): string[] {
  const lines: string[] = [];
  const unit = row("명", "people", "人", "人")[lang];
  if (result.current) {
    lines.push(row(
      `현재 ${people(result.current.min, lang)}~${people(result.current.max, lang)}${unit} (${prepTime(result.current.observedAt, result.current.observedAt.slice(0, 10), lang)} 관측)`,
      `Now ${people(result.current.min, lang)}–${people(result.current.max, lang)} ${unit} (observed ${prepTime(result.current.observedAt, result.current.observedAt.slice(0, 10), lang)})`,
      `当前 ${people(result.current.min, lang)}~${people(result.current.max, lang)}${unit}（${prepTime(result.current.observedAt, result.current.observedAt.slice(0, 10), lang)} 观测）`,
      `現在 ${people(result.current.min, lang)}~${people(result.current.max, lang)}${unit}（${prepTime(result.current.observedAt, result.current.observedAt.slice(0, 10), lang)} 観測）`,
    )[lang]);
  }
  if (result.range) {
    lines.push(row(
      `비교 범위 ${people(result.range.min, lang)}~${people(result.range.max, lang)}${unit}`,
      `Compared range ${people(result.range.min, lang)}–${people(result.range.max, lang)} ${unit}`,
      `比较区间 ${people(result.range.min, lang)}~${people(result.range.max, lang)}${unit}`,
      `比較範囲 ${people(result.range.min, lang)}~${people(result.range.max, lang)}${unit}`,
    )[lang]);
  }
  const dates = result.weeks.filter((week) => week.status === "VALID").map((week) => week.date.slice(5).replace("-", "/"));
  lines.push(row(
    `같은 요일·같은 시각 기록 ${result.validDays}일 (4일 이상이면 평소 비교)${dates.length ? ` · ${dates.join(", ")}` : ""}`,
    `Same weekday and time: ${result.validDays} day(s) (usual needs 4+)${dates.length ? ` · ${dates.join(", ")}` : ""}`,
    `同星期同时刻记录 ${result.validDays} 天（4 天以上才做平常比较）${dates.length ? ` · ${dates.join(", ")}` : ""}`,
    `同じ曜日・同じ時刻の記録 ${result.validDays}日（4日以上で普段と比較）${dates.length ? ` · ${dates.join(", ")}` : ""}`,
  )[lang]);
  if (result.holidayCheck === "UNAVAILABLE") lines.push(compareCopy.holidayUnchecked[lang]);
  if (result.todayIsHoliday) lines.push(compareCopy.todayHoliday[lang]);
  lines.push(compareCopy.rangeNote[lang]);
  return lines;
}

export function lastCheckHeadline(changes: readonly CheckChange[], checkedAt: string, serviceDate: string, lang: PrepLang): string {
  const at = prepTime(checkedAt, serviceDate, lang);
  return changes.length
    ? row(`지난 확인(${at}) 이후 달라진 점`, `Changed since your last look (${at})`, `自上次查看（${at}）以来的变化`, `前回の確認（${at}）以降の変化`)[lang]
    : row(`지난 확인(${at}) 이후 달라진 공식 값은 없습니다.`, `No official value changed since your last look (${at}).`, `自上次查看（${at}）以来官方数值没有变化。`, `前回の確認（${at}）以降、公式の値に変化はありません。`)[lang];
}

export function changeLine(change: CheckChange, serviceDate: string, lang: PrepLang): string {
  const count = (value: number) => people(value, lang);
  switch (change.kind) {
    case "ACTION_ADDED":
    case "ACTION_REMOVED": {
      const title = actionText({ rule: change.rule, source: "SEOUL_FORECAST", value: { kind: "LEVEL", level: 0 }, startAt: null, endAt: null, issuedAt: null }, serviceDate, null, lang).title;
      return change.kind === "ACTION_ADDED"
        ? row(`새 준비할 일: ${title}`, `New: ${title}`, `新增：${title}`, `新しい準備：${title}`)[lang]
        : row(`없어진 준비할 일: ${title}`, `No longer needed: ${title}`, `已取消：${title}`, `不要になった準備：${title}`)[lang];
    }
    case "CROWD":
      return row(
        `${prepTime(change.at, serviceDate, lang)} 혼잡 예측 ${levelName(change.from, lang)} → ${levelName(change.to, lang)}`,
        `${prepTime(change.at, serviceDate, lang)} crowding forecast ${levelName(change.from, lang)} → ${levelName(change.to, lang)}`,
        `${prepTime(change.at, serviceDate, lang)} 拥挤预测 ${levelName(change.from, lang)} → ${levelName(change.to, lang)}`,
        `${prepTime(change.at, serviceDate, lang)} 混雑予測 ${levelName(change.from, lang)} → ${levelName(change.to, lang)}`,
      )[lang];
    case "RAIN":
      return row(
        `${prepTime(change.at, serviceDate, lang)} 강수확률 ${change.from}% → ${change.to}%`,
        `${prepTime(change.at, serviceDate, lang)} chance of rain ${change.from}% → ${change.to}%`,
        `${prepTime(change.at, serviceDate, lang)} 降水概率 ${change.from}% → ${change.to}%`,
        `${prepTime(change.at, serviceDate, lang)} 降水確率 ${change.from}% → ${change.to}%`,
      )[lang];
    case "AIRPORT":
      return row(
        `${prepTime(change.at, serviceDate, lang)} 출국 예상 약 ${count(change.from)} → ${count(change.to)}명`,
        `${prepTime(change.at, serviceDate, lang)} expected departures about ${count(change.from)} → ${count(change.to)}`,
        `${prepTime(change.at, serviceDate, lang)} 预计出境约 ${count(change.from)} → ${count(change.to)}人`,
        `${prepTime(change.at, serviceDate, lang)} 出国予想 約${count(change.from)} → ${count(change.to)}人`,
      )[lang];
    case "EVENTS":
      return row(`근처 공식 행사 ${change.from}건 → ${change.to}건`, `Official events nearby ${change.from} → ${change.to}`, `附近官方活动 ${change.from} → ${change.to} 项`, `近くの公式イベント ${change.from}件 → ${change.to}件`)[lang];
    case "HOLIDAYS":
      return row("공휴일 정보가 바뀌었습니다", "Holiday information changed", "假日信息有变", "祝日情報が変わりました")[lang];
  }
}
