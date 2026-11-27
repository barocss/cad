import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, evaluateCadPart, type CadPartFeature } from '@barocss/cad';
import { part } from '../src/api';
import { attachedRibSignature } from '../src/engine/attachedRib';
import { withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { toPartDocument } from '../src/engine/part';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';

type Rib = Extract<ModelNode, { kind: 'rib' }>;
function seed(side: 'top' | 'bottom' = 'top'): StudioDoc {
  const doc = part('stock').box({ w: 40, d: 30, h: 10 }).doc, parent = { node: 1, side: 'solid' as const }, face = `n1.${side}`;
  const sig = attachedRibSignature(doc, parent, face, toPartDocument(doc).features);
  return withNode(doc, { kind: 'rib', parent, min: [10, 14, side === 'top' ? 9 : -5], max: [30, 16, side === 'top' ? 15 : 1], sigs: { [face]: sig } });
}
function stockHeight(doc: StudioDoc, height: number): StudioDoc {
  return { ...doc, nodes: doc.nodes.map((node, i) => i === 1 && node.kind === 'extrude' ? { ...node, height } : node) };
}
function outcome(doc: StudioDoc) {
  const result = evaluateCadPart(toPartDocument(doc));
  assert.equal(result.outputs.length, 1);
  const [output] = result.outputs, report = checkBrep(output.brep, { strict: true, pcurveSamples: 33 });
  assert.ok(report.valid, report.issues.join('; ')); assert.equal(output.brep.bodies.length, 1);
  assert.equal(output.brep.bodies[0].kind, 'solid'); assert.ok(output.brep.shells.every(shell => shell.closed));
  return { output, mass: part('measured', doc).mass({ density: 1 }) };
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function altered(doc: StudioDoc, change: (node: Rib) => void): StudioDoc {
  const result = structuredClone(doc); change(result.nodes[2] as Rib); return result;
}

test('attached Rib: native top and bottom references follow a 10→12 stock edit and retain 200 mm³ of outside material', () => {
  for (const side of ['top', 'bottom'] as const) {
    const original = seed(side), before = structuredClone(original), changed = stockHeight(original, 12);
    const a = outcome(original), b = outcome(changed);
    near(a.mass.volume, 12200); near(b.mass.volume, 14600);
    near(a.mass.centroid[2], side === 'top' ? 62500 / 12200 : 59500 / 12200);
    near(b.mass.centroid[2], side === 'top' ? 89300 / 14600 : 85900 / 14600);
    const rib = toPartDocument(changed).features.at(-1); assert.ok(rib?.kind === 'rib');
    assert.deepEqual(rib.min, [10, 14, side === 'top' ? 11 : -5]);
    assert.deepEqual(rib.max, [30, 16, side === 'top' ? 17 : 1]);
    assert.deepEqual(changed.nodes[2], original.nodes[2], 'authored corners and saved plane stay fixed');
    assert.deepEqual(original, before);
  }
});

test('attached Rib: save and fresh Open retain the source cap and reproduce the changed native result', async () => {
  for (const side of ['top', 'bottom'] as const) {
    const doc = stockHeight(seed(side), 12), before = outcome(doc), opened = await readStudioFile(encodeStudioFile(doc));
    assert.ok('doc' in opened, JSON.stringify(opened)); assert.deepEqual(opened.doc, doc);
    const after = outcome(opened.doc); assert.deepEqual(after.output.brep, before.output.brep); assert.deepEqual(after.mass, before.mass);
  }
});

test('attached Rib: lost identity, reversed source and changed XY support refuse without altering the recipe', () => {
  const original = seed(), before = structuredClone(original);
  const variants: StudioDoc[] = [stockHeight(original, -12), stockHeight(original, 0), stockHeight(original, .5)];
  const renamed = structuredClone(original); renamed.nodes[1].id = 'n9'; variants.push(renamed);
  const suppressed = structuredClone(original); suppressed.nodes[1].suppressed = true; variants.push(suppressed);
  const xy = structuredClone(original), profile = xy.nodes[0]; assert.ok(profile.kind === 'sketch' && profile.profile === 'rectangle');
  profile.max[0] = 50; variants.push(xy);
  const unsupported = structuredClone(original), narrow = unsupported.nodes[0]; assert.ok(narrow.kind === 'sketch' && narrow.profile === 'rectangle');
  narrow.min = [15, -45]; narrow.max = [25, 75]; variants.push(unsupported); // Same centroid and area, but the actual trim no longer supports the Rib.
  for (const changed of variants) assert.throws(() => toPartDocument(changed), /Attached Rib:/);
  assert.deepEqual(original, before);
});

test('attached Rib: invalid anchors, zero overlap, missing exterior and unsupported positions never fall back to absolute Rib', () => {
  const doc = seed();
  const changes: ((node: Rib) => void)[] = [
    node => { node.sigs = {}; },
    node => { node.sigs!['n1.side0'] = node.sigs!['n1.top']; delete node.sigs!['n1.top']; },
    node => { node.sigs!['n1.top'].d = [0, 0, -1]; },
    node => { node.sigs!['n1.top'].p[2] = NaN; },
    node => { node.min[2] = 10; },
    node => { node.max[2] = 10; },
    node => { node.min[0] = 50; node.max[0] = 70; },
    node => { node.rematched = { 'n1.bottom': 'n1.top' }; },
  ];
  for (const change of changes) assert.throws(() => toPartDocument(altered(doc, change)), /Attached Rib:/);
});

test('attached Rib: legacy absolute ribs and suppressed attachments preserve existing lowering', () => {
  const attached = seed(), legacy = structuredClone(attached); delete legacy.nodes[2].sigs;
  const lower = toPartDocument(stockHeight(legacy, 12)).features.at(-1); assert.ok(lower?.kind === 'rib');
  assert.deepEqual(lower.min, [10, 14, 9]); assert.deepEqual(lower.max, [30, 16, 15]);
  near(outcome(stockHeight(legacy, 12)).mass.volume, 14520);
  const suppressed = structuredClone(attached); suppressed.nodes[2].suppressed = true; suppressed.nodes[2].sigs = {};
  near(outcome(stockHeight(suppressed, 12)).mass.volume, 14400);
});

test('attached Rib: UI native cap metadata obeys policy while its exact saved plane Z remains unchanged', () => {
  const doc = seed(), node = doc.nodes[2] as Rib, sig = node.sigs!['n1.top'];
  assert.deepEqual(sig, { k: 'plane', p: [20, 15, 10], d: [0, 0, 1], s: 1200 });
  const ui = altered(doc, node => { node.sigs!['n1.top'].p[0] += 1e-9; node.sigs!['n1.top'].s += 1e-9; });
  near(outcome(stockHeight(ui, 12)).mass.volume, 14600);
  const features = toPartDocument(stockHeight(ui, 12)).features;
  assert.ok(features.at(-1)?.kind === 'rib');
  assert.equal((features.at(-1) as Extract<CadPartFeature, { kind: 'rib' }>).min[2], 11);
  assert.equal((ui.nodes[2] as Rib).sigs!['n1.top'].p[2], 10);
});


test('attached Rib: a named stock thickness remains live without rewriting authored Rib coordinates', () => {
  for (const side of ['top', 'bottom'] as const) {
    const original = seed(side), stock = original.nodes[1]; assert.ok(stock.kind === 'extrude');
    original.parameters = { StockThickness: 10 }; stock.height = { parameter: 'StockThickness' };
    const changed = { ...original, parameters: { StockThickness: 12 } };
    near(outcome(original).mass.volume, 12200); near(outcome(changed).mass.volume, 14600);
    assert.deepEqual(changed.nodes[2], original.nodes[2]);
  }
});
