"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { safeOfficialEventHomepage } from "../lib/event-presentation";

export type VisitorShowLanguage = "ko" | "en" | "zh" | "ja";

/**
 * Deliberately narrow: the visitor view accepts only facts that are safe to
 * hand across the desk. Statistical signals, inferred status and internal
 * diagnostics cannot accidentally enter this surface through this API.
 */
export interface TourismVisitorShowContent {
  officialEventTitleKo: string;
  officialEventPeriod: string;
  officialEventAddressKo?: string | null;
  officialEventUrl?: string | null;
  officialEventSource: string;
  deterministicWeatherNote?: Partial<Record<VisitorShowLanguage, string>> | null;
}

export interface TourismVisitorShowProps {
  open: boolean;
  content: TourismVisitorShowContent | null;
  triggerRef: RefObject<HTMLElement | null>;
  onRequestClose: () => void;
  initialLanguage?: VisitorShowLanguage;
}

const languageLabels: Record<VisitorShowLanguage, string> = {
  ko: "한국어",
  en: "English",
  zh: "中文",
  ja: "日本語",
};

const copy = {
  ko: {
    title: "관광객에게 보여주기",
    description: "공식 행사 정보와 실용적인 날씨 안내만 보여줍니다.",
    language: "표시 언어",
    event: "공식 행사 정보",
    officialTitle: "공식 행사명",
    period: "공식 행사기간",
    address: "주소",
    officialPage: "공식 페이지",
    source: "출처",
    weather: "날씨 안내",
    close: "닫기",
    unverifiedName: "공식 외국어명은 확인되지 않았습니다. 공식 한국어명을 그대로 표시합니다.",
    operationCaveat: "공식 행사기간만으로 실제 운영 여부나 운영시간을 확인할 수 없습니다. 공식 안내를 확인하세요.",
  },
  en: {
    title: "Visitor information",
    description: "Only official event details and a practical weather note are shown.",
    language: "Display language",
    event: "Official event information",
    officialTitle: "Official event name",
    period: "Official event period",
    address: "Address",
    officialPage: "Official page",
    source: "Source",
    weather: "Weather note",
    close: "Close",
    unverifiedName: "An official foreign-language name has not been verified. The official Korean name is shown unchanged.",
    operationCaveat: "The official event period does not confirm actual operation or opening hours. Check the official notice.",
  },
  zh: {
    title: "向游客展示",
    description: "仅显示官方活动信息和实用天气提示。",
    language: "显示语言",
    event: "官方活动信息",
    officialTitle: "官方活动名称",
    period: "官方活动期间",
    address: "地址",
    officialPage: "官方网站",
    source: "来源",
    weather: "天气提示",
    close: "关闭",
    unverifiedName: "尚未确认官方外语名称。以下内容保留官方韩文名称。",
    operationCaveat: "官方活动期间并不能确认实际是否开放或开放时间。请查看官方公告。",
  },
  ja: {
    title: "観光客に見せる",
    description: "公式イベント情報と実用的な天気案内だけを表示します。",
    language: "表示言語",
    event: "公式イベント情報",
    officialTitle: "公式イベント名",
    period: "公式イベント期間",
    address: "住所",
    officialPage: "公式ページ",
    source: "出典",
    weather: "天気案内",
    close: "閉じる",
    unverifiedName: "公式の外国語名は確認できていません。公式の韓国語名をそのまま表示します。",
    operationCaveat: "公式イベント期間だけでは、実際の開催状況や開催時間は確認できません。公式案内をご確認ください。",
  },
} as const;

const visitorLanguages = Object.keys(languageLabels) as VisitorShowLanguage[];

export function TourismVisitorShow({
  open,
  content,
  triggerRef,
  onRequestClose,
  initialLanguage = "ko",
}: TourismVisitorShowProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<VisitorShowLanguage | null>(null);
  const language = selectedLanguage ?? initialLanguage;
  const id = useId();
  const titleId = `${id}-visitor-show-title`;
  const descriptionId = `${id}-visitor-show-description`;
  const labels = copy[language];
  const officialUrl = safeOfficialEventHomepage(content?.officialEventUrl);
  const weatherNote = content?.deterministicWeatherNote?.[language]?.trim() || null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && content && !dialog.open) dialog.showModal();
    if ((!open || !content) && dialog.open) dialog.close();
  }, [content, open]);

  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    setSelectedLanguage(null);
    triggerRef.current?.focus();
    onRequestClose();
  };

  return <dialog
    ref={dialogRef}
    className="tourism-visitor-show"
    lang={language}
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    onCancel={(event) => {
      event.preventDefault();
      closeDialog();
    }}
    onClose={() => {
      setSelectedLanguage(null);
      triggerRef.current?.focus();
      if (open) onRequestClose();
    }}
  >
    <div className="tourism-visitor-show-inner">
      <header className="tourism-visitor-show-header">
        <div>
          <h2 id={titleId}>{labels.title}</h2>
          <p id={descriptionId}>{labels.description}</p>
        </div>
        <button
          type="button"
          className="tourism-visitor-show-close"
          onClick={closeDialog}
          autoFocus
          aria-label={labels.close}
        >{labels.close}</button>
      </header>

      <div className="tourism-visitor-show-languages" role="group" aria-label={labels.language}>
        {visitorLanguages.map((candidate) => <button
          key={candidate}
          type="button"
          lang={candidate}
          aria-pressed={language === candidate}
          onClick={() => setSelectedLanguage(candidate)}
        >{languageLabels[candidate]}</button>)}
      </div>

      {content && <div className="tourism-visitor-show-content">
        <section className="tourism-visitor-show-event" aria-label={labels.event}>
          <h3>{labels.event}</h3>
          {language !== "ko" && <p className="tourism-visitor-show-name-note">{labels.unverifiedName}</p>}
          <dl>
            <div>
              <dt>{labels.officialTitle}</dt>
              <dd lang="ko">{content.officialEventTitleKo}</dd>
            </div>
            <div>
              <dt>{labels.period}</dt>
              <dd>{content.officialEventPeriod}</dd>
            </div>
            {content.officialEventAddressKo && <div>
              <dt>{labels.address}</dt>
              <dd lang="ko">{content.officialEventAddressKo}</dd>
            </div>}
            {officialUrl && <div>
              <dt>{labels.officialPage}</dt>
              <dd><a href={officialUrl} target="_blank" rel="noreferrer">{labels.officialPage}</a></dd>
            </div>}
            <div>
              <dt>{labels.source}</dt>
              <dd>{content.officialEventSource}</dd>
            </div>
          </dl>
          <p className="tourism-visitor-show-operation-caveat">{labels.operationCaveat}</p>
        </section>

        {weatherNote && <section className="tourism-visitor-show-weather" aria-label={labels.weather}>
          <h3>{labels.weather}</h3>
          <p>{weatherNote}</p>
        </section>}
      </div>}
    </div>
  </dialog>;
}
