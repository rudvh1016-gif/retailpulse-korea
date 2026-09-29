/**
 * The staff share text and the lines of the one-page image.
 *
 * Built from the same prep result and the same sentence functions as the
 * screen, so a shared message can never carry a number the screen did not
 * show. It names its own date and time instead of "now", keeps the chosen
 * date in its link, and says that the link shows the latest data while the
 * saved text or image stays as it was when saved. Nothing personal goes in.
 */
import { sidesCopy } from "./airport-sides-copy";
import type { BusinessHours, BusinessPrep, PrepPlace, PrepSource } from "./business-prep";
import { actionText, factLine, hoursLabel, placeName, prepTime, sourceName, statusLine, type PrepLang } from "./business-prep-copy";
import { industryProfiles, type IndustryId } from "./industry-guidance";

type Row = Record<PrepLang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });

export const shareCopy = {
  title: row("직원에게 공유", "Share with staff", "分享给员工", "スタッフに共有"),
  copy: row("문구 복사", "Copy text", "复制文字", "文章をコピー"),
  image: row("이미지 저장", "Save image", "保存图片", "画像を保存"),
  share: row("공유하기", "Share", "分享", "共有"),
  preview: row("공유 문구 미리보기", "Preview the text", "预览分享文字", "共有文を確認"),
  copied: row("문구를 복사했습니다.", "Text copied.", "已复制文字。", "文章をコピーしました。"),
  copyFailed: row("복사하지 못했습니다. 아래 문구를 직접 선택해 복사하세요.", "Could not copy. Select the text below and copy it yourself.", "未能复制。请手动选择下方文字复制。", "コピーできませんでした。下の文章を選択してコピーしてください。"),
  imageReady: row("이미지를 만들었습니다. 기기의 다운로드 목록을 확인하세요.", "Image created. Check your device's downloads.", "图片已生成。请查看设备的下载列表。", "画像を作成しました。端末のダウンロードを確認してください。"),
  imageFailed: row("이미지를 만들지 못했습니다. 아래 문구를 직접 선택해 복사하세요.", "Could not create the image. Select the text below and copy it yourself.", "未能生成图片。请手动选择下方文字复制。", "画像を作成できませんでした。下の文章を選択してコピーしてください。"),
  shareChosen: row("공유 대상을 선택했습니다. 실제 전달 여부는 받는 쪽에서 확인하세요.", "A share target was chosen. Confirm delivery with the recipient.", "已选择分享对象。是否送达请向对方确认。", "共有先を選びました。届いたかは相手に確認してください。"),
  shareCancelled: row("공유를 취소했습니다.", "Sharing was cancelled.", "已取消分享。", "共有をキャンセルしました。"),
  shareFailed: row("공유 창을 열지 못했습니다. 문구 복사를 이용하세요.", "Could not open sharing. Use Copy text instead.", "未能打开分享。请使用复制文字。", "共有を開けませんでした。文章のコピーをご利用ください。"),
  selectable: row("직접 복사할 문구", "Text to copy yourself", "可手动复制的文字", "手動でコピーする文章"),
};

const labels = {
  place: row("장소", "Place", "地点", "場所"),
  industry: row("업종", "Business", "业态", "業種"),
  hours: row("영업시간", "Hours", "营业时间", "営業時間"),
  facts: row("영업시간 안에서 확인된 사실", "Official facts inside the hours", "营业时间内确认的事实", "営業時間内で確認できた事実"),
  actions: row("준비할 일", "What to prepare", "需要准备的事", "準備すること"),
  basis: row("자료 기준", "Data as of", "资料基准", "資料の基準"),
  source: row("출처", "Sources", "来源", "出典"),
  latest: row("최신 정보", "Latest", "最新信息", "最新情報"),
  savedAt: row("저장 시각 기준 내용입니다. 링크를 열면 최신 자료를 볼 수 있습니다.", "This is as of the time saved; the link shows the latest data.", "内容以保存时为准，打开链接可查看最新资料。", "保存時点の内容です。リンクを開くと最新の資料になります。"),
  none: row("없음", "None", "无", "なし"),
};

const weekdays: Record<PrepLang, string[]> = {
  ko: ["일", "월", "화", "수", "목", "금", "토"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
};

export function dateLabel(serviceDate: string, lang: PrepLang): string {
  const weekday = weekdays[lang][new Date(`${serviceDate}T00:00:00Z`).getUTCDay()] ?? "";
  return lang === "en" ? `${serviceDate} (${weekday})` : `${serviceDate} (${weekday})`;
}

/** The page for the same place and date; the date is always explicit. */
export function shareLink(origin: string, lang: PrepLang, serviceDate: string): string {
  return `${origin.replace(/\/+$/, "")}/${lang}/business?date=${serviceDate}`;
}

export interface ShareInput {
  prep: BusinessPrep;
  serviceDate: string;
  place: PrepPlace;
  industry: IndustryId;
  hours: BusinessHours | null;
  lang: PrepLang;
  link: string;
  /** When the reader saved it; printed as a date and time, never "now". */
  savedAt: string;
}

export interface ShareDocument {
  title: string;
  lines: Array<{ kind: "heading" | "text" | "item" | "note"; text: string }>;
}

function sourcesUsed(prep: BusinessPrep): PrepSource[] {
  const used = new Set<PrepSource>();
  for (const entry of prep.coverage) if (entry.status === "COVERED" || entry.status === "PARTIAL") used.add(entry.source);
  for (const action of prep.actions) used.add(action.source);
  if (prep.facts.some((fact) => fact.kind === "EVENTS")) used.add("TOURAPI_EVENTS");
  if (prep.facts.some((fact) => fact.kind === "HOLIDAY")) used.add("HOLIDAY_CALENDAR");
  if (prep.facts.some((fact) => fact.kind === "GATE_PEAK")) used.add("A1_FLIGHTS");
  return [...used];
}

/** One structure for both the copied text and the image, in reading order. */
export function buildShareDocument(input: ShareInput): ShareDocument {
  const { prep, serviceDate, lang } = input;
  const lines: ShareDocument["lines"] = [];
  lines.push({ kind: "text", text: `${dateLabel(serviceDate, lang)} · ${placeName(input.place, lang)}` });
  lines.push({ kind: "text", text: `${labels.industry[lang]}: ${industryProfiles[input.industry].label[lang]} · ${labels.hours[lang]}: ${hoursLabel(input.hours, lang)}` });
  lines.push({ kind: "heading", text: labels.facts[lang] });
  if (prep.facts.length) for (const fact of prep.facts) lines.push({ kind: "item", text: factLine(fact, serviceDate, lang) });
  else lines.push({ kind: "item", text: labels.none[lang] });
  lines.push({ kind: "heading", text: labels.actions[lang] });
  prep.actions.forEach((action, index) => {
    const text = actionText(action, serviceDate, input.industry, lang);
    lines.push({ kind: "item", text: `${index + 1}. ${text.body}` });
  });
  if (!prep.actions.length || prep.hourlyStatus !== "ACTIONS") lines.push({ kind: "item", text: statusLine(prep.actions.length ? prep.hourlyStatus : prep.status, lang) });
  const issued = prep.coverage.filter((entry) => entry.issuedAt && (entry.status === "COVERED" || entry.status === "PARTIAL"))
    .map((entry) => `${sourceName(entry.source, lang)} ${prepTime(entry.issuedAt as string, serviceDate, lang)}`);
  // Gate departures are a flight count with their own collection time.
  for (const fact of prep.facts) if (fact.kind === "GATE_PEAK" && fact.issuedAt) issued.push(`${sourceName("A1_FLIGHTS", lang)} ${prepTime(fact.issuedAt, serviceDate, lang)}`);
  if (input.place.kind === "airport") lines.push({ kind: "note", text: sidesCopy.notice[lang] });
  lines.push({ kind: "note", text: `${labels.basis[lang]}: ${issued.length ? issued.join(" · ") : labels.none[lang]} (KST)` });
  lines.push({ kind: "note", text: `${labels.source[lang]}: ${sourcesUsed(prep).map((source) => sourceName(source, lang)).join(", ") || labels.none[lang]}` });
  const savedMs = Date.parse(input.savedAt);
  const savedDay = Number.isFinite(savedMs) ? new Date(savedMs + 9 * 3_600_000).toISOString().slice(0, 10) : serviceDate;
  const saved = `${savedDay} ${prepTime(input.savedAt, savedDay, lang)} KST`;
  lines.push({ kind: "note", text: `${saved} · ${labels.savedAt[lang]}` });
  lines.push({ kind: "note", text: `${labels.latest[lang]}: ${input.link}` });
  return { title: "KORETAIL", lines };
}

export function shareText(document: ShareDocument): string {
  return [`[${document.title}]`, ...document.lines.map((line) => (line.kind === "heading" ? `\n■ ${line.text}` : line.kind === "item" ? `- ${line.text}` : line.text))]
    .join("\n").replace(/\n{3,}/g, "\n\n");
}
