export type ArrivalConditions=Record<string,string[]>;
export type ArrivalGuidance={when:ArrivalConditions;title:string;reason:string;nextStep:string;details?:string[];sourceUrls?:string[]};
export type ArrivalCountry={id:string;name:string;scope:string;checkedAt:string;verifiedAt?:string;reviewScope?:string;reviewReferences?:Array<{label:string;url:string}>;effectiveLabel:string;conditions:Array<{id:string;label:string;when?:ArrivalConditions;options:Array<{id:string;label:string}>}>;results:Array<{when:ArrivalConditions;label:string;summary?:string;facts:Array<{label:string;value:string}>;notes:string[]}>;guidance?:ArrivalGuidance[];procedures?:{summary:string;sections:Array<{title:string;notes:string[]}>;sourceUrls:string[]};notes:string[];sources:Array<{label:string;url:string}>};
export type ArrivalCheck={id:string;state:string;lastCheckedAt:string;nextCheckAt:string;lastSuccessfulCheckAt?:string|null;accessReviewRequired?:boolean};
const matches=(when:ArrivalConditions,answers:Record<string,string>)=>Object.entries(when).every(([key,values])=>values.includes(answers[key]));
export function visibleArrivalConditions(country:ArrivalCountry,answers:Record<string,string>){
 const purposeOnly=['special','unknown'].includes(answers.purpose)||country.guidance?.some(item=>Object.keys(item.when).length===1&&item.when.purpose&&matches(item.when,answers));
 return country.conditions.filter(condition=>(!purposeOnly||condition.id==='purpose')&&(!condition.when||matches(condition.when,answers)));
}

/** Drop no-longer-applicable answers, so switching residence cannot revive an old eligibility answer. */
export function updateArrivalAnswer(country:ArrivalCountry,answers:Record<string,string>,id:string,value:string){
 const next={...answers,[id]:value};
 const visibleIds=new Set(visibleArrivalConditions(country,next).map(condition=>condition.id));
 for(const condition of country.conditions)if(!visibleIds.has(condition.id))delete next[condition.id];
 return next;
}

/** A missing/unsupported answer is never an exemption of zero or an ordinary allowance. */
export function evaluateArrival(country:ArrivalCountry,answers:Record<string,string>):{visible:ArrivalCountry['conditions'];complete:boolean;result?:ArrivalCountry['results'][number];guidance?:Omit<ArrivalGuidance,'when'>}{
 const visible=visibleArrivalConditions(country,answers);
 const complete=visible.every(condition=>condition.options.some(option=>option.id===answers[condition.id]));
 if(!complete)return {visible,complete,result:undefined,guidance:undefined};
 const unknown=visible.filter(condition=>answers[condition.id]==='unknown');
 if(unknown.length)return {visible,complete,result:undefined,guidance:{title:'선택한 조건을 먼저 확인해 주세요',reason:`${unknown.map(condition=>condition.label).join(' · ')}이(가) 아직 확인되지 않아 한도를 확정하지 않았습니다.`,nextStep:'해당 조건을 확인해 다시 선택하거나, 가져갈 물품과 여행 일정을 도착지 세관에 문의하세요. 미확인은 면세 없음이라는 뜻이 아닙니다.'}};
 const guidance=country.guidance?.find(item=>matches(item.when,answers));
 if(guidance)return {visible,complete,result:undefined,guidance};
 if(answers.purpose==='special')return {visible,complete,result:undefined,guidance:{title:'일반 여행자 한도와 별도로 확인해야 합니다',reason:'판매·대리구매·승무원·이주 등은 이 안내의 일반 개인 사용 범위와 다릅니다.',nextStep:'물품 용도와 여행자 자격을 세관에 알리고 해당 신고·허가·면세 절차를 확인하세요. 일반 여행자 금액을 대신 적용하지 않습니다.'}};
 // Reuse the reviewed child-scope note; do not change Japan's numeric publication baseline.
 if(country.id==='JP'&&answers.age==='child')return {visible,complete,result:undefined,guidance:{title:'만 6세 미만은 본인 사용 물품만 별도 확인합니다',reason:country.notes.find(note=>note.startsWith('6세 미만'))??'이 연령의 일반물품 기준을 확인하지 못했습니다.',nextStep:'아이가 사용할 물품임을 확인하고, 개별 물품의 인정 여부를 일본 세관에 문의하세요. 일반 성인 한도나 면세액 0으로 계산하지 않습니다.',sourceUrls:[country.sources[0].url]}};
 const result=country.results.find(item=>matches(item.when,answers));
 if(result)return {visible,complete,result,guidance:undefined};
 const selected=visible.map(condition=>`${condition.label}: ${condition.options.find(option=>option.id===answers[condition.id])!.label}`);
 return {visible,complete,result:undefined,guidance:{title:'이 조합의 적용 기준은 별도 확인이 필요합니다',reason:`선택한 조건(${selected.join(' / ')})에 맞는 기준이 이 안내에서 검증되지 않았습니다.`,nextStep:'아래 공식 근거에서 해당 조건을 확인하거나 세관에 문의하세요. 기본 한도나 면세액 0으로 계산하지 않습니다.'}};
}

export function arrivalCheckSummary(check?:ArrivalCheck){
 if(!check)return '자동 확인 기록 없음';
 if(check.accessReviewRequired)return '자동 조회 미구성 · 수동 검토본';
 return ({NUMERIC_VERIFIED:'일본 일부 수치 자동 확인',SOURCE_UNCHANGED:'기준 원문과 동일',REVIEW_REQUIRED:'원문 변경 · 재검토 필요',CHECK_UNAVAILABLE:'자동 재확인 실패 · 검토본 유지',BASELINE_REQUIRED:'자동 비교 기준 검토 필요',STALE:'자동 확인 지연 · 검토본 유지'} as Record<string,string>)[check.state]??'자동 확인 상태 미확인';
}

export function arrivalCheckExplanation(check?:ArrivalCheck){
 if(!check)return '저장된 자동 확인 기록이 없습니다. 수동 검토일과 자동 확인 성공일은 다릅니다.';
 if(check.accessReviewRequired)return '이 출처는 자동 접근 검토가 끝나지 않아 원문을 요청하지 않았습니다. 상태 점검일은 공식 원문 확인일이나 조회 실패일이 아닙니다.';
 return ({NUMERIC_VERIFIED:'일본 주류·궐련·향수의 검증된 수치만 자동 확인했습니다. 다른 조건·법령의 최신성을 보장하지 않습니다.',SOURCE_UNCHANGED:'검토된 한 출처의 내용이 기준 원문과 같습니다. 모든 최신 법령을 확인했다는 뜻은 아닙니다.',REVIEW_REQUIRED:'원문이 달라져 재검토가 필요합니다. 법령 변경이 확인된 것은 아니며 마지막 검토 내용을 유지합니다.',CHECK_UNAVAILABLE:'최근 자동 조회를 완료하지 못했습니다. 실패 시각으로 공식 자료 확인일을 갱신하지 않습니다.',BASELINE_REQUIRED:'자동 비교에 사용할 원문 기준을 검토해야 합니다. 자동 확인 성공으로 보지 않습니다.',STALE:'예정된 자동 확인이 지연됐습니다. 최신 확인으로 표시하지 않고 마지막 검토 내용을 유지합니다.'} as Record<string,string>)[check.state]??'저장된 상태만으로 확인 결과를 판단할 수 없습니다.';
}
