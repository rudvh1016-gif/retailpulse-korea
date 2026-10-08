"""Reuse actual district .blend geometry. Data and Korean labels remain web text.
Usage: blender -b --python scripts/render-seoul-comparison.py -- source.blend output-dir
"""
import bpy,json,sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]
source=Path(args[0]).resolve();out=Path(args[1]).resolve();out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene
s.render.resolution_x=640;s.render.resolution_y=514;s.render.resolution_percentage=100
s.cycles.samples=16;s.cycles.use_denoising=True
s.render.image_settings.file_format='PNG'
manifest={'blender':bpy.app.version_string,'source':source.name,'conceptual':True,'data_baked':False,'people':0,'districts':{}}
for key in ['myeongdong','seongsu','hongdae','itaewon']:
 for collection in bpy.data.collections:
  if collection.name.startswith('DISTRICT_'):collection.hide_render=collection.name!='DISTRICT_'+key.upper()
 s.render.filepath=str(out/(key+'.png'));bpy.ops.render.render(write_still=True)
 collection=bpy.data.collections.get('DISTRICT_'+key.upper())
 manifest['districts'][key]={'objects':len(collection.all_objects),'width':640,'height':514}
bpy.ops.wm.save_as_mainfile(filepath=str(out/'seoul-comparison.blend'))
(out/'render-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
