import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeLoop, edgeRing } from '@barocss/cad';
import { boxCage } from '../src/app/primitives';
import { openRun, redoSession, runOp, select, startSession, undoSession, validationOf } from '../src/subd/cageEdit';

test('Loop button matches double-click on either orientation of a hole boundary and Fill is undoable', () => {
  const base = startSession(0, boxCage(30, 20, 16, 4, [0, 0, 0]));
  assert.equal(base.cage.faces.length, 96);
  const top = base.cage.faces.findIndex(face => face.every(v => base.cage.positions[3 * v + 2] === 16));
  const hole = runOp(select(base, { kind: 'face', f: top }, false), 'delete');
  assert.equal(hole.cage.faces.length, 95);
  const boundary = validationOf(hole).boundaryEdges;
  assert.equal(boundary.length, 4);
  const [a,b] = boundary[0], before = structuredClone(hole);
  for (const [x,y] of [[a,b],[b,a]]) {
    const hit = { kind: 'edge' as const, a: x, b: y };
    const selected = select(hole, hit, false), button = runOp(selected, 'select-loop');
    assert.deepEqual(button.sel, select(hole, hit, false, 'loop').sel);
    assert.equal(button.sel.edges.length, 4);
    assert.deepEqual(button.cage, hole.cage);
    assert.deepEqual(button.undo, hole.undo); assert.deepEqual(button.redo, hole.redo);
    const filled = runOp(button, 'fill');
    assert.equal(filled.cage.faces.length, 96);
    assert.equal(validationOf(filled).boundaryEdges.length, 0);
    assert.equal(validationOf(filled).valid, true);
    assert.equal(filled.undo.length, hole.undo.length + 1);
    const undone = undoSession(filled);
    assert.deepEqual(undone.cage, hole.cage); assert.deepEqual(undone.sel, button.sel);
    const redone = redoSession(undone);
    assert.deepEqual(redone.cage, filled.cage); assert.deepEqual(redone.sel, filled.sel);
  }
  assert.deepEqual(hole, before);
});

test('interior Loop and Ring keep native selection and do not create history steps', () => {
  const base = startSession(0, boxCage(30, 20, 16, 4, [0, 0, 0]));
  const [a,b] = base.cage.faces.flatMap(f => f.map((v,i) => [v,f[(i+1)%f.length]])).find(([a,b]) => base.cage.positions[3*a+2]===8 && base.cage.positions[3*b+2]===8)!;
  assert.equal(openRun(base.cage,a,b),null);
  const hit = { kind:'edge' as const,a,b }, selected=select(base,hit,false), before=structuredClone(selected);
  for (const [op,grow] of [['select-loop','loop'],['select-ring','ring']] as const) {
    const result=runOp(selected,op);
    assert.deepEqual(result.sel,select(base,hit,false,grow).sel);
    assert.deepEqual(result.sel.edges,grow==='loop'?edgeLoop(base.cage,a,b):edgeRing(base.cage,a,b));
    assert.ok(result.sel.edges.length>=8);
    assert.deepEqual(result.cage,base.cage); assert.equal(result.undo.length,0); assert.equal(result.redo.length,0);
  }
  assert.deepEqual(selected,before);
});

test('Loop and Ring without an edge retain their input refusal and session', () => {
  const base=startSession(0,boxCage(30,20,16,4,[0,0,0])),before=structuredClone(base);
  for (const op of ['select-loop','select-ring'] as const) assert.throws(()=>runOp(base,op),/pick an edge first/);
  assert.deepEqual(base,before);
});
