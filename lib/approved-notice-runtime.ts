import {APPROVED_NOTICE_SOURCES,checkApprovedNotices} from './approved-notice-changecheck.mjs';
interface NoticeState {sourceId:string;checkedAt:string;lastCompletedCheckAt?:string|null;status:string;reason?:string;observedSHA256?:string|null;requiresReview?:boolean;accessBlocked?:boolean}
interface NoticeRow {source_id:string;checked_at:string;state:string}
export async function readApprovedNoticeChecks(db:Pick<D1Database,'prepare'>):Promise<NoticeRow[]>{
 const reply=await db.prepare('SELECT source_id,checked_at,state FROM approved_notice_checks ORDER BY source_id LIMIT 2').all<NoticeRow>();
 if(!reply.success)throw Error('NOTICE_METADATA_READ_FAILED');return reply.results??[];
}
function decode(row:NoticeRow):NoticeState{
 const state=JSON.parse(row.state) as NoticeState;
 if(state.sourceId!==row.source_id||state.checkedAt!==row.checked_at||!Number.isFinite(Date.parse(state.checkedAt))||!['SOURCE_UNCHANGED','REVIEW_REQUIRED','ERROR'].includes(state.status)||typeof state.requiresReview!=='boolean'||typeof state.accessBlocked!=='boolean'||(state.observedSHA256!=null&&!/^[a-f0-9]{64}$/.test(state.observedSHA256)))throw Error('NOTICE_METADATA_REVIEW_REQUIRED');
 return state;
}
export async function refreshApprovedNoticeChecks(db:Pick<D1Database,'prepare'>,now=new Date(),fetchImpl:typeof fetch=fetch){
 const rows=await readApprovedNoticeChecks(db),previous=rows.map(decode);
 const result=await checkApprovedNotices(previous,now,fetchImpl);
 for(const item of result.results){
  if(!('checkedAt' in item))continue;
  const before=rows.find(row=>row.source_id===item.sourceId);
  // Store only bounded evidence metadata. CAS prevents a racing run from clearing
  // a review/access block. No write touches official_calendar_current or seed data.
  const state:NoticeState={sourceId:item.sourceId,checkedAt:item.checkedAt!,lastCompletedCheckAt:item.lastCompletedCheckAt,status:item.status,reason:item.reason,observedSHA256:item.observedSHA256,requiresReview:item.requiresReview,accessBlocked:'accessBlocked' in item?item.accessBlocked:false};
  const reply=await db.prepare(`INSERT INTO approved_notice_checks(source_id,checked_at,state) VALUES(?,?,?)
   ON CONFLICT(source_id) DO UPDATE SET checked_at=excluded.checked_at,state=excluded.state
   WHERE approved_notice_checks.state IS ? AND approved_notice_checks.checked_at<excluded.checked_at`).bind(item.sourceId,state.checkedAt,JSON.stringify(state),before?.state??null).run();
  if(!reply.success)throw Error('NOTICE_METADATA_WRITE_FAILED');
 }
 return result;
}
export function projectApprovedNoticeChecks(rows:NoticeRow[],available=true){
 return {mode:'APPROVED_SOURCE_CHANGE_CHECK_ONLY',automaticDateIngestion:false,cadence:'MONTHLY',retryCooldownDays:7,sources:APPROVED_NOTICE_SOURCES.map(source=>{
  const row=rows.find(row=>row.source_id===source.id);let state:NoticeState|undefined;try{if(row)state=decode(row);}catch{/* Invalid metadata is not evidence. */}
  return {sourceId:source.id,country:'KR',year:source.year,sourceURL:source.articleURL,status:!available?'UNAVAILABLE':row&&!state?'REVIEW_REQUIRED':state?.status??'NOT_CHECKED',checkedAt:state?.checkedAt??null,requiresReview:state?.requiresReview??Boolean(row&&!state),accessBlocked:state?.accessBlocked??false,reason:state?.reason??null};
 }),limitations:['이미 검토한 한국 연간 공지의 변경 여부만 확인합니다. 새 공지·추가 공휴일을 찾아 반영하거나 일정 확인일을 갱신하지 않습니다.']};
}
