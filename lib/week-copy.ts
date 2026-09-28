/**
 * Words for the week-ahead view, in the four product languages.
 */
import type { WeekAhead, WeekItem } from "./week-ahead";
import { localHolidayName } from "./holiday-calendar";
import { prepTime, type PrepLang } from "./business-prep-copy";
import { dateLabel } from "./prep-share";

type Row = Record<PrepLang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });

export const weekCopy = {
  title: row("이번 주 준비", "The week ahead", "本周准备", "今週の準備"),
  today: row("오늘", "Today", "今天", "今日"),
  events: row("이번 주 공식 행사", "Official events this week", "本周官方活动", "今週の公式イベント"),
  noEvents: row("현재 확인된 행사 없음", "No official event found so far", "目前未确认有活动", "現在確認できるイベントなし"),
  koreanUnavailable: row("한국 공휴일 자료를 아직 받지 못해 한국 공휴일은 표시하지 못했습니다.", "Korean holiday data has not arrived, so Korean holidays could not be shown.", "尚未取得韩国公共假日资料，未能显示韩国假日。", "韓国の祝日資料をまだ取得できていないため、韓国の祝日は表示できませんでした。"),
  airport: row("공항은 날씨·행사 자료를 연결하지 않았습니다. 공항 공식 예고는 오늘과 내일만 발표됩니다.", "Weather and events are not linked to the airport. The airport's official forecast covers today and tomorrow only.", "机场未关联天气与活动资料。机场官方预告仅发布今天和明天。", "空港には天気・イベント資料を連携していません。空港の公式予告は今日と明日のみです。"),
  population: row("혼잡 예측은 12시간 앞까지만 발표되어 이번 주 보기에서 제외했습니다.", "Crowding forecasts reach only 12 hours ahead, so they are not in the week view.", "拥挤预测仅提前12小时发布，因此未放入本周视图。", "混雑予測は12時間先までのため、今週の表示には含めていません。"),
  pastPattern: row("과거 같은 요일 흐름은 기록이 충분하지 않아 아직 제외했습니다.", "Past same-weekday patterns are not included yet: not enough records.", "过往同星期趋势因记录不足暂未纳入。", "過去の同じ曜日の傾向は記録が不足しているため、まだ含めていません。"),
  sources: row("출처: 한국천문연구원 특일 정보, 중국 국무원 공지, 일본 내각부, 기상청, 한국관광공사", "Sources: KASI, China State Council notice, Japan Cabinet Office, KMA, Korea Tourism Organization", "来源：韩国天文研究院、中国国务院通知、日本内阁府、韩国气象厅、韩国观光公社", "出典：韓国天文研究院、中国国務院通知、日本内閣府、気象庁、韓国観光公社"),
};

const labels: Record<WeekItem["label"] | "PAST", Row> = {
  CONFIRMED: row("확정 일정", "Confirmed", "已确定日程", "確定した予定"),
  OFFICIAL_FORECAST: row("공식 예보", "Official forecast", "官方预报", "公式予報"),
  PAST: row("과거 참고", "Past reference", "过往参考", "過去の参考"),
  UNCONFIRMED: row("미확인", "Not yet known", "未确认", "未確認"),
};

export function weekLabel(label: WeekItem["label"], lang: PrepLang): string {
  return labels[label][lang];
}

const countries: Record<"KR" | "CN" | "JP", Row> = {
  KR: row("한국", "Korea", "韩国", "韓国"),
  CN: row("중국", "China", "中国", "中国"),
  JP: row("일본", "Japan", "日本", "日本"),
};

const short = (day: string) => day.slice(5).replace("-", "/");

export function weekItemLine(item: WeekItem, lang: PrepLang): string {
  switch (item.kind) {
    case "HOLIDAY": {
      const name = localHolidayName(item.name, lang, item.country);
      const period = item.start !== item.end ? ` ${short(item.start)}–${short(item.end)}` : "";
      return row(`${countries[item.country].ko} 공휴일 · ${name}${period}`, `${countries[item.country].en} holiday · ${name}${period}`,
        `${countries[item.country].zh}假日 · ${name}${period}`, `${countries[item.country].ja}の祝日 · ${name}${period}`)[lang];
    }
    case "WORKING_DAY":
      return row(`중국 조정 근무일 (휴일 아님) · ${localHolidayName(item.name, lang, "CN")}`, `China adjusted working day (not a holiday) · ${localHolidayName(item.name, lang, "CN")}`,
        `中国调休上班日（非假日）· ${item.name}`, `中国の振替出勤日（休日ではない）· ${localHolidayName(item.name, lang, "CN")}`)[lang];
    case "RAIN":
      return row(
        `강수확률 최고 ${item.percent}% (${prepTime(item.fromAt, item.fromAt.slice(0, 10), lang)}–${prepTime(item.toAt, item.toAt.slice(0, 10), lang)} 예보 기준)`,
        `Highest chance of rain ${item.percent}% (forecast for ${prepTime(item.fromAt, item.fromAt.slice(0, 10), lang)}–${prepTime(item.toAt, item.toAt.slice(0, 10), lang)})`,
        `最高降水概率 ${item.percent}%（${prepTime(item.fromAt, item.fromAt.slice(0, 10), lang)}–${prepTime(item.toAt, item.toAt.slice(0, 10), lang)} 预报）`,
        `最高降水確率 ${item.percent}%（${prepTime(item.fromAt, item.fromAt.slice(0, 10), lang)}–${prepTime(item.toAt, item.toAt.slice(0, 10), lang)}の予報）`,
      )[lang];
    case "FORECAST_NOT_PUBLISHED":
      return row("날씨 예보 발표 전", "No weather forecast published yet", "天气预报尚未发布", "天気予報はまだ発表前")[lang];
  }
}

export function weekHeadline(week: WeekAhead, lang: PrepLang): string {
  const holidayDays = week.days.filter((day) => day.items.some((item) => item.kind === "HOLIDAY")).length;
  const events = week.events?.length ?? 0;
  const range = `${short(week.start)}–${short(week.end)}`;
  return row(
    `${weekCopy.title.ko} (${range}) · 공휴일 ${holidayDays}일${week.events ? ` · 행사 ${events}건` : ""}`,
    `${weekCopy.title.en} (${range}) · ${holidayDays} holiday day(s)${week.events ? ` · ${events} event(s)` : ""}`,
    `${weekCopy.title.zh}（${range}）· 假日 ${holidayDays} 天${week.events ? ` · 活动 ${events} 项` : ""}`,
    `${weekCopy.title.ja}（${range}）· 祝日 ${holidayDays}日${week.events ? ` · イベント ${events}件` : ""}`,
  )[lang];
}

export function weekDayLabel(date: string, today: boolean, lang: PrepLang): string {
  const label = dateLabel(date, lang).slice(5).replace("-", "/");
  return today ? `${label} · ${weekCopy.today[lang]}` : label;
}

export function unpublishedLine(country: "CN" | "JP", year: number, lang: PrepLang): string {
  return row(`${countries[country].ko} ${year}년 공휴일은 아직 공식 발표되지 않았습니다.`, `${countries[country].en}'s ${year} holidays are not officially published yet.`,
    `${countries[country].zh}${year}年假日尚未官方发布。`, `${countries[country].ja}の${year}年の祝日はまだ公式発表されていません。`)[lang];
}
