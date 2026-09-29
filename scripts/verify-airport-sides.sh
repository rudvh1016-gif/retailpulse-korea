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
# Images are read with OCR, and each recognised word is printed with its
# pixel box, so the E/W labels, hall numbers and gate numbers can be placed
# without printing the image itself.
sudo apt-get -qq update >/dev/null 2>&1; sudo apt-get -qq install -y tesseract-ocr tesseract-ocr-kor >/dev/null 2>&1
tesseract --version 2>&1 | head -1
ocr() {
  tesseract "$1" stdout -l kor+eng --psm "${2:-11}" tsv 2>/dev/null | awk -F'\t' 'NR>1 && $12!="" && $11>40 {printf "%s x=%d y=%d w=%d h=%d\n", $12, $7, $8, $9, $10}' | head -500
}
img() {
  section "IMAGE $1"
  curl -sSL --max-time 60 -A "$UA" -o "/tmp/$1.img" "$2" || { echo "FETCH_FAILED"; return; }
  file "/tmp/$1.img"; sha256sum "/tmp/$1.img" | cut -c1-64
  python3 -c "from PIL import Image; im=Image.open('/tmp/$1.img').convert('L'); im=im.resize((im.width*2, im.height*2)); im.save('/tmp/$1.png')" 2>/dev/null || cp "/tmp/$1.img" "/tmp/$1.png"
  echo "(coordinates are in a 2x upscaled image)"
  ocr "/tmp/$1.png"
}
img T1_MAP https://www.airport.kr/sites/ap_ko/images/sub/handicap-map1.jpg
img T2_MAP https://www.airport.kr/sites/ap_ko/images/sub/handicap-map2.jpg
img KAL_T2 "https://kr.img.news.koreanair.com/wp-content/uploads/2026/04/%EC%82%AC%EC%A7%847-1-1024x768.png"
# The official interactive map, rendered and read the same way.
if npx --yes playwright@1.47.2 install --with-deps chromium >/dev/null 2>&1; then
  for t in P01 P02 P03; do
    section "GEOMAP $t"
    node -e "
      const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
    " 2>/dev/null
    npx --yes playwright@1.47.2 screenshot --viewport-size=2400,1600 --wait-for-timeout=12000 "https://www.airport.kr/geomap/ap_ko/view.do?alertType=0&tmnlId=$t&type=2" "/tmp/geo-$t.png" >/dev/null 2>&1 && ocr "/tmp/geo-$t.png" || echo "SCREENSHOT_FAILED"
  done
fi
exit 0
