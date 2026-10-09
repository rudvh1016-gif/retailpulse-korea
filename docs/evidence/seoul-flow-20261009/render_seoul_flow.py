"""KORETAIL Seoul concept models. Geometry never encodes snapshot values.
Run with Blender 5.2: blender -b -t 4 -P render_seoul_flow.py
"""
import bpy, math, os, json
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__))

def mat(name, rgb, roughness=.42, metal=.03):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=roughness; p.inputs['Metallic'].default_value=metal
    return m

def box(name, p, size, material, bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p)
    o=bpy.context.object; o.name=name; o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if bevel:
        b=o.modifiers.new('Soft architectural edges','BEVEL'); b.width=min(bevel,min(size)*.2); b.segments=3
        o.modifiers.new('Fabrication normals','WEIGHTED_NORMAL')
    return o

def cyl(name,p,r,depth,material):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=depth,location=p)
    o=bpy.context.object; o.name=name; o.data.materials.append(material)
    b=o.modifiers.new('Soft rim','BEVEL'); b.width=min(.04,depth*.16); b.segments=3
    o.modifiers.new('Surface normals','WEIGHTED_NORMAL')
    return o

def orb(name,p,r,material,scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=r,location=p)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(material)
    for poly in o.data.polygons: poly.use_smooth=True
    return o

def path(name, points, material, width=.035):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.resolution_u=20
    c.bevel_depth=width; c.bevel_resolution=4
    s=c.splines.new('BEZIER'); s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):
        p.co=co; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o); c.materials.append(material)
    return o

def arrow(name,p,direction,material):
    bpy.ops.mesh.primitive_cone_add(vertices=3,radius1=.14,radius2=0,depth=.34,location=p)
    o=bpy.context.object; o.name=name; o.rotation_euler=Vector(direction).to_track_quat('Z','Y').to_euler()
    o.data.materials.append(material)
    return o

def person(x,y,z,m):
    # Fixed illustrative figures, no link to counts or nationality.
    cyl('Illustrative person torso',(x,y,z+.20),.074,.26,m['blue'])
    orb('Illustrative person head',(x,y,z+.40),.075,m['porcelain'])
    for dx in [-.04,.04]: box('Illustrative person leg',(x+dx,y,z+.06),(.035,.05,.12),m['metal'],.01)

def tree(x,y,z,m):
    cyl('Street tree trunk',(x,y,z+.25),.055,.5,m['metal'])
    orb('Abstract tree canopy',(x,y,z+.60),.24,m['mint'],(1,1,1.35))

def building(x,y,w,d,h,m,name):
    box(name+' volume',(x,y,h/2+.17),(w,d,h),m['porcelain'],.07)
    box(name+' sky facade',(x,y-d/2-.018,h/2+.17),(w-.12,.045,h-.15),m['glass'],.008)
    for dz in range(1,max(2,int(h/.4))):
        z=.17+dz*h/max(2,int(h/.4))
        box(name+' floor band',(x,y-d/2-.055,z),(w-.07,.06,.04),m['white'],.01)
    for dx in [-w*.25,0,w*.25]:
        box(name+' fine mullion',(x+dx,y-d/2-.06,h/2+.17),(.025,.055,h-.12),m['white'],.005)
    box(name+' roof cap',(x,y,h+.20),(w+.09,d+.09,.09),m['white'],.02)


def setup(key):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s=bpy.context.scene
    m={'porcelain':mat('Airport porcelain white',(.79,.86,.90)),
       'white':mat('White architectural roof',(.91,.94,.96)),
       'sky':mat('KORETAIL sky enamel',(.42,.70,.88),.32,.10),
       'blue':mat('Sky detail',(.24,.52,.70),.38),
       'glass':mat('Muted sky glazing',(.32,.56,.69),.24,.16),
       'mint':mat('Small mint direction detail',(.63,.82,.74)),
       'metal':mat('Pale fine aluminium',(.45,.55,.60),.36,.3),
       'ground':mat('Almost white studio',(.985,.985,.985),.7,0)}
    floor=box('White studio shadow catcher',(0,0,-.15),(200,200,.1),m['ground'],0)
    floor.is_shadow_catcher=True
    s.render.engine='CYCLES'; s.cycles.device='CPU'; s.cycles.samples=40; s.cycles.use_denoising=True
    s.render.resolution_x=1440; s.render.resolution_y=900; s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG'; s.render.image_settings.color_mode='RGBA'; s.render.film_transparent=True
    s.world=bpy.data.worlds.new('White studio'); s.world.use_nodes=True
    s.world.node_tree.nodes.get('Background').inputs[0].default_value=(1,1,1,1)
    s.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
    for name,p,power,size in [('Soft north window',(-5,-4,10),850,7),('Sky fill',(4,3,8),400,6)]:
        bpy.ops.object.light_add(type='AREA',location=p); l=bpy.context.object; l.name=name
        l.data.energy=power; l.data.shape='DISK'; l.data.size=size
        l.rotation_euler=(Vector((0,0,.7))-l.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(10,-15,13))
    cam=bpy.context.object; cam.name='Isometric review camera'; cam.data.type='ORTHO'; cam.data.ortho_scale=13.2
    cam.rotation_euler=(Vector((0,0,.85))-cam.location).to_track_quat('-Z','Y').to_euler(); s.camera=cam
    s.view_settings.view_transform='Standard'
    # Opaque white review image, retaining shadows from the actual render.
    group=bpy.data.node_groups.new('KORETAIL white presentation','CompositorNodeTree')
    group.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    layer=group.nodes.new('CompositorNodeRLayers')
    over=group.nodes.new('CompositorNodeAlphaOver')
    over.inputs['Factor'].default_value=1
    over.inputs['Background'].default_value=(1,1,1,1)
    result=group.nodes.new('NodeGroupOutput')
    group.links.new(layer.outputs['Image'],over.inputs['Foreground'])
    group.links.new(over.outputs[0],result.inputs[0])
    s.compositing_node_group=group; s.render.use_compositing=True
    s['model_kind']='conceptual'; s['actual_coordinates']=False
    s['geometry_encodes_metric_values']=False; s['human_figures_are_quantitative']=False
    s['labels_in_html_only']=True; s['review_asset_key']=key
    return s,m


def station():
    s,m=setup('station')
    box('Cutaway platform raft',(0,0,.18),(9.6,5.7,.36),m['porcelain'])
    # Two rails and detailed sleepers remain visible in front of the train.
    for y in [-1.55,-2.18]: box('Aluminium rail',(0,y,.47),(9,.055,.075),m['metal'],.012)
    for i in range(29): box('Rail sleeper',(-4.4+i*.315,-1.865,.42),(.10,.93,.08),m['porcelain'],.008)
    box('Raised passenger platform',(0,.30,.61),(9.2,1.75,.32),m['white'])
    box('Platform mint edge',(0,-.61,.81),(9.2,.055,.055),m['mint'],.008)
    # Two connected carriage shells, intentionally unrelated to ridership volumes.
    for x in [-1.85,1.85]:
        box('Subway carriage',(x,-1.865,1.05),(3.55,.98,1.10),m['sky'],.18)
        box('Subway curved roof',(x,-1.865,1.66),(3.53,1.01,.16),m['white'],.07)
        box('Subway white side sill',(x,-2.367,.71),(3.4,.035,.13),m['white'],.01)
        for wx in [-1.18,-.59,.02,.63,1.22]:
            box('Carriage window',(x+wx,-2.369,1.22),(.43,.035,.34),m['glass'],.025)
        for wx in [-.88,.88]:
            box('Carriage door',(x+wx,-2.393,1.05),(.32,.027,.62),m['porcelain'],.012)
            box('Door glazing',(x+wx,-2.411,1.28),(.20,.016,.20),m['glass'],.006)
        for wx in [-1.05,1.05]:
            for wy in [-2.12,-1.61]: orb('Underbody wheel',(x+wx,wy,.53),.15,m['metal'],(1,.3,1))
    box('Carriage coupling',(0,-1.865,1.0),(.23,.7,.7),m['metal'])
    # The upper entry hall is open on the camera side so the turnstiles are visible.
    box('Station upper concourse deck',(0,1.97,2.17),(8.6,1.90,.19),m['white'])
    for x in [-3.9,3.9]:
        box('Concourse end support',(x,2.50,1.50),(.14,.17,2.2),m['porcelain'])
    box('Concourse back glazing',(0,2.86,2.91),(8.35,.085,1.32),m['glass'],.015)
    for x in [-3.9,-2.6,-1.3,0,1.3,2.6,3.9]:
        box('Concourse mullion',(x,2.79,2.91),(.055,.09,1.32),m['white'],.008)
    box('Shallow station canopy',(0,2.0,3.65),(8.9,2.2,.16),m['white'])
    box('Blank station sign, HTML label outside render',(0,1.02,3.38),(1.35,.06,.38),m['sky'])
    for x in [-.90,-.3,.3,.9]:
        box('Turnstile white pedestal',(x,1.92,2.52),(.19,.73,.54),m['porcelain'])
        box('Turnstile sky top',(x,1.92,2.80),(.20,.74,.08),m['sky'],.018)
        box('Turnstile mint gate',(x+.2,1.73,2.51),(.22,.045,.29),m['mint'],.008)
    # Two stair flights with white balustrades.
    for x in [-2.7,2.7]:
        for i in range(12):
            y=.70-i*.13; z=2.23-i*.115
            box('Visible station stair tread',(x,y,z),(.76,.17,.11),m['porcelain'],.008)
        for dx in [-.43,.43]:
            path('Stair handrail',[(x+dx,.76,2.9),(x+dx,-.80,1.6)],m['metal'],.025)
            for i in [0,4,8,11]:
                z=2.90-i*.115
                box('Stair rail support',(x+dx,.70-i*.13,z-.30),(.025,.025,.60),m['metal'],.004)
    for x,y,z in [(-1.9,.12,.81),(1.4,.3,.81),(.6,1.1,2.28)]: person(x,y,z,m)
    path('Concept entry direction',[(-4.5,1.2,2.3),(-3,1.4,2.34),(-1.4,1.5,2.34)],m['blue'],.025)
    arrow('Entry direction tip',(-1.3,1.5,2.34),(1,0,0),m['blue'])
    path('Concept exit direction',[(1.4,.48,.87),(2.5,.6,.87),(4.3,.6,.87)],m['mint'],.027)
    arrow('Exit direction tip',(4.42,.6,.87),(1,0,0),m['mint'])
    s.camera.data.ortho_scale=14.2
    return s


def living():
    s,m=setup('living-population')
    box('Abstract city district raft',(0,0,.08),(9.2,6.4,.16),m['porcelain'])
    box('Almost white central promenade',(0,-.6,.20),(8.9,1.25,.06),m['white'])
    box('Cross street',(1.35,0,.205),(1.05,6.1,.055),m['white'])
    for b in [(-3.1,1.4,1.6,1.3,2.4,'City hotel'),(-.95,1.4,1.75,1.4,1.65,'Urban office'),(2.8,1.7,1.55,1.5,2.95,'Residential building'),(-2.9,-2,1.95,.90,.8,'Street shops'),(.05,-2.0,1.80,.90,1.20,'City gallery'),(3.05,-1.55,1.4,1.20,1.7,'Civic building')]:
        building(*b[:-1],m,b[-1])
    # Shops have a small architectural mint awning.
    for x in [-3.45,-2.8,-2.15]:
        box('Street shop glazing',(x,-2.47,.58),(.43,.07,.56),m['glass'])
        box('Shop mint awning',(x,-2.62,.88),(.55,.39,.07),m['mint'],.014)
    for x,y in [(-4.02,-.55),(-1.25,-.50),(.0,.30),(1.35,2.63),(4.1,-.45)]: tree(x,y,.22,m)
    for x in [-2.4,.25]:
        box('Promenade bench',(x,-.30,.47),(.60,.16,.08),m['porcelain'],.015)
        for dx in [-.22,.22]: box('Bench leg',(x+dx,-.3,.35),(.05,.12,.2),m['metal'],.008)
    # A quiet spatial marker, never a measured heat map or people count.
    for r in [.48,.72]:
        path('Conceptual living population area marker',[(1.35+r*math.cos(i*math.tau/24),-.52+r*math.sin(i*math.tau/24),.24) for i in range(25)],m['sky'],.025)
    for x,y in [(-1.85,-.57),(.75,-.7),(1.3,.75),(3.45,-.52)]: person(x,y,.24,m)
    return s


def movement():
    s,m=setup('tourism-movement')
    box('Abstract mobility district raft',(0,0,.08),(9.2,6.4,.16),m['porcelain'])
    box('White city street',(0,-.95,.20),(8.95,1.4,.06),m['white'])
    # These places are anonymous concepts, not identified stations or POI coordinates.
    for b in [(-3.15,1.6,1.5,1.2,1.7,'Concept origin'),(0,1.8,1.7,1.3,2.25,'Concept cultural destination'),(3.2,.90,1.6,1.5,1.45,'Concept retail destination'),(-2.9,-2.15,1.8,.8,.8,'Concept neighborhood shops')]:
        building(*b[:-1],m,b[-1])
    for x,y in [(-3.15,-.65),(0,-.25),(3.2,-.8)]:
        cyl('Illustrative mobility hub',(x,y,.23),.44,.07,m['white'])
        cyl('Mobility hub inner sky disc',(x,y,.275),.22,.025,m['sky'])
    path('Illustrative movement path A',[(-3.15,-.65,.30),(-2,-1.3,.7),(-.8,-1.35,.8),(0,-.25,.30)],m['sky'],.065)
    path('Illustrative movement path B',[(0,-.25,.32),(1,-.9,.9),(2.5,-1.65,.70),(3.2,-.8,.32)],m['sky'],.065)
    path('Small mint destination accent',[(-3.15,-.65,.33),(-2.0,.40,1.2),(1.35,.35,1.2),(3.2,-.8,.33)],m['mint'],.035)
    arrow('Illustrative arrival direction',(-.25,-.78,.67),(.5,.9,-.6),m['blue'])
    arrow('Illustrative retail direction',(2.94,-1.1,.50),(.6,.7,-.5),m['blue'])
    for x,y in [(-4.04,.0),(1.35,2.35),(4.0,-1.95)]: tree(x,y,.2,m)
    for x,y in [(-2,-.75),(1,-1.3),(2.9,-1.8)]: person(x,y,.25,m)
    return s


def save(key,scene):
    scene.render.filepath=os.path.join(ROOT,key+'.png')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,key+'.blend'))
    bpy.ops.render.render(write_still=True)
    print('SEOUL_MODEL_RENDERED '+key,flush=True)

if __name__=='__main__':
    import sys
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    models={'station':station,'living-population':living,'tourism-movement':movement}
    for key in args or models:
        save(key,models[key]())