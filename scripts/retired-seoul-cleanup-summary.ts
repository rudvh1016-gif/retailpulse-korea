import type { planSeoulCleanup, SeoulCleanupUsage } from '../lib/retired-seoul-cleanup';
import type { reportProductionD1StorageHeadroom } from './report-d1-storage-headroom';

type Inventory = Awaited<ReturnType<typeof planSeoulCleanup>>['inventory'];
type StorageSnapshot = Awaited<ReturnType<typeof reportProductionD1StorageHeadroom>>;

export type SeoulCleanupSummary = {
  utcDay: string;
  status: 'COMPLETE' | 'SKIPPED' | 'PROCESSED' | 'ALREADY_PROCESSED' | 'STOPPED';
  reason: string | null;
  accountUsage: SeoulCleanupUsage | null;
  maximumBillableWrites: number | null;
  deleted: number | null;
  rowsWritten: number | null;
  storageBefore: StorageSnapshot | null;
  storageAfter: StorageSnapshot | null;
  remaining: Inventory | null;
};

export function renderSeoulCleanupSummary(report: SeoulCleanupSummary) {
  const number = (value: number | null | undefined, unit = '') => value == null ? '미확인' : value.toLocaleString('ko-KR') + unit;
  const kst = (value: string | undefined) => value
    ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul', hourCycle: 'h23' })
    : '미확인';
  const storageRows = [['DB', 'Primary'], ['A4_OVERFLOW_DB', 'Overflow']].map(([binding, label]) => {
    const before = report.storageBefore?.d1StorageHeadroom.find(entry => entry.binding === binding);
    const after = report.storageAfter?.d1StorageHeadroom.find(entry => entry.binding === binding);
    const delta = before?.usedBytes != null && after?.usedBytes != null
      ? before.usedBytes - after.usedBytes
      : null;
    return `| ${label} | ${number(before?.usedBytes)} | ${number(after?.usedBytes)} | ${number(delta == null ? null : Math.max(0, delta))} | ${number(after?.remainingBytes)} |`;
  });
  const remaining = report.remaining?.map(row => `- \`${row.table}\` 최소 ${number(row.sampledRows)}건`);

  return [
    '### 일일 서울 기록 정리',
    '',
    `- Cloudflare D1 집계일(UTC) ${report.utcDay}`,
    `- 결과 **${report.status}**${report.reason ? ` · \`${report.reason}\`` : ''}`,
    `- 논리 삭제 ${number(report.deleted, '건')} · 인덱스와 원장을 포함한 D1 쓰기 ${number(report.rowsWritten, '행')}`,
    `- 집계 시점의 계정 전체 D1 사용량 읽기 ${number(report.accountUsage?.rowsRead, '행')} · 쓰기 ${number(report.accountUsage?.rowsWritten, '행')}`,
    `- 이번 정리의 쓰기 한도 ${number(report.maximumBillableWrites, '행')}`,
    '',
    '| DB | 적용 전 사용 B | 적용 후 사용 B | 관측된 감소 B | 적용 후 여유 B |',
    '|---|---:|---:|---:|---:|',
    ...storageRows,
    '',
    `측정 시각(KST) 적용 전 ${kst(report.storageBefore?.checkedAt)} · 적용 후 ${kst(report.storageAfter?.checkedAt)}`,
    '',
    '저장 용량은 Cloudflare D1 응답의 측정값입니다. 논리 삭제 후에도 할당 공간이 유지될 수 있습니다.',
    '',
    '#### 남은 서울 기록 표본',
    '',
    ...(remaining == null ? ['미확인'] : remaining.length ? remaining : ['허용된 범위에서 남은 행이 확인되지 않았습니다.']),
    '',
  ].join('\n');
}
