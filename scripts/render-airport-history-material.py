"""Blender material reference only; the website keeps data-driven monthly widths.
Usage: blender -b --python scripts/render-airport-history-material.py -- output-dir
No labels, quantities or official monthly values are baked into this reference.
"""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector

out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.cycles.use_denoising=True;scene.render.resolution_x=1200;scene.render.resolution_y=480
scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('White world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(1,1,1,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4

def material(name,color):
 value=bpy.data.materials.new(name);value.diffuse_color=(*color,1);value.use_nodes=True
 node=value.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(*color,1)
 node.inputs['Roughness'].default_value=.32
 return value

paper=material('White paper',(1,1,1));neutral=material('Quiet sky-white',(0.42,0.59,0.80))
peak=material('Peak periwinkle',(0.17,0.31,0.59))
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.name='White background'
bpy.context.object.data.materials.append(paper)
for name,length,y,finish in [('Neutral reference',5.2,1.1,neutral),('Blue emphasis reference',6.4,0,peak),('Short neutral reference',3.8,-1.1,neutral)]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(length/2-3.2,y,.12));obj=bpy.context.object
 obj.name=name;obj.dimensions=(length,.35,.24);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 obj.data.materials.append(finish);bevel=obj.modifiers.new('Soft physical edges','BEVEL');bevel.width=.035;bevel.segments=3
 obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
for location,power,size in [((-3,-4,7),300,5),((4,3,6),180,4)]:
 bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
 light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(1,-8,10));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=9.6;scene.camera=camera
scene.view_settings.view_transform='Standard';scene.render.filepath=str(out/'airport-history-material.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'airport-history-material.blend'))
bpy.ops.render.render(write_still=True)
(out/'manifest.json').write_text(json.dumps({'blender':bpy.app.version_string,'purpose':'material reference','data_baked':False,'labels_baked':False,'web_representation':'CSS gradient; original monthly data controls width'},indent=2),encoding='utf-8',newline='\n')
