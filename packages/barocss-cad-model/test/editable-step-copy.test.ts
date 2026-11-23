import { strict as assert } from 'node:assert';
import test from 'node:test';
import { checkBrep, stepGeometryRecipeKey } from '@barocss/cad';
import { emptyDoc, rectanglePart, withNode } from '../src/engine/doc';
import { editableStepCopy } from '../src/engine/editableStepCopy';
import { editableStepSource } from '../src/engine/editableStepSource';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { evaluateDoc, exportStudioStep, partBreps } from '../src/engine/evaluate';

const stock = rectanglePart(40, 30, 10);
const bore = { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [11, 9], radius: 3 } as const;
const plate = withNode(stock, { ...bore, center: [...bore.center] });
const stepOf = (doc: ReturnType<typeof emptyDoc>) =>
  exportStudioStep(doc, { name: 'Anonymous', timestamp: '2026-11-24T00:00:00' }).text.replace(/'(?:[^']|'')*'/g, "''");
const geometry = stepOf(plate);
const imported = (step: string) => withNode(emptyDoc(), { kind: 'import', name: 'Source', step });

function checkPhysical(doc: ReturnType<typeof emptyDoc>, height: number, x: number, radius: number) {
  const result = evaluateDoc(doc, 1), boreArea = Math.PI * radius ** 2, area = 1200 - boreArea;
  assert.ok(result.ok);
  assert.equal(result.bodies.length, 1);
  const body = result.bodies[0];
  assert.ok(Math.abs(body.volume! - area * height) < 1e-8);
  const expected = [(24000 - x * boreArea) / area, (18000 - 9 * boreArea) / area, height / 2];
  assert.ok(body.centroid?.every((value, axis) => Math.abs(value - expected[axis]) < 1e-8));
}

test('rebuilds an anonymous STEP into existing editable features, with an independent material oracle', async () => {
  const source = imported(geometry.replace(/#(\d+)/g, (_, id) => '#' + (1000 + Number(id))));
  const before = encodeStudioFile(source);
  const result = editableStepCopy(source);
  assert.ok('doc' in result, JSON.stringify(result));
  assert.deepEqual(result.doc.nodes, plate.nodes);
  checkPhysical(source, 10, 11, 3);
  checkPhysical(result.doc, 10, 11, 3);
  const edited = { ...result.doc, nodes: result.doc.nodes.map(node => node.kind === 'extrude'
    ? { ...node, height: 14 } : node.kind === 'hole' ? { ...node, center: [14, 9] as [number, number], radius: 4 } : node) };
  const reopened = await readStudioFile(encodeStudioFile(edited));
  assert.ok('doc' in reopened);
  checkPhysical(reopened.doc, 14, 14, 4);
  assert.deepEqual(encodeStudioFile(source), before);
});

test('reads a second exact plate with fractional stock dimensions and bore values', () => {
  const fractional = { ...bore, center: [12.25, 8.125] as [number, number], radius: 1.75 };
  const authored = withNode(rectanglePart(38.5, 26.25, 12.75), fractional);
  const result = editableStepCopy(imported(stepOf(authored)));
  assert.ok('doc' in result, JSON.stringify(result));
  assert.deepEqual(result.doc.nodes, authored.nodes);
});

test('rejects wrong scope and unsupported geometry with no partial feature graph', () => {
  const blind = withNode(stock, { ...bore, center: [...bore.center], depth: 4 });
  const second = withNode(plate, { ...bore, center: [29, 20], parent: { node: 2, side: 'solid' } });
  for (const step of [stepOf(stock), stepOf(blind), stepOf(second), geometry + ' '.repeat(96 * 1024)]) {
    assert.ok('error' in editableStepCopy(imported(step)));
  }
  assert.ok('error' in editableStepCopy(stock));
  assert.ok('error' in editableStepCopy(withNode(imported(geometry), { kind: 'import', name: 'Second', step: geometry })));
});

test('rejects submitted geometry that an ordinary STEP import normalizes away', () => {
  const line = geometry.replace(/=LINE\('',#\d+,#(\d+)\);/, "=LINE('',#999,#$1);");
  const arc = geometry.replace(/B_SPLINE_CURVE\(2,\(#\d+,/, 'B_SPLINE_CURVE(2,(#999,');
  for (const change of [line, arc]) {
    assert.notEqual(change, geometry);
    const altered = change.replace('DATA;', "DATA;\n#999=CARTESIAN_POINT('',(100.,200.,300.));");
    const [output] = partBreps(imported(altered));
    assert.ok(checkBrep(output.brep, { strict: true }).valid);
    assert.ok('error' in editableStepCopy(imported(altered)));
  }
});

test('rejects conflicting context units, missing geometry, duplicate records and a second DATA section', () => {
  const wrongUnit = geometry.replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT($,.METRE.)');
  const shadowed = wrongUnit.replace('DATA;', 'DATA;\n#999=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));');
  assert.notEqual(stepGeometryRecipeKey(geometry), stepGeometryRecipeKey(wrongUnit));
  for (const altered of [
    shadowed, wrongUnit, geometry.replace('DATA;', "DATA;\n#15=CARTESIAN_POINT('',(0.,0.,0.));"),
    geometry.replace('END-ISO-10303-21;', 'DATA;\nENDSEC;\nEND-ISO-10303-21;'),
    geometry.replace(/=LINE\('',#\d+,/, "=LINE('',#999,"),
  ]) {
    assert.notEqual(altered, geometry);
    assert.ok('error' in editableStepCopy(imported(altered)));
  }
});

test('optional named drivers bind actual feature values without changing the initial solid', async () => {
  const source = imported(geometry), result = editableStepCopy(source, true);
  assert.ok('doc' in result && result.named, JSON.stringify(result));
  const { named } = result;
  assert.deepEqual(named.parameters, { plateThickness: 10, holeCentreX: 11, holeCentreY: 9 });
  const [, extrude, hole] = named.nodes;
  assert.ok(extrude.kind === 'extrude' && hole.kind === 'hole');
  assert.deepEqual(extrude.height, { parameter: 'plateThickness' });
  assert.deepEqual(hole.center, [{ parameter: 'holeCentreX' }, { parameter: 'holeCentreY' }]);
  assert.equal(hole.radius, 3);
  checkPhysical(named, 10, 11, 3);
  const revised = { ...named, parameters: { ...named.parameters, plateThickness: 14, holeCentreX: 14 } };
  const read = await readStudioFile(encodeStudioFile(revised));
  assert.ok('doc' in read);
  assert.deepEqual(read.doc.nodes, named.nodes);
  checkPhysical(read.doc, 14, 14, 3);
});

const shaft = (lower: [number, number], upper: [number, number], center: [number, number] = [0, 0]) =>
  withNode(emptyDoc(), {
    kind: 'shaft', generator: 'shaft@0', center,
    steps: [lower, upper].map(([diameter, length]) => ({ diameter, length })),
  });

test('reconstructs both orders of a two-step shaft without fitting a circle', async () => {
  for (const [d0, d1] of [[20, 12], [12, 20]]) {
    const authored = shaft([d0, 12], [d1, 8]), source = imported(stepOf(authored));
    const result = editableStepCopy(source, true);
    assert.ok('doc' in result, JSON.stringify(result));
    assert.equal(result.family, 'shaft');
    assert.equal(result.named, undefined);
    assert.deepEqual(result.doc.nodes, authored.nodes);
    const reopened = await readStudioFile(encodeStudioFile(result.doc));
    assert.ok('doc' in reopened);
    const [base, end] = [Math.PI * (d0 / 2) ** 2 * 12, Math.PI * (d1 / 2) ** 2 * 8];
    const expected = base + end, z = (6 * base + 16 * end) / expected;
    for (const doc of [source, reopened.doc]) {
      const report = evaluateDoc(doc, 1);
      assert.ok(report.ok);
      assert.equal(report.bodies.length, 1);
      assert.ok(Math.abs(report.bodies[0].volume! - expected) < 1e-8);
      assert.ok(report.bodies[0].centroid?.every((v, axis) => Math.abs(v - (axis === 2 ? z : 0)) < 1e-8));
    }
  }
});

test('rejects other shaft geometry, including a valid same-count translation', () => {
  const original = shaft([20, 12], [12, 8]);
  const feature = original.nodes[0];
  assert.ok(feature.kind === 'shaft');
  const variants = [
    shaft([20, 12], [12, 8], [1, 0]),
    { ...original, nodes: [{ ...feature, rotation: 10 }] },
    { ...original, nodes: [{ ...feature, steps: [...feature.steps, { diameter: 10, length: 6 }] }] },
    { ...original, nodes: [{ ...feature, chamfers: [1, 0] as [number, number] }] },
    { ...original, nodes: [{ ...feature, steps: [{ ...feature.steps[0], fillet: 1 }, feature.steps[1]] }] },
  ];
  const [moved] = partBreps(imported(stepOf(variants[0])));
  const movedCheck = checkBrep(moved.brep, { strict: true });
  assert.ok(movedCheck.valid);
  assert.deepEqual(movedCheck.counts, checkBrep(partBreps(imported(stepOf(original)))[0].brep).counts);
  for (const variant of variants) assert.ok('error' in editableStepCopy(imported(stepOf(variant))));
});

function scaleStepLengths(step: string, factor: number) {
  const one = (value: string) => String(Number(value) / factor);
  return step
    .replace(/(=CARTESIAN_POINT\('',\()([^)]+)(\)\);)/g, (_, a, values, b) => a + values.split(',').map(one).join(',') + b)
    .replace(/(=VECTOR\('',#\d+,)([^)]+)(\);)/g, (_, a, value, b) => a + one(value) + b)
    .replace(/(=UNCERTAINTY_MEASURE_WITH_UNIT\(LENGTH_MEASURE\()([^)]+)(\))/g, (_, a, value, b) => a + one(value) + b);
}

function centimetres(step: string) {
  return scaleStepLengths(step.replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT(.CENTI.,.METRE.)'), 10);
}

function inches(step: string) {
  const basis = /(#\d+)=\(LENGTH_UNIT\(\)NAMED_UNIT\(\*\)SI_UNIT\(\.MILLI\.,\.METRE\.\)\);/.exec(step)?.[1];
  assert.ok(basis);
  return scaleStepLengths(step, 25.4)
    .replace('GLOBAL_UNIT_ASSIGNED_CONTEXT((' + basis + ',', 'GLOBAL_UNIT_ASSIGNED_CONTEXT((#9002,')
    .replace(/(UNCERTAINTY_MEASURE_WITH_UNIT\(LENGTH_MEASURE\([^)]+\),)#\d+,/, (_, prefix) => prefix + '#9002,')
    .replace(/\nENDSEC;\s*END-ISO-10303-21;/, '\n#9000=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);\n'
      + '#9001=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),' + basis + ');\n'
      + "#9002=(CONVERSION_BASED_UNIT('INCH',#9001)LENGTH_UNIT()NAMED_UNIT(#9000));\nENDSEC;\nEND-ISO-10303-21;");
}

test('reconstructs active SI centimetres into the same physical native millimetre plate', () => {
  const step = centimetres(geometry), source = editableStepSource('Centimetres', step), before = encodeStudioFile(source);
  assert.deepEqual(source.nodes.map(node => node.kind), ['import', 'scale']);
  assert.equal(stepGeometryRecipeKey(step, 'cm'), stepGeometryRecipeKey(geometry));
  const result = editableStepCopy(source, true);
  assert.ok('doc' in result && result.named, JSON.stringify(result));
  assert.equal(result.sourceUnit, 'cm');
  assert.deepEqual(result.doc.nodes, plate.nodes);
  assert.deepEqual(result.named.parameters, { plateThickness: 10, holeCentreX: 11, holeCentreY: 9 });
  checkPhysical(source, 10, 11, 3);
  checkPhysical(result.doc, 10, 11, 3);
  checkPhysical(result.named, 10, 11, 3);
  assert.deepEqual(encodeStudioFile(source), before);
});

test('refuses wrong active centimetre context, manual scaling and normalized carrier drift', () => {
  const step = centimetres(geometry);
  const shadow = geometry.replace('DATA;', 'DATA;\n#999=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.CENTI.,.METRE.));');
  const twoUnits = step
    .replace('DATA;', 'DATA;\n#999=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));')
    .replace(/GLOBAL_UNIT_ASSIGNED_CONTEXT\(\(#(\d+),/, 'GLOBAL_UNIT_ASSIGNED_CONTEXT((#$1,#999,');
  const badVector = step.replace(/(=VECTOR\('',#\d+,)[^)]+/, (_, carrier) => carrier + '56');
  assert.notEqual(stepGeometryRecipeKey(badVector, 'cm'), stepGeometryRecipeKey(geometry));
  for (const altered of [shadow, twoUnits, badVector])
    assert.ok('error' in editableStepCopy(editableStepSource('Wrong centimetre evidence', altered)));
  const source = editableStepSource('Centimetres', step), scale = source.nodes[1];
  assert.ok(scale.kind === 'scale');
  assert.ok('error' in editableStepCopy({ ...source, nodes: [source.nodes[0], { ...scale, pivot: [1, 0, 0] }] }));
  assert.ok('error' in editableStepCopy(imported(step)));
  assert.ok('error' in editableStepCopy(editableStepSource('Centimetre shaft', centimetres(stepOf(shaft([20, 12], [12, 8]))))));
});

test('validates the linked inch conversion and reconstructs a native millimetre plate', () => {
  const native = withNode(stock, { ...bore, center: [12, 9] });
  const mm = stepOf(native), inch = inches(mm), source = editableStepSource('Inch plate', inch), before = encodeStudioFile(source);
  assert.equal(stepGeometryRecipeKey(inch, 'in'), stepGeometryRecipeKey(mm));
  const result = editableStepCopy(source, true);
  assert.ok('doc' in result && result.named, JSON.stringify(result));
  assert.equal(result.sourceUnit, 'in');
  assert.deepEqual(result.doc.nodes, native.nodes);
  assert.deepEqual(result.named.parameters, { plateThickness: 10, holeCentreX: 12, holeCentreY: 9 });
  checkPhysical(source, 10, 12, 3);
  checkPhysical(result.doc, 10, 12, 3);
  assert.deepEqual(encodeStudioFile(source), before);
});

test('refuses named INCH without the exact linked factor, length dimensions, unit basis and uncertainty', () => {
  const mm = stepOf(withNode(stock, { ...bore, center: [12, 9] })), inch = inches(mm);
  for (const wrong of [
    inch.replace('LENGTH_MEASURE(25.4)', 'LENGTH_MEASURE(25.)'),
    inch.replace('WITH_UNIT(LENGTH_MEASURE(25.4)', 'WITH_UNIT(AREA_MEASURE(25.4)'),
    inch.replace('DIMENSIONAL_EXPONENTS(1.', 'DIMENSIONAL_EXPONENTS(2.'),
    inch.replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT(.CENTI.,.METRE.)'),
    inch.replace('#9002,\'\',\'\');', '#9000,\'\',\'\');'),
    inch.replace('NAMED_UNIT(#9000)', 'NAMED_UNIT(#9002)'),
    inch.replace('DATA;', 'DATA;\n#999=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));'),
  ]) {
    assert.notEqual(wrong, inch);
    assert.ok('error' in editableStepCopy(editableStepSource('Wrong inch declaration', wrong)));
  }
  // The same edit could round away in another path. This reconstruction must have an exact key.
  assert.ok('error' in editableStepCopy(editableStepSource('Non-invertible fixture', inches(geometry))));
});
