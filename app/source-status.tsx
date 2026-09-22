'use client';
import type {Lang} from './retailpulse-data';
import {useLiveSummary,LiveLoadMessage} from './live-signals';
import {contextText as t} from './operational-context';
import {nextSourceWindow,publicFailureReason} from '../lib/source-status';
/**
 * The catalogue itself now lives in `lib/source-catalog.ts`, as plain data
 * with no React import, so `app/page-brief.tsx` can server-render it into the
 * first HTML response. These re-exports keep every existing client import
 * working against one copy of the text.
 */
export { activeSourceCatalog, sourceUse } from '../lib/source-catalog';
import { localized, sourceName } from '../lib/source-catalog';
export { sourceName };
type Words=[string,string,string,string];
const word=(lang:Lang,words:Words)=>localized(lang,words);

export function CollectionStatus({lang}:{lang:Lang}) {
 const summary=useLiveSummary();
 const failures=summary?.sources?.filter(row=>!['LIVE','OFFICIAL_HISTORICAL'].includes(row.status))??[];
 const reasons={TIMEOUT:['응답 대기시간 초과','Response timed out','等待响应超时','応答待ち時間超過'],NETWORK:['연결 단계 실패','Network connection failed','连接失败','接続段階の失敗'],AUTH:['인증·권한 확인 필요','Authentication or permission needs review','需要确认认证或权限','認証・権限の確認が必要'],SCHEMA:['자료 형식 확인 필요','Data format needs review','需要确认资料格式','資料形式の確認が必要'],OTHER:['상태 확인 필요','Status needs review','需要确认状态','状態の確認が必要']} satisfies Record<string,Words>;
 return <section id="collection-status" className="collection-status"><h2>{t(lang,'자료 연결 상태','Data connection status','资料连接状态','資料の接続状況')}</h2>
 {!summary?<LiveLoadMessage loading={summary===undefined} lang={lang}/>:<><p>{failures.length?t(lang,`${failures.length}개 자료의 갱신을 확인 중입니다.`,`${failures.length} sources need a refresh check.`,`${failures.length}项资料需要检查更新。`,`${failures.length}件の更新を確認中です。`):t(lang,'현재 표시할 수집 오류가 없습니다.','No collection errors currently reported.','当前未报告收集错误。','現在、報告された収集エラーはありません。')}</p>
 <details><summary>{t(lang,'원인·마지막 성공·다음 수집 예정 보기','Reasons, last success and next scheduled collection','查看原因、最近成功及下次收集计划','原因・最終成功・次回収集予定を見る')}</summary>
 {failures.map(row=>{const next=nextSourceWindow(row.sourceId,summary.generatedAt);const last=row.retrievedAt?new Date(Date.parse(row.retrievedAt)+9*3600000).toISOString().slice(0,16).replace('T',' ')+' KST':t(lang,'성공 기록 없음','No successful collection recorded','无成功记录','成功記録なし');return <article key={row.sourceId}><h3>{sourceName(row.sourceId,lang)}</h3><p>{row.status==='ERROR'?word(lang,reasons[publicFailureReason(row.detail)]):t(lang,'최신 자료 미확보','Latest data not secured','尚未获得最新资料','最新資料未確保')}</p><p>{t(lang,'마지막 성공','Last success','最近成功','最終成功')} · {last}</p><p>{t(lang,'다음 수집 예정','Next scheduled collection','下次收集计划','次回収集予定')} · {next?next.slice(0,16).replace('T',' ')+' KST':t(lang,'자료별 정기 수집 때 확인','Checked by its scheduled collector','由相应定期收集确认','資料別の定期収集で確認')}</p></article>;})}
 <p>{t(lang,'예정 시각은 실행·복구 보장이 아닙니다. 연결·응답 시간 초과만으로 공급자와 KORETAIL 중 어느 쪽 문제인지 확정할 수 없습니다. 수집 실패 시 마지막 성공 자료와 원래 기준시각을 유지합니다.','Scheduled times do not guarantee execution or recovery. A connection/response timeout alone cannot identify whether the provider or KORETAIL caused it. Failed refreshes preserve last-good data and original timestamps.','计划时间不保证执行或恢复。仅凭连接或响应超时无法确定责任方。失败时保留最近成功资料及原始时刻。','予定時刻は実行・復旧の保証ではありません。接続・応答超過だけで原因側を断定できません。失敗時は最終成功資料と元の基準時刻を保持します。')}</p>
 </details></>}
 </section>;
}
