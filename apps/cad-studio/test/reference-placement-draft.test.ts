import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { Placement, ReferenceSet } from '@barocss/cad-model/engine/schema/references';
import { readReferences } from '@barocss/cad-model/chat/references';
import type { ReferencePlacementFields as Fields } from '../src/ui/ReferencePlacementFields';
import { ReferencePlacementFields as RealFields } from '../src/ui/ReferencePlacementFields';
import { ReferencesPanel, type ReferencesPanelProps } from '../src/ui/ReferencesPanel';

type Props = Parameters<typeof Fields>[0];
type ElementProps = { children?: unknown; [key: string]: unknown };
type View = ReactElement<ElementProps>;
const shared = globalThis as typeof globalThis & { __referencePlacementState?: (initial: unknown) => [unknown, (next: unknown) => void] };
const studio = existsSync(resolve('src/ui/ReferencePlacementFields.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'reference-placement-'));
let ReferencePlacementFields: typeof Fields;
try {
  const outfile = join(temporary, 'fields.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/ReferencePlacementFields.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'placement-state', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/ReferencePlacementFields.tsx') ? { path: 'react', namespace: 'placement-state' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'placement-state' }, () => ({ contents: 'export const useState=initial=>globalThis.__referencePlacementState(initial);' }));
    } }],
  });
  ({ ReferencePlacementFields } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }
function elements(node: unknown): View[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const zero = (): Placement => ({ position: [0, 0, 0], rotation: [0, 0, 0] });
const names = ['position x', 'position y', 'position z', 'rotation x', 'rotation y', 'rotation z'];
function fixture(run: (h: ReturnType<typeof createFixture>) => void) {
  const previous = shared.__referencePlacementState;
  try { run(createFixture()); } finally { shared.__referencePlacementState = previous; }
}
function createFixture() {
  let owner: unknown = {}, dirty = false, slots: unknown[] = [], cursor = 0;
  const saved = new Map([['ref1', zero()], ['ref2', zero()]]), states = new Map<string, unknown[]>(), commits: { id: string; at: Placement }[] = [];
  shared.__referencePlacementState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial;
    return [slots[i], next => { if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; };
  const onPlace: Props['onPlace'] = (id, at) => { commits.push({ id, at }); saved.set(id, at); owner = {}; };
  const render = (id = 'ref1') => {
    slots = states.get(id) ?? []; states.set(id, slots);
    for (let i = 0; i < 10; i++) {
      cursor = 0; dirty = false;
      const view = ReferencePlacementFields({ id, at: structuredClone(saved.get(id)!), resetKey: owner, onPlace });
      if (!dirty) return view;
    }
    throw new Error('Placement draft did not settle');
  };
  const field = (axis: number, id = 'ref1') => elements(render(id)).find(e => e.props['aria-label'] === `${id} ${names[axis]}`)!.props;
  return { saved, commits, render, field,
    type(axis: number, text: string, id = 'ref1') { (field(axis, id).onChange as (e: unknown) => void)({ target: { value: text } }); },
    key(axis: number, key = 'Enter', id = 'ref1') { const input = field(axis, id); (input.onKeyDown as (e: unknown) => void)({ key, currentTarget: { value: input.value }, stopPropagation() {} }); },
    revision(id?: string, at?: Placement) { if (id && at) saved.set(id, at); owner = {}; },
    unmount(id: string) { states.delete(id); saved.delete(id); owner = {}; },
  };
}

test('all six axes synchronize after Enter, Undo and Redo; Enter after Undo cannot reapply the stale coordinate', () => {
  for (let axis = 0; axis < 6; axis++) fixture(h => {
    const original = structuredClone(h.saved.get('ref1')!), kind = axis < 3 ? 'position' : 'rotation', index = axis % 3;
    h.type(axis, '50'); assert.equal(h.field(axis).value, '50'); assert.equal(h.commits.length, 0);
    h.key(axis); const applied = structuredClone(h.saved.get('ref1')!); assert.equal(applied[kind][index], 50);
    h.revision('ref1', original); assert.equal(h.field(axis).value, '0');
    h.key(axis); assert.equal(h.commits.at(-1)!.at[kind][index], 0);
    h.revision('ref1', applied); assert.equal(h.field(axis).value, '50');
    assert.deepEqual(original, zero());
  });
});

test('typing and blur do not commit; hover-only equivalent placements retain drafts and existing number semantics', () => fixture(h => {
  h.type(0, '12.5'); h.type(1, '-7');
  assert.equal(h.field(0).value, '12.5'); assert.equal(h.field(1).value, '-7');
  assert.equal(h.field(0).onBlur, undefined); h.key(0, 'Tab'); h.key(0, 'Escape'); assert.equal(h.commits.length, 0);
  assert.equal(h.field(0).value, '12.5'); h.key(0);
  assert.deepEqual(h.commits[0].at, { position: [12.5, 0, 0], rotation: [0, 0, 0] });
  assert.equal(h.field(1).value, '0', 'other-axis draft is canceled by the committed revision');
  for (const [raw, expected] of [['', 0], ['-2.75', -2.75], ['Infinity', -2.75], ['NaN', -2.75]] as const) {
    h.type(0, raw); h.key(0); assert.equal(h.commits.at(-1)!.at.position[0], expected);
  }
}));

test('committed revisions cancel drafts across references; same-ID same-value Open and remove/restore cannot revive them', () => fixture(h => {
  h.type(1, '18'); h.type(5, '25', 'ref2');
  assert.equal(h.field(1).value, '18'); assert.equal(h.field(5, 'ref2').value, '25');
  h.type(0, '50'); h.key(0);
  assert.equal(h.field(1).value, '0'); assert.equal(h.field(5, 'ref2').value, '0');
  assert.deepEqual(h.saved.get('ref2'), zero());
  h.type(2, '99'); h.revision(); assert.equal(h.field(2).value, '0', 'same coordinates and IDs, new document owner');
  h.type(4, '77'); h.revision('ref1', { position: [1, 2, 3], rotation: [4, 5, 6] });
  assert.deepEqual(names.map((_, i) => h.field(i).value), ['1', '2', '3', '4', '5', '6']);
  const stored = structuredClone(h.saved.get('ref1')!); h.type(0, '88'); h.unmount('ref1'); h.revision('ref1', stored);
  assert.equal(h.field(0).value, '1');
}));

test('without an explicit owner, changed saved coordinates still reset all axis drafts', () => {
  const old = shared.__referencePlacementState; let state: unknown;
  shared.__referencePlacementState = initial => { if (state === undefined) state = initial; return [state, next => { state = next; }]; };
  try {
    const props: Props = { id: 'ref1', at: zero(), onPlace() {} };
    let view = ReferencePlacementFields(props);
    const input = elements(view).find(e => e.props['aria-label'] === 'ref1 rotation z')!.props;
    (input.onChange as (e: unknown) => void)({ target: { value: '90' } });
    props.at = { position: [50, 0, 0], rotation: [0, 0, 0] }; view = ReferencePlacementFields(props);
    assert.equal(elements(view).find(e => e.props['aria-label'] === 'ref1 rotation z')!.props.value, '0');
  } finally { shared.__referencePlacementState = old; }
});

test('ReferencesPanel forwards document ownership without changing labels, datum or envelope controls', () => {
  const owner = {}, set: ReferenceSet = { version: 1, references: ['ref1', 'ref2'].map(id => ({ id, name: id, at: zero(), source: { mesh: { positions: [], indices: [] } } })), datums: [], keepouts: [] };
  const props: ReferencesPanelProps = { set: readReferences(set), resetKey: owner, local: new Map(), verdicts: null,
    onAddFile() {}, onPlace() {}, onDatum() {}, onEnvelope() {}, onRemove() {} };
  let tree: unknown;
  function Probe() { tree = ReferencesPanel(props); return null; }
  renderToStaticMarkup(createElement(Probe));
  const children = elements(tree).filter(e => e.type === RealFields);
  assert.equal(children.length, 2); children.forEach(e => assert.equal(e.props.resetKey, owner));
  const html = renderToStaticMarkup(createElement(ReferencesPanel, props));
  for (const id of ['ref1', 'ref2']) {
    for (const name of names) assert.ok(html.includes(`aria-label="${id} ${name}"`));
    for (const label of ['datum face', 'datum kind', 'add datum', 'envelope offset', 'add keep-out']) assert.ok(html.includes(`aria-label="${id} ${label}"`));
    assert.ok(html.includes(`aria-label="Remove ${id}"`));
  }
  assert.deepEqual(set.references.map(r => r.at), [zero(), zero()]);
});
