import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type DocPlane, type SketchNode, type StudioDoc } from '../src/engine/doc';
import { encodeStudioFile, decodeStudioFile } from '../src/engine/container';
import { readStudioDoc } from '../src/engine/migrate';
import { evaluateDoc } from '../src/engine/evaluate';
import { editFields } from '../src/app/editFields';
import { profileOf } from '../src/sketch/loops';
import { rectangleOutline, startPicking } from '../src/sketch/select';
import { sketchShapes } from '../src/sketch/reopen';
import { xyPlane } from '../src/sketch/plane';
import { outlineMobility } from '../src/sketch/mobility';
import {
  axisDiameterGeometry, axisDiameterKey, commitDimension, constraintEntries, dimensionLabel, dimensionValue,
  drivingDimensionValue, removeConstraint, solveShape, type Polygon,
} from '../src/sketch/rules';

const PI = Math.PI;

function halfProfile(points: [number, number][], fromRectangle = false): Polygon {
  const base: Polygon = {
    kind: 'polygon',
    closed: true,
    points,
    bulges: [0, 0, 0, 0],
    hv: { h: [0, 2], v: [1, 3] },
    ids: ['e1', 'e2', 'e3', 'e4'],
    ...(fromRectangle ? { fromRectangle: true as const } : {}),
  };
  return base;
}

function finishSketch(shape: Polygon, plane?: DocPlane): SketchNode {
  const res = profileOf([shape]);
  assert.ok('node' in res, 'error' in res ? res.error : '');
  return { ...res.node, ...(plane ? { plane } : {}), id: 'n0' } as unknown as SketchNode;
}

function revolveDoc(sketch: SketchNode, axis: 'x' | 'y' = 'y'): StudioDoc {
  return {
    ...emptyDoc(),
    nodes: [sketch, { kind: 'revolve', id: 'n1', sketch: 0, axis, origin: [0, 0], angle: 360 }],
    outputs: { b1: { node: 1, side: 'solid' } },
    nextId: 2,
  };
}

async function roundTrip(doc: StudioDoc): Promise<StudioDoc> {
  const decoded = await decodeStudioFile(encodeStudioFile(doc));
  const read = readStudioDoc(decoded.text);
  assert.ok('doc' in read, 'error' in read ? read.error : '');
  return read.doc;
}

function reopenPolygon(node: SketchNode): Polygon {
  const initial = sketchShapes(node, {});
  const state = startPicking({ ...initial, plane: xyPlane(), tool: 'select', editNode: 0 }, 'select');
  assert.ok(state.shape?.kind === 'polygon');
  return state.shape;
}

test('Y-axis diameter Ø12 -> Ø14 updates half-profile radius and native Revolve volume', async () => {
  const start = halfProfile([[0, 0], [6, 0], [6, 20], [0, 20]]);
  const key = axisDiameterKey(1, 'y');
  assert.equal(key, 'adiay1');
  assert.equal(dimensionLabel(start, key), 'Diameter of point 2 about Y axis');
  assert.equal(dimensionValue(start, key), 12);
  assert.equal(drivingDimensionValue(start, key), undefined);

  const g0 = axisDiameterGeometry(start, 1, 'y');
  assert.ok(g0);
  assert.equal(g0.diameter, 12);
  assert.equal(g0.radius, 6);
  assert.equal(g0.side, 1);

  const r12 = commitDimension(start, key, 12);
  assert.ok(r12.ok, r12.ok ? '' : r12.reason);
  assert.equal(r12.report.dof, 1);
  assert.equal(drivingDimensionValue(r12.shape, key), 12);
  assert.equal(dimensionValue(r12.shape, key), 12);
  assert.ok(constraintEntries(r12.shape).some(e => e.label === 'Axis diameter' && e.detail === 'point 2 about Y = Ø12'));

  // Mobility: point 1/2 are locked radially along X, free only along Y.
  const mob = outlineMobility(r12.shape);
  assert.ok(mob);
  const p2Mob = mob.directions.find(d => d.point === 2);
  assert.ok(p2Mob?.motion && p2Mob.motion.dimension === 1);
  assert.ok(Math.abs(p2Mob.motion.direction[0]) < 1e-9);
  assert.ok(Math.abs(Math.abs(p2Mob.motion.direction[1]) - 1) < 1e-9);

  const eval12 = await evaluateDoc(revolveDoc(finishSketch(r12.shape), 'y'), 1);
  assert.ok(eval12.ok, eval12.ok ? '' : JSON.stringify(eval12.error));
  const vol12 = PI * 6 * 6 * 20;
  assert.ok(Math.abs(eval12.bodies[0].volume! - vol12) < 1e-4, `expected ${vol12}, got ${eval12.bodies[0].volume}`);

  const r14 = commitDimension(r12.shape, key, 14);
  assert.ok(r14.ok, r14.ok ? '' : r14.reason);
  assert.equal(r14.report.dof, 1);
  assert.equal(drivingDimensionValue(r14.shape, key), 14);
  assert.ok(Math.abs(r14.shape.points[0][0]) < 1e-9);
  assert.ok(Math.abs(r14.shape.points[1][0] - 7) < 1e-9);
  assert.ok(Math.abs(r14.shape.points[2][0] - 7) < 1e-9);
  assert.ok(Math.abs(r14.shape.points[2][1] - 20) < 1e-9);
  assert.ok(Math.abs(r14.shape.points[3][0]) < 1e-9);

  const eval14 = await evaluateDoc(revolveDoc(finishSketch(r14.shape), 'y'), 2);
  assert.ok(eval14.ok, eval14.ok ? '' : JSON.stringify(eval14.error));
  const vol14 = PI * 7 * 7 * 20;
  assert.ok(Math.abs(eval14.bodies[0].volume! - vol14) < 1e-4, `expected ${vol14}, got ${eval14.bodies[0].volume}`);

  // Removing the axis diameter restores DOF from 1 back to 2.
  const row = constraintEntries(r14.shape).find(e => e.label === 'Axis diameter');
  assert.ok(row);
  const stripped = removeConstraint(r14.shape, row.id);
  const solvedStripped = solveShape(stripped);
  assert.ok(solvedStripped.ok);
  assert.equal(solvedStripped.dof, 2);
});

test('rectangle-drawn half-profile retains adia through .bcad save/open and Feature Editor Ø14 -> Ø16 edit', async () => {
  const rect = rectangleOutline({ kind: 'rectangle', a: [0, 0], b: [6, 20], ids: ['e1', 'e2', 'e3', 'e4'] });
  assert.ok(rect);
  const r14 = commitDimension(rect, axisDiameterKey(1, 'y'), 14);
  assert.ok(r14.ok, r14.ok ? '' : r14.reason);

  const node = finishSketch(r14.shape);
  assert.ok(node.outline?.rules?.some(r => r.kind === 'adia' && r.value === 14));

  let doc = await roundTrip(revolveDoc(node, 'y'));
  const reopened = reopenPolygon(doc.nodes[0] as SketchNode);
  assert.equal(drivingDimensionValue(reopened, axisDiameterKey(1, 'y')), 14);
  assert.ok(Math.abs(reopened.points[1][0] - 7) < 1e-9);

  const fields = editFields(doc.nodes, 1, doc.parameters);
  const diaField = fields.find(f => f.label.includes('Diameter of point 2 about Y axis'));
  assert.ok(diaField && diaField.kind === 'number', `missing axis diameter field in ${fields.map(f => f.label).join(', ')}`);
  assert.equal(diaField.get(doc.nodes), 14);

  doc = { ...doc, nodes: diaField.set(doc.nodes, 16) };
  assert.equal(diaField.get(doc.nodes), 16);

  const eval16 = await evaluateDoc(doc, 3);
  assert.ok(eval16.ok, eval16.ok ? '' : JSON.stringify(eval16.error));
  const vol16 = PI * 8 * 8 * 20;
  assert.ok(Math.abs(eval16.bodies[0].volume! - vol16) < 1e-4, `expected ${vol16}, got ${eval16.bodies[0].volume}`);
});

test('negative-side Y-axis profile stays on negative branch (-6 -> -7) and X-axis profile scales Y (6 -> 7)', async () => {
  const neg = halfProfile([[0, 0], [-6, 0], [-6, 20], [0, 20]]);
  const rNeg = commitDimension(neg, axisDiameterKey(1, 'y'), 14);
  assert.ok(rNeg.ok, rNeg.ok ? '' : rNeg.reason);
  assert.ok(Math.abs(rNeg.shape.points[1][0] + 7) < 1e-9, `expected -7, got ${rNeg.shape.points[1][0]}`);
  assert.ok(Math.abs(rNeg.shape.points[2][0] + 7) < 1e-9);
  const evalNeg = await evaluateDoc(revolveDoc(finishSketch(rNeg.shape), 'y'), 4);
  assert.ok(evalNeg.ok);
  assert.ok(Math.abs(evalNeg.bodies[0].volume! - PI * 7 * 7 * 20) < 1e-4);

  const xProf = halfProfile([[0, 0], [20, 0], [20, 6], [0, 6]]);
  const rX = commitDimension(xProf, axisDiameterKey(2, 'x'), 14);
  assert.ok(rX.ok, rX.ok ? '' : rX.reason);
  assert.ok(Math.abs(rX.shape.points[2][1] - 7) < 1e-9, `expected y=7, got ${rX.shape.points[2][1]}`);
  assert.ok(Math.abs(rX.shape.points[3][1] - 7) < 1e-9);
  const evalX = await evaluateDoc(revolveDoc(finishSketch(rX.shape), 'x'), 5);
  assert.ok(evalX.ok);
  assert.ok(Math.abs(evalX.bodies[0].volume! - PI * 7 * 7 * 20) < 1e-4);
});

test('tilted 3D sketch plane and fractional diameter 12.0006 preserve exact radius 6.0003', async () => {
  const start = halfProfile([[0, 0], [6, 0], [6, 20], [0, 20]]);
  const rPrec = commitDimension(start, axisDiameterKey(1, 'y'), 12.0006);
  assert.ok(rPrec.ok, rPrec.ok ? '' : rPrec.reason);
  assert.equal(drivingDimensionValue(rPrec.shape, axisDiameterKey(1, 'y')), 12.0006);
  assert.ok(Math.abs(rPrec.shape.points[1][0] - 6.0003) < 1e-9, `expected 6.0003, got ${rPrec.shape.points[1][0]}`);

  const s = Math.SQRT1_2;
  const tiltedPlane: DocPlane = { origin: [10, 20, 30], normal: [0, -s, s], xAxis: [1, 0, 0] };
  const r14 = commitDimension(start, axisDiameterKey(1, 'y'), 14);
  assert.ok(r14.ok);
  const evalTilted = await evaluateDoc(revolveDoc(finishSketch(r14.shape, tiltedPlane), 'y'), 6);
  assert.ok(evalTilted.ok, evalTilted.ok ? '' : JSON.stringify(evalTilted.error));
  assert.ok(Math.abs(evalTilted.bodies[0].volume! - PI * 7 * 7 * 20) < 1e-4);
});

test('refuses non-positive/tiny/non-finite values, on-axis points, redundant and conflicting constraints without corrupting state', () => {
  const base = halfProfile([[0, 0], [6, 0], [6, 20], [0, 20]]);
  const baseSolve = solveShape(base);
  assert.ok(baseSolve.ok);

  // Invalid numeric values
  for (const bad of [NaN, Infinity, -Infinity, 0, -5, 0.001]) {
    const res = commitDimension(base, axisDiameterKey(1, 'y'), bad);
    assert.equal(res.ok, false, `expected refusal for ${bad}`);
  }

  // On-axis points
  assert.equal(axisDiameterGeometry(base, 0, 'y'), null);
  assert.equal(axisDiameterGeometry(base, 3, 'y'), null);
  assert.equal(axisDiameterGeometry(base, 1, 'x'), null);
  assert.equal(commitDimension(base, axisDiameterKey(0, 'y'), 12).ok, false);
  assert.equal(commitDimension(base, axisDiameterKey(3, 'y'), 12).ok, false);
  assert.equal(commitDimension(base, axisDiameterKey(1, 'x'), 12).ok, false);

  // Redundant: adiay1 = 12 then adiay2 = 12 (vertical edge 1 already ties x1 = x2)
  const r12 = commitDimension(base, axisDiameterKey(1, 'y'), 12);
  assert.ok(r12.ok);
  const red = commitDimension(r12.shape, axisDiameterKey(2, 'y'), 12);
  assert.equal(red.ok, false);
  assert.match(red.reason, /over-define|implied/i);

  // Conflicting: adiay1 = 12 then adiay2 = 16
  const conf = commitDimension(r12.shape, axisDiameterKey(2, 'y'), 16);
  assert.equal(conf.ok, false);
  assert.match(conf.reason, /conflict/i);

  // Conflicting with existing edge length len0 = 6
  const withLen = commitDimension(base, 'len0', 6);
  assert.ok(withLen.ok);
  const confLen = commitDimension(withLen.shape, axisDiameterKey(1, 'y'), 14);
  assert.equal(confLen.ok, false);
  assert.match(confLen.reason, /conflict/i);

  // Redundant with existing edge length len0 = 6
  const redLen = commitDimension(withLen.shape, axisDiameterKey(1, 'y'), 12);
  assert.equal(redLen.ok, false);
  assert.match(redLen.reason, /over-define|implied/i);

  // Accepted state untouched
  const afterSolve = solveShape(r12.shape);
  assert.ok(afterSolve.ok);
  assert.equal(afterSolve.dof, 1);
  assert.equal(afterSolve.rank, r12.report.rank);
});
