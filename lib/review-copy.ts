/**
 * Words for the weekly industry review and the feeling log, in the four
 * product languages.
 */
import type { Feeling } from "./feeling-log";
import type { RangeVerdict } from "./weekly-review";
import type { PrepLang } from "./business-prep-copy";

type Row = Record<PrepLang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });

export const reviewCopy = {
  title: row("주간 업종 점검", "Weekly check for your business", "每周业态检查", "週次の業種チェック"),
  population: row("지역 인구 (같은 요일·같은 시각)", "Area population (same weekday and time)", "地区人口（同星期、同时刻）", "地域人口（同じ曜日・同じ時刻）"),
  weeksAgo: { 1: row("1주 전", "1 week ago", "1周前", "1週間前"), 2: row("2주 전", "2 weeks ago", "2周前", "2週間前"), 4: row("4주 전", "4 weeks ago", "4周前", "4週間前") } as Record<1 | 2 | 4, Row>,
  subway: row("대표역 하차 인원 (서울시 일별 공식)", "Station exits (Seoul official daily)", "代表车站下车人数（首尔市每日官方）", "代表駅の降車人数（ソウル市の日別公式）"),
  lastWeek: row("지난주 같은 요일 대비", "vs same weekday last week", "较上周同星期", "先週同曜日比"),
  fourWeek: row("최근 4주 같은 요일 평균 대비", "vs 4-week same-weekday average", "较近4周同星期平均", "直近4週の同曜日平均比"),
  categories: row("업종 카드 결제 활동 (지금)", "Card payment activity for your type (now)", "业态刷卡消费活跃度（当前）", "業種のカード決済活動（現在）"),
  categoriesNote: row("서울시 실시간 도시데이터의 신한카드 내국인 결제 기반 활동 단계입니다. 매출이나 외국인 매출이 아니며, 지난 주 기록은 없어 현재 단계만 보여 줍니다.",
    "An activity level from Seoul real-time city data, based on Shinhan Card domestic cardholders. It is not sales or foreign sales; there is no past-week record, so only the current level is shown.",
    "首尔市实时城市数据中基于新韩卡国内持卡人付款的活跃等级，并非销售额或外国人销售额；没有上周记录，仅显示当前等级。",
    "ソウル市リアルタイム都市データの新韓カード国内会員の決済に基づく活動段階です。売上や外国人売上ではなく、過去の週の記録はないため現在の段階のみ表示します。"),
  noCategory: row("이 업종에 연결된 서울시 업종 분류가 없습니다.", "No Seoul category is mapped to this business type.", "该业态没有对应的首尔市业态分类。", "この業種に対応するソウル市の業種分類はありません。"),
  mapped: row("연결한 서울시 업종", "Seoul categories read", "对应的首尔市业态", "対応するソウル市の業種"),
  quarterly: row("분기 통계 (주간 추세 아님)", "Quarterly releases (not a weekly trend)", "季度统计（非每周趋势）", "四半期統計（週次の推移ではありません）"),
  salesQuarter: row("추정매출 공개 분기", "Estimated-sales quarter", "推算销售额公开季度", "推計売上の公開四半期"),
  storeQuarter: row("점포 증감 공개 분기", "Store-count quarter", "门店增减公开季度", "店舗数増減の公開四半期"),
  airport: row("공항 7일·28일 전 같은 요일 비교", "Airport vs the same weekday 7 and 28 days ago", "机场与7天、28天前同星期比较", "空港の7日・28日前の同曜日比較"),
  passengers: row("공식 예상 출국 승객", "Official expected departures", "官方预计出境旅客", "公式の出国予想旅客"),
  flights: row("운항 기록 편수", "Recorded flights", "航班记录数", "運航記録の便数"),
  unavailable: row("비교 자료 없음", "No comparison data", "无比较资料", "比較資料なし"),
  feelingTitle: row("오늘 체감 기록", "How today felt", "今日体感记录", "今日の体感記録"),
  feelingNote: row("내 체감 기록이며 공식 자료가 아닙니다. 이 기기에만 저장되고 어디로도 보내지 않습니다.", "Your own record, not official data. Kept on this device only and never sent anywhere.", "这是您的个人体感记录，并非官方资料；仅保存在本设备，不会发送。", "自分の体感記録で、公式資料ではありません。この端末にのみ保存され、送信されません。"),
  recent: row("최근 기록", "Recent", "最近记录", "最近の記録"),
  remove: row("삭제", "Delete", "删除", "削除"),
  saved: row("기록했습니다.", "Recorded.", "已记录。", "記録しました。"),
  storageBlocked: row("이 브라우저가 저장을 막아 기록할 수 없습니다.", "This browser blocks storage, so nothing can be recorded.", "此浏览器禁止存储，无法记录。", "このブラウザは保存を許可していないため記録できません。"),
};

const verdicts: Record<RangeVerdict, Row> = {
  HIGHER: row("지금이 더 높은 구간", "Now is higher", "当前更高", "現在の方が高い区間"),
  OVERLAPS: row("범위가 겹침", "Ranges overlap", "区间重叠", "範囲が重なる"),
  LOWER: row("지금이 더 낮은 구간", "Now is lower", "当前更低", "現在の方が低い区間"),
};

export function verdictLabel(verdict: RangeVerdict | null, lang: PrepLang): string {
  return verdict ? verdicts[verdict][lang] : reviewCopy.unavailable[lang];
}

export const feelingLabels: Record<Feeling, Row> = {
  BUSIER: row("평소보다 붐빔", "Busier than usual", "比平常忙", "いつもより混雑"),
  USUAL: row("평소 수준", "About usual", "和平常差不多", "いつも通り"),
  QUIETER: row("평소보다 한산", "Quieter than usual", "比平常清闲", "いつもより閑散"),
};

const categoryNames: Record<string, Omit<Row, "ko">> = {
  한식: { en: "Korean food", zh: "韩餐", ja: "韓国料理" },
  "일식/중식/양식": { en: "Japanese, Chinese and Western food", zh: "日式、中式、西式餐饮", ja: "和食・中華・洋食" },
  "제과/커피/패스트푸드": { en: "Bakery, coffee and fast food", zh: "烘焙、咖啡、快餐", ja: "製菓・カフェ・ファストフード" },
  생활용품: { en: "Household goods", zh: "生活用品", ja: "生活用品" },
  "의류/잡화": { en: "Clothing and accessories", zh: "服装与杂货", ja: "衣料・雑貨" },
  화장품: { en: "Cosmetics", zh: "化妆品", ja: "化粧品" },
  "문화/취미": { en: "Culture and hobbies", zh: "文化与爱好", ja: "文化・趣味" },
  숙박: { en: "Lodging", zh: "住宿", ja: "宿泊" },
};

export function categoryName(category: string, lang: PrepLang): string {
  return lang === "ko" ? category : categoryNames[category]?.[lang] ?? category;
}

/** Tenths of a percent from the official daily counts, with the sign spelled out. */
export function tenthsPercent(value: number | null, lang: PrepLang): string {
  if (value === null) return reviewCopy.unavailable[lang];
  return `${value > 0 ? "+" : ""}${(value / 10).toFixed(1)}%`;
}
