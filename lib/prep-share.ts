/**
 * The staff share text and the lines of the one-page image.
 *
 * Built from the same prep result and fact sentences as the screen, with
 * a compact selection of facts and concrete preparation instructions. It names its own date and time instead of "now", keeps the chosen
 * date in its link, and says that the link shows the latest data while the
 * saved text or image stays as it was when saved. Nothing personal goes in.
 */
import { sidesCopy } from "./airport-sides-copy";
import type { BusinessHours, BusinessPrep, PrepAction, PrepFact, PrepPlace, PrepSource } from "./business-prep";
import { factLine, hoursLabel, isWholeDayFact, placeName, prepSpan, prepTime, sourceName, statusLine, type PrepLang } from "./business-prep-copy";
import { industryProfiles, type IndustryId } from "./industry-guidance";
import { unselectedIndustryLabel } from "./industry-ids";
import { businessScopeParams, sharedBusinessPlace } from "./business-preferences";

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
  facts: row("지금 핵심", "Key points", "重点", "要点"),
  reference: row("하루 전체 참고 (영업시간과 무관)", "Whole-day reference (not limited to the hours)", "全天参考（不限于营业时间）", "終日の参考（営業時間とは別）"),
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
export function shareLink(origin: string, lang: PrepLang, serviceDate: string, place?: PrepPlace): string {
  const params=new URLSearchParams({date:serviceDate});
  if(place) businessScopeParams(place).forEach((value,key)=>params.set(key,value));
  return `${origin.replace(/\/+$/, "")}/${lang}/business?${params}`;
}

/** Explicit share scope takes precedence for this visit; never writes recipient preferences. */
export function sharedPrepPlace(params: Pick<URLSearchParams, 'get'>): PrepPlace | null {
 return sharedBusinessPlace(params);
}

export interface ShareInput {
  prep: BusinessPrep;
  serviceDate: string;
  place: PrepPlace;
  industry: IndustryId | null;
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

const factSource=(fact:PrepFact):PrepSource=>fact.kind==='CROWD_MAX'?'SEOUL_FORECAST':fact.kind==='RAIN_MAX'||fact.kind==='TEMPERATURE_RANGE'?'KMA_FORECAST':fact.kind==='EVENTS'?'TOURAPI_EVENTS':fact.kind==='HOLIDAY'?'HOLIDAY_CALENDAR':fact.kind==='AIRPORT_PEAK'||fact.kind==='AIRPORT_TOTAL'?'A5_FORECAST':'A1_FLIGHTS';
const priority:PrepFact['kind'][]=['CROWD_MAX','AIRPORT_PEAK','FLIGHT_SPLIT','GATE_PEAK','RAIN_MAX','TEMPERATURE_RANGE','AIRPORT_TOTAL','HOLIDAY','EVENTS'];
function briefFact(fact:PrepFact,day:string,lang:PrepLang){
  if(fact.kind==='EVENTS')return row('공식 행사 기간에 포함 · 실제 운영 시간·장소는 별도 확인','Within an official event period · verify operating times and location','在官方活动期间 · 请另行确认实际时间与地点','公式イベントの期間内 · 実際の時間と場所は別途確認')[lang];
  const text=factLine(fact,day,lang),sourceSuffix=text.lastIndexOf(` (${sourceName(factSource(fact),lang)}`);
  return sourceSuffix<0?text:text.slice(0,sourceSuffix);
}
function briefAction(action:PrepAction,day:string,industry:IndustryId|null,lang:PrepLang){
 const span=action.startAt&&action.endAt?prepSpan(action.startAt,action.endAt,day,lang):'';
 const peak=industry ? industryProfiles[industry].checklist[lang].find(entry=>entry[0]==='peak')?.[2] : undefined;
 const instruction:Record<PrepAction['rule'],Row>={
  CROWD:row('계산대·진열·통로를 정리하세요.','Clear the counter, displays and walkways.','整理收银台、陈列与通道。','レジ・陳列・通路を整えてください。'),
  AIRPORT_PEAK:row('계산대와 재고를 확인하고 매장 실제 대기 줄을 살피세요.','Check the counter, stock and actual store queue.','检查收银台、库存与店前实际排队。','レジ・在庫と店前の実際の待ちを確認してください。'),
  GATE_PEAK:row('출발 시간표를 확인하고 매장 실제 대기 줄을 살피세요.','Check the departure board and actual store queue.','核对出发时刻表与店前实际排队。','出発時刻表と店前の実際の待ちを確認してください。'),
  RAIN:row('우산 보관대와 입구 바닥을 점검하세요.','Check the umbrella stand and entrance floor.','检查伞架与入口地面。','傘立てと入口の床を点検してください。'),
  HEAT:row('냉방과 대기 공간을 점검하세요.','Check cooling and the waiting area.','检查冷气与等候区。','冷房と待機スペースを点検してください。'),
  COLD:row('난방과 출입문을 점검하세요.','Check heating and the entrance.','检查暖气与出入口。','暖房と出入口を点検してください。'),
  EVENT:row('주최 측의 실제 행사 시간·장소부터 확인하세요.','Verify actual event times and location with the organizer.','先向主办方确认实际活动时间与地点。','主催者の実際の開催時間と場所を確認してください。'),
  HOLIDAY:row('공휴일 영업시간과 다국어 안내를 확인하세요.','Check holiday opening hours and multilingual signs.','检查假日营业时间与多语言指引。','祝日の営業時間と多言語案内を確認してください。'),
 };
 return `${span?`${span} · `:''}${action.rule==='CROWD'&&peak?peak:instruction[action.rule][lang]}`;
}

/** One brief for preview, clipboard, native share and image. Numerical evidence is never re-estimated. */
export function buildShareDocument(input: ShareInput): ShareDocument {
 const {prep,serviceDate,lang}=input,lines:ShareDocument['lines']=[];
 lines.push({kind:'text',text:`${dateLabel(serviceDate,lang)} · ${placeName(input.place,lang)}`});
 lines.push({kind:'text',text:`${labels.industry[lang]}: ${input.industry ? industryProfiles[input.industry].label[lang] : unselectedIndustryLabel[lang]} · ${labels.hours[lang]}: ${hoursLabel(input.hours,lang)}`});
 // The withheld flight-share passenger estimate is not reintroduced by a share export.
 const facts=prep.facts.filter(fact=>fact.kind!=='FLIGHT_SPLIT_ESTIMATE').sort((a,b)=>priority.indexOf(a.kind)-priority.indexOf(b.kind)).slice(0,3);
 const actions=prep.actions.slice(0,3);
 lines.push({kind:'heading',text:labels.facts[lang]});
 const inHours=facts.filter(fact=>!isWholeDayFact(fact)),wholeDay=facts.filter(isWholeDayFact);
 for(const fact of inHours)lines.push({kind:'item',text:briefFact(fact,serviceDate,lang)});
 if(!facts.length)lines.push({kind:'item',text:statusLine(prep.status,lang)});
 if(wholeDay.length){lines.push({kind:'heading',text:labels.reference[lang]});for(const fact of wholeDay)lines.push({kind:'item',text:briefFact(fact,serviceDate,lang)});}
 lines.push({kind:'heading',text:labels.actions[lang]});
 const instructions=[...new Set(actions.map(action=>briefAction(action,serviceDate,input.industry,lang)))];
 if(!instructions.length)instructions.push(row('최신 자료와 매장 실제 대기·재고를 확인하세요.','Check the latest data, actual store queue and stock.','核对最新资料、店内实际排队与库存。','最新資料と店の実際の待ち・在庫を確認してください。')[lang]);
 instructions.forEach((text,index)=>lines.push({kind:'item',text:`${index+1}. ${text}`}));
 const used=new Set<PrepSource>([...facts.map(factSource),...actions.map(action=>action.source)]);
 const sources=[...used].map(source=>{
  const coverage=prep.coverage.find(entry=>entry.source===source);
  const times=[...new Set([...facts.filter(fact=>factSource(fact)===source).map(fact=>'issuedAt' in fact?fact.issuedAt:null),...actions.filter(action=>action.source===source).map(action=>action.issuedAt),coverage?.issuedAt].filter((at):at is string=>Boolean(at)))];
  const partial=coverage?.status==='PARTIAL'?` · ${row('일부 시간만 확인','partial hours only','仅部分时段','一部の時間のみ')[lang]}${coverage.coveredStartAt&&coverage.coveredEndAt?` ${prepSpan(coverage.coveredStartAt,coverage.coveredEndAt,serviceDate,lang)}`:''}`:'';
  return `${sourceName(source,lang)}${times.length?` ${times.map(at=>prepTime(at,serviceDate,lang)).join('/')}`:''}${partial}`;
 });
 if(input.place.kind==='airport')lines.push({kind:'note',text:sidesCopy.notice[lang]});
 if(prep.hourlyStatus!=='ACTIONS'&&prep.hourlyStatus!=='NO_CHANGE'&&facts.length)lines.push({kind:'note',text:statusLine(prep.hourlyStatus,lang)});
 if(sources.length)lines.push({kind:'note',text:`${labels.source[lang]} · ${labels.basis[lang]}: ${sources.join(' / ')} (KST)`});
 const savedMs=Date.parse(input.savedAt),savedDay=Number.isFinite(savedMs)?new Date(savedMs+9*3_600_000).toISOString().slice(0,10):serviceDate;
 lines.push({kind:'note',text:`${savedDay} ${prepTime(input.savedAt,savedDay,lang)} KST · ${row('저장본 · 링크에서 최신 자료 확인','Saved copy · link opens latest data','保存版本 · 链接查看最新资料','保存版 · リンクで最新資料を確認')[lang]}`});
 lines.push({kind:'note',text:`${labels.latest[lang]}: ${input.link}`});
 return {title:'KORETAIL',lines};
}

export function shareText(document: ShareDocument): string {
  return [`[${document.title}]`, ...document.lines.map((line) => (line.kind === "heading" ? `\n■ ${line.text}` : line.kind === "item" ? `- ${line.text}` : line.text))]
    .join("\n").replace(/\n{3,}/g, "\n\n");
}
