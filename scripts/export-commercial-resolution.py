"""Export higher density sizes from the reviewed 512px Blender renders, never upscale."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);args=parser.parse_args()
repo=Path(__file__).resolve().parents[1]
keys=[p.name.removesuffix('-64.webp') for p in (repo/'public/commercial-icons').glob('*-64.webp')]
destination=repo/'public/commercial-icons/sharp-v1';destination.mkdir(exist_ok=True)
assets=[]
for key in sorted(keys):
 source=args.source/(key+'.png');out=destination/(key+'-256.webp')
 with Image.open(source) as original:
  if original.size!=(512,512):raise ValueError('Reviewed source must be 512px: '+key)
  original.resize((256,256),Image.Resampling.LANCZOS).save(out,'WEBP',quality=92,method=6)
 assets.append({'key':key,'width':256,'height':256,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'reviewed512PngSha256':hashlib.sha256(source.read_bytes()).hexdigest()})
(destination/'manifest.json').write_bytes(json.dumps({'source':'Existing reviewed shinhan_industry_icons_v1 Blender 512px renders','geometryChanged':False,'textBaked':False,'totalBytes':sum(a['bytes'] for a in assets),'assets':assets},indent=2).encode())
print(json.dumps({'assets':len(assets),'totalBytes':sum(a['bytes'] for a in assets)}))
