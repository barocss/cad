import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/drawing-fit-proposal-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/src/engine/proposalDrawingCallouts.ts',
  'apps/cad-studio/src/ui/ProposalDrawingCallouts.tsx',
  'apps/cad-studio/src/state/useProposalDrawingCallouts.ts',
  'packages/barocss-cad-model/src/chat/drawing.ts',
  'packages/barocss-cad-model/src/drawing/fits.ts',
  'packages/barocss-cad-model/src/io/svg.ts',
];
const f = await createFlow({
  name: 'drawing-fit-proposal', output: process.argv[2], envFrozen: 'D1836_SOURCE_FROZEN',
  qualification: 'Review one face-carried fit before approving a local nominal edit across two table intervals.',
  limits: ['One Top diameter and a synthetic shop table. These values are not certified standards or manufacturing approval.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import assert from 'node:assert/strict';
import {rectanglePart,withNode} from '@barocss/cad-model/engine/doc';
import {withIds} from '@barocss/cad-model/engine/ids';
import {drawingInputs} from '@barocss/cad-model/chat/drawing';
import {readDrawing} from '@barocss/cad-model/drawing/types';
const doc=withNode(withIds(rectanglePart(60,40,8)),{kind:'hole',parent:{node:1,side:'solid'},center:[30,20],radius:6});
const input=drawingInputs(doc);assert.ok(typeof input!=='string');
const edge=input.views.top.edges.find(e=>e.kind==='circle'&&e.circle&&Math.abs(e.circle.radius-6)<1e-7);
assert.ok(edge?.circle);
const fits={version:1 as const,faces:[{face:'n2.side0',class:'H7'}],tables:[{id:'synthetic-shop',rows:[
 {class:'H7',over:10,upTo:18,upper:.018,lower:0},
 {class:'H7',over:18,upTo:24,upper:.030,lower:0}
]}]};
const dimension={id:'bore-fit',kind:'diameter',view:'top',edge:edge.name,near:edge.circle.center,place:[55,45]};
console.log(JSON.stringify({...doc,fits,drawing:readDrawing({sheet:'A3',scale:1,views:['top'],dimensions:[dimension]})}));
`,
  oracleSource: String.raw`
import json, re, sys
import xml.etree.ElementTree as ET

data = json.load(sys.stdin)
ns = '{http://www.w3.org/2000/svg}'
svg = ET.fromstring(data['svg'])
groups = [g for g in svg.iter(ns+'g') if g.get('data-dim') == 'bore-fit' and g.get('class') == 'dimension']
view, = [g for g in svg.iter(ns+'g') if g.get('class') == 'view' and g.get('data-view') == 'top']
arcs = [path.get('d', '') for path in view.findall(ns+'path')]
if data['diameter'] == 0:
    assert groups == [] and arcs == [], (groups, arcs)
    lines = []
else:
    group, = groups
    lines = [''.join(t.itertext()) for t in group.iter(ns+'text')]
    text, = lines
    m = re.fullmatch(r'Ø(\d+(?:\.\d+)?) THRU H7 \(\+([.\d]+)/(\+?[.\d]+)\)', text)
    assert m, text
    value, upper, lower = [float(v) for v in m.groups()]
    assert value == data['diameter'], text
    # A projection roundoff can move a bound inward by one presentation digit.
    assert 0 <= lower <= .001 and data['upper'] - .001001 <= upper <= data['upper'], text
    r = data['diameter'] / 2
    assert len(arcs) == 2 and all(re.search(rf'A{r:g} {r:g} 0 0 [01] ', a) for a in arcs), arcs
source, = [''.join(t.itertext()) for t in svg.iter(ns+'text') if (t.text or '').startswith('SRC ')]
print(json.dumps(dict(status='PASS', lines=lines, source=source)))
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const mcp = { app: f.app, output: f.output, clientName: f.name };
const expectedVolume = diameter => 60 * 40 * 8 - Math.PI * (diameter / 2) ** 2 * 8;
async function capture(label, diameter, upper) {
  const d = f.page.getByLabel('Drawing sheet', { exact: true }).locator('g.dimension[data-dim="bore-fit"]');
  if (diameter) await d.getByText(new RegExp('Ø' + diameter)).waitFor();
  else await f.page.locator('.dw-dim.lost').waitFor();
  const state = await f.snapshot(label);
  assert.ok(Math.abs(state.bodies.bodies[0].volume - expectedVolume(diameter)) < 1e-7);
  const [download] = await Promise.all([f.page.waitForEvent('download'), button('Export SVG').click()]);
  const file = join(f.output, label + '.svg');
  await download.saveAs(file);
  const result = await f.runOracle({ svg: await readFile(file, 'utf8'), diameter, upper }, label);
  return { ...result, file };
}

await f.run(async () => {
  const seed = await f.inspect('synthetic-fit-fixture', {});
  const file = join(f.output, 'fit-review.bcad');
  const working = Buffer.from(JSON.stringify(seed));
  await writeFile(file, working);
  await f.freshOpen(file, seed, '01-original-model');
  await button('Drawing').click();
  const original = await capture('02-original-drawing', 12, .018);
  const originalSvg = await readFile(original.file);
  f.phase = 'Stage a nominal change pinned to the working part without applying it';
  const candidate = await withMcpSession(mcp, file, 'local-fit-change', async call => {
    const read = await call('drawing', { action: 'dimensions', sheet: 1, include_callouts: true });
    assert.deepEqual(read.callouts[0].lines, original.lines);
    const fields = await call('query', { action: 'edit_fields', index: 2 });
    const diameter = fields.fields.find(field => field.label === 'Diameter');
    assert.equal(diameter.value, 12);
    const op = { tool: 'features', args: { action: 'edit', index: fields.index, expectedRevision: fields.revision,
      values: { [diameter.key]: 19 } } };
    const staged = await call('proposals', { action: 'propose', title: 'Change the bore from 12 to 19 mm', ops: [op] });
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    const { proposals: [p1] } = await call('proposals', { action: 'list' });
    const result = await call('drawing', { action: 'dimensions', sheet: 1, review: {
      proposal: 'P1', expectedRevision: read.revision, expectedProposalRevision: p1.proposalRevision,
    } });
    assert.deepEqual(result.callouts[0].lines, original.lines);
    assert.match(result.candidate.callouts[0].lines[0], /Ø19(?:\.0+)? THRU H7 \(\+0\.(?:029|030?)\/(?:0|\+0\.001)\)/);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    return result.candidate;
  });
  const stagedBytes = await readFile(file);
  const pending = JSON.parse(stagedBytes);
  assert.deepEqual(pending.nodes, seed.nodes);
  assert.deepEqual(pending.fits, seed.fits);
  await f.freshOpen(file, pending, '03-pending');
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await button('Preview', card).click();
  const changes = card.getByRole('group', { name: 'Drawing callout changes', exact: true });
  await changes.waitFor();
  assert.deepEqual(await changes.locator('dd').allTextContents(), [original.lines[0], candidate.callouts[0].lines[0]]);
  await f.same(pending);
  assert.deepEqual(await readFile(file), stagedBytes);
  const impact = changes.getByText('Fit changed. Review before accepting.', { exact: true });
  if (baseline) {
    assert.equal(await impact.count(), 0);
    await f.snapshot('04-fit-change-no-separate-review');
    f.report.observations.push({ approvalPreview: 'FAIL: limits differ, but fit-impact review has no separate indication' });
    return;
  }
  await impact.waitFor();
  await f.snapshot('04-fit-change-explicit-review');
  await button('Accept', card).click();
  await f.changed(pending);
  await changes.waitFor({ state: 'hidden' });
  const approved = await f.doc();
  assert.equal(approved.nodes[2].radius, 9.5);
  assert.deepEqual(approved.fits, seed.fits);
  assert.deepEqual([approved.history.at(-1).kind, approved.history.at(-1).proposal, approved.history.at(-1).by.agent],
    ['accept', 'P1', 'user']);
  await button('Drawing').click();
  const current = await capture('05-approved-drawing', 19, .030);
  assert.deepEqual(current.lines, candidate.callouts[0].lines);
  assert.notEqual(current.source, original.source);
  await button('Model').click();
  const saved = await f.save('fit-change-approved');
  await f.freshOpen(saved.file, approved, '06-fresh-open-model');
  await button('Drawing').click();
  const reopened = await capture('07-reopened-drawing', 19, .030);
  assert.deepEqual([reopened.lines, reopened.source], [current.lines, current.source]);
  assert.deepEqual(await readFile(original.file), originalSvg);
  assert.deepEqual(await readFile(file), stagedBytes);
  f.report.observations.push({ working: original.lines, candidate: current.lines, fitTablePreserved: true, userApproved: true });

  f.phase = 'Lose the only bore, with no alternative and no fit assignment to the source';
  const isolated = structuredClone(approved);
  delete isolated.fits;
  delete isolated.proposals;
  delete isolated.history;
  const isolatedFile = join(f.output, 'no-alternative-bore.bcad');
  await writeFile(isolatedFile, JSON.stringify(isolated));
  await f.freshOpen(isolatedFile, isolated, '08-only-bore');
  await f.page.locator('.history .hs[data-node-index="2"]').click({ button: 'right' });
  await f.page.getByRole('menuitem', { name: 'Suppress', exact: true }).click();
  await f.changed(isolated);
  const suppressed = await f.doc();
  assert.equal(suppressed.nodes[2].suppressed, true);
  assert.deepEqual(suppressed.drawing.dimensions, isolated.drawing.dimensions);
  await button('Drawing').click();
  await capture('09-no-alternative-omits-callout', 0, 0);
  const diagnosis = await f.page.evaluate(() => window.__studioDrawing());
  assert.match(diagnosis.dimensions.find(dimension => dimension.id === 'bore-fit').lost, /circle.*no longer in the part/i);
  const issue = f.page.locator('[title="DIMENSION_LOST"]');
  assert.match(await issue.textContent(), /diameter dimension in the top view is lost/i);
  assert.equal(await f.page.getByRole('button', { name: /^(?:Use|Preview) candidate/ }).count(), 0);
  await f.undo();
  await f.same(isolated);
  await f.page.getByLabel('Drawing sheet', { exact: true }).locator('g.dimension[data-dim="bore-fit"]').waitFor();

});
