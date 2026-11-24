import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkApprovedDuctReview, render as renderReview } from './duct-proposal-review-browser-steps.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const review = process.argv.includes('--review');
const outlet = review || process.argv.includes('--outlet');
const end = outlet ? 'outlet' : 'inlet';
const capName = outlet ? 'n1.end' : 'n1.start';
const fixedName = outlet ? 'n1.start' : 'n1.end';
const axis = outlet ? 2 : 0, initialCap = outlet ? 28 : -10, sign = outlet ? 1 : -1;
const movingPiece = outlet ? 'tail' : 'lead';
const source = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
      holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'cw' }]],
      sideTags: { outer: ['e0'], holes: [['bore']] } },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Perpendicular bore', mode: 'exact', path: {
      degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
      controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 23], [12, 30, 28]],
    } },
  ], outputs: { b1: { node: 1, side: 'solid' } } };
const pins = ['packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/brep/exact-sweep.ts',
  'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/app/nativeOffsetFace.ts',
  ...(review ? ['apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
    'apps/cad-studio/test/duct-proposal-review-browser-steps.mjs', 'packages/barocss-cad-model/src/chat/part/modelCandidate.ts',
    'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/part/views.ts'] : []),
  ...(review && !baseline ? ['packages/barocss-cad-model/src/chat/perpendicularAnnularOutletOffsetEvidence.ts',
    'packages/barocss-cad-model/src/chat/perpendicularAnnularOutletProposalReview.ts'] : [])];
const f = await createFlow({ name: `perpendicular-sweep-${end}-offset`, output: process.argv[2], envFrozen: review ? 'D1925_SOURCE_FROZEN' : outlet ? 'D1924_SOURCE_FROZEN' : 'D1921_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: review ? 'Bind the local Agent image and inspection to the actual Studio approval.' : `Use signed Offset face on the original annular ${end} of the four-span perpendicular Exact Sweep.`,
  limits: ['Original straight cap of one exact annulus with both ends. No replacement, second edit or linked reference plane. Desktop only.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const { outputs: [out] } = partSnapshot(doc);
const drawn = evaluateDoc(doc, 0).bodies[0];
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const sample = edge => {
  const [lo,hi] = curveDomain(edge.curve);
  return [0,.19,.5,.81,1].map(t => evaluateCurve(edge.curve,lo+(hi-lo)*t));
};
const caps = brep.faces.flatMap(face => {
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane') return [];
  return [{ name: face.name, plane, loops: face.loops.map(id => {
    const loop = loops.get(id);
    return { kind: loop.kind, rims: loop.coedges.map(id => {
      const use = uses.get(id), twin = uses.get(use.twin);
      return { reciprocal: twin?.twin === id && twin.edge === use.edge && twin.sense !== use.sense, points: sample(edges.get(use.edge)) };
    }) };
  }) }];
});
const joints = [[0,0],[1,12],[2,18]].flatMap(([axis,level]) => brep.edges
  .filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[axis]-level)<1e-9)).map(edge => ({
    id: edge.id, points: sample(edge), continuity: measureBrepEdgeContinuity(brep,edge.id),
    sides: brep.coedges.filter(use => use.edge === edge.id).map(use => [use.id,digestOf(use.pcurve)]),
  })));
const kept = brep.faces.filter(face => face.name !== '${capName}' && !face.name?.startsWith('n1.${movingPiece}.'))
  .map(face => [face.name,digestOf(face.surface)]);
console.log(JSON.stringify({ digest: digestOf(brep), topology: checkBrep(brep,{strict:true}), caps, joints, kept,
  mesh: drawn.mesh.faces.map(face => [face.name,face.index]), mass: massPropertiesOf(out), quadrature: brepMassProperties(brep,1) }));
`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (dialog, label) => dialog.locator('.status').filter({ hasText: new RegExp(`^${label}$`) });
const distance = dialog => dialog.getByLabel('Offset', { exact: true });
const near = (a, b, tol = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tol, JSON.stringify({ a, b, tol }));
const baseLength = 15 * Math.PI + 20;
const baseMoments = [324 * Math.PI + 2583 / 4, 540 * Math.PI + 1440, 486 * Math.PI - 1143 / 4].map(value => value / 3);

async function verify(label, doc, offset, original) {
  const result = await f.inspect(label,doc), { topology, caps, joints, kept, mass, quadrature } = result;
  assert.ok(topology.valid, topology.issues.join('\n'));
  assert.deepEqual(topology.counts, { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 72, edges: 36, vertices: 20 });
  assert.equal(topology.topology[0].genus,1);
  const cap = caps.find(face => face.name === capName);
  assert.ok(cap && cap.plane.kind === 'plane');
  const moved = initialCap + sign * offset;
  near(cap.plane.o[axis], moved);
  assert.deepEqual(cap.plane.n, outlet ? [0,0,1] : [-1,0,0]);
  assert.deepEqual(cap.loops.map(loop => loop.kind),['outer','inner']);
  for (const { kind, rims } of cap.loops) {
    assert.equal(rims.length,2);
    for (const rim of rims) {
      assert.ok(rim.reciprocal);
      for (const point of rim.points) {
        near(point[axis], moved);
        const radius = outlet ? Math.hypot(point[0]-12,point[1]-30) : Math.hypot(point[1],point[2]);
        near(radius,kind === 'outer' ? 2 : 1);
      }
    }
  }
  assert.deepEqual(caps.find(face => face.name === fixedName),original.caps.find(face => face.name === fixedName));
  assert.deepEqual(kept,original.kept);
  const withoutContinuity = edges => edges.map(({id,points,sides}) => ({id,points,sides}));
  assert.deepEqual(withoutContinuity(joints),withoutContinuity(original.joints));
  assert.equal(joints.length,12);
  for (const edge of joints) {
    assert.equal(edge.continuity.status,'measured');
    near(edge.continuity.maximumAngleDegrees,0,1e-6);
  }
  const middle = outlet ? [12,30,28+offset/2] : [-10-offset/2,0,0];
  const length = baseLength + offset, centroid = baseMoments.map((value,i) => (value + offset * middle[i]) / length);
  const [shown] = (await f.bodies()).bodies;
  for (const measured of [mass,quadrature,shown]) {
    near(measured.volume,3*Math.PI*length);
    measured.centroid.forEach((value,i) => near(value,centroid[i]));
  }
  f.report.observations.push({label,offset,capAxis:axis,capCoordinate:moved,volume:mass.volume,centroid:mass.centroid,
    gap:topology.maximumPcurveGap,digest:result.digest});
  return result;
}

async function reviewOutlet(original) {
  const file = join(f.output, 'annular-outlet-proposal.bcad');
  await writeFile(file, JSON.stringify(source));
  const session = { app: f.app, output: f.output, clientName: f.name };
  f.phase = 'stage a signed outlet Offset in the local Agent';
  const result = await withMcpSession(session, file, 'annular-outlet-review', async (call, request) => {
    const expectedRevision = await currentPartRevision(call);
    const op = { tool: 'features', args: { action: 'command', command: 'offset-face',
      expectedRevision, faces: [capName], values: { d: -4 } } };
    const originalFile = await readFile(file);
    const dry = await call('features', { action: 'batch', dryRun: true, ops: [op] });
    assert.equal(dry.dryRun, true);
    near(dry.change.volume,-12*Math.PI,.0005);
    assert.deepEqual(await readFile(file),originalFile);
    const staged = await call('proposals', { action: 'propose', title: 'Move the original annular outlet inward by 4 mm', ops: [op] });
    assert.deepEqual([staged.proposal,staged.applied],['P1',false]);
    const { proposals: [pending] } = await call('proposals', { action: 'list' });
    const beforeReview = await readFile(file);
    if (baseline) {
      assert.equal(pending.modelReviewRevision,undefined);
      const refusal = await call('query', { action: 'render', proposal: 'P1', expectedRevision,
        expectedProposalRevision: pending.proposalRevision }, true);
      assert.equal(refusal.code,'MODEL_REVIEW_UNAVAILABLE');
      assert.deepEqual(await readFile(file),beforeReview);
      f.report.observations.push({ label: 'previous pinned review refusal', code: refusal.code });
      return;
    }
    assert.match(pending.modelReviewRevision,/^[0-9a-f]{64}$/);
    assert.match((await call('proposals',{action:'accept',id:'P1'},true)).error,/user accepts.*studio/i);
    const pins = { proposal: 'P1', expectedRevision, expectedProposalRevision: pending.modelReviewRevision };
    const normal = await renderReview(request,pins), opposite = await renderReview(request,{...pins,orientation:'opposite'});
    assert.notDeepEqual(normal.png,opposite.png);
    assert.notEqual(normal.meta.candidate.reviewRevision,opposite.meta.candidate.reviewRevision);
    assert.equal(normal.meta.candidate.bodySha256,opposite.meta.candidate.bodySha256);
    const evidence = normal.meta.perpendicularAnnularOutletOffset;
    assert.ok(evidence);
    assert.deepEqual(opposite.meta.perpendicularAnnularOutletOffset,evidence);
    const faces = ['n1.start','n1.end'];
    const inspect = { ...pins, action: 'inspect', faces,
      expectedReviewRevision: normal.meta.candidate.reviewRevision };
    const native = await call('query',inspect);
    assert.equal(native.faces.find(x => x.name === 'n1.end').geometry.point[2],24);
    assert.equal(native.faces.find(x => x.name === 'n1.start').geometry.point[0],-10);
    assert.deepEqual(native.candidate,normal.meta.candidate);
    assert.deepEqual(native.perpendicularAnnularOutletOffset,evidence);
    assert.equal(native.imageSha256,normal.meta.imageSha256);
    const alternate = await call('query',{...inspect,orientation:'opposite',expectedReviewRevision:opposite.meta.candidate.reviewRevision});
    assert.deepEqual(alternate.faces,native.faces);
    assert.equal(alternate.imageSha256,opposite.meta.imageSha256);
    for (const [override,code] of [[{orientation:'opposite'},'MODEL_REVIEW_IMAGE_STALE'],
      [{expectedRevision:'0'.repeat(16)},'MODEL_REVIEW_BASE_STALE'],
      [{expectedProposalRevision:'0'.repeat(64)},'MODEL_REVIEW_PROPOSAL_STALE']])
      assert.equal((await call('query',{...inspect,...override},true)).code,code);
    assert.deepEqual(await readFile(file),beforeReview);
    await writeFile(join(f.output,'01-Agent-four-views.png'),normal.png);
    await writeFile(join(f.output,'02-Agent-opposite-views.png'),opposite.png);
    f.report.observations.push({ label:'pinned outlet review', evidence, candidate:normal.meta.candidate,
      normalImage:normal.meta.imageSha256, oppositeImage:opposite.meta.imageSha256 });
    return { ...normal, faces, native, reviewPin:inspect, alternate:{png:opposite.png,orientation:'opposite'} };
  });
  const pending = JSON.parse(await readFile(file,'utf8'));
  assert.deepEqual([pending.nodes,pending.outputs],[source.nodes,source.outputs]);
  await f.freshOpen(file,pending,'03-open-pending-proposal');
  await button('Chat').first().click();
  const item = f.page.getByRole('listitem',{name:'Proposal P1',exact:true});
  await button('Preview',item).click();
  await button('Hide',item).waitFor();
  await f.same(pending);
  await f.snapshot('04-explicit-Studio-preview');
  if (baseline) return;
  await button('Accept',item).click();
  await f.changed(pending);
  const approved = (await f.snapshot('05-explicit-Studio-approval')).doc;
  const native = await verify('approved-native',approved,-4,original);
  assert.equal(native.digest,result.meta.candidate.bodySha256);
  const saved = await f.save('reviewed-annular-outlet');
  const reopened = (await f.freshOpen(saved.file,approved,'06-reviewed-native-open')).doc;
  assert.equal((await verify('reopened-reviewed-native',reopened,-4,original)).digest,result.meta.candidate.bodySha256);
  await withMcpSession(session,saved.file,'annular-outlet-reopened',async (call,request) => {
    await checkApprovedDuctReview(call,request,result);
  });
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: `annular-sweep-${end}-offset.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) },2);
  await f.same(source);
  const original = await f.inspect('original',source);
  assert.ok(original.topology.valid);
  if (review) return reviewOutlet(original);
  f.phase = `pick the original annular ${end} land`;
  await button('View cube directions',f.page.getByRole('group',{name:'View cube',exact:true})).click();
  const direction = outlet ? 'Top' : 'Left';
  await f.page.getByRole('menuitem',{name:direction,exact:true}).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await f.page.waitForFunction(label => document.querySelector('.view-cube .vc-label')?.textContent === label,direction.toUpperCase());
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point),outlet ? [13.55,30,28] : [-10,0,1.55]);
  assert.ok(pixel && await f.page.evaluate(point => document.elementFromPoint(...point)?.matches('canvas.vp-canvas'),pixel));
  await f.page.mouse.click(...pixel);
  const capIndex = original.mesh.find(([name]) => name === capName)?.[1];
  assert.ok(Number.isInteger(capIndex));
  await f.page.waitForFunction(index => window.__studioSelection?.selection.faces[0]?.face === index,capIndex);
  f.phase = `open the signed Offset face on the selected ${end}`;
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  if (baseline) {
    await status(panel,'refused').waitFor();
    assert.ok(await button('Apply',panel).isDisabled());
    await f.same(source);
    await f.snapshot(`01-original-${end}-offset-refused`);
    return;
  }
  await distance(panel).fill('4');
  await status(panel,'preview').waitFor();
  assert.equal(await panel.getByLabel('Mode',{exact:true}).count(),0);
  await f.snapshot('01-outward-preview');
  await button('Apply',panel).click();
  await f.changed(source);
  const outward = (await f.snapshot('02-outward-applied')).doc, operation = outward.nodes[2];
  assert.deepEqual(outward.nodes.slice(0,2),source.nodes);
  assert.deepEqual([operation.kind,operation.parent,operation.faces,operation.distance],
    ['offset-face',{node:1,side:'solid'},[capName],4]);
  assert.equal(operation.sigs[capName].k,'plane');
  await verify('outward',outward,4,original);

  f.phase = 'check joint contact and edit the original Offset in History';
  await f.openFeatureEditor(2,`the signed ${end} Offset`);
  await button('Edit offset',f.editor()).click();
  const editor = hud('Edit Offset face');
  await distance(editor).fill('-10');
  await status(editor,'refused').waitFor();
  assert.ok(await button('Apply',editor).isDisabled());
  await f.same(outward);
  await f.snapshot('03-joint-contact-refused');
  await distance(editor).fill('-4');
  await status(editor,'preview').waitFor();
  await button('Apply',editor).click();
  await f.changed(outward);
  const inward = (await f.snapshot('04-inward-applied')).doc;
  assert.deepEqual(inward.nodes,[...source.nodes,{...operation,distance:-4}]);
  const native = await verify('inward',inward,-4,original);
  await f.undo(); await f.same(outward);
  await f.redo(); await f.same(inward);
  const saved = await f.save(`perpendicular-annular-${end}-offset`);
  await f.freshOpen(saved.file,inward,'05-native-reopened');
  assert.equal((await verify('reopened',await f.doc(),-4,original)).digest,native.digest);
  await button('Iso',f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await f.snapshot(`06-reopened-offset-${end}`);
});
