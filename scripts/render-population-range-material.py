"""Offline, data-free Blender material profile for the live Seoul range chart.

Run with Blender --background --python scripts/render-population-range-material.py.
Only lighting colors are exported. Runtime SVG geometry always uses source min/max.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
material = bpy.data.materials.new('Approved Seoul blue')
material.use_nodes = True
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value = (.29, .46, .64, 1)
shader.inputs['Roughness'].default_value = .55
steps = 64
vertices = [(x, .125 - .25 * i / steps, .02 + .012 * math.sin(math.pi * i / steps))
            for x in [-2, 2] for i in range(steps + 1)]
mesh = bpy.data.meshes.new('Data-free rounded material strip')
mesh.from_pydata(vertices, [], [(i, i + 1, i + steps + 2, i + steps + 1) for i in range(steps)])
mesh.update()
obj = bpy.data.objects.new('Material only', mesh)
bpy.context.collection.objects.link(obj)
obj.data.materials.append(material)
for face in mesh.polygons:
    face.use_smooth = True
bpy.ops.object.camera_add(location=(0, 0, 8))
scene.camera = bpy.context.object
scene.camera.rotation_euler = (0, 0, 0)
scene.camera.data.type = 'ORTHO'
scene.camera.data.ortho_scale = 1
for location, energy, size in [((-3, -4, 6), 1000, 4), ((4, 2, 5), 350, 5)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy, light.data.size = energy, size
    light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
scene.world = bpy.data.worlds.new('Approved white studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs[1].default_value = .45
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 512, 128
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = -1
output = root / 'public/chart-materials/seoul-blue-range.png'
output.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(output)
bpy.ops.render.render(write_still=True)
render = bpy.data.images.load(str(output), check_existing=False)
# Read the PNG's display RGB bytes, without a second display transform.
render.colorspace_settings.name = 'Non-Color'
pixels = list(render.pixels)
def byte(value):
    return round(255 * max(0, min(1, value)))
colors = []
for band in range(32):
    row = 127 - (band * 4 + 2)
    rgb = [sum(pixels[(row * 512 + x) * 4 + channel] for x in range(224, 288)) / 64 for channel in range(3)]
    colors.append('#' + ''.join(f'{byte(value):02x}' for value in rgb))
(root / 'app/population-range-material-profile.json').write_text(json.dumps({
    'generator': 'scripts/render-population-range-material.py',
    'blenderVersion': bpy.app.version_string,
    'materialLinearRgb': [.29, .46, .64],
    'roughness': .55,
    'scope': 'Data-free Blender lighting profile; no population values, timestamps or baked chart geometry.',
    'colors': colors,
}, indent=2) + '\n', encoding='utf-8', newline='\n')
print('SEOUL_DATA_FREE_MATERIAL_COMPLETE', flush=True)
