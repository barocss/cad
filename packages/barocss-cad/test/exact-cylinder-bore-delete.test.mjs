import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, CadPartError, checkBrep, evaluateCadPart, reevaluate } from '../dist/index.js';
import { healExactCylinderBoreIfAdmitted } from '../dist/features/heal-exact-cylinder-bore.js';
import { faceSignatures } from '../dist/part/part-expect.js';

const halves = ['tool.side0#1', 'tool.side0#2'];
const append = (doc, ...features) => ({ ...doc, features: [...doc.features, ...features] });
const body = (doc, id) => evaluateCadPart(doc).outputs.find(output => output.id === id).brep;
const deletion = (face, expect) => ({ id: 'heal', kind: 'delete-face', target: 'cut', face, ...(expect ? { expect } : {}) });
const refuses = (doc, face, code = 'CAPABILITY') => assert.throws(() => evaluateCadPart(append(doc, deletion(face))),
  cause => cause instanceof CadPartError && cause.feature === 'heal' && cause.code === code);

function fixture({ replaceFirst = false, distance = 2, rotate = false, z = 5, x = 0, height = 8, skin = 'normal' } = {}) {
  const direction = (x, y, z) => rotate ? [-y, x, z] : [x, y, z];
  const origin = (x, y, z) => {
    const [dx, dy, dz] = direction(x, y, z);
    return rotate ? [dx + 34, dy - 47, dz + 7] : [dx + 20, dy + 20, dz];
  };
  const surface = {
    degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
    controlPoints: [[10, 0], [10, 10], [0, 10], [-10, 10], [-10, 0]].map(([x, y]) => [origin(x, y, 0), origin(x, y, 12)]),
    weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(w => [w, w]),
  };
  const offset = { kind: 'offset-face', face: `half.${skin}`, distance };
  const replace = { kind: 'replace-face', face: 'half.v-max', plane: { origin: origin(0, 0, 13), normal: direction(0, .5, 1) } };
  const edits = replaceFirst ? [replace, offset] : [offset, replace];
  const stock = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'half', kind: 'thicken', thickness: 2, side: 'reverse', mode: 'exact-cylinder', surface },
    { ...edits[0], id: 'first', target: 'half' },
    { ...edits[1], id: 'stock', target: 'first' },
  ] };
  const tool = [
    { id: 'circle', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 1.5,
      plane: { origin: origin(x, 5, z), normal: direction(0, 1, 0), xAxis: direction(1, 0, 0) } },
    { id: 'tool', kind: 'extrude', sketch: 'circle', height },
  ];
  const cut = { id: 'cut', kind: 'difference', target: 'stock', tool: 'tool' };
  return { stock, tool, cut, bored: append(stock, ...tool, cut) };
}

for (const options of [{}, { replaceFirst: true, distance: -.5, rotate: true }]) {
  test(`either bore half restores the current stock in ${options.replaceFirst ? 'Replace → Offset' : 'Offset → Replace'} order`, () => {
    const { stock, bored } = fixture(options);
    const original = body(stock, 'stock'), cut = body(bored, 'cut');
    const checkCut = checkBrep(cut, { strict: true });
    assert.equal(checkCut.valid, true);
    assert.equal(checkCut.topology[0].genus, 1);
    assert.ok(brepMassProperties(cut, 1).volume < brepMassProperties(original, 1).volume);
    const radius = 10 + (options.distance ?? 2);
    const stockVolume = 13 * Math.PI * (radius ** 2 - 8 ** 2) / 2 - (radius ** 3 - 8 ** 3) / 3;
    assert.ok(Math.abs(brepMassProperties(original, 1).volume - stockVolume) < 1e-8);
    for (const face of halves) {
      const expect = { [face]: { ...faceSignatures(cut).get(face), size: 0 } };
      const doc = append(bored, deletion(face, expect));
      const snapshot = evaluateCadPart(doc), [healed] = snapshot.outputs;
      assert.equal(snapshot.outputs.length, 1);
      assert.equal(healed.feature, 'heal');
      assert.deepEqual(healed.brep, original);
      assert.deepEqual(healed.brep, body(JSON.parse(JSON.stringify(snapshot.document)), 'heal'));
      assert.deepEqual(snapshot.document, doc);
      assert.deepEqual(snapshot.features.at(-1).dependencies, ['cut', 'stock', 'first', 'half', 'tool', 'circle']);
      const check = checkBrep(healed.brep, { strict: true });
      assert.equal(check.valid, true, check.issues.join('\n'));
      assert.equal(check.topology[0].genus, 0);
    }
  });
}

test('Delete face refuses stock surfaces, missing names and a moved face signature', () => {
  const { bored } = fixture();
  for (const face of ['half.normal', 'half.v-max', 'half.u-max']) refuses(bored, face);
  for (const face of ['tool.side0', 'tool.side0#3']) refuses(bored, face, 'REFERENCE');
  refuses(bored, halves.join('+'), 'INPUT');
  const face = halves[0], signature = faceSignatures(body(bored, 'cut')).get(face);
  assert.throws(() => evaluateCadPart(append(bored, deletion(face, { [face]: { ...signature, radius: 1, size: 0 } }))),
    cause => cause instanceof CadPartError && cause.feature === 'heal' && cause.code === 'REFERENCE_MOVED');
});

test('Delete face refuses native blind, breakout, off-centre and inner-Offset cuts', () => {
  for (const options of [{ height: 5 }, { z: 6 }, { x: .75 }, { skin: 'reverse' }]) {
    const { bored } = fixture(options);
    const cut = body(bored, 'cut');
    const face = cut.faces.find(face => face.name?.startsWith('tool.side0'));
    assert.ok(face, JSON.stringify(options));
    refuses(bored, face.name);
  }
});

test('Delete face needs the direct two-edit stock and a directly authored circle even on cache reuse', () => {
  const { stock, tool, cut, bored } = fixture();
  const noReplace = { ...stock, features: stock.features.slice(0, -1) };
  refuses(append(noReplace, ...tool, { ...cut, target: 'first' }), halves[0]);

  const [circle, extrude] = tool, { center, radius, ...sketch } = circle;
  const loop = { ...sketch, profile: 'loop', segments: [{ kind: 'arc', start: [radius, 0], center, direction: 'ccw' }] };
  const fromLoop = append(stock, loop, extrude, cut);
  assert.deepEqual(body(fromLoop, 'cut'), body(bored, 'cut'));
  refuses(fromLoop, halves[0]);
  const heal = deletion(halves[0]), healed = evaluateCadPart(append(bored, heal));
  assert.throws(() => reevaluate(healed, { document: append(fromLoop, heal) }),
    cause => cause instanceof CadPartError && cause.feature === 'heal' && cause.code === 'CAPABILITY');
});

test('the native bore certificate refuses different stock and an altered retained boundary', () => {
  const { stock, tool, bored } = fixture();
  const original = body(stock, 'stock'), cutter = body(append(stock, ...tool), 'tool'), current = body(bored, 'cut');
  const certify = (bored, stock) => healExactCylinderBoreIfAdmitted(bored, halves[0], stock, cutter, 'half.normal', 'half.v-max');
  assert.equal(certify(current, original), original);
  assert.equal(certify(current, body(fixture({ distance: 1 }).stock, 'stock')), undefined);
  const differentEdge = structuredClone(current);
  differentEdge.edges.find(edge => edge.name === 'half.normal|half.v-max').name = 'unknown';
  assert.equal(checkBrep(differentEdge, { strict: true }).valid, true);
  assert.equal(certify(differentEdge, original), undefined);
});
