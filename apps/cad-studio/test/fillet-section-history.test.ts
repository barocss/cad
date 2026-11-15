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
const shared = globalThis as typeof globalThis & { __sectionHistoryHooks?: Hooks };
const studio = existsSync(resolve('src/ui/NodeEditor.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'section-history-'));
let NodeEditor: typeof Component;
try {
  const outfile = join(temporary, 'editor.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/NodeEditor.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'history-hooks', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/NodeEditor.tsx') ? { path: 'react', namespace: 'history-hooks' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'history-hooks' }, () => ({ contents: 'export const useState=(...a)=>globalThis.__sectionHistoryHooks.useState(...a),useRef=(...a)=>globalThis.__sectionHistoryHooks.useRef(...a),useId=(...a)=>globalThis.__sectionHistoryHooks.useId(...a),useEffect=(...a)=>globalThis.__sectionHistoryHooks.useEffect(...a),useLayoutEffect=(...a)=>globalThis.__sectionHistoryHooks.useLayoutEffect(...a);' }));
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
function fixture(kind: 'conic' | 'g2' = 'conic') {
  const old = shared.__sectionHistoryHooks, slots: unknown[] = [], effects: (() => unknown)[] = [];
  let cursor = 0, dirty = false;
  const effect = (callback: () => unknown, deps?: unknown[]) => { const i = cursor++, oldDeps = slots[i] as unknown[] | undefined;
    if (!deps || !oldDeps || deps.some((value, j) => !Object.is(value, oldDeps[j]))) { slots[i] = deps; effects.push(callback); }
  };
  shared.__sectionHistoryHooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next: unknown) => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useId() { return `history-${cursor++}`; }, useEffect: effect, useLayoutEffect: effect,
  };
  const nodes = [...rectanglePart(40, 30, 10).nodes, { id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' }, radius: 4, edges: ['n1.side0|n1.top'], section: kind === 'conic' ? { kind, rho: .7 } : { kind, tension: .7 } }] as ModelNode[];
  const applied: ModelNode[][] = [];
  const props: Props = { nodes, index: 2, parameters: {}, onApply(next) { applied.push(next); }, onClose() {}, onRefuse() {} };
  function render() { for (let i = 0; i < 10; i++) { cursor = 0; dirty = false; const view = NodeEditor(props); while (effects.length) effects.shift()!(); if (!dirty) return view; } throw new Error('History did not settle'); }
  const input = (name: string) => elements(render()).find(e => e.props['aria-label'] === name)!.props;
  const button = (name: string) => elements(render()).find(e => e.type === 'button' && content(e) === name)!.props;
  return { props, applied, render, input, button,
    type(name: string, value: string) { (input(name).onChange as (e: unknown) => void)({ target: { value } }); },
    click(name: string) { (button(name).onClick as (e: unknown) => void)({ currentTarget: {} }); },
    cleanup() { shared.__sectionHistoryHooks = old; },
  };
}

const help = 'Unitless section shape · greater than 0 and less than 1';
for (const [kind,,label] of [['conic','rho','Rho'],['g2','tension','Tension']] as const) {
  test(`actual History ${label} raw draft blocks Apply and Enter once; correction retains numeric-only section`, () => {
    const h = fixture(kind), original = structuredClone(h.props.nodes);
    try {
      for (const raw of ['', '0', '1', '-.1', '1.1', 'NaN', 'Infinity', '1e']) {
        h.type(label, raw); const input = h.input(label);
        assert.equal(input.value, raw); assert.equal(input['aria-invalid'], true);
        const all = elements(h.render()), local = all.filter(e => e.props.id === input['aria-describedby']);
        assert.equal(local.length, 1); assert.equal(content(local[0]), help); assert.equal(local[0].props.role, 'status');
        assert.equal(content(h.render()).split(help).length - 1, 1);
        assert.doesNotMatch(content(h.render()), /Enter a number for|Rho ·|Tension ·/);
        let validity = ''; (input.ref as (element: unknown) => void)({ setCustomValidity(value: string) { validity = value; } }); assert.equal(validity, help + '.');
        assert.equal(h.button('Apply').disabled, true); h.click('Apply');
        const root = h.render() as View; const oldElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement'); class Element { closest() { return null; } } Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: Element }); try { (root.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', preventDefault() {}, target: new Element() }); } finally { if (oldElement) Object.defineProperty(globalThis, 'HTMLElement', oldElement); else Reflect.deleteProperty(globalThis, 'HTMLElement'); }
        assert.equal(h.applied.length, 0); h.click('Reset'); assert.equal(h.input(label).value, .7);
      }
      for (const raw of ['.005', '.995', '.65']) { h.type(label, raw); assert.equal(h.input(label)['aria-invalid'], undefined); assert.equal(h.button('Apply').disabled, false); }
      assert.equal(elements(h.render()).filter(e => e.props['aria-label'] === label + ' parameter').length, 0);
      h.click('Apply'); assert.equal(h.applied.length, 1);
      const node = h.applied[0][2]; assert.equal(node.kind, 'fillet'); if (node.kind === 'fillet') assert.deepEqual(node.section, kind === 'conic' ? { kind, rho: .65 } : { kind, tension: .65 });
      assert.deepEqual(h.props.nodes, original);
    } finally { h.cleanup(); }
  });
  test(`actual History ${label} validates untouched stored values and clears ownership`, () => {
    const h = fixture(kind);
    try {
      h.props.nodes = h.props.nodes.map(node => node.kind === 'fillet' ? { ...node, section: kind === 'conic' ? { kind, rho: 0 } : { kind, tension: 1 } } : node);
      assert.equal(h.input(label)['aria-invalid'], true); assert.equal(h.button('Apply').disabled, true);
      h.type(label, ''); h.props.index = 1; h.render(); assert.equal(content(h.render()).includes(help), false);
      h.props.index = 2; h.props.nodes = [...rectanglePart(40,30,10).nodes, { id:'n2',kind:'fillet',parent:{node:1,side:'solid'},radius:4,edges:['n1.side0|n1.top'], section: kind === 'conic' ? {kind,rho:.7} : {kind,tension:.7} }];
      assert.equal(h.input(label).value, .7); assert.equal(h.input(label)['aria-invalid'], undefined);
      h.type(label, ''); h.props.nodes = structuredClone(h.props.nodes); assert.equal(h.input(label).value, .7);
      assert.equal(h.applied.length, 0);
    } finally { h.cleanup(); }
  });
}
