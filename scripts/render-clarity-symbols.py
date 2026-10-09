"""Small real Blender symbols. All live dates, counts and choices remain accessible HTML."""
import bpy
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('symbols',ROOT/'scripts/render-prep-symbols.py')
model=importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
OUT=ROOT/'public/visuals/clarity/v1'
SOURCE=ROOT/'assets-src/clarity-20261009'
OUT.mkdir(parents=True,exist_ok=True)
SOURCE.mkdir(parents=True,exist_ok=True)

def suitcase(m,small=False):
 h=1.15 if small else 1.65
 model.box('Suitcase shell',(0,0,.31+h/2),(1.1,.58,h),m['sky'],.16)
 model.box('Raised handle',(0,0,.39+h),(.5,.18,.34),m['mint'],.05)
 model.box('Handle opening',(0,-.01,.43+h),(.29,.2,.14),m['paper'],.025)
 for x in [-.29,.29]:model.box('Soft luggage rib',(x,-.3,.31+h/2),(.035,.035,h*.68),m['paper'],.02)
 for x in [-.38,.38]:model.sphere('Suitcase wheel',(x,0,.22),.12,m['ink'])

def calendar(m):
 model.box('Calendar body',(0,0,1.12),(1.6,.30,1.65),m['paper'],.1)
 model.box('Calendar header',(0,-.19,1.78),(1.6,.11,.34),m['sky'],.05)
 for x in [-.48,.48]:model.tube('Calendar ring',[(x,-.25,1.81),(x,-.25,2.11),(x,.17,2.11),(x,.17,1.81)],.065,m['mint'])
 for x in [-.43,0,.43]:
  for z in [.67,1.04,1.41]:model.box('Blank date cell',(x,-.175,z),(.21,.035,.17),m['mint'],.04)

def record(m):
 model.box('Travel journal',(0,0,1.11),(1.43,.35,1.79),m['sky'],.11)
 model.box('Journal pages',(.09,-.015,1.13),(1.17,.32,1.59),m['paper'],.07)
 model.box('Journal front',(0,-.21,1.12),(1.43,.055,1.79),m['sky'],.09)
 model.box('Blank journal inset',(.09,-.249,1.17),(.86,.035,.58),m['mint'],.06)
 model.box('Journal bookmark',(.41,-.015,.96),(.10,.03,1.91),m['mint'],.02)

def camera(m):
 model.box('Tourism camera',(0,0,1),(1.7,.65,1.02),m['sky'],.16)
 model.box('Camera top',(-.24,0,1.64),(.65,.48,.33),m['mint'],.08)
 model.cylinder('Camera lens',(0,-.48,1),.36,.3,m['paper'],(1.5708,0,0))
 model.cylinder('Lens glass',(0,-.65,1),.25,.035,m['ink'],(1.5708,0,0))

def shopping(m):
 model.box('Shopping bag',(0,0,.91),(1.43,.70,1.4),m['sky'],.09)
 for y in [-.21,.21]:model.tube('Shopping bag handle',[(-.39,y,1.56),(-.39,y,2.03),(.39,y,2.03),(.39,y,1.56)],.055,m['mint'])
 model.box('Plain bag inset',(0,-.36,.98),(.7,.025,.48),m['paper'],.05)

for name,compose in [('checked-bag',lambda m:suitcase(m)),('cabin-bag',lambda m:suitcase(m,True)),('calendar',calendar),('travel-record',record),('tourism-camera',camera),('shopping-bag',shopping)]:
 m=model.setup(name)
 m['sky']=model.material('approved sky blue',(.67,.83,.94))
 m['mint']=model.material('restrained mint',(.66,.84,.77))
 m['paper']=model.material('near white',(.99,.995,1))
 bpy.data.objects['Small porcelain presentation base'].data.materials.clear()
 bpy.data.objects['Small porcelain presentation base'].data.materials.append(m['paper'])
 compose(m)
 scene=bpy.context.scene
 scene.cycles.samples=24
 scene.render.resolution_x=256
 scene.render.resolution_y=256
 scene.camera.data.ortho_scale=3.75
 scene.render.filepath=str(OUT/(name+'-256.webp'))
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(name+'.blend')))
 bpy.ops.render.render(write_still=True)
