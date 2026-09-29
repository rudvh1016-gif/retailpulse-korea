/**
 * Words for the business preparation briefing, in the four product
 * languages. The screen and the staff share text both call these, so a
 * shared copy can never say something the screen did not.
 *
 * Every sentence reports an official value and its limit; none turns rain
 * into sales, an event into customers or airport passengers into visitors.
 */
import type { BusinessHours, BusinessPrep, PrepAction, PrepCoverage, PrepFact, PrepPlace, PrepSource, PrepStatus } from "./business-prep";
import { industryProfiles, type IndustryId } from "./industry-guidance";
import { localHolidayName } from "./holiday-calendar";

export type PrepLang = "ko" | "en" | "zh" | "ja";
type Row = Record<PrepLang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });

export const prepCopy = {
  eyebrow: row("오늘 준비", "TODAY'S PREP", "今日准备", "今日の準備"),
  title: row("영업시간에 맞춘 준비", "Prep for your opening hours", "按营业时间准备", "営業時間に合わせた準備"),
  conditions: row("내 조건", "My store", "我的条件", "自店の条件"),
  change: row("조건 바꾸기", "Change", "更改条件", "条件を変更"),
  close: row("닫기", "Close", "关闭", "閉じる"),
  save: row("저장", "Save", "保存", "保存"),
  wholeDay: row("하루 전체", "Whole day", "全天", "終日"),
  wholeDayOption: row("영업시간 없이 하루 전체 보기", "No hours — read the whole day", "不设营业时间，查看全天", "営業時間なしで終日を見る"),
  open: row("여는 시간", "Opens", "开店", "開店"),
  closeTime: row("닫는 시간", "Closes", "打烊", "閉店"),
  terminal: row("터미널", "Terminal", "航站楼", "ターミナル"),
  industry: row("업종", "Business type", "业态", "業種"),
  deviceOnly: row("이 기기에만 저장되며 서버로 보내지 않습니다.", "Saved on this device only; never sent to a server.", "仅保存在本设备，不会发送到服务器。", "この端末にのみ保存され、サーバーには送信されません。"),
  storageBlocked: row("이 브라우저가 저장을 막아 이번 방문에만 적용됩니다.", "This browser blocks storage, so this applies to this visit only.", "此浏览器禁止存储，仅本次访问有效。", "このブラウザは保存を許可していないため、今回の訪問のみ有効です。"),
  crossesMidnight: row("다음 날까지 영업", "Open past midnight", "营业至次日", "翌日まで営業"),
  factsTitle: row("영업시간 안에서 확인된 사실", "Official facts inside your hours", "营业时间内确认的事实", "営業時間内で確認できた事実"),
  actionsTitle: row("준비할 일", "What to prepare", "需要准备的事", "準備すること"),
  evidence: row("근거 보기", "Show the basis", "查看依据", "根拠を見る"),
  condition: row("조건", "Rule", "条件", "条件"),
  dataUsed: row("사용한 자료", "Data used", "使用资料", "使用した資料"),
  issuedAt: row("발표·수집", "Issued / collected", "发布·采集", "発表・収集"),
  target: row("대상 시간", "Hours covered", "对象时间", "対象時間"),
  limit: row("한계", "Limit", "局限", "限界"),
  industryCheck: row("업종 체크", "For your business", "业态提示", "業種チェック"),
  standing: row("매일 하는 기본 점검은 아래 업종 가이드에 따로 있습니다.", "Your everyday checklist stays separate, in the business guide below.", "日常基本检查另见下方业态指南。", "毎日の基本点検は下の業種ガイドに分けてあります。"),
  noFacts: row("영업시간 안에서 확인된 공식 자료가 없습니다.", "No official data falls inside your hours.", "营业时间内没有可确认的官方资料。", "営業時間内に確認できる公式資料がありません。"),
  loading: row("자료를 불러오는 중입니다.", "Loading data.", "正在加载资料。", "資料を読み込み中です。"),
  airportLink: row("공항 전체 신호 보기", "All airport signals", "查看机场全部信号", "空港の全シグナルを見る"),
};

const statusCopy: Record<PrepStatus, Row> = {
  ACTIONS: row("", "", "", ""),
  NO_CHANGE: row("추가로 확인할 큰 변화는 없습니다.", "No major change to check.", "没有需要额外确认的重大变化。", "追加で確認すべき大きな変化はありません。"),
  PARTIAL: row("확인 가능한 시간에는 큰 변화가 없습니다. 자료가 없는 시간은 판단하지 않았습니다.", "No major change in the hours the data covers. Hours without data were not judged.", "资料覆盖的时段内没有重大变化。没有资料的时段未作判断。", "資料がある時間帯に大きな変化はありません。資料のない時間帯は判断していません。"),
  INSUFFICIENT: row("판단할 자료가 부족합니다.", "Not enough data to judge.", "判断所需资料不足。", "判断に必要な資料が不足しています。"),
  ENDED: row("오늘 영업시간은 이미 종료되었습니다. 다음 준비는 날짜를 내일로 바꿔 확인하세요.", "Today's hours have ended. Switch the date to tomorrow for the next prep.", "今天的营业时间已结束。请把日期切换到明天查看下一次准备。", "本日の営業時間は終了しました。次の準備は日付を明日に切り替えて確認してください。"),
  PAST: row("지난 날짜입니다. 준비 브리핑은 오늘과 앞으로의 날짜에만 나옵니다.", "This date has passed. The prep briefing covers today and later dates only.", "该日期已过去。准备简报仅适用于今天及之后的日期。", "過去の日付です。準備ブリーフィングは今日以降の日付のみです。"),
};

export function statusLine(status: PrepStatus, lang: PrepLang): string {
  return statusCopy[status][lang];
}

const sourceCopy: Record<PrepSource, Row> = {
  SEOUL_FORECAST: row("서울시 공식 혼잡 예측", "Seoul official crowding forecast", "首尔市官方拥挤预测", "ソウル市公式混雑予測"),
  KMA_FORECAST: row("기상청 단기예보", "KMA short-range forecast", "韩国气象厅短期预报", "気象庁短期予報"),
  TOURAPI_EVENTS: row("한국관광공사 행사 정보", "Korea Tourism Organization events", "韩国观光公社活动信息", "韓国観光公社のイベント情報"),
  A5_FORECAST: row("인천공항 공식 출국 예상", "Incheon Airport official departure forecast", "仁川机场官方出境预测", "仁川空港公式出国予測"),
  HOLIDAY_CALENDAR: row("공식 공휴일", "Official public holidays", "官方公共假日", "公式の祝日"),
};

export function sourceName(source: PrepSource, lang: PrepLang): string {
  return sourceCopy[source][lang];
}

const limitCopy: Record<PrepSource, Row> = {
  SEOUL_FORECAST: row("측정 구역에 머무는 인구의 공식 등급입니다. 매장 방문객·매출 수치가 아닙니다.", "An official grade of people present in the measured zone, not store visitors or sales.", "为测量区域内停留人口的官方等级，并非到店人数或销售额。", "測定区域に滞在する人口の公式等級で、来店客数や売上ではありません。"),
  KMA_FORECAST: row("기상청 격자 예보입니다. 날씨가 매출에 주는 영향은 판단하지 않습니다.", "A KMA grid forecast. It says nothing about the effect of weather on sales.", "为气象厅网格预报，不判断天气对销售的影响。", "気象庁の格子予報です。天気が売上に与える影響は判断しません。"),
  TOURAPI_EVENTS: row("공식 행사 기간 정보입니다. 행사 방문객 수는 알 수 없습니다.", "Official event dates only; event attendance is unknown.", "仅为官方活动期间，无法得知活动访客数。", "公式の開催期間のみで、来場者数は分かりません。"),
  A5_FORECAST: row("공항이 발표한 출국 예상 승객입니다. 매장 방문객 수가 아니며, 항공사로 승객 국적을 알 수는 없습니다.", "The airport's expected departing passengers — not store visitors, and airline does not tell passenger nationality.", "机场发布的预计出境旅客，并非到店人数，也不能由航空公司推断旅客国籍。", "空港発表の出国予想旅客で、来店客数ではなく、航空会社から旅客の国籍は分かりません。"),
  HOLIDAY_CALENDAR: row("공식 공휴일 정보입니다. 공휴일에 손님이 늘거나 준다고 판단하지 않습니다.", "Official holiday dates. They do not say whether customers rise or fall.", "为官方假日信息，不判断假日客人增减。", "公式の祝日情報です。客数の増減は判断しません。"),
};

export function limitLine(source: PrepSource, lang: PrepLang): string {
  return limitCopy[source][lang];
}

const levelNames: Record<PrepLang, string[]> = {
  ko: ["자료 없음", "여유", "보통", "약간 붐빔", "붐빔"],
  en: ["Unavailable", "Quiet", "Moderate", "Slightly busy", "Busy"],
  zh: ["无资料", "空闲", "一般", "略拥挤", "拥挤"],
  ja: ["資料なし", "余裕", "普通", "やや混雑", "混雑"],
};

export function levelName(level: number, lang: PrepLang): string {
  return levelNames[lang][level] ?? levelNames[lang][0];
}

const areaNames: Record<string, Row> = {
  myeongdong: row("명동", "Myeongdong", "明洞", "明洞"),
  hongdae: row("홍대", "Hongdae", "弘大", "弘大"),
  seongsu: row("성수", "Seongsu", "圣水", "聖水"),
  itaewon: row("이태원", "Itaewon", "梨泰院", "梨泰院"),
};

export function placeName(place: PrepPlace, lang: PrepLang): string {
  if (place.kind === "airport") return `${row("인천공항", "Incheon Airport", "仁川机场", "仁川空港")[lang]} ${place.terminal}`;
  return areaNames[place.area][lang];
}

const HOUR_MS = 3_600_000;
const kstDay = (ms: number) => new Date(ms + 9 * HOUR_MS).toISOString().slice(0, 10);
const kstClock = (ms: number) => new Date(ms + 9 * HOUR_MS).toISOString().slice(11, 16);

/**
 * "HH:MM" on the service date; the next day's midnight reads "24:00" so a
 * whole day ends where a reader expects; anything else names its own day.
 */
export function prepTime(iso: string, serviceDate: string, lang: PrepLang): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const day = kstDay(ms), clock = kstClock(ms);
  if (day === serviceDate) return clock;
  const next = new Date(Date.parse(`${serviceDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (day === next && clock === "00:00") return "24:00";
  if (day === next) return `${row("다음 날", "next day", "次日", "翌日")[lang]} ${clock}`;
  return `${day.slice(5).replace("-", "/")} ${clock}`;
}

export function prepSpan(startAt: string, endAt: string, serviceDate: string, lang: PrepLang): string {
  return `${prepTime(startAt, serviceDate, lang)}–${prepTime(endAt, serviceDate, lang)}`;
}

export function hoursLabel(hours: BusinessHours | null, lang: PrepLang): string {
  if (!hours || hours.open === hours.close) return prepCopy.wholeDay[lang];
  const late = hours.close < hours.open ? ` (${prepCopy.crossesMidnight[lang]})` : "";
  return `${hours.open}–${hours.close}${late}`;
}

function number(value: number, lang: PrepLang): string {
  return new Intl.NumberFormat({ ko: "ko-KR", en: "en-US", zh: "zh-CN", ja: "ja-JP" }[lang]).format(value);
}

function issued(iso: string | null, serviceDate: string, lang: PrepLang): string {
  if (!iso) return "";
  return ` · ${prepTime(iso, serviceDate, lang)} ${row("발표·수집", "issued/collected", "发布·采集", "発表・収集")[lang]}`;
}

const countryNames: Record<"KR" | "CN" | "JP", Row> = {
  KR: row("한국", "Korea", "韩国", "韓国"),
  CN: row("중국", "China", "中国", "中国"),
  JP: row("일본", "Japan", "日本", "日本"),
};

export function factLine(fact: PrepFact, serviceDate: string, lang: PrepLang): string {
  switch (fact.kind) {
    case "CROWD_MAX":
      return row(
        `혼잡 예측 최고 단계 '${levelName(fact.level, lang)}' · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`,
        `Highest forecast crowding '${levelName(fact.level, lang)}' · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`,
        `预测最高拥挤等级「${levelName(fact.level, lang)}」 · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`,
        `予測の最高混雑度「${levelName(fact.level, lang)}」 · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`,
      )[lang] + ` (${sourceName("SEOUL_FORECAST", lang)}${issued(fact.issuedAt, serviceDate, lang)})`;
    case "RAIN_MAX":
      return row(
        `강수확률 최고 ${fact.percent}% · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`,
        `Highest chance of rain ${fact.percent}% · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`,
        `最高降水概率 ${fact.percent}% · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`,
        `最高降水確率 ${fact.percent}% · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`,
      )[lang] + ` (${sourceName("KMA_FORECAST", lang)}${issued(fact.issuedAt, serviceDate, lang)})`;
    case "TEMPERATURE_RANGE": {
      const range = fact.minC === fact.maxC ? `${fact.minC}°C` : `${fact.minC}~${fact.maxC}°C`;
      return row(`기온 ${range}`, `Temperature ${range.replace("~", "–")}`, `气温 ${range}`, `気温 ${range}`)[lang]
        + ` (${sourceName("KMA_FORECAST", lang)})`;
    }
    case "AIRPORT_PEAK":
      return row(
        `출국 예상 승객이 가장 많은 시간 ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)} · 약 ${number(fact.count, lang)}명`,
        `Most expected departures ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)} · about ${number(fact.count, lang)}`,
        `预计出境旅客最多时段 ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)} · 约${number(fact.count, lang)}人`,
        `出国予想旅客が最も多い時間 ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)} · 約${number(fact.count, lang)}人`,
      )[lang] + ` (${sourceName("A5_FORECAST", lang)}${issued(fact.issuedAt, serviceDate, lang)})`;
    case "AIRPORT_TOTAL":
      return row(
        `영업시간 출국 예상 승객 합계 약 ${number(fact.count, lang)}명 (${fact.bands}개 시간대)`,
        `Expected departures across your hours about ${number(fact.count, lang)} (${fact.bands} bands)`,
        `营业时间内预计出境旅客合计约${number(fact.count, lang)}人（${fact.bands}个时段）`,
        `営業時間内の出国予想旅客合計 約${number(fact.count, lang)}人（${fact.bands}時間帯）`,
      )[lang];
    case "EVENTS": {
      const period = fact.eventEnd && fact.eventEnd !== fact.eventStart ? `${fact.eventStart}~${fact.eventEnd}` : fact.eventStart;
      return row(
        `근처 공식 행사 ${fact.count}건 · ${fact.title} (${period})`,
        `${fact.count} official event(s) nearby · ${fact.title} (${period})`,
        `附近官方活动 ${fact.count} 项 · ${fact.title}（${period}）`,
        `近くの公式イベント ${fact.count}件 · ${fact.title}（${period}）`,
      )[lang];
    }
    case "HOLIDAY": {
      const name = localHolidayName(fact.name, lang, fact.country);
      return row(
        `${countryNames[fact.country].ko} 공휴일 · ${name}`,
        `${countryNames[fact.country].en} public holiday · ${name}`,
        `${countryNames[fact.country].zh}公共假日 · ${name}`,
        `${countryNames[fact.country].ja}の祝日 · ${name}`,
      )[lang];
    }
  }
}

export interface ActionText { title: string; body: string; industryHint: string | null }

function industryPeakHint(industry: IndustryId | null, lang: PrepLang): string | null {
  if (!industry) return null;
  const rowOfPeak = industryProfiles[industry]?.checklist[lang]?.find((entry) => entry[0] === "peak");
  return rowOfPeak ? `${rowOfPeak[1]} · ${rowOfPeak[2]}` : null;
}

export function actionText(action: PrepAction, serviceDate: string, industry: IndustryId | null, lang: PrepLang): ActionText {
  const span = action.startAt && action.endAt ? prepSpan(action.startAt, action.endAt, serviceDate, lang) : "";
  const value = action.value;
  switch (action.rule) {
    case "CROWD":
      return {
        title: row("혼잡 예측 시간 전에 준비", "Get ready before the busy forecast", "在预测拥挤时段前做好准备", "混雑予測の時間前に準備")[lang],
        body: row(
          `${span} 공식 혼잡 예측이 '${levelName(value.kind === "LEVEL" ? value.level : 0, lang)}'입니다. 그 전에 계산대·진열·동선을 정리하세요.`,
          `${span} the official forecast is '${levelName(value.kind === "LEVEL" ? value.level : 0, lang)}'. Clear the counter, displays and walkways before then.`,
          `${span} 官方预测为「${levelName(value.kind === "LEVEL" ? value.level : 0, lang)}」。请在此之前整理收银台、陈列与动线。`,
          `${span} の公式予測は「${levelName(value.kind === "LEVEL" ? value.level : 0, lang)}」です。その前にレジ・陳列・動線を整えてください。`,
        )[lang],
        industryHint: industryPeakHint(industry, lang),
      };
    case "AIRPORT_PEAK":
      return {
        title: row("출국 승객이 가장 많은 시간 전에 준비", "Get ready before the departure peak", "在出境旅客最多的时段前做好准备", "出国旅客が最も多い時間の前に準備")[lang],
        body: row(
          `${span} 출국 예상 승객이 가장 많습니다(약 ${number(value.kind === "PASSENGERS" ? value.count : 0, lang)}명). 그 전에 계산대와 재고를 준비하세요.`,
          `${span} has the most expected departures (about ${number(value.kind === "PASSENGERS" ? value.count : 0, lang)}). Prepare the counter and stock before then.`,
          `${span} 预计出境旅客最多（约${number(value.kind === "PASSENGERS" ? value.count : 0, lang)}人）。请在此之前准备收银台与库存。`,
          `${span} は出国予想旅客が最も多い時間です（約${number(value.kind === "PASSENGERS" ? value.count : 0, lang)}人）。その前にレジと在庫を準備してください。`,
        )[lang],
        industryHint: industryPeakHint(industry, lang),
      };
    case "RAIN":
      return {
        title: row("비 예보 대비", "Rain in the forecast", "预报有雨", "雨の予報に備える")[lang],
        body: row(
          `${span} 강수확률 ${value.kind === "PROBABILITY" ? value.percent : 0}% 예보입니다. 우산 보관대와 입구 바닥을 준비하세요.`,
          `${span} has a ${value.kind === "PROBABILITY" ? value.percent : 0}% chance of rain. Set out an umbrella stand and dry the entrance floor.`,
          `${span} 降水概率 ${value.kind === "PROBABILITY" ? value.percent : 0}%。请准备伞架并保持入口地面干燥。`,
          `${span} の降水確率は${value.kind === "PROBABILITY" ? value.percent : 0}%です。傘立てと入口の床を準備してください。`,
        )[lang],
        industryHint: null,
      };
    case "HEAT":
      return {
        title: row("더위 대비", "Heat in the forecast", "预报高温", "暑さに備える")[lang],
        body: row(
          `${span} 기온 ${value.kind === "TEMPERATURE" ? value.celsius : 0}°C 예보입니다. 냉방과 대기 공간을 점검하세요.`,
          `${span} reaches ${value.kind === "TEMPERATURE" ? value.celsius : 0}°C. Check cooling and any waiting area.`,
          `${span} 预报气温 ${value.kind === "TEMPERATURE" ? value.celsius : 0}°C。请检查冷气与等候区。`,
          `${span} は気温${value.kind === "TEMPERATURE" ? value.celsius : 0}°Cの予報です。冷房と待機スペースを点検してください。`,
        )[lang],
        industryHint: null,
      };
    case "COLD":
      return {
        title: row("추위 대비", "Cold in the forecast", "预报低温", "寒さに備える")[lang],
        body: row(
          `${span} 기온 ${value.kind === "TEMPERATURE" ? value.celsius : 0}°C 예보입니다. 난방과 출입문 쪽을 점검하세요.`,
          `${span} drops to ${value.kind === "TEMPERATURE" ? value.celsius : 0}°C. Check heating and the entrance.`,
          `${span} 预报气温 ${value.kind === "TEMPERATURE" ? value.celsius : 0}°C。请检查暖气与出入口。`,
          `${span} は気温${value.kind === "TEMPERATURE" ? value.celsius : 0}°Cの予報です。暖房と出入口を点検してください。`,
        )[lang],
        industryHint: null,
      };
    case "EVENT": {
      const count = value.kind === "EVENTS" ? value.count : 0, title = value.kind === "EVENTS" ? value.title : "";
      return {
        title: row("근처 공식 행사 기간", "An official event nearby", "附近有官方活动", "近くで公式イベント開催期間")[lang],
        body: row(
          `근처 공식 행사 기간입니다(${count}건 · ${title}). 행사 시간과 장소는 주최 측 안내로 확인하세요.`,
          `An official event period includes this date (${count} · ${title}). Check times and places with the organiser.`,
          `附近官方活动期间（${count}项 · ${title}）。活动时间与地点请以主办方公告为准。`,
          `近くの公式イベント開催期間です（${count}件 · ${title}）。時間と場所は主催者の案内で確認してください。`,
        )[lang],
        industryHint: null,
      };
    }
    case "HOLIDAY": {
      const country = value.kind === "HOLIDAY" ? value.country : "KR";
      const name = value.kind === "HOLIDAY" ? localHolidayName(value.name, lang, country) : "";
      const bodies: Record<"KR" | "CN" | "JP", Row> = {
        KR: row(`한국 공휴일입니다: ${name}. 공휴일 영업시간 안내가 맞는지 확인하세요.`, `A Korean public holiday: ${name}. Check that your holiday hours are posted correctly.`, `韩国公共假日：${name}。请确认假日营业时间的告示是否正确。`, `韓国の祝日です：${name}。祝日の営業時間の案内が正しいか確認してください。`),
        CN: row(`중국 공식 연휴 기간입니다: ${name}. 중국어 안내와 결제 수단을 확인해 보세요.`, `China's official holiday: ${name}. Check your Chinese-language signs and payment options.`, `中国官方假期期间：${name}。请检查中文指引与支付方式。`, `中国の公式連休期間です：${name}。中国語の案内と決済手段を確認してください。`),
        JP: row(`일본 공휴일입니다: ${name}. 일본어 안내와 결제 수단을 확인해 보세요.`, `A Japanese public holiday: ${name}. Check your Japanese-language signs and payment options.`, `日本公共假日：${name}。请检查日语指引与支付方式。`, `日本の祝日です：${name}。日本語の案内と決済手段を確認してください。`),
      };
      return {
        title: row(`${countryNames[country].ko} 공휴일`, `${countryNames[country].en} holiday`, `${countryNames[country].zh}假日`, `${countryNames[country].ja}の祝日`)[lang],
        body: bodies[country][lang],
        industryHint: null,
      };
    }
  }
}

const conditionCopy: Record<PrepAction["rule"], Row> = {
  CROWD: row("영업시간 안 공식 혼잡 단계가 '약간 붐빔' 이상", "Official crowding 'slightly busy' or higher inside your hours", "营业时间内官方拥挤等级为「略拥挤」或以上", "営業時間内の公式混雑度が「やや混雑」以上"),
  AIRPORT_PEAK: row("영업시간 안 출국 예상 승객이 가장 많은 공식 시간대", "The official band with the most expected departures inside your hours", "营业时间内预计出境旅客最多的官方时段", "営業時間内で出国予想旅客が最も多い公式時間帯"),
  RAIN: row("영업시간 안 강수확률 50% 이상", "Chance of rain 50% or more inside your hours", "营业时间内降水概率 50% 以上", "営業時間内の降水確率50%以上"),
  HEAT: row("영업시간 안 기온 30°C 이상", "30°C or more inside your hours", "营业时间内气温 30°C 以上", "営業時間内の気温30°C以上"),
  COLD: row("영업시간 안 기온 5°C 이하", "5°C or less inside your hours", "营业时间内气温 5°C 以下", "営業時間内の気温5°C以下"),
  EVENT: row("공식 행사 기간에 이 날짜 포함", "An official event period includes this date", "官方活动期间包含该日期", "公式イベント期間にこの日付を含む"),
  HOLIDAY: row("이 날짜가 공식 공휴일", "This date is an official public holiday", "该日期为官方公共假日", "この日付が公式の祝日"),
};

export interface EvidenceText { condition: string; data: string; issued: string; target: string; limit: string }

export function evidenceText(action: PrepAction, serviceDate: string, lang: PrepLang): EvidenceText {
  const official = action.value.kind === "HOLIDAY" ? ` · ${action.value.officialSource}` : "";
  return {
    condition: conditionCopy[action.rule][lang],
    data: `${sourceName(action.source, lang)}${official}`,
    issued: action.issuedAt ? prepTime(action.issuedAt, serviceDate, lang) : row("시각 정보 없음", "No time given", "无时间信息", "時刻情報なし")[lang],
    target: action.startAt && action.endAt ? prepSpan(action.startAt, action.endAt, serviceDate, lang) : row("날짜 전체", "The whole date", "整日", "日付全体")[lang],
    limit: limitLine(action.source, lang),
  };
}

/** Why a source did not settle the whole window, or null when it did. */
export function coverageLine(entry: PrepCoverage, serviceDate: string, lang: PrepLang): string | null {
  const name = sourceName(entry.source, lang);
  switch (entry.status) {
    case "COVERED":
      return null;
    case "PARTIAL":
      return row(
        `${name}: ${entry.coveredStartAt && entry.coveredEndAt ? prepSpan(entry.coveredStartAt, entry.coveredEndAt, serviceDate, lang) : ""}만 확인됩니다. 나머지 시간은 판단할 자료가 없습니다.`,
        `${name}: covers ${entry.coveredStartAt && entry.coveredEndAt ? prepSpan(entry.coveredStartAt, entry.coveredEndAt, serviceDate, lang) : ""} only. The other hours have no data to judge.`,
        `${name}：仅覆盖 ${entry.coveredStartAt && entry.coveredEndAt ? prepSpan(entry.coveredStartAt, entry.coveredEndAt, serviceDate, lang) : ""}，其余时段没有可判断的资料。`,
        `${name}：${entry.coveredStartAt && entry.coveredEndAt ? prepSpan(entry.coveredStartAt, entry.coveredEndAt, serviceDate, lang) : ""}のみ確認できます。残りの時間は判断できる資料がありません。`,
      )[lang];
    case "NONE":
      return row(`${name}: 영업시간에 해당하는 자료가 없습니다.`, `${name}: no data for your hours.`, `${name}：没有对应营业时间的资料。`, `${name}：営業時間に該当する資料がありません。`)[lang];
    case "STALE":
      return row(
        `${name}: 자료가 오래되어(${entry.issuedAt ? prepTime(entry.issuedAt, serviceDate, lang) : "—"} 발표·수집) 판단에 쓰지 않았습니다.`,
        `${name}: too old to use (${entry.issuedAt ? prepTime(entry.issuedAt, serviceDate, lang) : "—"}).`,
        `${name}：资料过旧（${entry.issuedAt ? prepTime(entry.issuedAt, serviceDate, lang) : "—"}），未用于判断。`,
        `${name}：資料が古いため（${entry.issuedAt ? prepTime(entry.issuedAt, serviceDate, lang) : "—"}）判断に使いませんでした。`,
      )[lang];
    case "NOT_YET_PUBLISHED":
      return row(
        `${name}: 12시간 앞까지만 발표되어 이 날짜는 아직 없습니다.`,
        `${name}: published only 12 hours ahead, so this date is not out yet.`,
        `${name}：仅提前 12 小时发布，该日期尚未发布。`,
        `${name}：12時間先までしか発表されないため、この日付はまだありません。`,
      )[lang];
  }
}

/** Everything the screen says, in reading order, for one language. */
export function prepSentences(prep: BusinessPrep, serviceDate: string, industry: IndustryId | null, lang: PrepLang) {
  return {
    facts: prep.facts.map((fact) => factLine(fact, serviceDate, lang)),
    actions: prep.actions.map((action) => actionText(action, serviceDate, industry, lang)),
    coverage: prep.coverage.map((entry) => coverageLine(entry, serviceDate, lang)).filter((line): line is string => line !== null),
    status: statusLine(prep.status, lang),
  };
}
