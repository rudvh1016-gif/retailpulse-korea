"""Owner-requested Blender unit pillar; no data is baked into the asset."""
import bpy
import math
import os
import sys
from mathutils import Vector

out = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(out, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return m

sky = material('KORETAIL sky blue', (0.40, 0.72, 0.92), 0.32)
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 1.6))
pillar = bpy.context.object
pillar.name = 'Data-free wide unit pillar'
pillar.dimensions = (1.65, 1.20, 3.20)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
pillar.data.materials.append(sky)
bevel = pillar.modifiers.new('Restrained edge', 'BEVEL')
bevel.width = 0.035
bevel.segments = 3
pillar.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')

world = bpy.context.scene.world or bpy.data.worlds.new('White studio')
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.35
for name, location, energy, size in [('Key', (-4,-5,7), 1.2, 5), ('Fill', (4,-1,5), 0.4, 4), ('Rim', (0,4,6), 0.8, 3)]:
    bpy.ops.object.light_add(type='SUN', location=location)
    lamp = bpy.context.object
    lamp.name = name
    lamp.data.energy = energy
    lamp.data.angle = math.radians(12)
    lamp.rotation_euler = (Vector((0,0,1.6)) - lamp.location).to_track_quat('-Z','Y').to_euler()

bpy.ops.object.camera_add(location=(6,-9,6))
camera = bpy.context.object
camera.rotation_euler = (Vector((0,0,1.6))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4.15
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 400
scene.render.resolution_y = 560
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = os.path.join(out, 'reference-pillar-unit.png')
scene['data_truth'] = 'Unit geometry only. Runtime DOM heights use verified flight-ratio estimates; no baked counts.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'reference-pillar-unit.blend'))
bpy.ops.render.render(write_still=True)
