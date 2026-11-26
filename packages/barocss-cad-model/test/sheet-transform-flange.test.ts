import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkOutput, evaluateCadPart, flatPatternOf, massPropertiesOf, type BendTable } from '@barocss/cad';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { duplicateBody } from '../src/chat/features';
import { evaluateDoc, evaluatePart } from '../src/engine/evaluate';
import { toPartDocument } from '../src/engine/part';

const FIXTURE = join(import.meta.dirname, 'fixtures/sheet-l-bracket.calls.json');
const RADIUS = 1.5;
const WIDTH = 30;
const BORE = 2.75;

interface CallFixture {
  readonly calls: readonly { readonly tool: string; readonly args: Record<string, unknown> }[];
}

async function buildAsymmetricSheetDoc(): Promise<StudioDoc> {
  const { calls } = JSON.parse(readFileSync(FIXTURE, 'utf8')) as CallFixture;
  let state: ChatState = { doc: emptyDoc(), bodies: [], turnBase: emptyDoc() };
  for (const [index, call] of calls.entries()) {
    const result = await dispatchTool(state, call.tool, call.args, async doc => evaluatePart(doc, index + 1));
    assert.equal(result.isError, false, result.content);
    state = result.state;
  }
  return {
    ...state.doc,
    nodes: state.doc.nodes.map(node => node.id === 'n1' && node.kind === 'sketch' && node.profile === 'circle'
      ? { ...node, center: [25, 18] as [number, number] }
      : node),
  };
}

function close(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected} (tol ${tolerance})`);
}

function flangedTruth(thickness: number, kFactor: number) {
  const s = RADIUS + thickness;
  const volume = WIDTH * (thickness * (90 - 4 * s) + Math.PI / 2 * (s ** 2 - RADIUS ** 2)) - 2 * Math.PI * BORE ** 2 * thickness;
  const allowance = Math.PI / 2 * (RADIUS + kFactor * thickness);
  const deduction = 2 * s - allowance;
  const length = 90 - 2 * deduction;
  const area = WIDTH * length - 2 * Math.PI * BORE ** 2;
  return { s, volume, allowance, deduction, length, area };
}

test('single YZ reflection in StudioDoc supports subsequent flange, upstream thickness edit, and bend-table provenance', async () => {
  const table: BendTable = {
    id: 'studio-reflect-table',
    sources: [{ id: 'shop', label: 'Shop test coupon' }],
    rows: [
      { thickness: 1.5, radius: 1.5, angle: 90, kFactor: 0.44, source: 'shop' },
      { thickness: 2.0, radius: 1.5, angle: 90, kFactor: 0.46, source: 'shop' },
    ],
  };
  const seed = await buildAsymmetricSheetDoc();
  const withTable: StudioDoc = {
    ...seed,
    nodes: seed.nodes.map((node, index) => {
      if (index !== 0 || node.kind !== 'sheet-contour') return node;
      return { ...node, kFactor: undefined, bendTable: table };
    }),
  };
  const reflected = withNode(withTable, { kind: 'mirror', parent: { node: 6, side: 'solid' }, plane: 'yz', keep: false });
  const flanged = withNode(reflected, { kind: 'sheet-flange', parent: { node: 7, side: 'solid' }, edges: ['n0.end|n0.leg1.a'], length: 20 });

  for (const [thickness, kVal, rowIndex] of [[1.5, 0.44, 0], [2.0, 0.46, 1]] as const) {
    const doc: StudioDoc = thickness === 1.5
      ? flanged
      : { ...flanged, nodes: flanged.nodes.map((node, index) => index === 0 && node.kind === 'sheet-contour' ? { ...node, thickness } : node) };
    const evaluated = evaluateDoc(doc, 1);
    assert.equal(evaluated.ok, true);
    if (!evaluated.ok) return;
    assert.equal(evaluated.bodies.length, 1);
    assert.ok(evaluated.bodies[0].sheet);

    const output = evaluateCadPart(toPartDocument(doc)).outputs.at(-1)!;
    assert.equal(checkOutput(output).valid, true);
    const expected = flangedTruth(thickness, kVal);
    const mass = massPropertiesOf(output);
    close(mass.volume, expected.volume, expected.volume * 1e-9, `studio reflected flange volume t=${thickness}`);
    assert.ok(mass.centroid[0] < 0);

    const flat = flatPatternOf(output);
    const expectedRow = { table: table.id, rows: [rowIndex], how: 'exact', estimate: false };
    assert.equal(flat.fixedFace, 'n0.leg0.a');
    close(flat.box.max[0], WIDTH, 1e-11, 'flat width');
    close(flat.box.max[1], expected.length, 1e-11, 'flat length');
    close(flat.area, expected.area, 1e-11, 'flat area');
    assert.deepEqual(flat.bends.map(b => [b.name, b.direction, b.table]), [
      ['n0.bend1', 'down', expectedRow],
      ['n8.bend', 'up', expectedRow],
    ]);
  }

  // Missing row refuses cleanly without mutating the accepted doc.
  const missDoc: StudioDoc = {
    ...flanged,
    nodes: flanged.nodes.map((node, index) => index === 0 && node.kind === 'sheet-contour' ? { ...node, thickness: 3.0 } : node),
  };
  const refused = evaluateDoc(missDoc, 2);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error.detail, /BEND_TABLE_MISS/);
});

test('disjoint Duplicate supports copy-only subsequent flange and bend table while keeping original sheet invariant', async () => {
  const seed = await buildAsymmetricSheetDoc();
  const originalOutput = evaluateCadPart(toPartDocument(seed)).outputs[0];
  const originalMass = massPropertiesOf(originalOutput);
  const originalFlat = flatPatternOf(originalOutput);

  const duplicated = duplicateBody(seed, { node: 6, side: 'solid' }, [60, 0, 0]).doc;
  const copyTable: BendTable = {
    id: 'copy-flange-table',
    sources: [{ id: 'coupon', label: 'Copy coupon' }],
    rows: [{ thickness: 1.5, radius: 1.5, angle: 90, kFactor: 0.46, source: 'coupon' }],
  };
  const copyWithTable: StudioDoc = {
    ...duplicated,
    nodes: duplicated.nodes.map((node, index) => {
      if (index !== 7 || node.kind !== 'sheet-contour') return node;
      return { ...node, kFactor: undefined, bendTable: copyTable };
    }),
  };
  const copyFlanged = withNode(copyWithTable, { kind: 'sheet-flange', parent: { node: 14, side: 'solid' }, edges: ['n7.end|n7.leg1.a'], length: 20 });

  const evaluated = evaluateDoc(copyFlanged, 1);
  assert.equal(evaluated.ok, true);
  if (!evaluated.ok) return;
  assert.equal(evaluated.bodies.length, 2);
  assert.ok(evaluated.bodies[0].sheet && evaluated.bodies[1].sheet);

  const outputs = evaluateCadPart(toPartDocument(copyFlanged)).outputs;
  assert.equal(outputs.length, 2);
  const [origAfter, copyAfter] = outputs;

  // Original body, flat pattern, bend list, and mass are untouched.
  assert.deepEqual(origAfter.sheet?.bends.map(b => b.name), ['n0.bend1']);
  assert.equal(origAfter.sheet?.kFactor, 0.44);
  assert.equal(origAfter.sheet?.bendTable, undefined);
  close(massPropertiesOf(origAfter).volume, originalMass.volume, 1e-11, 'original volume invariant');
  close(flatPatternOf(origAfter).area, originalFlat.area, 1e-11, 'original flat area invariant');

  // Copy gains a 20 mm flange and uses its own bend table exclusively.
  assert.equal(checkOutput(copyAfter).valid, true);
  const expectedCopy = flangedTruth(1.5, 0.46);
  const copyRow = { table: copyTable.id, rows: [0], how: 'exact', estimate: false };
  close(massPropertiesOf(copyAfter).volume, expectedCopy.volume, expectedCopy.volume * 1e-9, 'copy flanged volume');
  const copyFlat = flatPatternOf(copyAfter);
  close(copyFlat.box.max[0], WIDTH, 1e-11, 'copy flat width');
  close(copyFlat.box.max[1], expectedCopy.length, 1e-11, 'copy flat length');
  close(copyFlat.area, expectedCopy.area, 1e-11, 'copy flat area');
  assert.deepEqual(copyFlat.bends.map(b => [b.name, b.direction, b.table]), [
    ['n7.bend1', 'down', copyRow],
    ['n15.bend', 'up', copyRow],
  ]);
});

test('unqualified Mirror(keep:true), Scale and Linear Pattern drop sheet qualification and refuse subsequent flange', async () => {
  const seed = await buildAsymmetricSheetDoc();
  const cases: StudioDoc[] = [
    withNode(seed, { kind: 'mirror', parent: { node: 6, side: 'solid' }, plane: 'yz', keep: true }),
    withNode(seed, { kind: 'scale', parent: { node: 6, side: 'solid' }, factor: 1 }),
    withNode(seed, { kind: 'linear-pattern', parent: { node: 6, side: 'solid' }, axis: 'x', spacing: 120, count: 2 }),
  ];
  for (const doc of cases) {
    const evaluated = evaluateDoc(doc, 1);
    assert.equal(evaluated.ok, true);
    if (!evaluated.ok) continue;
    assert.equal(evaluated.bodies[0].sheet, undefined);
    const withFlange = withNode(doc, { kind: 'sheet-flange', parent: { node: 7, side: 'solid' }, edges: ['n0.end|n0.leg1.a'], length: 20 });
    const refused = evaluateDoc(withFlange, 2);
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.match(refused.error.detail, /NOT_A_SHEET/);
  }
});
