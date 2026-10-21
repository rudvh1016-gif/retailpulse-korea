/** Only substantive review evidence is a review date; collection attempts never are. */
export function arrivalReviewDateLabel(country:{verifiedAt?:string|null;checkedAt?:string}):string {
 const value=country.verifiedAt;
 if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '미확인 · 검토 필요';
 const parsed=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:'미확인 · 검토 필요';
}
