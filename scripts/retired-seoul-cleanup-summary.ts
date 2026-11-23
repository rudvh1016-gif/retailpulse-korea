/** GitHub Actions operator output, kept outside visitor-facing product copy. */
type Usage = { rowsRead: number; rowsWritten: number };
type Inventory = { table: string; sampledRows: number };
type StorageMeasure = { binding: string; usedBytes?: number | null };
type CleanupEvidence = {
  utcDay: string;
  reason: string;
  usage?: Usage | null;
  allowance?: number;
  result?: { deleted: number; rowsWritten: number };
  before?: readonly StorageMeasure[];
  after?: readonly StorageMeasure[];
  remaining?: readonly Inventory[];
};

export function seoulCleanupSummary(evidence: CleanupEvidence) {
  const format = (value: number | undefined | null) => value == null ? '미확인' : value.toLocaleString('en-US');
  const { utcDay, usage, allowance, result, before, after, remaining, reason } = evidence;
  const storage = (label: string, binding: string) => {
    const from = before?.find(row => row.binding === binding)?.usedBytes;
    const to = after?.find(row => row.binding === binding)?.usedBytes;
    return `| ${label} | ${format(from)} | ${format(to)} | ${format(from == null || to == null ? null : from - to)} |`;
  };
  const residual = remaining === undefined ? '미확인' : remaining.length
    ? remaining.map(row => `\`${row.table}\` (${row.sampledRows})`).join(', ')
    : '대상 테이블에서 발견되지 않음';
  return [
    '### 서울 기록 일일 정리',
    '',
    `- UTC 계정 집계일 ${utcDay} · 결과 \`${reason}\``,
    usage ? `- Cloudflare D1 계정 전체 사용량 (정리 전 부분 집계) · 읽기 ${format(usage.rowsRead)}행 · 쓰기 ${format(usage.rowsWritten)}행`
      : '- Cloudflare D1 계정 전체 사용량 미확인',
    `- 이번 정리 쓰기 상한 ${format(allowance)}행 · 논리 삭제 ${format(result?.deleted)}건 · D1 쓰기(인덱스·장부 포함) ${format(result?.rowsWritten)}행`,
    `- 남은 표본 (테이블당 최대 1행) · ${residual}`,
    '',
    '| D1 | 전(바이트) | 후(바이트) | 확보(바이트) |',
    '| --- | ---: | ---: | ---: |',
    storage('Primary', 'DB'),
    storage('Overflow', 'A4_OVERFLOW_DB'),
    '',
  ].join('\n');
}
