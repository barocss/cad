import test from 'node:test';
import assert from 'node:assert/strict';
import { CadPartError } from '@barocss/cad';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, evaluatePreview } from '../src/engine/evaluate';
import { friendlyCause } from '../src/engine/errors';
import { sewGapLocation } from '../src/engine/sewGapLocation';

const surface = (z: number) => ({ degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1],
  controlPoints: [[[0, 0, z], [0, 10, z]], [[10, 0, z], [10, 10, z]]] as [number, number, number][][], weights: [[1, 1], [1, 1]] });
const doc = withNode(emptyDoc(), { kind: 'sew', names: ['같은 이름', '같은 이름'], surfaces: [surface(0), surface(10)] });
const detail = 'the surfaces do not close: 8 edges meet no other surface (surfaces 1, 2)';
const cause = new CadPartError('GEOMETRY', 'n0', detail);
test('native Sew preview/evaluation lists exact saved names and ordinals without mutation', () => {
  const before = JSON.stringify(doc);
  for (const evaluate of [evaluateDoc, evaluatePreview]) {
    const result = evaluate(doc, 1);
    assert.equal(result.ok, false); if (result.ok) throw new Error('expected open surfaces');
    assert.equal(result.error.code, 'GEOMETRY'); assert.equal(result.error.feature, 'n0');
    assert.equal(result.error.detail, detail);
    assert.match(result.error.hint, /1\. 같은 이름; 2\. 같은 이름/);
  }
  assert.equal(JSON.stringify(doc), before);
});
test('only exact native owner/message/category and valid surface indices enrich', () => {
  const error = friendlyCause(cause);
  const enriched = sewGapLocation(doc, cause, error);
  assert.notEqual(enriched, error);
  assert.deepEqual({ ...enriched, hint: error.hint }, error);
  for (const other of [new Error(cause.message), new CadPartError('INPUT', 'n0', detail), new CadPartError('GEOMETRY', 'n1', detail)])
    assert.equal(sewGapLocation(doc, other, error), error);
  for (const text of [detail + ' trailing', detail.replace('1, 2', '1, 3'), detail.replace('1, 2', '1, 1'),
    detail.replace('1, 2', '0, 2'), detail.replace('8 edges', '999999999999999999999 edges'), detail.replace('8 edges', '1 edges')]) {
    const bad = new CadPartError('GEOMETRY', 'n0', text), friendly = friendlyCause(bad);
    assert.equal(sewGapLocation(doc, bad, friendly), friendly);
  }
  const mismatch = { ...error, detail: detail + ' changed' };
  assert.equal(sewGapLocation(doc, cause, mismatch), mismatch);
});
test('ambiguous, suppressed, non-Sew and nested documents retain ordinary feedback', () => {
  const error = friendlyCause(cause), node = doc.nodes[0];
  const variants: StudioDoc[] = [
    { ...doc, nodes: [node, node] }, { ...doc, nodes: [{ ...node, suppressed: true }] },
    { ...doc, nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [1, 1] }] },
    { ...doc, pendingParts: { p: { doc, rev: 'r', name: 'p' } } },
  ];
  if (node.kind === 'sew') variants.push({ ...doc, nodes: [{ ...node, names: ['short'] }] });
  for (const variant of variants) assert.equal(sewGapLocation(variant, cause, error), error);
});
