/** Manually reviewed declaration guidance, 2026-10-22; never an automatic tax calculation. */
export function arrivalCountryActions(id:string,answers:Record<string,string>){
 if(answers.purpose!=='ordinary')return undefined;
 if(id==='JP'&&['adult','young'].includes(answers.age))return {
  action:'한도 이내여도 입국 물품을 신고하세요. 과세·제한품이 있으면 적색통로로 가세요.',
  caution:answers.age==='young'?'만 20세 미만은 술·담배 면세가 없습니다.':'1개·1세트 가격이 일반물품 한도를 넘으면 그 물품 전체 가격이 과세 대상입니다.',
 };
 if(id==='VN'&&['adult','minor'].includes(answers.age))return {
  action:'초과 휴대품은 세관 검사구역을 지나기 전에 신고하세요.',
  caution:answers.age==='minor'?'만 18세 미만은 술·담배 면세에서 제외됩니다.':'술과 담배의 선택형 한도를 모두 더하지 않습니다.',
 };
 if(id==='TH')return {
  scope:'본인용·적정 수량의 휴대품 기준입니다.',
  action:'일반물품 초과 시 여권·영수증(있는 경우)과 함께 세관 신고창구로 가세요.',
  caution:'술·담배 초과분은 세관 지정함에 반납하세요. 납세만으로 반입이 보장되지는 않습니다.',
 };
 return undefined;
}

/** Hide only the adult bottle-size sentence for Japan's 6–19 group, retaining baggage aggregation. */
export function arrivalResultNotes(id:string,answers:Record<string,string>,notes:string[]){
 if(id==='JP'&&answers.age==='young')return notes.map(note=>note.replace(/^술은 병 크기와 무관하게 \d+병이라는 뜻이 아닙니다\.\s*/,''));
 if(id==='TH')return notes.filter(note=>!note.startsWith('술·담배 면세 적용 연령'));
 return notes;
}

/** Thailand's unverified age rule belongs next to its alcohol/tobacco figures, not hidden elsewhere. */
export function arrivalAlcoholNotes(id:string,notes:string[]){
 return id==='TH'?notes.filter(note=>note.startsWith('술·담배 면세 적용 연령')):[];
}
