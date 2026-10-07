from pathlib import Path
import base64, hashlib, io, json, struct, xml.etree.ElementTree as ET
from PIL import Image

root = Path(__file__).resolve().parent
assets = root / 'web-assets'
contract = json.loads((root / 'checks/export-contract.json').read_text(encoding='utf-8'))
checks = []
for record in contract['icons']:
    data = (assets / record['file']).read_bytes()
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        assert list(image.size) == record['size'], record['file']
        assert image.mode == 'RGB', record['file']
        assert hashlib.sha256(data).hexdigest() == record['sha256'], record['file']
    checks.append(record['file'])
for original, alias in contract['versionedAliases'].items():
    assert (assets / original).read_bytes() == (assets / alias).read_bytes(), alias
ico = (assets / 'favicon.ico').read_bytes()
assert struct.unpack_from('<HHH', ico) == (0, 1, 3)
assert [struct.unpack_from('<BB', ico, 6 + i * 16) for i in range(3)] == [(16,16),(32,32),(48,48)]
with Image.open(io.BytesIO(ico)) as image:
    assert image.ico.sizes() == {(16,16),(32,32),(48,48)}
    for size in image.ico.sizes():
        image.ico.getimage(size).load()
svg = ET.fromstring((assets / 'favicon.svg').read_text(encoding='utf-8'))
assert svg.find('{http://www.w3.org/2000/svg}title').text == 'KORETAIL'
embedded = svg.find('{http://www.w3.org/2000/svg}image').attrib['href']
assert base64.b64decode(embedded.split(',',1)[1]) == (assets / 'favicon-128.png').read_bytes()
base = json.loads((root / 'model/manifest-base.webmanifest').read_text(encoding='utf-8'))
manifest = json.loads((assets / 'manifest.webmanifest').read_text(encoding='utf-8'))
for field in ('id','name','short_name','start_url','scope','display'):
    assert manifest[field] == base[field], field
assert manifest['name'] == 'KORETAIL'
for item in manifest['icons']:
    target = assets / item['src'].lstrip('/')
    assert target.is_file(), target
    if item['type'] == 'image/png':
        with Image.open(target) as image:
            assert item['sizes'] == f'{image.width}x{image.height}'
assert any(i.get('purpose') == 'maskable' and i['sizes'] == '512x512' for i in manifest['icons'])
provenance = json.loads((root / 'checks/blender-provenance.json').read_text(encoding='utf-8'))
assert provenance['finalProjectedRadius'] < provenance['guaranteedSafeRadius'] == 0.4
assert provenance['textObjects'] == 0
assert provenance['actualBlender'] == '5.2.1 LTS'
blend = root / 'model/koretail-app-icon.blend'
assert blend.is_file() and blend.stat().st_size > 100_000
result = {'result':'PASS','checkedRasterFiles':checks,'icoFrames':[[16,16],[32,32],[48,48]],'svgEmbeddedPngVerified':True,'versionedAliasesByteIdentical':True,'identityPreserved':True,'opaqueRgbVerified':True,'modelProjectedRadius':provenance['finalProjectedRadius'],'maskableSafeRadius':0.4,'physicalDeviceVerified':False,'productionConnectionCompleted':False,'blendSha256':hashlib.sha256(blend.read_bytes()).hexdigest()}
(root / 'checks/asset-validation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(result))
