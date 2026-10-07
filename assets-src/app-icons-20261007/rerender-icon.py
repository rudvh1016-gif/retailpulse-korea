from pathlib import Path
import bpy
root=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root/'model'/'koretail-app-icon.blend'))
bpy.context.scene.render.filepath=str(root/'render'/'koretail-flight-runway-1024.png')
bpy.ops.render.render(write_still=True)
