/** Counts and end-to-end times have different meanings; never derive one from the other. */
export function checkpointMethodCopy(lang:string){return ({
 ko:'인원은 출국장 대기 인원, 시간은 출국장·보안검색·출국심사 합계(일부 추정)입니다.',
 en:'Counts are hall queues; time combines the hall, security and immigration, including estimates.',
 zh:'人数为出境大厅排队人数；时间合计大厅、安检及出境审查，含部分估算。',
 ja:'人数は出国場の待機人数、時間は出国場・保安検査・出国審査の合計（一部推定）です。',
} as Record<string,string>)[lang]??'Hall queue counts; combined hall, security and immigration time includes estimates.';}
export function checkpointTimingCopy(lang:string){return ({
 ko:'약 15분 간격 수집·전달 지연 가능 · 20분 초과는 지난값',
 en:'Collected about every 15 min; delivery may lag. Over 20 min is marked prior.',
 zh:'约每15分钟采集，传送可能延迟；超过20分钟标为旧值。',
 ja:'約15分間隔で収集・配信に遅延あり。20分超は前回値と表示。',
} as Record<string,string>)[lang]??'About 15-minute collection; delivery may lag. Over 20 minutes is marked prior.';}
