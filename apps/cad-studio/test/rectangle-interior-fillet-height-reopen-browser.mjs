import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const [output, mode] = process.argv.slice(2);
assert.ok(mode === undefined || mode === '--baseline');
const baseline = mode === '--baseline';
const pins = [
  'apps/cad-studio/src/state/rectangleFinishResize.ts',
  'apps/cad-studio/src/state/historyFeatureApply.ts',
  'apps/cad-studio/src/files/useStudioDocumentFiles.ts',
];
const f = await createFlow({
  name: 'rectangle-interior-fillet-height-reopen',
  envFrozen: 'RECTANGLE_INTERIOR_HEIGHT_REOPEN_FROZEN',
  output, initialFiles: pins, requiredFrozen: pins,
  qualification: baseline ? 'Reproduce a held Fillet on fresh Open after an accepted Height edit'
    : 'Preserve a numeric interior Fillet from Height through native Save and fresh Open',
  limits: ['One 40 × 30 mm rectangle, one upward extrusion, one terminal unshaped Fillet along the front top edge.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, evaluateSurface } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const action = JSON.parse(process.argv[3]);
if (action === 'signature') {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok && result.bodies.length === 1);
  const edge = signaturesOf(result.bodies[0]).edges.get('n1.side0|n1.top');
  assert.ok(edge && edge.shared === undefined);
  console.log(JSON.stringify(toSig(edge)));
  process.exit(0);
}
const [{key,brep}] = partBreps(doc), feature=doc.nodes.at(-1).id;
const surfaces = brep.faces.filter(face => face.name?.startsWith(feature+'.face')).map(face => face.surface);
const bounds=brep.vertices.map(v=>v.point[0]), length=Math.max(...bounds)-Math.min(...bounds);
const stations = [0, ...doc.nodes.at(-1).radii.slice(1, -1).map(p => p.fraction), 1];
const samples = doc.nodes.at(-1).held ? [] : stations.flatMap((t, i) => i === 0 ? [t] : [(t + stations[i-1])/2, t]).map(t=>{
  const x=t*length;
  const candidates=surfaces.flatMap(surface=>{
    assert.equal(surface.kind,'surface');
    if(surface.kind!=='surface') return [];
    const u0=surface.knotsU[surface.degreeU],u1=surface.knotsU[surface.controlPoints.length];
    const v0=surface.knotsV[surface.degreeV],v1=surface.knotsV[surface.controlPoints[0].length],uMid=(u0+u1)/2;
    const a=evaluateSurface(surface,uMid,v0)[0], b=evaluateSurface(surface,uMid,v1)[0];
    if (x<Math.min(a,b)-1e-9 || x>Math.max(a,b)+1e-9) return [];
    let lo=v0,hi=v1;
    for (let i=0;i<60;i++) {
      const mid=(lo+hi)/2;
      if ((evaluateSurface(surface,uMid,mid)[0]<x)===(a<b)) lo=mid;
      else hi=mid;
    }
    return [[u0,uMid,u1].map(u=>evaluateSurface(surface,u,(lo+hi)/2))];
  });
  assert.ok(candidates.length>0, 'Missing native section at X='+x);
  return {t,x,sections:candidates};
});
console.log(JSON.stringify({key,check:checkBrep(brep,{strict:true}),sha:digestOf(brep),volume:brepMassProperties(brep,1).volume,samples}));
`,

});

const edge = 'n1.side0|n1.top';
const base = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const radii = [
  { at: [0, 0, 10], radius: 1.25, atEnd: true },
  { at: [10, 0, 10], radius: 3, fraction: 0.25 },
  { at: [25, 0, 10], radius: 1, fraction: 0.625 },
  { at: [40, 0, 10], radius: 2.5, atEnd: true },
];
const references = () => f.page.getByRole('region', { name: 'References', exact: true });

function signedDoc(signature, name = edge) {
  return {
    ...base,
    nodes: [...base.nodes, {
      id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' },
      edges: [name], radius: 1.25, radii, sigs: { [name]: signature },
    }],
    outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
  };
}

async function open(doc) {
  await f.newPage();
  await f.openFile({
    name: 'interior-fillet.bcad', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  }, doc.nodes.length);
}

async function checkLive(doc, height, signature, label) {
  assert.equal(doc.nodes[1].height, height);
  const finish = doc.nodes[2];
  assert.deepEqual(finish.parent, { node: 1, side: 'solid' });
  assert.deepEqual(finish.edges, [edge]);
  assert.deepEqual(finish.sigs, { [edge]: signature });
  assert.deepEqual(finish.radii.map(point => point.radius), [1.25, 3, 1, 2.5]);
  assert.deepEqual(finish.radii.map(point => point.fraction), [undefined, 0.25, 0.625, undefined]);
  assert.deepEqual(finish.radii.map(point => point.atEnd), [true, undefined, undefined, true]);
  assert.equal(finish.section, undefined);
  assert.equal(finish.held, undefined);
  assert.equal(await references().count(), 0);
  const native = await f.inspect(label, doc, 'measure');
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.equal(native.key, bodies[0].key);
  // The independent two-station Hermite integral in held-interior-fillet-replacement-browser
  // gives integral(r² dx) = 27731/168 over this 40 mm edge.
  const expected = 1200 * height - (1 - Math.PI / 4) * 27731 / 168;
  assert.ok(native.check.valid);
  assert.equal(native.check.counts.bodies, 1);
  assert.equal(native.check.counts.shells, 1);
  assert.ok(Math.abs(native.volume - expected) < 1e-7);
  assert.ok(Math.abs(bodies[0].volume - expected) < 1e-7);
  const locations = [0, 5, 10, 17.5, 25, 32.5, 40];
  const radiiAtLocation = [1.25, 2.34375, 3, 2, 1, 1.5625, 2.5];
  assert.equal(native.samples.length, locations.length);
  for (const [i, sample] of native.samples.entries()) {
    const r = radiiAtLocation[i], diagonal = r * (1 - Math.SQRT1_2);
    const x = locations[i];
    const target = [[x, r, height], [x, diagonal, height - diagonal], [x, 0, height - r]];
    for (const section of sample.sections) {
      const errors = [section, [...section].reverse()].map(points => Math.max(...points.map((p, j) =>
        Math.hypot(...p.map((v, k) => v - target[j][k])))));
      assert.ok(Math.min(...errors) < 1e-6);
    }
  }
  return native;
}

async function checkHeld(original, label) {
  await references().waitFor();
  await f.page.waitForFunction(() => window.__studioDoc?.nodes.at(-1)?.suppressed &&
    window.__studioBodies?.().massReady && Number.isFinite(window.__studioBodies().bodies[0]?.volume));
  const state = await f.snapshot(label);
  const unheld = structuredClone(state.doc);
  const finish = unheld.nodes[2];
  assert.ok(finish.held);
  assert.equal(finish.suppressed, true);
  delete finish.held;
  delete finish.suppressed;
  assert.deepEqual(unheld.nodes, original.nodes);
  const height = original.nodes[1].height;
  const native = await f.inspect(label + '-native', state.doc, 'measure');
  assert.ok(native.check.valid, JSON.stringify(native.check.issues));
  assert.equal(native.samples.length, 0);
  assert.equal(state.bodies.bodies.length, 1);
  for (const volume of [state.bodies.bodies[0].volume, native.volume]) {
    assert.ok(Math.abs(volume - 1200 * height) <= 1e-7, `Held stock volume: ${volume}`);
  }
  f.report.observations.push({ label, held: state.doc.nodes[2].held, volume: native.volume });
}

await f.run(async () => {
  f.phase = 'Get source and taller signatures from the evaluated extrusion';
  const startSig = await f.inspect('source-signature', base, 'signature');
  const tallerBase = { ...base, nodes: [base.nodes[0], { ...base.nodes[1], height: 16 }] };
  const tallerSig = await f.inspect('taller-signature', tallerBase, 'signature');
  assert.equal(startSig.k, 'line');
  assert.equal(startSig.s, 40);
  assert.deepEqual(startSig.p, [20, 0, 10]);
  assert.equal(Math.abs(startSig.d[0]), 1);
  assert.ok(startSig.d.slice(1).every(value => value === 0));
  assert.deepEqual(tallerSig, { ...startSig, p: [20, 0, 16] });

  const source = signedDoc(startSig);
  f.phase = 'Open the signed Fillet and change Distance in History';
  await open(source);
  await f.same(source);
  const originalNative = await checkLive(source, 10, startSig, '01-source-native');
  await f.openFeatureEditor(1);
  const distance = f.editor().getByLabel('Distance', { exact: true });
  if (!baseline) {
    await distance.fill('30');
    await f.editor().getByRole('button', { name: 'Apply', exact: true }).click();
    await f.editor().locator('.hud-error code').filter({ hasText: 'REFERENCE_MOVED' }).waitFor({ state: 'attached' });
    await f.same(source);
  }
  await distance.fill('16');
  const accepted = (await f.applyEditor(source, '02-height16')).doc;
  const acceptedSig = baseline ? startSig : tallerSig;
  const acceptedNative = await checkLive(accepted, 16, acceptedSig, '03-height16-native');
  await f.undo();
  await f.same(source);
  assert.deepEqual(await checkLive(source, 10, startSig, '04-undo-native'), originalNative);
  await f.redo();
  await f.same(accepted);
  assert.deepEqual(await checkLive(accepted, 16, acceptedSig, '05-redo-native'), acceptedNative);

  const saved = await f.save('06-height16');
  assert.deepEqual(saved.doc, accepted);
  if (baseline) {
    f.phase = 'Fresh Open of saved height16 reproduces held Fillet';
    await f.newPage();
    await f.openFile(saved.file, accepted.nodes.length);
    await checkHeld(accepted, '07-height16-open-held');
  } else {
    const reopened = await f.freshOpen(saved.file, accepted, '07-height16-open');
    assert.deepEqual(await checkLive(reopened.doc, 16, tallerSig, '08-height16-open-native'), acceptedNative);
    await f.openFeatureEditor(2);
    const columns = [
      ['data-fillet-endpoint', 'Start', 0],
      ['data-fillet-station', 'Interior 1', 10],
      ['data-fillet-station', 'Interior 2', 25],
      ['data-fillet-endpoint', 'End', 40],
    ];
    for (const [attribute, name, x] of columns) {
      const marker = f.page.locator(`[${attribute}="${name}"]`);
      await marker.waitFor({ state: 'attached' });
      assert.deepEqual((await marker.getAttribute('data-position')).split(',').map(Number), [x, 0, 16]);
    }
    for (const [index, [position, radius]] of [[25, 3], [62.5, 1]].entries()) {
      const prefix = `Interior ${index + 1}`;
      assert.equal(await f.editor().getByLabel(prefix + ' position (%)', { exact: true }).inputValue(), String(position));
      assert.equal(await f.editor().getByLabel(prefix + ' radius', { exact: true }).inputValue(), String(radius));
    }
    await f.snapshot('09-height16-open-stations');
  }

  f.phase = 'Open an unrelated missing edge and retain its held state';
  const missing = signedDoc({ k: 'line', p: [20, 20, 1.5], d: [0, 0, 1], s: 3 }, 'n1.side6|n1.side7');
  await open(missing);
  await checkHeld(missing, '10-genuine-missing-edge');
});
