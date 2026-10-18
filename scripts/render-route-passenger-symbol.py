"""Reuse KORETAIL's actual aircraft geometry; no country, label or statistic in pixels."""
import bpy, json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets-src/app-icons-20261007/model/source-flight-B.blend'
OUT=ROOT/'public/visuals/route-passengers'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=320
scene.render.resolution_y=240
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='WEBP'
scene.render.image_settings.color_mode='RGBA'
scene.render.image_settings.quality=84
floor=bpy.data.objects.get('Infinite square studio')
if floor: floor.hide_render=True
def material(name,color,metallic):
 m=bpy.data.materials.new(name);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF')
 n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Metallic'].default_value=metallic
 n.inputs['Roughness'].default_value=.32
 return m
silver=material('route-satin-silver',(.62,.69,.77),.55)
ink=material('route-ink-blue',(.025,.055,.10),.25)
base=material('route-neutral-runway',(.83,.87,.92),.2)
for ob in bpy.data.objects:
 if ob.type!='MESH' or ob==floor:continue
 ob.data.materials.clear()
 ob.data.materials.append(base if 'runway' in ob.name.lower() else ink if any(x in ob.name.lower() for x in ['glazing','intake','center line']) else silver)
scene.render.filepath=str(OUT/'aircraft-320.webp')
bpy.ops.render.render(write_still=True)
p=OUT/'aircraft-320.webp'
manifest={'blender':bpy.app.version_string,'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'output':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'width':320,'height':240,'dataBaked':False,'conceptual':True}
(OUT/'provenance.json').write_text(json.dumps(manifest,indent=2),encoding='utf8',newline='\n')
print(json.dumps(manifest))
