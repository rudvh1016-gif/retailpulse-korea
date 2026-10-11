"""Original pastel checkpoint base. Decorative people; live HTML owns every value.
Blender --background --python this.py -- ABSOLUTE_OUTPUT_DIRECTORY
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1])
out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=.38
    return m
white=material('porcelain white',(.91,.96,1))
sky=material('soft sky',(.27,.59,.83))
mint=material('mint accent',(.4,.76,.62))
blue=material('scanner belt and wayfinding',(.13,.34,.51))
glass=material('pale scanner glass',(.57,.78,.88))
floor=material('white ground',(1,1,1))
def box(name,pos,size,mat,bevel=.08):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name
    o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    b=o.modifiers.new('soft manufactured edges','BEVEL');b.width=bevel;b.segments=4
    o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
    return o

def sphere(name,pos,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    for polygon in o.data.polygons:polygon.use_smooth=True
    return o

def person(name,x,y):
    # Fixed decorative scene characters: never a rendering of observed queue counts.
    sphere(name+' head',(x,y,.68),(.075,.075,.075),white)
    sphere(name+' jacket',(x,y,.49),(.085,.065,.14),sky)
    for offset in [-.038,.038]:
        box(name+' leg',(x+offset,y,.31),(.042,.052,.18),white,.018)
    for offset in [-.10,.10]:
        box(name+' arm',(x+offset,y,.47),(.034,.045,.17),white,.015)
    box(name+' carry on',(x+.17,y+.015,.32),(.105,.105,.17),mint,.025)
    box(name+' luggage handle',(x+.17,y+.015,.44),(.058,.021,.07),blue,.01)
# An original bowed plinth: four paired observation groups, not official geometry.
vertices=[]
for z in [.02,.18]:
    for rear in [False,True]:
        for i in range(33):
            x=-3.7+7.4*i/32;y=.44-.075*x*x+(.66 if rear else -.95)
            vertices.append((x,y,z))
faces=[]
for i in range(32):
    faces.extend([(i,i+1,33+i+1,33+i),(66+i,99+i,99+i+1,66+i+1),
                  (i,66+i,66+i+1,i+1),(33+i,33+i+1,99+i+1,99+i)])
faces.extend([(0,33,99,66),(32,98,131,65)])
mesh=bpy.data.meshes.new('bowed base mesh');mesh.from_pydata(vertices,[],faces);mesh.update()
base=bpy.data.objects.new('original curved checkpoint base',mesh);bpy.context.collection.objects.link(base)
base.data.materials.append(white);b=base.modifiers.new('porcelain lip','BEVEL');b.width=.08;b.segments=4;base.modifiers.new('normals','WEIGHTED_NORMAL')
for index,x in enumerate([-2.7,-.9,.9,2.7]):
    y=.44-.075*x*x
    box('paired booth platform '+str(index),(x,y,.23),(1.38,1.12,.14),sky)
    for dx in [-.48,0,.48]:box('white checkpoint post',(x+dx,y,.66),(.13,.2,.83),white,.035)
    box('checkpoint canopy',(x,y,1.09),(1.22,.33,.18),sky,.07)
    box('mint edge',(x,y-.19,1.1),(1.03,.04,.055),mint,.02)
    for lane,dx in enumerate([-.26,.26]):
        box('scanner housing',(x+dx,y+.16,.55),(.28,.43,.39),white,.035)
        box('scanner opening',(x+dx,y-.063,.54),(.20,.018,.21),blue,.018)
        box('conveyor belt',(x+dx,y-.25,.40),(.24,.37,.065),blue,.018)
        box('tray',(x+dx,y-.34,.445),(.16,.12,.033),glass,.012)
        box('lane marker',(x+dx,y-.71,.195),(.08,.19,.012),mint,.008)
        if (index+lane)%2==0:person('decorative traveler '+str(index)+str(lane),x+dx-.04,y-.6)
    for dx in [-.63,.63]:
        box('queue rail post',(x+dx,y-.52,.45),(.025,.025,.42),white,.008)
        box('queue rail',(x+dx,y-.31,.64),(.025,.46,.025),glass,.01)
ground=box('ground',(0,0,-.18),(200,200,.2),floor);ground.is_shadow_catcher=True
world=bpy.data.worlds.new('soft white studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(1,1,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;bpy.context.scene.world=world
for name,pos,power,size in [('key',(-4,-5,7),650,5),('fill',(4,-1,5),350,4)]:
    bpy.ops.object.light_add(type='AREA',location=pos);lamp=bpy.context.object;lamp.name=name;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;lamp.rotation_euler=(Vector((0,0,.2))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-8,8));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.35))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=8.35
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=960;scene.render.resolution_y=400;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.2
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'checkpoint-base.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'checkpoint-base.blend'))
bpy.ops.render.render(write_still=True)
