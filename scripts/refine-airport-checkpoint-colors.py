"""Recolor the original Blender scene without changing geometry/camera or creating backups.
Blender --background assets-src/checkpoint-polish-20261011/checkpoint-base.blend
  --python scripts/refine-airport-checkpoint-colors.py -- ABSOLUTE_OUTPUT_PNG
The existing render generator remains the geometry source; this pass changes materials only.
"""
import bpy, sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1])
out.parent.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0

def material(name,color,metallic=0,roughness=.4):
    item=bpy.data.materials.new(name);item.diffuse_color=(*color,1);item.use_nodes=True
    shader=item.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=metallic
    shader.inputs['Roughness'].default_value=roughness
    return item

def assign(obj,mat):
    obj.data.materials.clear();obj.data.materials.append(mat)

pearl=material('refined pearl structure',(.92,.94,.97),.08,.32)
silver=material('refined brushed silver',(.62,.69,.75),.55,.32)
floor=material('refined neutral porcelain base',(.94,.95,.97),.05,.48)
canopies=[material('refined canopy '+str(i),color,.18,.32) for i,color in enumerate([
    (.27,.59,.83),(.35,.62,.67),(.30,.55,.74),(.42,.61,.72)])]
belts=material('refined navy scanner belts',(.13,.28,.39),.12,.48)
openings=material('refined scanner depth',(.065,.13,.18),.08,.38)
trays=material('refined cool steel trays',(.67,.77,.83),.4,.27)
coats=[material('refined traveler coat '+str(i),color,0,.62) for i,color in enumerate([
    (.20,.30,.40),(.34,.46,.38),(.43,.34,.40),(.40,.50,.55)])]
skins=[material('refined traveler skin '+str(i),color,0,.55) for i,color in enumerate([
    (.73,.52,.38),(.90,.73,.60),(.53,.35,.24),(.83,.63,.47)])]
trousers=material('refined charcoal trousers',(.17,.21,.25),0,.65)
travelers=sorted({obj.name.split(' ')[2] for obj in bpy.data.objects if obj.name.startswith('decorative traveler ')})
for obj in bpy.data.objects:
    name=obj.name
    if obj.type!='MESH':continue
    if name=='original curved checkpoint base':assign(obj,floor)
    elif name.startswith('paired booth platform') or name.startswith('queue rail post'):assign(obj,silver)
    elif name.startswith('checkpoint canopy'):
        # Original generated object order is fixed; suffixes follow the four booths.
        index=0 if '.' not in name else int(name.rsplit('.',1)[1])
        assign(obj,canopies[index%4])
    elif name.startswith('white checkpoint post') or name.startswith('scanner housing'):assign(obj,pearl)
    elif name.startswith('scanner opening'):assign(obj,openings)
    elif name.startswith('conveyor belt'):assign(obj,belts)
    elif name.startswith('tray'):assign(obj,trays)
    elif name.startswith('decorative traveler '):
        index=travelers.index(name.split(' ')[2]);part=name.split(' ')[3].split('.')[0]
        assign(obj,skins[index%4] if part=='head' else trousers if part=='leg' else coats[index%4])
scene=bpy.context.scene
scene.render.resolution_x=1920;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.cycles.samples=96;scene.cycles.use_denoising=True
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=str(out)
bpy.ops.render.render(write_still=True)
