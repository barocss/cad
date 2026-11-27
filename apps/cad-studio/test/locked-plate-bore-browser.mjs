import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const f = await createFlow({
  name: 'locked-plate-bore', output: process.argv[2], envFrozen: 'LOCKED_PLATE_BORE_FROZEN',
  qualification: 'Local level-one proposal and native through-bore evidence for a locked rectangular plate.',
  limits: ['Synthetic XY plate, known mm frame, no live provider. No final-only vs stepwise comparison.'],
  initialFiles: [
    'apps/cad-studio/test/locked-plate-bore-browser.mjs',
    'apps/cad-studio/test/mcp-browser-session.mjs',
    'apps/cad-studio/server/cadMcp.ts',
    'packages/barocss-cad-model/src/chat/part/nativeFaceReview.ts',
    'packages/barocss-cad/src/features/bored-cap-offset.ts',
  ],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, tessellateBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { readStudioFile } from '@barocss/cad-model/engine/container';
const [file, mode = '"native"', input = 'null'] = process.argv.slice(2);
if (JSON.parse(mode) === 'decode') {
  const opened = await readStudioFile(readFileSync(JSON.parse(input)));
  if (!('doc' in opened)) throw new Error(JSON.stringify(opened));
  console.log(JSON.stringify(opened.doc));
} else {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const [{ key, brep }] = partBreps(doc);
  const value = { body: key, valid: checkBrep(brep, { strict: true }).valid,
    volume: brepMassProperties(brep, 1).volume,
    faces: brep.faces.filter(face => {
      const g = faceGeometry(face);
      return g.kind === 'cylinder' && g.out === -1;
    }).map(face => face.name ?? face.id) };
  if (JSON.parse(mode) === 'mesh') {
    const mesh = tessellateBrep(brep);
    Object.assign(value, { mesh: { positions: [...mesh.positions], indices: [...mesh.indices] } });
  }
  console.log(JSON.stringify(value));
}
`,
});
const referenceName = 'Locked plate · millimetres';
const ref = node => ({ node, side: 'solid' });
const empty = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0 };
function nodes(left = 3, right = 4, depth) {
  return [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 5 },
    { id: 'n2', kind: 'hole', parent: ref(1), center: [15, 20], radius: left, axis: 'z', side: 'max' },
    { id: 'n3', kind: 'hole', parent: ref(2), center: [45, 20], radius: right, axis: 'z', side: 'max',
      ...(depth === undefined ? {} : { depth }) },
  ];
}
const plate = features => ({ ...empty, nodes: features, outputs: { b3: ref(3) }, nextId: 4 });
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: 'locked-plate-bore', autonomy: 1 }, file, label, run);
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const knownVolume = 60 * 40 * 5 - Math.PI * (3 ** 2 + 4 ** 2) * 5;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function check(label, file, doc, left, right, expectedVolume, through) {
  const native = await f.inspect(label, doc);
  assert.equal(native.valid, true);
  assert.ok(Math.abs(native.volume - expectedVolume) < 1e-7, JSON.stringify(native));
  assert.equal(native.faces.length, 4);
  const before = await readFile(file);
  await mcp(file, label, async call => {
    const revision = await currentPartRevision(call);
    const observed = await call('query', { action: 'inspect', faces: native.faces, expectedRevision: revision });
    assert.deepEqual([observed.revision, observed.unit], [revision, 'mm']);
    assert.equal(observed.faces.length, 4);
    const cylinders = observed.faces.map(({ geometry }) => {
      assert.deepEqual([geometry.kind, geometry.outwardNormal], ['cylinder', 'toward-axis']);
      return [...geometry.axis.point.slice(0, 2), geometry.radius * 2];
    }).sort((a, b) => a[0] - b[0]);
    const expected = [[15, 20, left], [15, 20, left], [45, 20, right], [45, 20, right]];
    for (const [index, actual] of cylinders.entries()) {
      assert.ok(actual.every((value, axis) => Math.abs(value - expected[index][axis]) < 1e-7), JSON.stringify(actual));
    }
    if (through) {
      assert.equal(observed.throughBorePlates?.length, 1);
      const [proof] = observed.throughBorePlates;
      assert.deepEqual(proof.bounds, { min: [0, 0, 0], max: [60, 40, 5] });
      assert.deepEqual(proof.openings, [{ face: 'n1.bottom', z: 0 }, { face: 'n1.top', z: 5 }]);
      assert.deepEqual(proof.bores.map(bore => [bore.center, bore.diameter]).sort((a, b) => a[0][0] - b[0][0]),
        [[[15, 20], left], [[45, 20], right]]);
      assert.deepEqual(proof.bores.flatMap(bore => bore.faces).sort(), native.faces.sort());
      assert.equal(proof.body, native.body);
    } else {
      assert.equal(observed.throughBorePlates, undefined);
    }
    f.report.observations.push({ label, revision, sourceSHA256: digest(before), native, observed });
  });
  assert.deepEqual(await readFile(file), before);
}

await f.run(async () => {
  f.phase = 'lock the reference and stage an editable native candidate over MCP';
  const { mesh } = await f.inspect('reference-mesh', plate(nodes()), 'mesh');
  const path = join(f.output, 'pending-plate.bcad');
  await writeFile(path, JSON.stringify(empty));
  await mcp(path, 'proposal', async call => {
    await call('requirements', { action: 'reference', name: referenceName, mesh });
    const { references } = await call('requirements', { action: 'references' });
    assert.deepEqual(references.map(({ id, kind, name }) => [id, kind, name]), [['ref1', 'mesh', referenceName]]);
    const ops = [{ tool: 'features', args: { action: 'add', features: nodes() } }];
    await call('features', ops[0].args, true);
    const staged = await call('proposals', { action: 'propose', title: 'Build an editable two-hole plate', ops });
    assert.deepEqual([staged.proposal, staged.applied], ['P1', false]);
    assert.equal(staged.change.volume, Number(knownVolume.toFixed(3)));
  });
  const pending = await f.inspect('pending-file', {}, 'decode', path);
  assert.deepEqual([pending.nodes, pending.outputs], [[], {}]);
  const locked = pending.references;
  await f.freshOpen(path, pending, '01-locked-reference');
  assert.deepEqual((await f.bodies()).bodies, []);
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await f.same(pending);
  await f.snapshot('02-proposal-preview');
  await button('Hide', card()).click();
  await f.same(pending);
  await button('Accept', card()).click();
  await f.changed(pending);
  const approved = await f.doc();
  const decision = approved.history.at(-1);
  assert.deepEqual([decision.kind, decision.proposal, decision.by.agent], ['accept', 'P1', 'user']);
  assert.deepEqual(approved.nodes, nodes());
  assert.deepEqual(approved.references, locked);
  await button('Chat').first().click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('03-approved-native');

  f.phase = 'open and compare the independent negative controls';
  for (const [label, model, left, right, volume, through] of [
    ['04-near-through', nodes(3, 4, 4.9), 6, 8, knownVolume + 1.6 * Math.PI, false],
    ['05-swapped', nodes(4, 3), 8, 6, knownVolume, true],
  ]) {
    const doc = { ...plate(model), references: locked };
    const file = join(f.output, label + '.bcad');
    await writeFile(file, JSON.stringify(doc));
    await check(label, file, doc, left, right, volume, through);
    await f.freshOpen(file, doc, label + '-scene');
  }
  f.phase = 'edit one independent diameter and verify native Save and Open';
  const approvedFile = join(f.output, 'approved-native.bcad');
  await writeFile(approvedFile, JSON.stringify(approved));
  await check('approved', approvedFile, approved, 6, 8, knownVolume, true);
  await f.freshOpen(approvedFile, approved, '06-approved-before-edit');
  await f.openFeatureEditor(2, 'first Hole');
  const diameter = f.editor().getByRole('spinbutton', { name: 'Diameter', exact: true });
  assert.equal(await diameter.inputValue(), '6');
  await diameter.fill('10');
  await f.applyEditor(approved, '07-diameter-apply');
  const edited = await f.doc();
  assert.deepEqual(edited.nodes, nodes(5, 4));
  assert.deepEqual(edited.references, locked);
  await f.undo(); await f.same(approved);
  await f.redo(); await f.same(edited);
  const [download] = await Promise.all([f.page.waitForEvent('download'), button('Save').click()]);
  const saved = join(f.output, 'two-hole-plate.bcad');
  await download.saveAs(saved);
  assert.deepEqual(await f.inspect('saved-file', {}, 'decode', saved), edited);
  await f.freshOpen(saved, edited, '08-saved-fresh-open');
  await check('reopened', saved, edited, 10, 8, 12000 - 205 * Math.PI, true);
  await f.persist();
});
