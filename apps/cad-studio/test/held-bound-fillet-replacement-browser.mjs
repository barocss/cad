// #20: same held single-straight-edge fixture as held-variable-fillet-replacement,
// with saved Dim bindings instead of literal radius values. No new native oracle.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const [output, mode] = process.argv.slice(2);
assert.ok(['--baseline', '--after'].includes(mode));
const baseline = mode === '--baseline';
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { StartR: 1, EndR: 3 },
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [30, 12] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 20 },
    { id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side6|n1.side7'],
      radius: { parameter: 'StartR' },
      radii: [{ at: [20, 20, 0], radius: { parameter: 'StartR' }, atEnd: true },
        { at: [20, 20, 3], radius: { parameter: 'EndR' }, atEnd: true }],
      sigs: { 'n1.side6|n1.side7': { k: 'line', p: [20, 20, 1.5], d: [0, 0, 1], s: 3 } } },
  ], outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
};
const pins = [
  'apps/cad-studio/test/held-bound-fillet-replacement-browser.mjs',
  'apps/cad-studio/src/state/heldFinishReplacement.ts',
  'apps/cad-studio/src/state/useHeldFinishEdge.ts',
  'apps/cad-studio/src/ui/NodeEditor.tsx',
];
const f = await createFlow({
  name: 'held-bound-fillet-replacement', output, envFrozen: 'HELD_BOUND_FILLET_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: baseline ? '#20 baseline: held varying Fillet with saved parameter radii lacks explicit Replace edge.'
    : '#20 bound-radius explicit replacement: same terminal single straight edge, saved Dim preservation.',
  oracleSource: String.raw`import json,sys
from pathlib import Path
d=json.load(sys.stdin); saved=json.loads(Path(d['file']).read_bytes())
assert saved['parameters']=={'StartR':2,'EndR':3}
assert len(saved['nodes'])==3
f=saved['nodes'][2]
assert f['id']=='n2' and f['parent']=={'node':1,'side':'solid'}
assert f['edges']==['n1.side0|n1.top']
assert f['radius']=={'parameter':'StartR'}
assert f['radii']==[{'at':[0,0,20],'radius':{'parameter':'StartR'},'atEnd':True},{'at':[30,0,20],'radius':{'parameter':'EndR'},'atEnd':True}]
assert not any(k in f for k in ['held','suppressed','rematched'])
assert saved['nodes'][:2]==d['originalNodes']
assert d['beforeVolume']>d['afterVolume']>0
print(json.dumps({'status':'PASS','savedDimBindingsExact':True,'originalNodesExact':True,'beforeVolume':d['beforeVolume'],'afterVolume':d['afterVolume'],'claim':'current application body volume changes; not an independent native accuracy certification'}))
`,
  limits: ['Synthetic 30×12×20 box; terminal two-end circular law only. No new topology or general native accuracy qualification.',
    'No interior/multi-edge/curved/linked-source/late-result qualification in this run.'],
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
async function open(doc) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'held-bound-fillet.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.page.getByRole('region', { name: 'References', exact: true }).waitFor();
  await f.ready();
}
async function pick() {
  const p = await f.page.evaluate(() => window.__studioScreenOf([15, 0, 20]));
  assert.ok(p && p.length === 2); await f.page.mouse.click(...p);
  for (const [label, expected] of [['Start', [0, 0, 20]], ['End', [30, 0, 20]]]) {
    const marker = f.page.locator(`[data-fillet-endpoint="${label}"]`); await marker.waitFor();
    assert.deepEqual((await marker.getAttribute('data-position')).split(',').map(Number), expected);
  }
  await f.editor().getByText(/This choice assigns the saved Start/).waitFor();
}
await f.run(async () => {
  await f.newPage();
  f.phase = 'Open same held fixture with parameter-bound radius fields';
  await open(source);
  const before = await f.doc(), feature = before.nodes[2];
  assert.ok(feature.held); assert.equal(feature.suppressed, true);
  assert.deepEqual(before.parameters, source.parameters);
  assert.deepEqual(before.nodes.slice(0, 2), source.nodes.slice(0, 2));
  assert.deepEqual(feature.radius, source.nodes[2].radius);
  assert.deepEqual(feature.radii, source.nodes[2].radii);
  await writeFile(join(output, 'authored-fixture.bcad'), JSON.stringify(source, null, 2));
  await writeFile(join(output, 'accepted-held.bcad'), JSON.stringify(before, null, 2));
  await f.openFeatureEditor(2);
  const replace = button('Replace edge', f.editor());
  if (baseline) {
    assert.equal(await replace.count(), 0);
    await f.same(before);
    await f.snapshot('01-bound-held-no-replace');
    f.report.observations.push({ label: 'baseline', replaceButtons: 0, boundFieldsPreserved: true, held: feature.held,
      numericalShape: 'Existing numeric fixture, same parameter values; no independent native re-evaluation performed.' });
    return;
  }
  assert.equal(await replace.isEnabled(), true);
  await button('Top', f.page.locator('.views')).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  await replace.click(); await pick(); await f.same(before);
  await f.editor().getByText('Start RStartR (1) → (0, 0, 20)', { exact: true }).waitFor();
  await f.editor().getByText('End REndR (3) → (30, 0, 20)', { exact: true }).waitFor();
  assert.equal((await f.editor().innerText()).includes('[object Object]'), false);
  await button('Apply edge replacement', f.editor()).scrollIntoViewIfNeeded();
  await f.snapshot('02-bound-staged-replacement');
  await button('Cancel edge replacement', f.editor()).click();
  await f.same(before); assert.equal(await f.page.locator('[data-fillet-endpoint]').count(), 0);
  await replace.click(); await pick();
  await button('Apply edge replacement', f.editor()).click();
  await f.changed(before);
  const accepted = await f.doc(), changed = accepted.nodes[2];
  assert.equal(changed.held, undefined); assert.equal(changed.suppressed, undefined);
  assert.deepEqual(changed.edges, ['n1.side0|n1.top']);
  assert.deepEqual(changed.radii.map(p => p.at), [[0, 0, 20], [30, 0, 20]]);
  const expected = structuredClone(before), next = expected.nodes[2];
  delete next.held; delete next.suppressed; delete next.rematched;
  next.edges = changed.edges; next.sigs = changed.sigs;
  next.radii = next.radii.map((p, i) => ({ ...p, at: i ? [30, 0, 20] : [0, 0, 20] }));
  assert.deepEqual(accepted, expected);
  await f.snapshot('03-bound-applied');
  await f.closeEditor(); await f.undo(); await f.same(before); await f.redo(); await f.same(accepted);
  const readVolume = async () => {
    await f.ready(); const read = await f.bodies();
    assert.equal(read.fresh, true); assert.equal(read.bodies.length, 1);
    assert.equal(read.bodies[0].key, 'b2'); assert.equal(read.bodies[0].massRef, null);
    assert.ok(Number.isFinite(read.bodies[0].volume) && read.bodies[0].volume > 0);
    return read.bodies[0].volume;
  };
  const beforeVolume = await readVolume();
  await f.setParameter('StartR', 2, '04-bound-parameter-change');
  const parameterized = { ...accepted, parameters: { ...accepted.parameters, StartR: 2 } };
  await f.same(parameterized);
  const afterVolume = await readVolume();
  assert.ok(beforeVolume - afterVolume > 1, 'Changing StartR must reevaluate the current body, not just save a Dim field');
  await f.undo(); await f.same(accepted); assert.ok(Math.abs(await readVolume() - beforeVolume) < 1e-7);
  await f.redo(); await f.same(parameterized); assert.ok(Math.abs(await readVolume() - afterVolume) < 1e-7);
  const saved = await f.save('bound-replaced');
  await f.runOracle({ file: saved.file, originalNodes: source.nodes.slice(0, 2), beforeVolume, afterVolume }, '05-saved-binding');
  await f.freshOpen(saved.file, parameterized, '06-fresh-open');
  await f.openFeatureEditor(2); await f.same(parameterized);
  await f.editor().scrollIntoViewIfNeeded(); await f.snapshot('07-fresh-bound-history');
  f.report.observations.push({ label: 'after', fullDocExpectedExact: true, preservedParameters: parameterized.parameters,
    preservedRadius: changed.radius, preservedControls: changed.radii, undoRedoExact: true, actualDownloadAndFreshOpen: true,
    publicParameterReevaluation: { parameter: 'StartR', from: 1, to: 2, beforeVolume, afterVolume,
      limits: 'Application current-body read, not an independent native geometry accuracy oracle' } });
});
