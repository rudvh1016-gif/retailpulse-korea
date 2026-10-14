"""Export higher density sizes from the reviewed 512px Blender renders, never upscale."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);args=parser.parse_args()
repo=Path(__file__).resolve().parents[1]
keys=[p.name.removesuffix('-64.webp') for p in (repo/'public/commercial-icons').glob('*-64.webp')]
destination=repo/'public/commercial-icons/sharp-v1';destination.mkdir(exist_ok=True)
assets=[];derived192=[]
for key in sorted(keys):
 source=args.source/(key+'.png');out=destination/(key+'-256.webp');out192=destination/(key+'-192.webp')
 with Image.open(source) as original:
  if original.size!=(512,512):raise ValueError('Reviewed source must be 512px: '+key)
  original.resize((256,256),Image.Resampling.LANCZOS).save(out,'WEBP',quality=92,method=6)
  # 48-64 CSS px at 3x needs 144-192 px; without this step phones fetch the 256px file.
  original.resize((192,192),Image.Resampling.LANCZOS).save(out192,'WEBP',quality=92,method=6)
 assets.append({'key':key,'width':256,'height':256,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'reviewed512PngSha256':hashlib.sha256(source.read_bytes()).hexdigest()})
 derived192.append({'key':key,'width':192,'height':192,'bytes':out192.stat().st_size,'sha256':hashlib.sha256(out192.read_bytes()).hexdigest(),'reviewed512PngSha256':hashlib.sha256(source.read_bytes()).hexdigest()})
(destination/'manifest.json').write_bytes(json.dumps({'source':'Existing reviewed shinhan_industry_icons_v1 Blender 512px renders','geometryChanged':False,'textBaked':False,'totalBytes':sum(a['bytes'] for a in assets),'assets':assets,'derived192':derived192},indent=2).encode())
print(json.dumps({'assets':len(assets),'totalBytes':sum(a['bytes'] for a in assets)}))
