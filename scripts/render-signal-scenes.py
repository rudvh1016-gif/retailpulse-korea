"""Blender 5.2: operating objects for five Seoul preparation facts.

Images contain no lettering, numbers, measured crowd or weather condition.
A closed umbrella represents preparation, even when rain probability is zero.
The thermometer and calendar have blank faces; all readings stay in HTML.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / 'public/visuals/signals/v1'
SOURCES = ROOT / 'outputs/signal-sources'


def material(name, rgb, metallic=0, roughness=.4):
    # Same color management and physical finish as the industry-guide scenes.
    linear = tuple(((v+.055)/1.055)**2.4 if v > .04045 else v/12.92 for v in rgb)
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*linear, 1)
    m.use_nodes = True
    node = m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*linear, 1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    return m


def box(name, pos, dimensions, mat, bevel=.045):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    ob = bpy.context.object
    ob.name, ob.dimensions = name, dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    if bevel:
        modifier = ob.modifiers.new('Soft manufactured edges', 'BEVEL')
        modifier.width, modifier.segments = bevel, 4
        ob.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return ob


def cylinder(name, pos, radius, depth, mat, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=pos)
    ob = bpy.context.object
    ob.name = name
    if rotation:
        ob.rotation_euler = rotation
    ob.data.materials.append(mat)
    for polygon in ob.data.polygons:
        polygon.use_smooth = True
    modifier = ob.modifiers.new('Rounded rim', 'BEVEL')
    modifier.width, modifier.segments = .015, 3
    ob.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return ob


def sphere(name, pos, radius, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=pos)
    ob = bpy.context.object
    ob.name, ob.scale = name, scale
    ob.data.materials.append(mat)
    for polygon in ob.data.polygons:
        polygon.use_smooth = True
    return ob


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions, curve.bevel_depth, curve.bevel_resolution = '3D', radius, 4
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p, xyz in zip(spline.points, points):
        p.co = (*xyz, 1)
    ob = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def setup(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    m = {
        'white': material('Warm porcelain', (.94, .93, .89)),
        'sage': material('Sage', (.54, .68, .58)),
        'mint': material('Pale mint', (.78, .87, .80)),
        'rose': material('Dusty rose', (.77, .53, .56)),
        'pink': material('Pale rose', (.92, .77, .78)),
        'lilac': material('Soft lilac', (.70, .62, .79)),
        'sand': material('Linen sand', (.84, .75, .57)),
        'gold': material('Brushed brass', (.70, .54, .32), .65, .3),
        'metal': material('Brushed steel', (.51, .53, .50), .65, .3),
        'ink': material('Charcoal rubber', (.11, .13, .12)),
        'wood': material('Light wood', (.70, .56, .39)),
    }
    box('Object display plinth', (0, 0, 0), (3.4, 2.7, .14), m['white'], .10)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 640, 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.quality = 86
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'AgX'
    scene.world.color = (.85, .85, .85)
    for label, position, power, size in [
        ('Softbox', (0, -4, 7), 750, 5),
        ('Window fill', (-4, -1, 4), 500, 4),
        ('Edge light', (3, 4, 5), 600, 4),
    ]:
        bpy.ops.object.light_add(type='AREA', location=position)
        light = bpy.context.object
        light.name = label
        light.data.energy, light.data.shape, light.data.size = power, 'DISK', size
        light.rotation_euler = (Vector((0, 0, .8))-light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(5, -7, 5))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, .9))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 4.8
    scene.camera = camera
    scene['meaning'] = f'Concept operating objects: {name}; no measurements or real location.'
    return m


def crowd(m):
    # An empty, prepared queue route; the scene never counts people.
    box('Checkout cabinet', (.70, .55, .63), (1.18, .67, 1.1), m['sage'])
    box('Clean checkout top', (.70, .55, 1.23), (1.28, .76, .10), m['white'])
    cylinder('Payment display stand', (.88, .59, 1.39), .04, .25, m['metal'])
    box('Payment display housing', (.88, .59, 1.59), (.34, .07, .23), m['metal'], .02)
    box('Blank payment screen', (.88, .544, 1.59), (.28, .02, .17), m['ink'], .008)
    for x, y in [(-1.08, -.85), (-1.08, .48), (.42, -.85)]:
        cylinder('Queue post base', (x, y, .15), .19, .06, m['metal'])
        cylinder('Queue post', (x, y, .57), .03, .82, m['metal'])
        cylinder('Queue belt housing', (x, y, 1.01), .065, .12, m['sage'])
    box('Queue belt side', (-1.08, -.18, 1.01), (.035, 1.34, .065), m['sage'], .006)
    box('Queue belt front', (-.33, -.85, 1.01), (1.5, .035, .065), m['sage'], .006)


def rain(m):
    # Closed umbrellas and dry entrance mat: no rain cloud or rainfall claim.
    box('Entrance mat', (.38, -.67, .13), (1.90, .98, .07), m['sand'], .08)
    for i in range(12):
        box('Mat texture', (-.40+i*.135, -.67, .174), (.012, .85, .01), m['wood'], .002)
    cylinder('Umbrella stand', (-.68, .32, .55), .35, .89, m['rose'])
    cylinder('Stand open rim', (-.68, .32, 1.015), .30, .02, m['ink'])
    for i, (x, y) in enumerate([(-.78, .28), (-.56, .38)]):
        cylinder('Folded umbrella canopy', (x, y, 1.25), .075, 1.0, m['pink' if i else 'lilac'])
        cylinder('Umbrella shaft', (x, y, 1.87), .018, .25, m['gold'])
        points = [(x+.14*math.sin(t), y, 2.0+.14*math.cos(t)) for t in [n*math.pi/12 for n in range(13)]]
        tube('Umbrella curved handle', points, .025, m['wood'])


def temperature(m):
    # A blank digital thermometer: neither a red level nor invented reading.
    box('Thermometer base', (-.25, .25, .19), (1.08, .64, .22), m['sage'], .1)
    box('Thermometer body', (-.25, .25, 1.05), (.80, .27, 1.56), m['white'], .13)
    box('Blank thermometer display', (-.25, .101, 1.36), (.54, .032, .45), m['mint'], .045)
    cylinder('Thermometer sensor', (-.25, .078, .64), .12, .055, m['metal'], (math.pi/2, 0, 0))
    cylinder('Climate dial stand', (.93, -.38, .46), .03, .71, m['metal'])
    cylinder('Climate dial base', (.93, -.38, .14), .26, .07, m['sand'])
    cylinder('Climate dial housing', (.93, -.38, .98), .37, .13, m['sand'], (math.pi/2, 0, 0))
    cylinder('Climate dial blank face', (.93, -.46, .98), .30, .025, m['white'], (math.pi/2, 0, 0))


def holiday(m):
    box('Calendar base', (0, .15, .17), (1.90, 1.03, .18), m['wood'])
    calendar = box('Calendar easel', (0, .40, 1.10), (1.80, .16, 1.70), m['rose'], .05)
    calendar.rotation_euler.x = -.12
    sheet = box('Blank date sheet', (0, .27, 1.14), (1.62, .045, 1.43), m['white'], .025)
    sheet.rotation_euler.x = -.12
    for x in [-.55, .55]:
        tube('Calendar brass binding', [(x, .40, 1.81), (x, .20, 1.94), (x, .10, 1.76)], .034, m['gold'])
    box('Planning notebook', (.78, -.58, .24), (.66, .90, .14), m['pink'], .035)
    box('Notebook paper edges', (.78, -.58, .32), (.61, .85, .045), m['white'], .014)
    cylinder('Planning pencil', (-.48, -.53, .22), .025, 1.18, m['gold'], (math.pi/2, 0, .30))


def event(m):
    box('Stage deck', (0, .40, .22), (2.60, 1.45, .25), m['wood'], .05)
    for x in [-1.12, 1.12]:
        cylinder('Event arch upright', (x, .90, 1.12), .08, 1.88, m['lilac'])
    box('Event arch lintel', (0, .90, 2.08), (2.38, .16, .16), m['lilac'], .065)
    for i in range(7):
        sphere('Warm festoon lamp', (-.93+i*.31, .77, 1.93), .045, m['sand'])
    box('Stage backdrop panel', (0, 1.0, 1.18), (1.84, .05, 1.45), m['pink'], .09)
    cylinder('Microphone floor stand', (.34, .10, .93), .02, 1.17, m['metal'])
    cylinder('Microphone base', (.34, .10, .37), .16, .035, m['ink'])
    cylinder('Microphone', (.34, .10, 1.56), .045, .24, m['ink'], (0, math.pi/2, 0))
    box('Event information plinth', (-.97, -.62, .65), (.62, .50, 1.07), m['lilac'])
    box('Blank programme board', (-.97, -.62, 1.29), (.56, .10, .30), m['white'], .025)


def render_scene(name, compose):
    IMAGES.mkdir(parents=True, exist_ok=True)
    SOURCES.mkdir(parents=True, exist_ok=True)
    mats = setup(name)
    compose(mats)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES / f'{name}.blend'))
    bpy.context.scene.render.filepath = str(IMAGES / f'{name}-640.webp')
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(str(IMAGES / f'{name}-640.webp'))
    image.scale(320, 240)
    image.save_render(str(IMAGES / f'{name}-320.webp'), scene=bpy.context.scene)
    print(f'SIGNAL_SCENE_READY {name}')


if __name__ == '__main__':
    for name, compose in [('crowd', crowd), ('rain', rain), ('temperature', temperature), ('holiday', holiday), ('event', event)]:
        render_scene(name, compose)
