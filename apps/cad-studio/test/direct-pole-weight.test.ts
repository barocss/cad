import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidElement, type ReactElement } from 'react';
import { directOps, geometryOf, importSource, type DirectGeometry } from '@barocss/cad-model/engine/direct';
import type { DirectPanel as PublicPanel } from '../src/ui/DirectPanel';
import type { DirectPoleEditor as PublicEditor, PolePatch, PoleRow } from '../src/ui/DirectPoleEditor';

type Props = { children?: unknown; [key: string]: unknown };
type View = ReactElement<Props>;
type WeightProps = { direct: DirectGeometry; owner: string; label: string; value: number; positive: boolean; onEdit(value: number): void };
type FieldProps = { direct: DirectGeometry; id: string; row: PoleRow; onEdit(patch: PolePatch): void };
type Hooks = { useState(value: unknown): [unknown, (next: unknown) => void] };
const shared = globalThis as typeof globalThis & { __weightHooks?: Hooks };
const studio = existsSync(resolve('src/ui/DirectPanel.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'cad-pole-weight-'));
let PoleInput: (props: WeightProps) => View, PoleFields: (props: FieldProps) => View;
let DirectPanel: (props: Parameters<typeof PublicPanel>[0]) => View;
let DirectPoleEditor: (props: Parameters<typeof PublicEditor>[0]) => View;
try {
  const outfile = join(temporary, 'panel.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/DirectPanel.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'weight-hooks', setup(builder) {
      builder.onLoad({ filter: /DirectPoleEditor\.tsx$/ }, args => ({
        contents: readFileSync(args.path, 'utf8') + '\nexport { PoleInput, PoleFields };', loader: 'tsx', resolveDir: dirname(args.path),
      }));
      builder.onLoad({ filter: /DirectPanel\.tsx$/ }, args => ({
        contents: readFileSync(args.path, 'utf8') + "\nexport { DirectPoleEditor, PoleInput, PoleFields } from './DirectPoleEditor';", loader: 'tsx', resolveDir: dirname(args.path),
      }));
      builder.onResolve({ filter: /^react$/ }, args => /\/Direct(?:Panel|PoleEditor)\.tsx$/.test(args.importer) ? { path: 'react', namespace: 'weight-hooks' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'weight-hooks' }, () => ({
        contents: 'export const useState=(...args)=>globalThis.__weightHooks.useState(...args),useEffect=()=>{};',
      }));
    } }],
  });
  ({ PoleInput, PoleFields, DirectPanel, DirectPoleEditor } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }

function elements(node: unknown): View[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function field(view: unknown) { const input = elements(view).find(element => element.props['aria-label'] === 'Weight'); assert.ok(input); return input.props; }
function harness<P>(component: (props: P) => View, props: P) {
  const old = shared.__weightHooks, states: unknown[] = [];
  let cursor = 0, dirty = false;
  shared.__weightHooks = {
    useState(value) { const index = cursor++; if (!(index in states)) states[index] = value;
      return [states[index], next => { if (!Object.is(states[index], next)) { states[index] = next; dirty = true; } }]; },
  };
  return {
    props,
    render() {
      for (let i = 0; i < 10; i++) {
        cursor = 0; dirty = false;
        const view = component(props);
        if (!dirty) return view;
      }
      throw new Error('Weight render did not settle');
    },
    cleanup() { shared.__weightHooks = old; },
  };
}
function weight() {
  const changes: number[] = [];
  const props: WeightProps = { value: 1, direct: { sources: {}, objects: [] }, owner: 'part:0', label: 'Weight', positive: true,
    onEdit: value => changes.push(value) };
  const h = harness(PoleInput, props);
  return { ...h, changes,
    type(value: string) { (field(h.render()).onChange as (event: unknown) => void)({ target: { value } }); },
    key(key: string) { (field(h.render()).onKeyDown as (event: unknown) => void)({ key, preventDefault() {}, stopPropagation() {} }); },
    blur() { (field(h.render()).onBlur as () => void)(); },
  };
}

// Hooks/events use the actual private weight component. Native focus/Tab and
// document Undo/Redo are qualified separately in the desktop browser.
test('invalid submitted weights retain their draft and expose a linked positive/not-applied error', () => {
  const h = weight();
  try {
    for (const draft of ['0', '-1', '', ' ', 'Infinity', 'NaN']) {
      h.type(draft); h.key('Enter'); let view = h.render();
      assert.equal(field(view).value, draft); assert.equal(field(view)['aria-invalid'], true);
      assert.equal(field(view)['aria-describedby'], 'pole-input-part%3A0-Weight');
      const alert = elements(view).find(element => element.props.role === 'alert'); assert.ok(alert);
      assert.equal(alert.props.id, field(view)['aria-describedby']);
      assert.equal(text(alert), 'Enter a positive weight. Not applied; saved weight is 1.');
      h.blur(); view = h.render(); assert.equal(field(view).value, draft); assert.equal(field(view)['aria-invalid'], true);
      assert.deepEqual(h.changes, []); assert.equal(h.props.value, 1);
    }
    h.type('-1'); h.key('Tab'); h.blur(); assert.equal(field(h.render())['aria-invalid'], true);
  } finally { h.cleanup(); }
});

test('positive Enter/blur apply clears the error; Escape restores the actual saved weight without applying', () => {
  const h = weight();
  try {
    h.type('0'); h.key('Enter'); h.type('2'); h.key('Enter');
    assert.deepEqual(h.changes, [2]); assert.equal(field(h.render())['aria-invalid'], undefined);
    h.props.value = 2; h.props.direct = { sources: {}, objects: [] }; h.render();
    h.blur(); assert.deepEqual(h.changes, [2], 'unchanged blur does not repeat the edit');
    h.type('-1'); h.blur(); assert.equal(field(h.render())['aria-invalid'], true);
    h.key('Escape'); const view = h.render(); assert.equal(field(view).value, '2');
    assert.equal(field(view)['aria-invalid'], undefined); assert.equal(field(view)['aria-describedby'], undefined);
    assert.equal(elements(view).some(element => element.props.role === 'alert'), false); h.blur(); assert.deepEqual(h.changes, [2]);
    h.type('0.125'); h.blur(); assert.deepEqual(h.changes, [2, 0.125]);
  } finally { h.cleanup(); }
});

test('history revisions and saved values reset errors; ordinary rerenders retain rejected drafts', () => {
  const h = weight();
  try {
    h.type('0'); h.key('Enter'); assert.equal(field(h.render()).value, '0');
    assert.equal(field(h.render())['aria-invalid'], true, 'same revision does not reset the draft');
    h.props.direct = { sources: {}, objects: [] }; assert.equal(field(h.render()).value, '1');
    assert.equal(field(h.render())['aria-invalid'], undefined, 'history with an unchanged saved weight clears stale errors');
    h.type('-1'); h.blur(); h.props.owner = 'part:1';
    assert.equal(field(h.render()).value, '1');
    assert.equal(field(h.render())['aria-invalid'], undefined);
    for (const value of [2, 1, 2]) {
      h.type('-1'); h.blur(); h.props.value = value; h.props.direct = { sources: {}, objects: [] };
      assert.equal(field(h.render()).value, String(value)); assert.equal(field(h.render())['aria-invalid'], undefined);
    }
    assert.deepEqual(h.changes, []);
  } finally { h.cleanup(); }
});

for (const kind of ['curve', 'surface'] as const) {
  test(`${kind} poles share validation, key drafts by pole/object and keep the native positive-weight gate`, () => {
    const source = kind === 'curve'
      ? '@model test { version: 0; length-unit: mm; @curve #path { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[0,0,0],[10,0,0]]; weights: [1,1]; } }'
      : '@model test { version: 0; length-unit: mm; @surface #panel { type: nurbs; degree-u:1; degree-v:1; knots-u:[0,0,1,1]; knots-v:[0,0,1,1]; control-points:[[[0,0,0],[0,10,0]],[[10,0,0],[10,10,0]]]; weights:[[1,1],[1,1]]; } }';
    const direct = importSource({ sources: {}, objects: [] }, source, 'Weight test'), id = direct.objects[0].id;
    const before = structuredClone(direct), selected: string[] = [];
    const controls: Parameters<typeof PublicEditor>[0]['controls'] = {
      selected: null, select(key) { if (key !== null) selected.push(key); }, edit() {},
    };
    const tools = harness(DirectPanel, { selected: [id], direct, poleControls: controls, onChange() {}, onHide() {}, onError() {} });
    try {
      const editor = elements(tools.render()).find(element => element.type === DirectPoleEditor);
      assert.ok(editor);
      assert.equal(editor.props.id, id);
      assert.equal(editor.props.direct, direct);
      const props = editor.props as Parameters<typeof PublicEditor>[0];
      assert.equal(elements(DirectPoleEditor(props)).some(element => element.type === PoleFields), false);
      const [first, second] = props.rows;
      const weights = [first, second].map(row => {
        const selector = elements(DirectPoleEditor(props)).find(element => element.props['aria-label'] === 'Control point');
        assert.ok(selector);
        (selector.props.onChange as (event: unknown) => void)({ target: { value: row.key } });
        props.controls.selected = row.key;
        const fields = elements(DirectPoleEditor(props)).find(element => element.type === PoleFields);
        assert.ok(fields);
        const input = elements(PoleFields(fields.props as FieldProps))
          .find(element => element.type === PoleInput && element.props.label === 'Weight');
        assert.ok(input);
        assert.equal(input.props.direct, direct);
        assert.equal(input.props.value, 1);
        assert.equal(input.props.positive, true);
        return input.props.owner;
      });
      assert.deepEqual(selected, [first.key, second.key]);
      assert.deepEqual(weights, [`${id}:${first.key}`, `${id}:${second.key}`]);
    } finally { tools.cleanup(); }
    const edit = (value: number) => kind === 'curve' ? directOps.editCurvePole(direct, id, 0, { weight: value }) : directOps.editSurfacePole(direct, id, 0, 0, { weight: value });
    assert.throws(() => edit(0)); assert.throws(() => edit(-1));
    const changed = edit(2), geometry = geometryOf(changed, changed.objects[0]);
    assert.equal(geometry.kind === 'curve' ? geometry.weights[0] : geometry.weights[0][0], 2);
    assert.deepEqual(direct, before, 'valid and rejected edits preserve the previous revision');
  });
}
