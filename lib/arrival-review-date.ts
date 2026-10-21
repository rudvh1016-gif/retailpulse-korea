/** Only substantive review evidence is a review date; collection attempts never are. */
export function arrivalReviewDateLabel(country:{verifiedAt?:string|null;checkedAt?:string}):string {
 const value=country.verifiedAt;
 if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '미확인 · 검토 필요';
 const parsed=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:'미확인 · 검토 필요';
}

/** Human-readable source-review wording, never an attempted-check date. */
export function arrivalReviewSentence(country:{verifiedAt?:string|null;checkedAt?:string}):string {
 const date=arrivalReviewDateLabel(country);
 return date==='미확인 · 검토 필요'?'공식 자료를 확인한 날짜가 없어 직접 확인이 필요해요.':`${date}에 공식 자료를 확인했어요.`;
}
