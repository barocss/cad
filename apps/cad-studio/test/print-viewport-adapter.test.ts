import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { ViewportProps } from '../src/viewport/Viewport';
import type { projectPrintBodies } from '../src/viewport/printProjection';
import { printSelection, printFaceColors, printViewportProps, usePrintViewport } from '../src/viewport/usePrintViewport';

function fixture() {
  const events: unknown[] = [];
  const source = { bodies: [], selection: { faces: [{ body: 0, face: 3 }, { body: 0, face: 7 }], edges: [{ body: 0, edge: 4 }], bodies: [0] },
    ghost: new Set<number>(), printDisplay: { summary: { modelToBed: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1] } },
    onPick: (...args: unknown[]) => events.push(['pick', ...args]), onPickBody: (body: number) => events.push(['body', body]),
    onPickChain: (...args: unknown[]) => events.push(['chain', ...args]), onCursor: (point: unknown) => events.push(['cursor', point]),
    onContextMenu: (...args: unknown[]) => events.push(['menu', ...args]),
  } as unknown as ViewportProps;
  const projection = { bodies: [], faceSources: [[3, -1, 2]], edgeSources: [[4, -1]] } as unknown as ReturnType<typeof projectPrintBodies>;
  return { source, projection, events, adapted: () => printViewportProps(source, projection, printSelection(source.selection, projection), undefined) };
}
test('print selection and face colours map only retained native references, without mutating source', () => {
  const { source, projection } = fixture();
  const colour: [number, number, number] = [1, 0, 0];
  const colors = new Map([[0, new Map([[3, colour], [7, colour]])]]);
  assert.deepEqual(printSelection(source.selection, projection), { faces: [{ body: 0, face: 0 }], edges: [{ body: 0, edge: 0 }], bodies: [0] });
  assert.deepEqual(printFaceColors(colors, projection), new Map([[0, new Map([[0, colour]])]]));
  assert.equal(source.selection.faces.length, 2); assert.equal(colors.get(0)!.size, 2);
});
test('native print picks return model-space points and preserve additive and vertex metadata', () => {
  const f = fixture();
  f.adapted().onPick({ face: { body: 0, face: 0 }, edge: { body: 0, edge: 0 }, point: [11, 22, 33], vertex: { body: 0, at: [12, 23, 34] } }, true);
  assert.deepEqual(f.events, [['pick', { face: { body: 0, face: 3 }, edge: { body: 0, edge: 4 }, point: [1, 2, 3], vertex: { body: 0, at: [2, 3, 4] } }, true]]);
});
test('synthetic cap/edge picks select only the body, and cannot become native chain or context targets', () => {
  const f = fixture(), p = f.adapted();
  p.onPick({ face: { body: 0, face: 1 }, edge: null, point: [11, 22, 33] }, false);
  p.onPick({ face: null, edge: { body: 0, edge: 1 }, point: null }, false);
  p.onPickChain?.(0, 1); p.onPickChain?.(0, 0);
  p.onContextMenu({ x: 10, y: 20 }, { face: { body: 0, face: 1 }, edge: null, point: [11, 22, 33] });
  p.onCursor([11, 22, 33]); p.onCursor(null);
  assert.deepEqual(f.events, [['body', 0], ['body', 0], ['chain', 0, 4], ['menu', { x: 10, y: 20 }, { face: null, edge: null, point: null }], ['cursor', [1, 2, 3]], ['cursor', null]]);
});
test('projected geometry disables model-space editing overlays without replacing unrelated capabilities', () => {
  const f = fixture(), p = f.adapted();
  assert.equal(p.bodies, f.projection.bodies); assert.equal(p.ghost, f.source.ghost);
  for (const key of ['gizmo', 'transforms', 'measureLine', 'boundsBox', 'clip', 'clearance', 'cloud'] as const) assert.equal(p[key], null);
  assert.deepEqual(p.handles, []); assert.deepEqual(p.profiles, []);
});
test('inactive adapter preserves source identity; waiting print geometry uses stable empty inputs', () => {
  const f = fixture(); delete f.source.printDisplay;
  const read = (source: ViewportProps) => { let result!: ViewportProps; function Probe() { result = usePrintViewport(source); return null; } renderToStaticMarkup(createElement(Probe)); return result; };
  assert.equal(read(f.source), f.source);
  const first = read({ ...f.source, printActive: true }), second = read({ ...f.source, printActive: true });
  assert.equal(first.bodies, second.bodies); assert.equal(first.selection, second.selection); assert.equal(first.handles, second.handles);
  assert.equal(first.onPick, f.source.onPick);
});
