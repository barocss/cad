import { strict as assert } from 'node:assert';
import test from 'node:test';
import { checkBrep, stepGeometryRecipeKey } from '@barocss/cad';
import { emptyDoc, rectanglePart, withNode } from '../src/engine/doc';
import { editableStepCopy } from '../src/engine/editableStepCopy';
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
