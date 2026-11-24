import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const [output, input] = process.argv.slice(2);
assert.ok(output && input, 'Use the actual Keep file from instance-pattern-orientation-browser.mjs');
const oracleSource = String.raw`
import itertools, json, re, sys, xml.etree.ElementTree as ET
from pathlib import Path

case = json.load(sys.stdin)
brackets = {
    'keep': [(16., 5., 20., 15.), (6., 15., 10., 25.), (6., -5., 10., 5.)],
    'rotate': [(16., 5., 20., 15.), (0., 11., 10., 15.), (10., -5., 20., -1.)],
}[case['mode']]
stock = (-20., -20., 140., 40.)
boxes = [stock, *brackets]
point = lambda p: tuple(round(v, 5) for v in p)
edge = lambda a, b: tuple(sorted((point(a), point(b))))

def expected_set(box, z_lo, z_hi):
    x0, y0, x1, y1 = box
    return frozenset(itertools.product((x0, x1), (y0, y1), (z_lo, z_hi)))

# The scoped writer emits simple DATA entities, one per line, and plain solid shells.
step = Path(case['step']).read_text()
assert step.startswith('ISO-10303-21;') and 'END-ISO-10303-21;' in step
entity = {int(i): (kind, text) for i, kind, text in re.findall(r'^\s*#(\d+)\s*=\s*([A-Z][A-Z_0-9]*)\((.*)\);\s*$', step, re.M)}
refs = lambda text: [int(i) for i in re.findall(r'#(\d+)', text)]
topology = {'CLOSED_SHELL', 'ADVANCED_FACE', 'FACE_OUTER_BOUND', 'FACE_BOUND', 'EDGE_LOOP', 'ORIENTED_EDGE', 'EDGE_CURVE'}
def vertices(i):
    kind, text = entity[i]
    if kind == 'VERTEX_POINT':
        key, = refs(text)
        point_kind, data = entity[key]
        assert point_kind == 'CARTESIAN_POINT'
        return {point(map(float, data.rsplit('(', 1)[1].rstrip(')').split(',')))}
    if kind not in topology:
        return set()
    return set().union(*(vertices(key) for key in refs(text)))

actual = []
for kind, text in entity.values():
    if kind == 'MANIFOLD_SOLID_BREP':
        shell, = refs(text)
        assert entity[shell][0] == 'CLOSED_SHELL'
        actual.append(frozenset(vertices(shell)))
expected = [expected_set(stock, -4., 0.)] + [expected_set(box, 0., 2.) for box in brackets]
assert len(actual) == len(expected), (case['mode'], len(actual))
assert set(actual) == set(expected), (case['mode'], actual, expected)

# Compare screen and actual SVG Top-view geometry, then check individual complete boxes.
svg = '{http://www.w3.org/2000/svg}'
def top(tree):
    group, = [g for g in tree.iter(svg+'g') if g.get('data-view') == 'top' and g.get('class') == 'view']
    return [tuple(float(e.get(key)) for key in ('x1','y1','x2','y2')) for e in group if e.tag == svg+'line' and not e.get('stroke-dasharray')]
ink = top(ET.parse(case['svg']).getroot())
screen = top(ET.fromstring(case['screen']))
assert ink and ink == screen
min_x = min(min(a, c) for a, b, c, d in ink)
max_y = max(max(b, d) for a, b, c, d in ink)
scale = case['scale']
world = lambda x, y: ((x-min_x)/scale+stock[0], (max_y-y)/scale+stock[1])
drawn = {edge(world(a, b), world(c, d)) for a, b, c, d in ink}
expected_edges = set()
for x0, y0, x1, y1 in boxes:
    ring = [(x0,y0), (x1,y0), (x1,y1), (x0,y1)]
    expected_edges.update(edge(ring[k], ring[(k+1)%4]) for k in range(4))
assert drawn == expected_edges, (case['mode'], drawn-expected_edges, expected_edges-drawn)
print(json.dumps({'status':'PASS', 'mode':case['mode'], 'stepSolids':len(actual), 'verticesPerSolid':8, 'topEdges':len(drawn), 'widthDepths':[[(x2-x1),(y2-y1)] for x1,y1,x2,y2 in brackets]}))
`;

const f = await createFlow({
  name: 'instance-pattern-orientation-output', envFrozen: 'PATTERN_OUTPUT_FROZEN', output,
  qualification: 'Actual Studio Assembly Drawing and STEP downloads keep the selected circular orientation.',
  initialFiles: [
    'apps/cad-studio/test/instance-pattern-orientation-output-browser.mjs',
    'apps/cad-studio/src/files/StepExportPanel.tsx',
    'packages/barocss-cad-model/src/engine/evaluate.ts',
  ],
  limits: ['One top-level circular pattern, three present brackets and one Skip. Planar STEP topology and the assembly Top view only.'],
  oracleSource,
});
const button = (name, within = f.page) => within.getByRole('button', { name, exact: true });
const switchMode = name => button(name, f.page.locator('.mode')).click();
const settings = () => f.page.getByRole('complementary', { name: 'Drawing settings', exact: true });
const stepPanel = () => f.page.getByRole('region', { name: 'STEP export', exact: true });
const pickSeed = () => f.page.locator('[data-browser-instance-path="cube"]').click();
async function download(label, ext, control) {
  const [event] = await Promise.all([f.page.waitForEvent('download'), control.click()]);
  const path = join(f.output, `${label}.${ext}`);
  await event.saveAs(path);
  const bytes = await readFile(path);
  f.report.files.push({ label, ext, bytes: bytes.length, sha256: sha256(bytes) });
  return path;
}
async function exportOutputs(mode) {
  f.phase = `Export ${mode} arrangement from Studio`;
  await switchMode('Drawing');
  await settings().getByLabel('Drawing scope', { exact: true }).selectOption('assembly');
  await settings().getByLabel('Scale', { exact: true }).selectOption('0.5');
  await settings().getByLabel('Hidden lines', { exact: true }).uncheck();
  const ink = f.page.locator('.dw svg g.view[data-view="top"] line:not([stroke-dasharray])');
  await ink.first().waitFor({ state: 'attached' });
  const screen = await f.page.locator('svg[aria-label="Drawing sheet"]').evaluate(e => new XMLSerializer().serializeToString(e));
  const svg = await download(mode, 'svg', button('Export SVG'));
  await f.snapshot(`${mode}-assembly-drawing`);
  await switchMode('Model');
  await f.ready();
  const doc = await f.doc();
  assert.deepEqual(doc.instancePatterns[0].skip, [2]);
  await button('Export STEP').click();
  await stepPanel().getByLabel('STEP loss report', { exact: true }).waitFor();
  const included = await stepPanel().getByLabel('STEP included bodies').innerText();
  assert.match(included, /^4 output bodies\b/);
  await f.snapshot(`${mode}-step-preview`);
  const step = await download(mode, 'step', button('Export', stepPanel()));
  await f.same(doc);
  return f.runOracle({ mode, svg, step, screen, scale: 0.5 }, mode);
}
await f.run(async () => {
  await f.newPage();
  await f.openFile(input, 2);
  const initial = await f.doc();
  assert.equal(initial.instancePatterns[0].kind, 'circular-fixed');
  await exportOutputs('keep');
  const before = await f.doc();
  await pickSeed();
  const form = f.page.getByRole('group', { name: 'Instance pattern', exact: true });
  await form.getByLabel('Pattern orientation', { exact: true }).selectOption('rotate');
  await button('Apply', form).click();
  await f.changed(before);
  const rotating = await f.doc();
  assert.equal(rotating.instancePatterns[0].kind, 'circular');
  assert.deepEqual(rotating.instances.map(i => i.position), before.instances.map(i => i.position));
  await exportOutputs('rotate');
});
