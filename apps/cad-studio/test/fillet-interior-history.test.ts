import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidElement, type ReactElement } from 'react';
import type { NodeEditor as Component } from '../src/ui/NodeEditor';
import { rectanglePart, type ModelNode } from '@barocss/cad-model/engine/doc';
type Props = Parameters<typeof Component>[0];
type EP = { children?: unknown; [key: string]: unknown };
type View = ReactElement<EP>;
type Hooks = { useState(initial: unknown): unknown; useRef(initial: unknown): unknown; useId(): string; useEffect(effect: () => unknown, deps?: unknown[]): void; useLayoutEffect(effect: () => unknown, deps?: unknown[]): void };
const shared = globalThis as typeof globalThis & { __interiorHistoryHooks?: Hooks };
const studio = existsSync(resolve('src/ui/NodeEditor.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'interior-history-'));
let NodeEditor: typeof Component;
try {
  const outfile = join(temporary, 'editor.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/NodeEditor.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'history-hooks', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/NodeEditor.tsx') ? { path: 'react', namespace: 'history-hooks' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'history-hooks' }, () => ({ contents: 'export const useState=(...a)=>globalThis.__interiorHistoryHooks.useState(...a),useRef=(...a)=>globalThis.__interiorHistoryHooks.useRef(...a),useId=(...a)=>globalThis.__interiorHistoryHooks.useId(...a),useEffect=(...a)=>globalThis.__interiorHistoryHooks.useEffect(...a),useLayoutEffect=(...a)=>globalThis.__interiorHistoryHooks.useLayoutEffect(...a);' }));
    } }],
  });
  ({ NodeEditor } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }
function elements(node: unknown): View[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<EP>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function content(node: unknown): string {
  if (Array.isArray(node)) return node.map(content).join('');
  if (isValidElement<EP>(node)) return content(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function fixture() {
  const old = shared.__interiorHistoryHooks, slots: unknown[] = [], effects: (() => unknown)[] = [];
  let cursor = 0, dirty = false;
  const effect = (callback: () => unknown, deps?: unknown[]) => { const i = cursor++, oldDeps = slots[i] as unknown[] | undefined;
    if (!deps || !oldDeps || deps.some((value, j) => !Object.is(value, oldDeps[j]))) { slots[i] = deps; effects.push(callback); }
  };
  shared.__interiorHistoryHooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next: unknown) => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useId() { return `history-${cursor++}`; }, useEffect: effect, useLayoutEffect: effect,
  };
  const nodes = [...rectanglePart(40, 30, 10).nodes, { id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' }, radius: 1.25, edges: ['n1.side0|n1.top'], radii: [{ at: [0, 0, 10], atEnd: true, radius: 1.25 }, { at: [10, 0, 10], fraction: .25, radius: 3 }, { at: [25, 0, 10], fraction: .625, radius: 1 }, { at: [40, 0, 10], atEnd: true, radius: 2.5 }] }] as ModelNode[];
  const applied: ModelNode[][] = [];
  const props: Props = { nodes, index: 2, parameters: {}, onApply(next) { applied.push(next); }, onClose() {}, onRefuse() {} };
  function render() { for (let i = 0; i < 10; i++) { cursor = 0; dirty = false; const view = NodeEditor(props); while (effects.length) effects.shift()!(); if (!dirty) return view; } throw new Error('History did not settle'); }
  const input = (name: string) => elements(render()).find(e => e.props['aria-label'] === name)!.props;
  const button = (name: string) => elements(render()).find(e => e.type === 'button' && content(e) === name)!.props;
  return { props, applied, render, input, button,
    type(name: string, value: string) { (input(name).onChange as (e: unknown) => void)({ target: { value } }); },
    click(name: string) { (button(name).onClick as (e: unknown) => void)({ currentTarget: {} }); },
    cleanup() { shared.__interiorHistoryHooks = old; },
  };
}

test('actual History raw station draft has local feedback and guarded Apply, correction commits only valid fractions', () => {
  const h = fixture();
  try {
    for (const raw of ['', '0', '100', 'NaN', '0.0000001']) {
      h.type('Interior 1 position (%)', raw);
      const input = h.input('Interior 1 position (%)'); assert.equal(input.value, raw); assert.equal(input['aria-invalid'], true);
      const local = elements(h.render()).filter(e => e.props.id === 'history-fillet-interior-stationAt'); assert.equal(local.length, 1);
      assert.ok(String(input['aria-describedby']).includes('history-fillet-interior-stationAt'));
      assert.equal(h.button('Apply').disabled, true); h.click('Apply'); assert.equal(h.applied.length, 0);
      h.click('Reset'); assert.equal(h.input('Interior 1 position (%)').value, 25);
    }
    h.type('Interior 2 position (%)', '25'); assert.equal(h.input('Interior 2 position (%)')['aria-invalid'], true);
    h.type('Interior 1 position (%)', '');
    assert.equal(h.input('Interior 2 position (%)')['aria-invalid'], undefined, 'order feedback waits until both individual ranges are valid');
    h.click('Reset'); h.type('Interior 2 position (%)', '70'); h.click('Apply'); assert.equal(h.applied.length, 1);
    const result = h.applied[0][2]; assert.equal(result.kind, 'fillet'); if (result.kind === 'fillet') assert.equal(result.radii?.[2].fraction, .7);
  } finally { h.cleanup(); }
});

test('actual History Reset and feature/document ownership discard raw station errors without mutating source', () => {
  const h = fixture(), original = structuredClone(h.props.nodes);
  try {
    h.type('Interior 1 position (%)', '');
    h.props.index = 1; h.render();
    assert.equal(elements(h.render()).filter(e => String(e.props.id).startsWith('history-fillet-interior-')).length, 0);
    h.props.index = 2; h.render(); assert.equal(h.input('Interior 1 position (%)').value, 25);
    h.type('Interior 2 position (%)', '0'); h.props.nodes = structuredClone(h.props.nodes); h.render();
    assert.equal(h.input('Interior 2 position (%)').value, 62.5);
    assert.deepEqual(h.props.nodes, original); assert.equal(h.applied.length, 0);
  } finally { h.cleanup(); }
});

test('actual History Apply preserves an untouched lossy fraction when a radius or the other station changes', () => {
  const fraction = 0.000002999991000027;
  assert.notEqual(fraction * 100 / 100, fraction);
  for (const [field, value] of [['Interior 1 radius', '3.5'], ['Interior 2 position (%)', '70']]) {
    const h = fixture();
    try {
      h.props.nodes = h.props.nodes.map(node => node.kind === 'fillet' ? { ...node, radii: node.radii!.map((point, index) => index === 1 ? { ...point, fraction, at: [40 * fraction, 0, 10] as [number, number, number] } : point) } : node);
      const original = structuredClone(h.props.nodes);
      h.type(field, value); assert.equal(h.button('Apply').disabled, false); h.click('Apply');
      assert.equal(h.applied.length, 1); const result = h.applied[0][2]; assert.equal(result.kind, 'fillet');
      if (result.kind === 'fillet') assert.ok(Object.is(result.radii?.[1].fraction, fraction), field);
      assert.deepEqual(h.props.nodes, original, 'applying a draft does not mutate its accepted source');
    } finally { h.cleanup(); }
  }
});
