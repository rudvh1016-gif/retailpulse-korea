"""Reuse the signal-scene studio; render only a neutral station-gate model.

No station name, passenger count, clock, service availability or route map.
"""
import bpy
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('signal_studio', ROOT / 'scripts/render-signal-scenes.py')
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)


def station(m):
    studio.box('Station entrance wall', (0, .94, 1.13), (2.86, .13, 2.10), m['mint'], .05)
    studio.box('Blank entrance panel', (0, .86, 1.91), (1.59, .04, .32), m['white'], .03)
    for x in [-1.02, 0, 1.02]:
        studio.box('Station fare-gate housing', (x, -.08, .66), (.39, 1.25, 1.16), m['metal'], .09)
        studio.box('Fare-gate clean top', (x, -.08, 1.26), (.43, 1.28, .08), m['white'], .025)
        studio.box('Transit card reader', (x, -.43, 1.31), (.25, .31, .03), m['ink'], .03)
    for x in [-.51, .51]:
        studio.box('Neutral gate leaf', (x, .06, .77), (.60, .07, .65), m['sage'], .08)
    studio.box('Station map stand', (-1.19, .78, 1.19), (.50, .05, .58), m['white'], .025)


studio.render_scene('subway', station)
# Export the same full render for a directly viewable Library PNG.
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.image_settings.color_mode = 'RGBA'
bpy.data.images['Render Result'].save_render(str(studio.SOURCES / 'subway.png'), scene=bpy.context.scene)
