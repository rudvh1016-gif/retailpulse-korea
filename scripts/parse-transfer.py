"""Strict reader for the official BIFF8 forecast; no inference or cell fallback."""
import datetime
import hashlib
import json
import math
import sys
import xlrd

SCHEMA = 'incheon-transfer-security-v1'

def parse(raw, service_date, terminal):
    if terminal not in ('T1', 'T2'):
        raise ValueError('schema_terminal')
    datetime.date.fromisoformat(service_date)
    if raw[:8] != bytes.fromhex('d0cf11e0a1b11ae1'):
        raise ValueError('schema_workbook_format')
    b = xlrd.open_workbook(file_contents=raw)
    def cell(s, r, c, expected):
        if s.cell_value(r, c) != expected:
            raise ValueError('schema_header_%s_%s' % (r, c))
    title = '%s년 %s월 %s일' % tuple(service_date.split('-'))
    d = b.sheet_by_name('출국승객예고')
    if not str(d.cell_value(0, 0)).startswith(title + ' '):
        raise ValueError('wrong_service_date')
    if ('T2 국제선' in str(d.cell_value(0, 0))) != (terminal == 'T2'):
        raise ValueError('schema_terminal_title')
    s = b.sheet_by_name('환승객예고')
    if s.nrows != 45 or s.ncols != 10:
        raise ValueError('schema_dimensions')
    for r,c,v in [(0,0,'환승객예고'),(7,0,'2. 보안검색대별 환승여객(도착기준)'),
                  (8,0,'항목'),(8,9,'계'),(10,0,'환승객(명)'),
                  (14,0,'3. 시간대별 환승 보안검색대별 환승여객'),(16,9,'계'),(42,0,'계')]:
        cell(s,r,c,v)
    columns = [1,3,5,7] if terminal == 'T1' else [1,5]
    headers = [(8,1,'터미널'),(8,5,'탑승동'),(9,1,'동편'),(9,3,'서편'),(9,5,'동편'),(9,7,'서편')] if terminal == 'T1' else [(8,1,'제2여객터미널'),(9,1,'A'),(9,5,'B')]
    for r,c,v in headers: cell(s,r,c,v)
    def number(r,c):
        v=s.cell_value(r,c)
        if s.cell_type(r,c) != xlrd.XL_CELL_NUMBER or not math.isfinite(v) or v < 0 or v != int(v) or v > 1_000_000:
            raise ValueError('schema_value_%s_%s' % (r,c))
        return int(v)
    for h in range(24):
        r=h+18
        cell(s,r,0,'%s~%s시' % (h,h+1))
        if sum(number(r,c) for c in columns) != number(r,9):
            raise ValueError('schema_hour_sum')
    total=number(10,9)
    if total != number(42,9) or total != sum(number(r,9) for r in range(18,42)) or total != sum(number(10,c) for c in columns):
        raise ValueError('schema_day_sum')
    return dict(serviceDate=service_date, terminal=terminal, expectedTransferPassengers=total,
                basis='ARRIVAL_TRANSFER_SECURITY', sourceHash=hashlib.sha256(raw).hexdigest(), schemaVersion=SCHEMA)

if __name__ == '__main__':
    try:
        with open(sys.argv[1], 'rb') as f: raw=f.read()
        print(json.dumps(parse(raw,sys.argv[2],sys.argv[3])))
    except Exception as e:
        # Never expose response contents, credentials, or a guessed value.
        print('TRANSFER_PARSE_REJECTED:'+type(e).__name__+':'+str(e)[:100],file=sys.stderr)
        sys.exit(2)
