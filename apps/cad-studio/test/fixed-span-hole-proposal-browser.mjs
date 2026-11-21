import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const baseline = process.argv.includes('--baseline');
const near = baseline || process.argv.includes('--near');
const span = near ? 32.5 : 42;
const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/test/fixed-span-hole-proposal-browser.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/part/proposals.ts',
];
const f = await createFlow({
  name: 'fixed-span-hole-proposal', output: process.argv[2], envFrozen: 'FIXED_SPAN_HOLE_PROPOSAL_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Bind the local fixed-span edit proposal to the exact current terminal Hole and one Studio approval.',
  limits: ['One rectangular linked through Hole, base document, real stdio MCP at level 1 and desktop Studio. No live provider.'],
  inspectorSource: `
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {checkBrep,brepMassProperties,faceGeometry} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), [{brep}]=partBreps(doc);
console.log(JSON.stringify({check:checkBrep(brep,{strict:true}),volume:brepMassProperties(brep,1).volume,
  walls:brep.faces.filter(face=>face.name?.startsWith('n3.')).map(faceGeometry),
  tops:brep.faces.filter(face=>/^n1\\.top(?:@\\d+)?$/.test(face.name??'')).map(face=>[face.name,face.loops.length]).sort()}));
`,
});
const ref = node => ({ node, side: 'solid' });
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [50, 10], max: [54, 16] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { id: 'n2', kind: 'linear-span-pattern', parent: ref(1), axis: 'x', count: 3, span: 32 },
    { id: 'n3', kind: 'hole', parent: ref(2), center: [84, 13], radius: 1, face: 'n1.top@2' },
  ],
  outputs: { b3: ref(3) }, nextId: 4,
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: 'fixed-span-hole-proposal', autonomy: 1 }, file, label, run);
async function geometry(label, doc, centre) {
  const native = await f.inspect(label, doc);
  const expected = 768 - 8 * Math.PI;
  assert.ok(native.check.valid, JSON.stringify(native.check.issues));
  assert.ok(Math.abs(native.volume - expected) < 1e-7);
  assert.ok(Math.abs((await f.bodies()).bodies[0].volume - expected) < 1e-7);
  assert.deepEqual(native.tops, [['n1.top', 1], ['n1.top@1', 1], ['n1.top@2', 1], ['n1.top@3', 2]]);
  assert.equal(native.walls.length, 2);
  for (const wall of native.walls) {
    assert.equal(wall.kind, 'cylinder');
    assert.ok(Math.hypot(wall.c[0] - centre, wall.c[1] - 13, wall.r - 1) < 1e-7);
  }
  f.report.observations.push({ label, centre, reference: doc.nodes[3].face, expected, native });
  await f.persist();
}
await f.run(async () => {
  const path = join(f.output, 'local-pattern-proposal.bcad');
  await writeFile(path, JSON.stringify(source));
  f.phase = 'read the current revision and make a local level-one proposal';
  await mcp(path, 'proposal', async call => {
    const pin = await call('query', { action: 'render', highlight: ['n1.top@2'] });
    assert.ok(Object.values(pin.legend).includes('n1.top@2'));
    const args = { action: 'edit', index: 2, values: { count: 4, span }, expectedRevision: pin.revision };
    await call('features', args, true);
    if (!baseline) {
      const bad = await call('proposals', { action: 'propose', title: 'Touching copies',
        ops: [{ tool: 'features', args: { ...args, values: { count: 4, span: 12 } } }] }, true);
      assert.match(bad.error, /Keep a gap between pattern copies/);
      const stale = await call('proposals', { action: 'propose', title: 'Old revision',
        ops: [{ tool: 'features', args: { ...args, expectedRevision: '0000000000000000' } }] }, true);
      assert.match(stale.error, /part changed since the requested revision/i);
    }
    const proposal = await call('proposals', { action: 'propose', title: 'Resize the terminal Hole pattern', ops: [{ tool: 'features', args }] });
    assert.deepEqual([proposal.proposal, proposal.applied, proposal.change.volume], ['P1', false, 192]);
    assert.deepEqual(proposal.diff.changed.map(feature => feature.id), baseline ? ['n2'] : ['n2', 'n3']);
    const { proposals } = await call('proposals', { action: 'list', all: true });
    assert.deepEqual(proposals.map(p => [p.id, p.status, p.stale]), [['P1', 'open', false]]);
    f.report.observations.push({ label: 'proposal', revision: pin.revision, changed: proposal.diff.changed });
  });
  const pending = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(pending.nodes, source.nodes);
  f.phase = 'preview the local proposal without changing the part';
  await f.freshOpen(path, pending, 'pending');
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  await f.snapshot('proposal-preview');
  if (!baseline) {
    const choice = (id, checked) => card().locator(`input[aria-label="Keep ${id}"]${checked ? ':checked' : ':not(:checked)'}:enabled`);
    await choice('n3', true).click();
    await choice('n3', false).waitFor();
    await choice('n2', false).waitFor();
    await f.same(pending);
    await f.snapshot('paired-changes-left-out');
    await choice('n3', false).click();
    await choice('n3', true).waitFor();
    await choice('n2', true).waitFor();
  }
  f.phase = 'explicit Studio approval, native verification and fresh Open';
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  const expectedHole = baseline ? source.nodes[3] : { ...source.nodes[3], center: [52 + span, 13], face: 'n1.top@3' };
  assert.deepEqual(approved.nodes, [...source.nodes.slice(0, 2), { ...source.nodes[2], count: 4, span }, expectedHole]);
  assert.deepEqual(approved.outputs, source.outputs);
  const decision = approved.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P1', 'user']);
  await geometry('approved-native', approved, baseline ? 84 : 52 + span);
  await f.snapshot('proposal-accepted');
  await f.undo(); await f.same(pending);
  await f.redo(); await f.same(approved);
  const saved = await f.save('pattern-proposal-approved');
  await f.freshOpen(saved.file, saved.doc, 'proposal-reopened');
  await geometry('reopened-native', saved.doc, baseline ? 84 : 52 + span);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), pending);
});
