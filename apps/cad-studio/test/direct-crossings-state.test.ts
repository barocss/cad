import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidElement, type ReactElement } from 'react';
import { directOps, type DirectGeometry } from '@barocss/cad-model/engine/direct';

// Actual private Crossings component and actual curve-plane query. Only React
// scheduling is controlled, so stale markup is checked before any passive effect.
const studio = existsSync(resolve(process.cwd(), 'src/ui/DirectPanel.tsx')) ? process.cwd() : resolve(process.cwd(), 'apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
type StateValue = unknown | ((previous: unknown) => unknown);
const shared = globalThis as typeof globalThis & { __crossingsHooks?: { useState(value: unknown): [unknown, (next: StateValue) => void] } };
type Crossings = (props: { direct: DirectGeometry; id: string }) => ReactElement;
const temporary = await mkdtemp(join(tmpdir(), 'crossings-state-'));
let Crossings: Crossings;
try {
  await build({ entryPoints: [join(studio, 'src/ui/DirectPanel.tsx')], outfile: join(temporary, 'panel.mjs'),
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', tsconfig: join(studio, 'tsconfig.json'), logLevel: 'silent',
    plugins: [{ name: 'crossings-hooks', setup(b) {
      b.onLoad({ filter: /DirectPanel\.tsx$/ }, args => ({
        contents: readFileSync(args.path, 'utf8') + '\nexport { Crossings as TestCrossings };', loader: 'tsx', resolveDir: dirname(args.path),
      }));
      b.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/DirectPanel.tsx') ? { path: 'react', namespace: 'crossings-hooks' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'crossings-hooks' }, () => ({
        contents: 'export const useState=(value)=>globalThis.__crossingsHooks.useState(value); export const useEffect=()=>{};',
      }));
    } }],
  });
  ({ TestCrossings: Crossings } = await import(pathToFileURL(join(temporary, 'panel.mjs')).href));
} finally { await rm(temporary, { recursive: true, force: true }); }

type Props = { children?: unknown; [key: string]: unknown };
function elements(node: unknown): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function content(node: unknown): string {
  if (Array.isArray(node)) return node.map(content).join('');
  if (isValidElement<Props>(node)) return content(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function field(view: unknown, name: string) {
  const item = elements(view).find(element => element.props['aria-label'] === name || element.props.label === name);
  assert.ok(item, name); return item.props;
}
function crossings(view: unknown) { return elements(view).filter(element => element.props['aria-label'] === 'Crossing').map(element => content(element)); }
const cleared = (view: unknown) => { assert.deepEqual(crossings(view), []); assert.doesNotMatch(content(view), /does not cross|lies in the plane/); };
function harness(direct: DirectGeometry) {
  const before = shared.__crossingsHooks, slots: unknown[] = [];
  let cursor = 0, dirty = false, id = 'line1';
  shared.__crossingsHooks = { useState(value) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = value;
    return [slots[index], (next: StateValue) => {
      const value = typeof next === 'function' ? next(slots[index]) : next;
      if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
    }];
  } };
  const render = () => {
    let view!: ReactElement;
    for (let attempt = 0; attempt < 10; attempt++) {
      cursor = 0; dirty = false; view = Crossings({ direct, id });
      if (!dirty) return view;
      // The first render itself must not expose the answer it is discarding.
      cleared(view);
    }
    throw new Error('Crossings render did not settle');
  };
  return {
    render, setDirect(next: DirectGeometry) { direct = next; }, setId(next: string) { id = next; },
    axis(axis: 'x' | 'y' | 'z') { (field(render(), 'Crossing plane').onChange as (event: { target: { value: string } }) => void)({ target: { value: axis } }); },
    at(at: number | string) { (field(render(), 'At').onChange as (event: { target: { value: string } }) => void)({ target: { value: String(at) } }); },
    find() { (field(render(), 'Find crossings').onClick as () => void)(); return render(); },
    retained(axis: string, at: number) { const view = render(); assert.equal(field(view, 'Crossing plane').value, axis); assert.equal(field(view, 'At').value, String(at)); },
    cleanup() { shared.__crossingsHooks = before; },
  };
}
function source(): DirectGeometry {
  return { sources: { line: '@model test { version: 0; length-unit: mm; @curve #line { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[0,-7,0],[14,-7,0]]; weights: [1,1]; } }' },
    objects: [{ id: 'line1', name: 'Crossing control', source: 'line', geometry: 'line' }] };
}

test('same-ID Move, Undo and Redo clear successful answers immediately, retain inputs and Find uses current geometry', () => {
  const original = source(), before = structuredClone(original), moved = directOps.move(original, ['line1'], [0, 0, 10]), movedBefore = structuredClone(moved), h = harness(original);
  try {
    h.axis('x'); h.at(7);
    assert.deepEqual(crossings(h.find()), ['t 0.5 7, -7, 0']);
    assert.deepEqual(crossings(h.find()), ['t 0.5 7, -7, 0'], 'repeated Find is stable');
    h.setDirect(moved); cleared(h.render()); h.retained('x', 7);
    h.setDirect(original); cleared(h.render()); // no Find between Move and Undo: do not revive the old answer
    assert.deepEqual(crossings(h.find()), ['t 0.5 7, -7, 0']);
    h.setDirect(moved); cleared(h.render()); h.retained('x', 7);
    assert.deepEqual(crossings(h.find()), ['t 0.5 7, -7, 10']);
    h.setDirect(original); cleared(h.render()); h.retained('x', 7);
    assert.deepEqual(crossings(h.find()), ['t 0.5 7, -7, 0']);
    assert.deepEqual(original, before); assert.deepEqual(moved, movedBefore);
  } finally { h.cleanup(); }
});

test('no-crossing answers are discarded across same-ID Move, Undo and Redo', () => {
  const original = source(), moved = directOps.move(original, ['line1'], [10, 0, 0]), h = harness(original);
  try {
    h.axis('x'); h.at(20); assert.match(content(h.find()), /The curve does not cross X = 20\./);
    h.setDirect(moved); cleared(h.render()); h.retained('x', 20);
    assert.deepEqual(crossings(h.find()), ['t 0.71429 20, -7, 0']);
    h.setDirect(original); cleared(h.render()); assert.match(content(h.find()), /does not cross X = 20/);
    h.setDirect(moved); cleared(h.render()); assert.equal(crossings(h.find()).length, 1);
  } finally { h.cleanup(); }
});

test('errors clear on geometry change and Find replaces them with the current answer', () => {
  const original = source(), moved = directOps.move(original, ['line1'], [0, 0, 10]), before = structuredClone(original), h = harness(original);
  try {
    assert.match(content(h.find()), /lies in the plane Z = 0/);
    h.setDirect(moved); cleared(h.render()); h.retained('z', 0);
    assert.match(content(h.find()), /does not cross Z = 0/);
    h.setDirect(original); cleared(h.render()); assert.match(content(h.find()), /lies in the plane Z = 0/);
    h.axis('x'); cleared(h.render()); h.at(7); assert.equal(crossings(h.find()).length, 1);
    h.at(8); cleared(h.render()); assert.deepEqual(crossings(h.find()), ['t 0.57143 8, -7, 0']);
    assert.deepEqual(original, before);
  } finally { h.cleanup(); }
});

test('immutable snapshot or selected ID change invalidates answers even when source text is unchanged', () => {
  const original = source(), clone = { ...original, sources: { ...original.sources } }, before = structuredClone(original), h = harness(original);
  try {
    h.axis('x'); h.at(7); assert.equal(crossings(h.find()).length, 1);
    h.setDirect(clone); cleared(h.render()); h.retained('x', 7);
    h.setDirect(original); cleared(h.render()); assert.equal(crossings(h.find()).length, 1);
    h.setId('other'); cleared(h.render()); h.setId('line1'); cleared(h.render());
    assert.equal(crossings(h.find()).length, 1); assert.deepEqual(original, before);
  } finally { h.cleanup(); }
});


test('blank and nonfinite raw input discards answers and guarded Find cannot reuse the previous plane', () => {
  const original = source(), before = structuredClone(original), h = harness(original);
  try {
    h.axis('x');
    for (const invalid of ['', ' ', 'Infinity', '-Infinity', 'NaN', '1e309']) {
      h.at(7); assert.deepEqual(crossings(h.find()), ['t 0.5 7, -7, 0']);
      h.at(invalid); cleared(h.render());
      assert.equal(field(h.render(), 'At').value, invalid);
      assert.equal(field(h.render(), 'At')['aria-invalid'], true);
      assert.equal(field(h.render(), 'Find crossings').disabled, true);
      cleared(h.find()); // Invoke even the disabled control's handler: admission still refuses.
      h.at(7); cleared(h.render()); // Re-entering the old number does not revive its answer.
      assert.equal(field(h.render(), 'Find crossings').disabled, false);
      h.at(8); cleared(h.render());
      assert.deepEqual(crossings(h.find()), ['t 0.57143 8, -7, 0']);
    }
    assert.deepEqual(original, before);
  } finally { h.cleanup(); }
});

test('invalid raw input survives source and plane changes without reviving a previous answer or error', () => {
  const original = source(), moved = directOps.move(original, ['line1'], [0, 0, 10]), h = harness(original);
  try {
    assert.match(content(h.find()), /lies in the plane Z = 0/);
    h.at(''); cleared(h.render());
    h.setDirect(moved); cleared(h.render());
    h.axis('x'); cleared(h.render());
    h.setDirect(original); cleared(h.render());
    assert.equal(field(h.render(), 'At').value, '');
    cleared(h.find());
    h.at(7); cleared(h.render());
    assert.deepEqual(crossings(h.find()), ['t 0.5 7, -7, 0']);
  } finally { h.cleanup(); }
});
