"""Actual Blender topic sculptures. No readings, dates, countries or words in pixels.

These are fixed category symbols, never a rendering of today's weather or people.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/visuals/prep-symbols/v2'
SOURCES = ROOT / 'outputs/prep-symbols-v2'


def material(name, rgb, metallic=0, roughness=.32):
    linear = tuple(((v+.055)/1.055)**2.4 if v > .04045 else v/12.92 for v in rgb)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*linear, 1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    return mat


def box(name, pos, size, mat, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    ob = bpy.context.object
    ob.name, ob.dimensions = name, size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    mod = ob.modifiers.new('Soft sculpted edge', 'BEVEL')
    mod.width, mod.segments = bevel, 5
    ob.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return ob


def sphere(name, pos, radius, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, radius=radius, location=pos)
    ob = bpy.context.object
    ob.name, ob.scale = name, scale
    ob.data.materials.append(mat)
    for face in ob.data.polygons:
        face.use_smooth = True
    return ob


def cylinder(name, pos, radius, depth, mat, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=pos)
    ob = bpy.context.object
    ob.name = name
    if rotation:
        ob.rotation_euler = rotation
    ob.data.materials.append(mat)
    for face in ob.data.polygons:
        face.use_smooth = True
    mod = ob.modifiers.new('Rounded rim', 'BEVEL')
    mod.width, mod.segments = .022, 4
    ob.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return ob


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions, curve.bevel_depth, curve.bevel_resolution = '3D', radius, 4
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for point, xyz in zip(spline.points, points):
        point.co = (*xyz, 1)
    ob = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def setup(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    mats = {key: material(key, rgb, .45 if key == 'gold' else 0) for key, rgb in {
        'porcelain': (.98, .96, .91), 'mint': (.47, .78, .65),
        'rose': (.91, .53, .61), 'peach': (.97, .76, .57),
        'lilac': (.70, .60, .88), 'gold': (.85, .68, .35),
        'ink': (.19, .22, .23), 'paper': (1, .995, .96),
    }.items()}
    cylinder('Small porcelain presentation base', (0, 0, .08), 1.47, .16, mats['porcelain'])
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 640, 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 88
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.exposure = -.35
    scene.world.color = (.35, .35, .35)
    for name, loc, power, size in [
        ('Broad warm key', (-3, -4, 7), 450, 5),
        ('Soft fill', (4, -1, 5), 250, 4),
        ('Porcelain rim', (1, 4, 6), 350, 4),
    ]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        light = bpy.context.object
        light.name = name
        light.data.energy, light.data.size = power, size
        light.rotation_euler = (Vector((0, 0, 1))-light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(4.1, -7, 4.2))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, 1.04))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 4.55
    scene.camera = camera
    scene['meaning'] = 'Fixed topic sculpture; adjacent HTML contains all real facts.'
    return mats


def person(x, y, scale, color, m, raised=False):
    z = .18
    for side in [-1, 1]:
        cylinder('Abstract person leg', (x+side*.105*scale, y, z+.24*scale), .07*scale, .48*scale, m['ink'])
    sphere('Abstract person torso', (x, y, z+.70*scale), .27*scale, color, (1, .68, 1.36))
    sphere('Abstract person head', (x, y, z+1.20*scale), .17*scale, m['peach'])
    for side in [-1, 1]:
        tube('Abstract person arm', [(x+side*.23*scale, y, z+.88*scale), (x+side*.36*scale, y-.03, z+(.94 if raised else .58)*scale)], .055*scale, color)


def crowd(m):
    for x, y, scale, color in [(-.76, -.55, .94, 'rose'), (.02, -.1, 1.1, 'mint'), (.62, .57, .98, 'lilac')]:
        person(x, y, scale, m[color], m)
    # A path arrow denotes flow, not a counted crowd or real queue.
    tube('Sculpted flow path', [(-1.1, .40, .22), (-.70, .87, .22), (.10, 1.02, .22)], .06, m['gold'])
    tube('Flow arrow upper', [(-.08, 1.22, .22), (.18, 1.02, .22), (-.08, .82, .22)], .06, m['gold'])


def rain(m):
    for x, z, radius in [(-.60, 1.66, .43), (-.12, 1.92, .55), (.44, 1.76, .45), (.79, 1.57, .29)]:
        sphere('Pearl rain-cloud lobe', (x, .16, z), radius, m['paper'], (1, .70, .82))
    box('Rounded cloud underside', (.05, .15, 1.50), (1.82, .54, .35), m['paper'], .16)
    for x, y, z in [(-.55, -.08, .76), (.10, -.13, .56), (.65, -.04, .89)]:
        drop = sphere('Category raindrop', (x, y, z), .18, m['mint'], (.76, .66, 1.35))
        # Taper the upper half of the droplet silhouette.
        for vertex in drop.data.vertices:
            if vertex.co.z > 0:
                factor = max(.025, 1-vertex.co.z/.19)
                vertex.co.x *= factor
                vertex.co.y *= factor


def temperature(m):
    box('Porcelain thermometer housing', (-.18, .10, 1.25), (.52, .27, 1.98), m['paper'], .22)
    cylinder('Thermometer round lower housing', (-.18, -.09, .48), .36, .18, m['paper'], (math.pi/2, 0, 0))
    cylinder('Rose symbol bulb', (-.18, -.20, .48), .24, .055, m['rose'], (math.pi/2, 0, 0))
    box('Uncalibrated rose symbol stem', (-.18, -.058, 1.23), (.115, .035, 1.40), m['rose'], .05)
    # No graduations or variable level: this instrument never encodes a reading.
    cylinder('Warm temperature disc', (.78, .20, 1.65), .28, .09, m['peach'], (math.pi/2, 0, 0))
    for i in range(8):
        angle = i*math.pi/4
        tube('Warmth symbol ray', [(.78+.37*math.cos(angle), .15, 1.65+.37*math.sin(angle)), (.78+.47*math.cos(angle), .15, 1.65+.47*math.sin(angle))], .025, m['gold'])


def holiday(m):
    box('Calendar display', (-.37, .18, 1.12), (1.55, .24, 1.67), m['lilac'], .10)
    box('Calendar page', (-.37, .035, 1.03), (1.37, .045, 1.26), m['paper'], .025)
    for x in [-.78, .04]:
        tube('Calendar binding', [(x, .15, 1.94), (x, -.02, 2.04), (x, -.07, 1.89)], .035, m['gold'])
    for row in range(2):
        for col in range(3):
            box('Unnumbered calendar field', (-.78+col*.4, -.001, .72+row*.42), (.22, .018, .22), m['mint' if (row, col) == (1, 1) else 'peach'], .03)
    center = Vector((.81, -.30, .70))
    sphere('Country-information globe', center, .46, m['mint'])
    for angle in [0, math.pi/2]:
        points = [center+Vector((.472*math.cos(t)*math.cos(angle), .472*math.cos(t)*math.sin(angle), .472*math.sin(t))) for t in [i*math.tau/80 for i in range(81)]]
        tube('Globe meridian', points, .015, m['gold'])
    points = [center+Vector((.472*math.cos(t), .472*math.sin(t), 0)) for t in [i*math.tau/80 for i in range(81)]]
    tube('Globe equator', points, .015, m['gold'])


def event(m):
    box('Performance dais', (0, .28, .29), (2.15, 1.10, .26), m['lilac'], .08)
    box('Curtain pelmet', (0, .77, 2.08), (2.13, .27, .25), m['rose'], .09)
    for side in [-1, 1]:
        for i in range(3):
            cylinder('Rose curtain fold', (side*(.80+i*.105), .74, 1.27), .13, 1.50, m['rose'])
    person(-.22, .11, 1.05, m['mint'], m, raised=True)
    cylinder('Microphone stand', (.36, -.20, 1.05), .026, 1.28, m['gold'])
    cylinder('Microphone base', (.36, -.20, .44), .17, .035, m['ink'])
    cylinder('Microphone', (.36, -.20, 1.74), .055, .25, m['ink'], (0, math.pi/2, 0))
    # A sculptural note communicates performance, without naming an event.
    sphere('Musical note bowl', (.91, -.05, 1.30), .115, m['gold'], (1, .35, .70))
    tube('Musical note stem', [(.98, -.05, 1.31), (.98, -.05, 1.85), (1.16, -.05, 1.75)], .03, m['gold'])


def render(name, compose, out=OUT, sources=SOURCES):
    out.mkdir(parents=True, exist_ok=True)
    sources.mkdir(parents=True, exist_ok=True)
    mats = setup(name)
    compose(mats)
    bpy.ops.wm.save_as_mainfile(filepath=str(sources/f'{name}.blend'))
    scene = bpy.context.scene
    scene.render.filepath = str(out/f'{name}-640.webp')
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(str(out/f'{name}-640.webp'))
    image.scale(320, 240)
    image.save_render(str(out/f'{name}-320.webp'), scene=scene)
    print('PREP_SYMBOL_READY '+name)


if __name__ == '__main__':
    for name, compose in [('crowd', crowd), ('rain', rain), ('temperature', temperature), ('holiday', holiday), ('event', event)]:
        render(name, compose)
