"""Three actual Blender payment-information sculptures; numeric bands stay in HTML."""
import importlib.util
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('topic_models', ROOT/'scripts/render-prep-symbols.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
box, sphere, cylinder, tube = model.box, model.sphere, model.cylinder, model.tube


def coin(name, x, y, z, mat):
    cylinder(name, (x, y, z), .25, .085, mat)
    cylinder(name+' inner rim', (x, y, z+.046), .19, .008, mat)


def amount(m):
    for i in range(4):
        ob = box('Blank banknote '+str(i), (-.20+i*.05, .25+i*.03, .32+i*.085), (1.75, .90, .055), m['mint'], .04)
        ob.rotation_euler[2] = -.06+i*.035
    box('Banknote blank inset', (-.05, .34, .69), (1.35, .58, .016), m['paper'], .04)
    sphere('Unlettered banknote medallion', (-.05, .34, .72), .19, m['mint'], (1, 1, .12))
    box('Payment card', (-.40, .69, 1.34), (1.36, .12, .88), m['rose'], .10)
    box('Card chip', (-.67, .62, 1.35), (.24, .012, .20), m['gold'], .035)
    for z in [.26, .35, .44, .53, .62]:
        coin('Payment amount coin', .73, -.49, z, m['gold'])


def count(m):
    ob = box('Point-of-sale terminal', (-.40, .14, .57), (1.10, .88, .65), m['lilac'], .13)
    box('Terminal blank display', (-.40, -.02, .93), (.78, .48, .035), m['ink'], .05)
    for x in [-.66, -.40, -.14]:
        for y in [-.10, -.33]:
            box('Unnumbered terminal key', (x, y, .93), (.14, .10, .035), m['paper'], .02)
    for i in range(3):
        box('Separate unprinted transaction receipt '+str(i), (.51+i*.09, .43+i*.10, 1.14+i*.13), (.58, .045, 1.25), m['paper'], .025)
        for z in [.88+i*.13, 1.08+i*.13, 1.28+i*.13]:
            box('Non-text receipt rule', (.51+i*.09, .403+i*.10, z), (.32, .006, .024), m['mint'], .007)


def average(m):
    box('Single payment receipt', (.40, .57, 1.16), (.75, .055, 1.57), m['paper'], .035)
    for z in [.87, 1.08, 1.29, 1.50]:
        box('Unprinted receipt rule', (.40, .533, z), (.47, .007, .028), m['lilac'], .006)
    box('One payment card', (-.43, -.05, .89), (1.28, .12, .87), m['peach'], .10)
    box('Single-payment chip', (-.70, -.116, .90), (.23, .010, .19), m['gold'], .027)
    for z in [.27, .36, .45]:
        coin('Per-payment coin', .65, -.49, z, m['gold'])
    # One payment is the unit; no plotted mean, proportion or invented count.


if __name__ == '__main__':
    for name, compose in [('amount', amount), ('count', count), ('average', average)]:
        model.render(name, compose, ROOT/'public/visuals/commercial/v1', ROOT/'outputs/commercial-metrics-v1')
