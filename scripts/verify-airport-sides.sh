#!/usr/bin/env bash
# Prints the parts of the official sources that config/airport-sides.v1.json
# relies on. Images are printed as base64 between markers so a reviewer can
# look at exactly what was fetched. Read-only; no credentials.
set -uo pipefail
UA="Mozilla/5.0 (KORETAIL source verification)"
text() { curl -sSL --max-time 40 -A "$UA" "$1" | python3 -c "
import sys,re,html
s=sys.stdin.read()
s=re.sub(r'(?is)<(script|style).*?</\1>',' ',s)
s=re.sub(r'(?s)<[^>]+>','\n',s)
s=html.unescape(s)
lines=[l.strip() for l in s.splitlines() if l.strip()]
print('\n'.join(lines))
"; }
section() { echo; echo "===== $1 ====="; }
for id in 15095066 15140153; do
  section "data.go.kr $id"
  text "https://www.data.go.kr/data/$id/openapi.do" | grep -n -i -E "t1dg|t2dg|dgsum|출국장|입국장|승객|협의|문구|안내|혼잡|트래픽|제공|selectdate|gate|탑승구|codeshare|공동|master|terminal|터미널|estimated|changed|remark" | head -150
done
for page in 908 883 1008 886; do
  section "airport.kr ap_ko/$page"
  text "https://www.airport.kr/ap_ko/$page/subview.do" | grep -n -E "출국장|동편|서편|중앙|게이트|탑승구|체크인|카운터|예고|예상|혼잡|안내|승객|탑승동" | head -120
done
img() {
  section "IMAGE $1"
  curl -sSL --max-time 60 -A "$UA" -o /tmp/src "$2" && file /tmp/src && identify /tmp/src 2>/dev/null
  convert /tmp/src -resize '1800x1800>' -quality 72 /tmp/out.jpg && echo "BEGIN_BASE64 $1 $(stat -c %s /tmp/out.jpg)" && base64 -w 200 /tmp/out.jpg && echo "END_BASE64 $1"
}
img T1_MAP https://www.airport.kr/sites/ap_ko/images/sub/handicap-map1.jpg
img T2_MAP https://www.airport.kr/sites/ap_ko/images/sub/handicap-map2.jpg
img KAL_T2 "https://kr.img.news.koreanair.com/wp-content/uploads/2026/04/%EC%82%AC%EC%A7%847-1-1024x768.png"
exit 0
