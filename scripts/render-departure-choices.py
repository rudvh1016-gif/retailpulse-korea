"""Owner-requested Blender concepts for every existing departure choice group."""
import bpy,importlib.util,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('symbols',ROOT/'scripts/render-prep-symbols.py')
model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)
OUT=ROOT/'public/visuals/departure-choices/v1';SRC=ROOT/'assets-src/departure-choices-20261010'
OUT.mkdir(parents=True,exist_ok=True);SRC.mkdir(parents=True,exist_ok=True)
def terminal(m,variant):
 model.box('Terminal main hall',(0,0,.55),(1.8,.76,.7),m['paper'],.1)
 model.box('Sky glass frontage',(0,-.40,.57),(1.62,.08,.46),m['sky'],.045)
 wings=[(-.82,.25,.63),(.82,.25,.63)] if variant=='t2' else [(-.83,.40,.58),(.83,.40,.58)]
 for x,y,z in wings:model.box('Terminal wing',(x,y,z),(.62,1.1,.45),m['sky'],.09)
 model.box('Mint roof',(0,0,.95),(1.76,.8,.1),m['mint'],.06)
 for x in [-.53,0,.53]:model.box('Front portal',(x,-.46,.48),(.22,.06,.35),m['paper'],.03)
def concourse(m):
 model.box('Concourse hall',(0,.2,.73),(.7,1.5,1.05),m['paper'],.1)
 for x in [-.65,.65]:
  for y in [-.38,.17,.70]:model.box('Concept gate arm',(x,y,.63),(.8,.22,.25),m['sky'],.05)
 model.box('Concourse roof',(0,.2,1.3),(.76,1.6,.12),m['mint'],.055)
def receipt(m):
 model.box('Refund document',(0,0,1.05),(1.18,.22,1.64),m['paper'],.09)
 model.box('Document header',(0,-.13,1.65),(.76,.04,.18),m['sky'],.03)
 for z in [.7,.98,1.26]:model.box('Receipt line',(0,-.14,z),(.75,.025,.05),m['mint'],.02)
 model.cylinder('Refund coin',(.67,-.18,.53),.32,.1,m['mint'],(1.5708,0,0))
def help_sign(m):
 model.box('Question card',(0,0,1.02),(1.3,.25,1.5),m['paper'],.15)
 model.tube('Question curve',[(-.25,-.17,1.40),(-.17,-.17,1.59),(.14,-.17,1.59),(.27,-.17,1.40),(.06,-.17,1.21),(.06,-.17,1.01)],.07,m['sky'])
 model.sphere('Question point',(.06,-.17,.77),.07,m['mint'])
def security(m):
 model.box('Security arch',(0,0,1.1),(1.5,.6,1.9),m['sky'],.12)
 model.box('Open arch center',(0,-.1,1.01),(1.06,.83,1.48),m['paper'],.065)
 model.box('Security indicator',(.48,-.35,1.88),(.25,.05,.08),m['mint'],.02)
 model.box('Security tray',(0,-.63,.30),(.8,.60,.16),m['mint'],.07)
def immigration(m):
 model.box('Passport',(0,0,1.1),(1.12,.22,1.63),m['sky'],.1)
 model.box('Passport inset',(0,-.14,1.1),(.65,.04,.61),m['paper'],.08)
 model.cylinder('Passport round emblem',(0,-.18,1.12),.2,.04,m['mint'],(1.5708,0,0))
manifest=[]
for name,compose in [('terminal-t1',lambda m:terminal(m,'t1')),('terminal-t2',lambda m:terminal(m,'t2')),('concourse',concourse),('refund-receipt',receipt),('help-sign',help_sign),('security-check',security),('immigration-pass',immigration)]:
 m=model.setup(name)
 for key,color in [('sky',(.67,.83,.94)),('mint',(.66,.84,.77)),('paper',(.99,.995,1))]:m[key]=model.material('departure '+key,color)
 base=bpy.data.objects['Small porcelain presentation base'];base.data.materials.clear();base.data.materials.append(m['paper'])
 compose(m);scene=bpy.context.scene;scene.cycles.samples=24;scene.render.resolution_x=scene.render.resolution_y=256;scene.camera.data.ortho_scale=3.75
 scene['meaning']='Fixed decorative concept; HTML selection and official source carry actual guidance.'
 image=OUT/(name+'-256.webp');scene.render.filepath=str(image)
 bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(name+'.blend')));bpy.ops.render.render(write_still=True)
 manifest.append({'name':name,'width':256,'height':256,'bytes':image.stat().st_size,'sha256':hashlib.sha256(image.read_bytes()).hexdigest(),'source':str((SRC/(name+'.blend')).relative_to(ROOT)).replace('\\','/')})
(OUT/'manifest.json').write_bytes((json.dumps({'engine':bpy.app.version_string,'conceptOnly':True,'runtime3d':False,'assets':manifest},indent=2)+'\n').encode('utf-8'))
print('DEPARTURE_CHOICES_READY '+str(sum(row['bytes'] for row in manifest)))
