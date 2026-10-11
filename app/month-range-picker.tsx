"use client";
import { useMemo } from "react";
import type { Lang } from "./retailpulse-data";
import { localText } from "./local-text";

export function MonthRangePicker({
  lang, start, end, min, max, onStart, onEnd, onApply, onCancel,
}: {
  lang: Lang; start: string; end: string; min: string; max: string;
  onStart: (value: string) => void; onEnd: (value: string) => void;
  onApply: (start: string, end: string) => void; onCancel: () => void;
}) {
  const monthChoices = useMemo(() => {
    const months: string[] = [];
    const [minYear, minMonth] = min.split("-").map(Number);
    const [maxYear, maxMonth] = max.split("-").map(Number);
    for (let year = minYear, month = minMonth; year < maxYear || (year === maxYear && month <= maxMonth);) {
      months.push(`${year}-${String(month).padStart(2, "0")}`);
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return months;
  }, [min, max]);
  const invalid = end < start;
  const monthLabel = (month: string) => {
    const [year, value] = month.split("-");
    return lang === "en" ? `${year}-${value}` : `${year}.${value}`;
  };
  return <form className="month-range" onSubmit={(event) => { event.preventDefault(); if (!invalid) onApply(start, end); }}>
    <div className="month-range-head">
      <p className="eyebrow">{localText(lang, { ko: "기간 설정", en: "CUSTOM RANGE", zh: "自定义期间", ja: "期間指定" })}</p>
      <p>{localText(lang, {
        ko: "이 사이트가 보유한 공식 월별 데이터 범위 안에서 시작월과 종료월을 선택하세요.",
        en: "Choose a start and end month within the official monthly data held in this site.",
        zh: "请在本站已收录的官方月度数据范围内选择开始月和结束月。",
        ja: "このサイトに収録された公式月次データの範囲内で開始月と終了月を選択してください。",
      })}</p>
    </div>
    <div className="month-range-fields">
      <label><span>{localText(lang, { ko: "시작월", en: "START MONTH", zh: "开始月", ja: "開始月" })}</span><select name="startMonth" aria-label={localText(lang, { ko: "시작월", en: "Start month", zh: "开始月", ja: "開始月" })} value={start} onChange={(event) => onStart(event.target.value)}>{monthChoices.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
      <span aria-hidden="true">→</span>
      <label><span>{localText(lang, { ko: "종료월", en: "END MONTH", zh: "结束月", ja: "終了月" })}</span><select name="endMonth" aria-label={localText(lang, { ko: "종료월", en: "End month", zh: "结束月", ja: "終了月" })} value={end} onChange={(event) => onEnd(event.target.value)}>{monthChoices.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label>
    </div>
    {invalid && <p className="month-range-error" role="alert">{localText(lang, { ko: "종료월을 시작월과 같거나 뒤로 선택하세요.", en: "Choose an end month on or after the start month.", zh: "请选择不早于开始月的结束月。", ja: "終了月を開始月以降に設定してください。" })}</p>}
    <div className="month-range-actions">
      <button type="button" onClick={onCancel}>{localText(lang, { ko: "취소", en: "CANCEL", zh: "取消", ja: "キャンセル" })}</button>
      <button type="submit" className="primary" disabled={invalid}>{localText(lang, { ko: "이 기간 보기", en: "VIEW THIS PERIOD", zh: "查看该期间", ja: "この期間を見る" })}</button>
    </div>
    <small className="month-range-coverage">{localText(lang, { ko: "선택 가능", en: "AVAILABLE", zh: "可选范围", ja: "選択可能" })} · {min} — {max}</small>
  </form>;
}
