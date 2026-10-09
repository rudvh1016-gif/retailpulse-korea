"""Derive district lists from an already downloaded official CSV; no network calls."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('csv_file', type=Path)
parser.add_argument('--snapshot-date', required=True)
args = parser.parse_args()
raw = args.csv_file.read_bytes()
rows = list(csv.DictReader(raw.decode('cp949').splitlines()))
required = ['연번','건물명','구 명칭','도로명주소','지번주소','x 좌표','y 좌표','개방시간']
if len(rows) != 4455 or any(key not in rows[0] for key in required):
    raise ValueError('Official snapshot schema changed; review before importing')
out = Path(__file__).resolve().parents[1] / 'public/data/seoul-toilets'
out.mkdir(parents=True, exist_ok=True)
def text(value):
    return ' · '.join(part.strip() for part in value.split('|') if part.strip())
def coordinate(value, low, high):
    try:
        number = float(value)
        return number if low <= number <= high else None
    except ValueError:
        return None
for area, district in [('myeongdong','중구'),('hongdae','마포구'),('seongsu','성동구'),('itaewon','용산구')]:
    selected = []
    for row in rows:
        if row['구 명칭'] != district:
            continue
        selected.append(dict(id=row['연번'], name=text(row['건물명']), district=district,
            address=text(row['도로명주소']), lotAddress=text(row['지번주소']),
            longitude=coordinate(row['x 좌표'],126,128), latitude=coordinate(row['y 좌표'],37,38),
            hours=text(row['개방시간']), phone=text(row['전화번호']), type=text(row['유형']),
            facilities=text(row['화장실 현황']), accessible=text(row['장애인화장실 현황']),
            equipment=text(row['편의시설 (기타설비)']), notes=text(row['비고'])))
    result = dict(dataset='OA-22586', snapshotDate=args.snapshot_date, area=area, district=district,
        sourceRows=len(rows), sourceSha256=hashlib.sha256(raw).hexdigest(),
        sourceUrl='https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do',
        attribution='서울특별시 공중화장실 위치정보 · 공공누리 제1유형', rows=selected)
    target = out / (area+'.json')
    target.write_bytes(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
    print(area, len(selected), target.stat().st_size)
