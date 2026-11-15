import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { tappedHoleReadout } from '../src/ui/tappedHoleReadout';
import { HoleHistoryInputs } from '../src/ui/HoleHistoryInputs';
import { NodeEditor } from '../src/ui/NodeEditor';

test('exact designation and pitch use only the loaded tap value, without modifying inputs', () => {
  const rows = [{ id: 'M6', pitch: 1, tap: 5 }], before = JSON.stringify(rows);
  assert.match(tappedHoleReadout('M6×1', 5, rows).comparison, /matches the actual/);
  assert.match(tappedHoleReadout('M6×1', '4', rows).comparison, /Ø5 mm · differs/);
  assert.match(tappedHoleReadout('M6×1', 5, [{ ...rows[0], tap: 4.9 }]).comparison, /Ø4.9 mm · differs/);
  for (const candidates of [[], [{ id: 'M6', pitch: 0.75, tap: 5 }], [...rows, ...rows]])
    assert.match(tappedHoleReadout('M6×1', 4, candidates).comparison, /unavailable/);
  assert.match(tappedHoleReadout('M6×1', '', rows).drill, /unavailable/);
  assert.equal(JSON.stringify(rows), before);
});
test('placement stays original while the independent actual drill readout changes', () => {
  const hole: Extract<ModelNode, { kind: 'hole' }> = { kind: 'hole', parent: { node: 0, side: 'solid' }, center: [8, 12], radius: 2.5, depth: 8, axis: 'x', side: 'min', thread: 'M6×1' };
  const before = JSON.stringify(hole);
  const html = renderToString(createElement(HoleHistoryInputs, { hole, index: 1, drillDiameter: 4 }));
  assert.match(html, /M6×1(?:<!-- -->)? · Cosmetic/); assert.match(html, /Actual drill Ø4 mm/);
  assert.match(html, /Body end −X/); assert.match(html, /\+X/); assert.match(html, /comparison unavailable/);
  assert.equal(JSON.stringify(hole), before);
});
test('History uses the resolved parameter diameter and does not infer a legacy catalog', () => {
  const nodes: ModelNode[] = [{ kind: 'hole', parent: { node: 0, side: 'solid' }, center: [8, 12], radius: { parameter: 'R' }, thread: 'M6×1' }];
  const html = renderToString(createElement(NodeEditor, { nodes, index: 0, parameters: { R: 2 }, onApply() {}, onClose() {}, onRefuse() {} }));
  assert.match(html, /Actual drill Ø4 mm/); assert.match(html, /comparison unavailable/);
  assert.doesNotMatch(html, /Loaded row tap drill Ø5/);
});
