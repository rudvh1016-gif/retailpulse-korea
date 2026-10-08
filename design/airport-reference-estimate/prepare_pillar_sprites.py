"""Slice the owner-requested Blender render into lightweight stretchable assets."""
import json
import os
import sys
from PIL import Image

source, target = sys.argv[1:3]
os.makedirs(target, exist_ok=True)
im = Image.open(source).convert('RGBA')
bounds = im.getchannel('A').getbbox()
im = im.crop(bounds)
w, h = im.size
# Locate the first full-width vertical wall; the cap includes the complete top face.
alpha = im.getchannel('A')
widths = [sum(alpha.getpixel((x,y)) > 100 for x in range(w)) for y in range(h)]
wall_width = max(widths)
first_wall = next(y for y in range(h) if widths[y] >= wall_width - 2)
last_wall = next(y for y in range(h - 1, -1, -1) if widths[y] >= wall_width - 2)
cap = im.crop((0,0,w,2 * first_wall + 2))
body = im.crop((0,h//2,w,h//2 + 2))
base = im.crop((0,max(0, h - 2 * (h - last_wall) - 2),w,h))
def display_size(part):
    return part.resize((162,max(2,round(part.height * 162 / w))),Image.Resampling.LANCZOS)
cap, body, base = map(display_size, (cap, body, base))
for name, part in [('cap',cap),('wall',body),('base',base)]:
    part.save(os.path.join(target, 'reference-pillar-' + name + '.webp'), lossless=True, method=6)
im.save(os.path.join(os.path.dirname(source), 'reference-pillar-cropped.png'))
metadata = {'source':'reference-pillar-unit.blend','bounds':bounds,'unitSize':[w,h],
            'capSize':list(cap.size),'wallSize':list(body.size),'baseSize':list(base.size),
            'dataBaked':False,'newRuntimeEngines':0}
with open(os.path.join(os.path.dirname(source),'pillar-sprites.json'),'w',encoding='utf-8') as f:
    json.dump(metadata,f,indent=2)
print(json.dumps(metadata))
