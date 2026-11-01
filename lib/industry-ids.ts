import type { Lang } from "../app/retailpulse-data";

export type IndustryId = "beauty" | "fashion" | "food" | "convenience" | "popup" | "tourism" | "liquor" | "luxury";

export const unselectedIndustryLabel: Record<Lang, string> = {
  ko: "업종 선택 전", en: "Business type not selected", zh: "尚未选择业态", ja: "業種未選択",
};

/**
 * Business types and their names only. The shell needs these on every route
 * (the saved-preference check, the More screen); the guidance itself
 * (lib/industry-guidance.ts, lib/industry-playbooks.ts) loads with the
 * business screens. lib/industry-guidance.ts takes its labels from here.
 */
export const industryLabels: Record<IndustryId, Record<Lang, string>> = {
  beauty: { ko: "뷰티·화장품", en: "Beauty & cosmetics", zh: "美妆·化妆品", ja: "ビューティー・化粧品" },
  fashion: { ko: "패션·잡화", en: "Fashion & goods", zh: "时尚·杂货", ja: "ファッション・雑貨" },
  food: { ko: "식음료·카페", en: "Food & café", zh: "餐饮·咖啡", ja: "飲食・カフェ" },
  convenience: { ko: "편의·약국", en: "Convenience & pharmacy", zh: "便利店·药店", ja: "コンビニ・薬局" },
  popup: { ko: "팝업·체험", en: "Pop-up & experience", zh: "快闪·体验", ja: "ポップアップ・体験" },
  tourism: { ko: "관광·숙박", en: "Tourism & stay", zh: "旅游·住宿", ja: "観光・宿泊" },
  liquor: { ko: "주류·담배", en: "Liquor & tobacco", zh: "酒类·烟草", ja: "酒類・たばこ" },
  luxury: { ko: "명품", en: "Luxury", zh: "奢侈品", ja: "ラグジュアリー" },
};
