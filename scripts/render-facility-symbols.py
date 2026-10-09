"""Small Blender facility concepts, separate from published coordinates and live availability."""
import bpy
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('symbols',ROOT/'scripts/render-prep-symbols.py')
model=importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
OUT=ROOT/'public/visuals/facilities/v1'
SOURCE=ROOT/'assets-src/facilities-20261009'
OUT.mkdir(parents=True,exist_ok=True)
SOURCE.mkdir(parents=True,exist_ok=True)

def lockers(m):
    model.box('Locker bank',(0,0,1.1),(1.7,.58,1.8),m['paper'],.08)
    for x in [-.55,0,.55]:
        for z in [.65,1.55]:
            model.box('Locker door',(x,-.33,z),(.48,.08,.8),m['sky'],.045)
            model.box('Locker handle',(x+.13,-.4,z),(.035,.04,.2),m['mint'],.02)

def toilets(m):
    model.box('Public toilet building',(0,0,1),(1.8,.9,1.7),m['paper'],.1)
    model.box('Sheltering roof',(0,0,1.92),(2,.99,.15),m['sky'],.08)
    for x in [-.47,.47]:
        model.box('Public toilet entrance',(x,-.48,.98),(.65,.075,1.3),m['sky'],.06)
        model.sphere('Blank entrance marker',(x,-.54,1.41),.11,m['mint'])
        model.box('Entrance handle',(x+.21,-.54,.97),(.035,.035,.16),m['paper'],.02)

def parking(m):
    model.box('Parking platform',(0,0,.28),(2.4,1.6,.12),m['paper'],.06)
    for x in [-.82,.82]:model.box('Parking bay marking',(x,0,.35),(.045,1.25,.02),m['mint'],.01)
    model.box('Car body',(0,0,.62),(1.35,.82,.42),m['sky'],.17)
    model.box('Car cabin',(-.12,0,.98),(.7,.73,.43),m['sky'],.14)
    model.box('Windshield',(.22,0,1),(.055,.57,.23),m['paper'],.035)
    for x in [-.43,.43]:
        for y in [-.41,.41]:model.sphere('Car wheel',(x,y,.48),.15,m['mint'])

for name,compose in [('lockers',lockers),('toilets',toilets),('parking',parking)]:
    m=model.setup(name)
    m['sky']=model.material('approved sky blue',(.67,.83,.94))
    m['mint']=model.material('restrained mint',(.66,.84,.77))
    m['paper']=model.material('near white',(.99,.995,1))
    base=bpy.data.objects['Small porcelain presentation base']
    base.data.materials.clear();base.data.materials.append(m['paper'])
    compose(m)
    scene=bpy.context.scene
    scene.cycles.samples=24
    scene.render.resolution_x=256;scene.render.resolution_y=256
    scene.camera.data.ortho_scale=3.75
    scene.render.filepath=str(OUT/(name+'-256.webp'))
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(name+'.blend')))
    bpy.ops.render.render(write_still=True)
