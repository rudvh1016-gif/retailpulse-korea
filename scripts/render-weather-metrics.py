"""Only missing weather symbols. Temperature and rain are reused exact Blender bytes."""
import importlib.util
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('topic_models', ROOT/'scripts/render-prep-symbols.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
box, sphere, cylinder, tube = model.box, model.sphere, model.cylinder, model.tube


def wind(m):
    cylinder('Windsock pole', (-.64, .25, 1.10), .048, 1.85, m['gold'])
    cylinder('Pole base', (-.64, .25, .24), .27, .07, m['lilac'])
    # Cylindrical fabric segments taper along the horizontal pole, with no wind reading.
    for i in range(7):
        ob = cylinder('Pastel windsock segment', (-.38+i*.20, .25, 1.88-i*.036), .24-i*.021, .205, m['rose' if i % 2 == 0 else 'paper'], (0, math.pi/2+.16, 0))
    for z in [.62, .93]:
        tube('Sculpted air-flow curl', [(-.24, -.40, z), (.28, -.40, z+.03), (.75, -.40, z+.14), (.95, -.40, z+.35), (.82, -.40, z+.47)], .034, m['mint'])


def humidity(m):
    # A droplet and unnumbered hygrometer represent humidity, not rainfall.
    box('Hygrometer frame', (.44, .32, 1.02), (.95, .27, 1.30), m['lilac'], .14)
    box('Hygrometer blank display', (.44, .176, 1.11), (.70, .022, .74), m['paper'], .06)
    sphere('Humidity droplet body', (-.60, -.08, .77), .38, m['mint'], (.90, .60, 1.02))
    import bpy
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=.31, radius2=0, depth=.65, location=(-.60, -.08, 1.14))
    tip = bpy.context.object
    tip.name = 'Tapered humidity droplet tip'
    tip.scale.y = .60
    tip.data.materials.append(m['mint'])
    for face in tip.data.polygons:
        face.use_smooth = True
    sphere('Hygrometer category dot', (.44, .15, .63), .095, m['rose'], (1, .20, 1))


def air(m):
    box('Air sensor porcelain body', (-.35, .25, 1.01), (1.06, .72, 1.67), m['paper'], .16)
    for z in [.66, .85, 1.04, 1.23]:
        box('Air intake slot', (-.35, -.117, z), (.66, .018, .046), m['lilac'], .02)
    box('Air sensor unnumbered status panel', (-.35, -.12, 1.57), (.42, .021, .19), m['mint'], .04)
    for x, y, z, size in [(.55, -.12, .78, .16), (.92, .08, 1.29, .115), (.42, .12, 1.76, .12), (.95, -.10, .48, .10)]:
        sphere('Air particle symbol', (x, y, z), size, m['rose' if size > .13 else 'gold'])
    tube('Air-flow around particles', [(.20, -.26, .33), (.78, -.24, .40), (1.12, -.20, .84)], .025, m['mint'])


def sun(m):
    center = (0, .1, 1.28)
    sphere('Published clear-sky sun', center, .57, m['peach'], (1, .30, 1))
    for i in range(12):
        a = i*math.tau/12
        tube('Warm sun ray', [(.76*math.cos(a), .1, 1.28+.76*math.sin(a)), (.99*math.cos(a), .1, 1.28+.99*math.sin(a))], .052, m['gold'])


def cloud(m):
    for x, z, radius in [(-.63, 1.10, .43), (-.10, 1.35, .59), (.45, 1.15, .47), (.79, .96, .29)]:
        sphere('Published cloud-cover lobe', (x, .1, z), radius, m['paper'], (1, .72, .85))
    box('Cloud underside without precipitation', (.03, .10, .91), (1.87, .55, .36), m['paper'], .16)


def snow(m):
    cloud(m)
    for x, z in [(-.51, .45), (.27, .35), (.82, .43)]:
        for angle in [0, math.pi/3, math.pi*2/3]:
            tube('Published snowflake arm', [(x-.14*math.cos(angle), -.25, z-.14*math.sin(angle)), (x+.14*math.cos(angle), -.25, z+.14*math.sin(angle))], .022, m['lilac'])


if __name__ == '__main__':
    selected = set(sys.argv[sys.argv.index('--')+1:]) if '--' in sys.argv else None
    if selected and not selected.issubset({'wind', 'humidity', 'air', 'sun', 'cloud', 'snow'}):
        raise ValueError('Unknown weather symbol')
    for name, compose in [('wind', wind), ('humidity', humidity), ('air', air), ('sun', sun), ('cloud', cloud), ('snow', snow)]:
        if selected is None or name in selected:
            model.render(name, compose, ROOT/'public/visuals/weather/v2', ROOT/'outputs/weather-metrics-v2')
