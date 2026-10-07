from pathlib import Path
import base64,hashlib,json
from PIL import Image,ImageDraw,ImageFont

root=Path(__file__).resolve().parent
out=root/'web-assets';out.mkdir(exist_ok=True)
source=Image.open(root/'render'/'koretail-flight-runway-1024.png').convert('RGB')
assert source.size==(1024,1024)
sizes={'apple-touch-icon.png':180,'icon-192.png':192,'icon-512.png':512,'icon-maskable-512.png':512,'favicon-16.png':16,'favicon-32.png':32,'favicon-48.png':48,'favicon-128.png':128}
files=[]
for name,size in sizes.items():
 im=source.resize((size,size),Image.Resampling.LANCZOS);im.save(out/name,optimize=True,compress_level=9)
 files.append({'file':name,'size':[size,size],'mode':im.mode,'bytes':(out/name).stat().st_size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()})
source.save(out/'favicon.ico',format='ICO',sizes=[(16,16),(32,32),(48,48)])
png=base64.b64encode((out/'favicon-128.png').read_bytes()).decode('ascii')
(out/'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>KORETAIL</title><image width="128" height="128" href="data:image/png;base64,'+png+'"/></svg>\n',encoding='utf-8',newline='\n')
base=json.loads((root/'model'/'manifest-base.webmanifest').read_text(encoding='utf-8'))
version='20261007'
mapping={'apple-touch-icon.png':'apple-touch-icon-'+version+'.png','favicon.svg':'favicon-'+version+'.svg','favicon.ico':'favicon-'+version+'.ico','icon-192.png':'icon-192-'+version+'.png','icon-512.png':'icon-512-'+version+'.png','icon-maskable-512.png':'icon-maskable-512-'+version+'.png'}
for original,name in mapping.items():(out/name).write_bytes((out/original).read_bytes())
for icon in base['icons']:icon['src']='/'+mapping[icon['src'].lstrip('/')]
for name in ['manifest.webmanifest','manifest-'+version+'.webmanifest']:(out/name).write_text(json.dumps(base,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
for size in [60,120]:source.resize((size,size),Image.Resampling.LANCZOS).save(root/'previews'/('actual-'+str(size)+'.png'))
contract={'source':'real Blender Cycles CPU render','version':version,'icons':files,'versionedAliases':mapping,'manifestName':base['name'],'manifestId':base['id'],'unchangedApplicationIdentity':True,'bakedCornerMask':False,'opaqueBackground':True,'textBakedIntoIcon':False,'iPhonePhysicalDeviceVerified':False,'installedIconAutoRefreshClaimed':False,'linkShareImageChanged':False}
(root/'checks'/'export-contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'exported':len(files),'mapping':mapping,'manifestIdentity':base['id']},ensure_ascii=True))
