"""Render only the two Seoul stores needing new physical compositions.

Blender 5.2+, background mode. No labels, numbers, real locations or live data.
Outputs: editable .blend sources and 480/960px WebP images (4:3).
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / 'public/visuals/industry/v1'
SOURCES = ROOT / 'outputs/industry-sources'


def material(name, color, metallic=0, roughness=.38):
    m = bpy.data.materials.new(name)
    linear = tuple(((v+.055)/1.055)**2.4 if v > .04045 else v/12.92 for v in color)
    m.diffuse_color = (*linear, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*linear, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    return m


def box(name, pos, size, mat, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj


def cylinder(name, pos, radius, depth, mat, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=pos)
    obj = bpy.context.object
    obj.name = name
    if rotation:
        obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    mod = obj.modifiers.new('Rounded rim', 'BEVEL')
    mod.width, mod.segments = .014, 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj


def bottle(name, x, y, z, mat, cap, scale=1, pump=False):
    cylinder(name, (x, y, z+.14*scale), .073*scale, .28*scale, mat)
    cylinder(name+' cap', (x, y, z+.305*scale), .045*scale, .05*scale, cap)
    if pump:
        cylinder(name+' pump stem', (x, y, z+.35*scale), .02*scale, .05*scale, cap)
        box(name+' pump head', (x+.028*scale, y, z+.38*scale), (.10*scale, .035*scale, .025*scale), cap, .012)


def setup(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    mats = {
        'white': material('Porcelain white', (.92, .91, .88)),
        'paper': material('White studio', (1, 1, 1), roughness=.8),
        'rose': material('Beauty dusty rose', (.74, .46, .49)),
        'pink': material('Beauty pale rose', (.91, .74, .74)),
        'sage': material('Pharmacy sage', (.48, .68, .55)),
        'mint': material('Pharmacy pale mint', (.75, .87, .78)),
        'plum': material('Cosmetic plum', (.46, .26, .34)),
        'sand': material('Light timber', (.68, .54, .37)),
        'gold': material('Brushed brass', (.70, .53, .31), .72, .25),
        'metal': material('Brushed steel', (.49, .52, .48), .7, .26),
        'mirror': material('Mirror', (.80, .80, .79), .94, .12),
        'ink': material('POS display', (.055, .075, .06), .1),
        'cream': material('Medicine cream cartons', (.95, .89, .71)),
    }
    box('Store plinth', (0, 0, -.035), (5.9, 4.1, .14), mats['white'], .08)
    box('Back wall', (0, 1.85, 1.35), (5.8, .13, 2.7), mats['pink' if name == 'beauty' else 'mint'], .035)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 960, 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.quality = 86
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'AgX'
    scene.world.color = (.85, .85, .85)
    for label, pos, energy, size in [
        ('Large softbox', (0, -4, 8), 1100, 7),
        ('Window light', (-5, -1, 5), 850, 5),
        ('Rim light', (4, 4, 6), 950, 5),
    ]:
        bpy.ops.object.light_add(type='AREA', location=pos)
        light = bpy.context.object
        light.name = label
        light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
        light.rotation_euler = (Vector((0, 0, .8))-light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(7, -10, 8))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, .15, 1))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 8.25
    scene.camera = camera
    scene['illustration_only'] = True
    scene['meaning'] = 'Editorial operating-space example; no real location, number or live signal.'
    return mats


def beauty(m):
    # A cosmetics shop, with product families, testers and consultation.
    for x in [-2.1, -.75]:
        box('Cosmetics shelving backing', (x, 1.63, 1.4), (1.1, .08, 2.35), m['white'])
        for z in [.48, 1.03, 1.58, 2.13]:
            box('Brass-edged cosmetic shelf', (x, 1.35, z), (1.17, .60, .055), m['gold'], .012)
            for i in range(5):
                bottle('Skin care pump', x-.4+i*.2, 1.32, z+.04, m['pink' if i % 2 else 'white'], m['gold'], .87, pump=True)
    box('Shade consultation cabinet', (1.65, 1.2, .56), (1.75, .95, 1.04), m['rose'])
    box('Consultation stone top', (1.65, 1.2, 1.12), (1.88, 1.03, .07), m['white'])
    cylinder('Brass mirror frame', (1.65, 1.72, 1.96), .57, .055, m['gold'], (math.pi/2, 0, 0))
    cylinder('Consultation mirror', (1.65, 1.677, 1.96), .52, .02, m['mirror'], (math.pi/2, 0, 0))
    for i in range(3):
        bottle('Consultation sample', 1.18+i*.32, 1.15, 1.18, m['pink'], m['gold'], .8)
    cylinder('Consultation stool', (1.67, .23, .60), .32, .17, m['pink'])
    cylinder('Stool brass foot', (1.67, .23, .31), .035, .43, m['gold'])
    cylinder('Stool base', (1.67, .23, .09), .24, .045, m['gold'])
    box('Tester island fluted base', (-.52, -.53, .53), (2.4, 1.00, .99), m['rose'], .13)
    for i in range(18):
        box('Tester island fluting', (-1.65+i*.134, -1.065, .55), (.045, .045, .87), m['pink'], .022)
    box('Tester island top', (-.52, -.53, 1.09), (2.52, 1.08, .10), m['white'], .08)
    for i in range(6):
        x = -1.48+i*.26
        cylinder('Lipstick case', (x, -.74, 1.19), .048, .15, m['gold'])
        cylinder('Lipstick shade', (x, -.74, 1.30), .032, .10, m['rose' if i % 2 else 'plum'])
        cylinder('Compact powder', (x, -.37, 1.17), .078, .035, m['gold'])
    box('Disposable tester tools tray', (.36, -.54, 1.17), (.28, .50, .045), m['pink'], .025)
    for i in range(4):
        box('Single use applicator', (.28+i*.05, -.54, 1.205), (.016, .30, .02), m['white'], .008)
    box('Checkout cabinet', (2, -.9, .46), (.92, .78, .83), m['white'])
    box('Checkout top', (2, -.9, .91), (1.02, .88, .07), m['gold'])
    pos(m, 2, -.78, .96)
    for i in range(2):
        box('Gift bag', (2.12+i*.22, -1.00, 1.10), (.18, .12, .25), m['pink'], .01)


def pos(m, x, y, z):
    cylinder('POS stand', (x, y, z+.10), .055, .20, m['metal'])
    box('POS bezel', (x, y, z+.29), (.37, .08, .27), m['metal'], .025)
    box('POS screen', (x, y-.05, z+.29), (.31, .016, .21), m['ink'], .006)


def convenience(m):
    # Different fixtures make the two business types legible without text.
    box('Pharmacy cabinet backing', (-1.65, 1.55, 1.43), (2.0, .16, 2.25), m['white'])
    for z in [.47, .97, 1.47, 1.97]:
        box('Medicine shelf', (-1.65, 1.27, z), (2.06, .65, .06), m['sage'], .018)
        for i in range(7):
            x = -2.45+i*.26
            box('Medicine carton', (x, 1.32, z+.18), (.18, .20, .26), m['cream' if i % 2 else 'white'], .012)
            box('Medicine carton stripe', (x, 1.205, z+.17), (.18, .015, .055), m['sage'], .004)
    box('Pharmacy sign horizontal', (-1.63, 1.747, 2.61), (.47, .08, .15), m['sage'], .012)
    box('Pharmacy sign vertical', (-1.63, 1.747, 2.61), (.15, .08, .47), m['sage'], .012)
    box('Pharmacy consultation desk', (-1.6, -.45, .53), (2.12, .94, 1.0), m['sage'])
    box('Pharmacy clean worktop', (-1.6, -.45, 1.07), (2.23, 1.04, .09), m['white'])
    pos(m, -2.10, -.31, 1.12)
    for i in range(3):
        bottle('Consultation bottle', -1.43+i*.24, -.46, 1.12, m['white'], m['sage'], .75)
    box('Consultation privacy divider', (-.43, .63, .92), (.07, 1.72, 1.74), m['mint'])
    for x in [.55, 1.70]:
        box('Chilled drinks cabinet', (x, 1.26, 1.25), (1.01, .86, 2.38), m['white'])
        box('Refrigerator interior', (x, .799, 1.29), (.86, .025, 2.08), m['mint'])
        for z in [.43, .99, 1.55, 2.1]:
            box('Chilled drinks shelf', (x, .64, z), (.88, .32, .045), m['metal'], .01)
            for i in range(4):
                bottle('Chilled drink', x-.31+i*.205, .63, z+.035, m['sage' if i % 2 else 'cream'], m['white'], .70)
        box('Refrigerator door handle', (x+.45, .58, 1.22), (.032, .06, .68), m['metal'], .014)
    box('Convenience checkout', (1.64, -.66, .52), (1.63, .93, .98), m['sand'])
    box('Convenience checkout top', (1.64, -.66, 1.06), (1.74, 1.02, .08), m['white'])
    pos(m, 1.77, -.47, 1.10)
    box('Checkout scanner', (1.31, -.74, 1.13), (.31, .21, .075), m['ink'], .012)
    box('Reusable shopping basket', (.25, -.78, .32), (.59, .49, .42), m['sage'], .025)
    box('Basket inner opening', (.25, -.78, .53), (.48, .38, .018), m['ink'], .02)
    box('Basket handle', (.25, -.78, .72), (.51, .025, .025), m['metal'], .01)


IMAGES.mkdir(parents=True, exist_ok=True)
SOURCES.mkdir(parents=True, exist_ok=True)
for name, compose in [('beauty', beauty), ('convenience', convenience)]:
    mats = setup(name)
    compose(mats)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES / f'{name}.blend'))
    bpy.context.scene.render.filepath = str(IMAGES / f'{name}-960.webp')
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(str(IMAGES / f'{name}-960.webp'))
    img.scale(480, 360)
    img.save_render(str(IMAGES / f'{name}-480.webp'), scene=bpy.context.scene)
    print(f'INDUSTRY_SCENE_READY {name}')
