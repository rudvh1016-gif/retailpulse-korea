/**
 * The text a person copies out of a facility card.
 *
 * Copying is the moment a fact leaves the screen that framed it. Once this
 * text is pasted into a message, the reader has no filters, no header and no
 * page telling them what they are looking at — so everything that makes the
 * fact honest has to travel inside the text itself:
 *
 *   · that the row is an official REGISTRATION record, not live tenancy
 *   · that the hours are the operator's *published* hours, not an open/closed
 *     check made just now
 *   · that the directory can lag reality, so a store that has already left
 *     may still be listed
 *   · where it came from
 *
 * Pure and deterministic, so the same facility always yields the same text and
 * a test can assert the disclaimers are present.
 */
export type Lang = "ko" | "en" | "zh" | "ja";

export interface CopyableFacility {
  name: string;
  facilityItem?: string | null;
  terminalLabel?: string | null;
  floor?: string | null;
  areaLabel?: string | null;
  sideLabel?: string | null;
  locationRaw?: string | null;
  businessHoursRaw?: string | null;
  goodsBrands?: string | null;
  phone?: string | null;
}

export interface CopyLabels {
  location: string;
  hours: string;
  brands: string;
  phone: string;
  unknown: string;
}

/**
 * The two sentences that must never be separated from the data.
 *
 * `staleness` exists because the provider's directory is a registration
 * record, not a live tenancy feed: a shop that closed can remain listed until
 * the operator republishes. A reader who pastes this into a chat cannot see
 * the screen's own caveat, so it is repeated here.
 */
export const COPY_DISCLAIMER: Record<Lang, { record: string; basis: string; staleness: string; source: string }> = {
  ko: {
    record: "공항공사 공식 등록 자료이며 실시간 입점 현황이 아닙니다",
    basis: "공식 등록 영업시간 기준이며, 지금 문을 열었는지 확인한 것이 아닙니다",
    staleness: "공식 자료가 갱신되기 전에는 이미 퇴점한 매장이 표시될 수 있습니다",
    source: "출처: 인천국제공항공사 여객터미널 시설정보 현황 (공공데이터포털 15095064)",
  },
  en: {
    record: "An official airport-authority registration record, not live tenancy",
    basis: "Official published hours, not a check of whether it is open right now",
    staleness: "Until the operator republishes, a store that has already left may still be listed",
    source: "Source: Incheon International Airport Corporation passenger-terminal facility information (Public Data Portal 15095064)",
  },
  zh: {
    record: "为机场公社官方登记资料，并非实时入驻状况",
    basis: "以官方公布营业时间为准，并非当前是否营业的实时确认",
    staleness: "官方资料更新前，已撤店的店铺可能仍会显示",
    source: "来源：仁川国际机场公社 旅客航站楼设施信息现况（公共数据门户 15095064）",
  },
  ja: {
    record: "空港公社の公式登録資料であり、リアルタイムの入居状況ではありません",
    basis: "公式登録の営業時間基準であり、今営業中かを確認したものではありません",
    staleness: "公式資料が更新されるまで、すでに退店した店舗が表示される場合があります",
    source: "出典: 仁川国際空港公社 旅客ターミナル施設情報現況 (公共データポータル 15095064)",
  },
};

/** Builds the copied block. Fields the provider left empty are omitted, never invented. */
export function buildFacilityCopyText(facility: CopyableFacility, lang: Lang, labels: CopyLabels): string {
  const badges = [facility.terminalLabel, facility.floor, facility.areaLabel, facility.sideLabel]
    .filter((value): value is string => Boolean(value && value.trim()));
  const lines: string[] = [facility.name];
  if (facility.facilityItem?.trim()) lines.push(facility.facilityItem.trim());
  if (badges.length) lines.push(badges.join(" · "));
  lines.push("");
  if (facility.locationRaw?.trim()) lines.push(`${labels.location}: ${facility.locationRaw.trim()}`);
  // The hours label already carries "published hours" in every locale, so the
  // value can never appear as a bare time range with no basis attached.
  lines.push(`${labels.hours}: ${facility.businessHoursRaw?.trim() || labels.unknown}`);
  if (facility.goodsBrands?.trim()) lines.push(`${labels.brands}: ${facility.goodsBrands.trim()}`);
  if (facility.phone?.trim()) lines.push(`${labels.phone}: ${facility.phone.trim()}`);
  const disclaimer = COPY_DISCLAIMER[lang];
  lines.push("", `※ ${disclaimer.record}`, `※ ${disclaimer.basis}`, `※ ${disclaimer.staleness}`, disclaimer.source);
  return lines.join("\n");
}
