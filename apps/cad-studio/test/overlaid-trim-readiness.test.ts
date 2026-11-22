import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { directTrimRestriction, applyOverlaidTrim } from '../src/sketch/directTrimReadiness';
import { OverlaidLinesControls } from '../src/ui/OverlaidLinesControls';
import type { useOverlaidLines } from '../src/sketch/useOverlaidLines';
const draft = (): SketchState => ({ tool: 'select', plane: xyPlane(), shape: { kind: 'polygon', closed: true,
  points: [[4, 6], [14, 6], [14, 16], [4, 16]] }, picked: [{ kind: 'edge', i: 1 }] });

test('same existing boundary excludes stored drafts and IDs in any outline but allows new drafts', () => {
  const next = draft(), before = JSON.stringify(next);
  assert.equal(directTrimRestriction(next), null);
  assert.ok(directTrimRestriction({ ...next, editNode: 0 }));
  assert.ok(directTrimRestriction({ ...next, shape: { ...next.shape!, ids: ['e1'] } }));
  assert.ok(directTrimRestriction({ ...next, done: [{ ...next.shape!, ids: ['e5'] }] }));
  assert.equal(directTrimRestriction({ ...next, shape: { ...next.shape!, ids: [] } }), null);
  assert.equal(JSON.stringify(next), before);
});
test('refused execution retains the exact scan object; success clears only after native execution', () => {
  const next = draft(), scan = { selected: { group: 0, occurrence: 1 }, highlight: 'e8' };
  let retained: typeof scan | null = scan;
  const calls: string[] = [];
  applyOverlaidTrim(next, actual => { assert.equal(actual, next); calls.push('refusal'); return false; }, () => { retained = null; });
  assert.equal(retained, scan);
  applyOverlaidTrim(next, () => { assert.equal(retained, scan); calls.push('success'); return true; }, () => { calls.push('clear'); retained = null; });
  assert.equal(retained, null); assert.deepEqual(calls, ['refusal', 'success', 'clear']);
});
test('stored restriction retains Select and a focusable described Trim action', () => {
  const restriction = directTrimRestriction({ ...draft(), editNode: 0 });
  const scan: ReturnType<typeof useOverlaidLines> = {
    enabled: true, dragging: false, canSelect: true, trimRestriction: restriction,
    report: { status: 'complete', checked: 2, excludedShapes: 0, excludedSegments: 0, groups: [[
      { shape: 0, side: 1, start: [14, 6], end: [14, 16], id: 'e2' },
      { shape: 1, side: 3, start: [14, 16], end: [14, 6], id: 'e8' },
    ]] }, selection: { group: 0, occurrence: 1 }, highlight: undefined,
    start() {}, close: () => true, choose() {}, selectEdge() {}, trimEdge() {}, onSketchDragChange() {},
  };
  const html = renderToString(createElement(OverlaidLinesControls, { scan }));
  assert.match(html, /Select highlighted edge/);
  assert.match(html, /aria-disabled="true"/); assert.match(html, /aria-describedby=/);
  assert.equal(html.split(restriction!).length - 1, 1);
  assert.doesNotMatch(html, / disabled=""/);
});
