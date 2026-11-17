import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidElement, type ReactElement } from 'react';
import { importSource, type DirectGeometry } from '@barocss/cad-model/engine/direct';

type Props = { children?: unknown; [key: string]: unknown };
type View = ReactElement<Props>;
type PointProps = { id: string; direct: DirectGeometry; u: [number, number]; v: [number, number] };
type ToolsProps = { onThicken?(id: string, thickness: number, side: 'normal' | 'reverse' | 'both'): void; id: string; direct: DirectGeometry; run(op: () => DirectGeometry): void; added(): string[] };
type Hooks = { useState(value: unknown): [unknown, (next: unknown) => void]; useEffect(effect: () => void, deps: unknown[]): void };
const shared = globalThis as typeof globalThis & { __surfaceDomainHooks?: Hooks };
const studio = existsSync(resolve('src/ui/DirectPanel.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'cad-surface-domain-'));
let SurfacePoint: (props: PointProps) => View, SurfaceTools: (props: ToolsProps) => View;
type TransformProps = { direct: DirectGeometry; selected: string[]; moveControls: null; onRotate(axis: string, n: number): void; onScale(n: number): void; onStretch(n: number[]): void; onShear(a: string, b: string, n: number): void; onDuplicate(): void };
let Transform: (props: TransformProps) => View, TransformDraft: (props: Props) => View;
let DirectMoveControls: (props: MoveProps) => View;
type MoveProps = { direct: DirectGeometry; selected: string[]; onMove(by: [number, number, number]): void };
let SurfaceParameter: (props: Props) => View, Analysis: (props: Props) => View;
try {
  const outfile = join(temporary, 'panel.mjs');
  await build({ entryPoints: [join(studio, 'src/ui/DirectPanel.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'surface-domain-hooks', setup(builder) {
      builder.onLoad({ filter: /DirectPanel\.tsx$/ }, args => ({ contents: readFileSync(args.path, 'utf8') + '\nexport { SurfacePoint, SurfaceTools, SurfaceParameter, Analysis, DirectMoveControls, Transform, TransformDraft };', loader: 'tsx', resolveDir: dirname(args.path) }));
      builder.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/DirectPanel.tsx') ? { path: 'react', namespace: 'surface-domain-hooks' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'surface-domain-hooks' }, () => ({ contents: 'export const useState=(...a)=>globalThis.__surfaceDomainHooks.useState(...a),useEffect=(...a)=>globalThis.__surfaceDomainHooks.useEffect(...a);' }));
    } }],
  });
  ({ SurfacePoint, SurfaceTools, SurfaceParameter, Analysis, DirectMoveControls, Transform, TransformDraft } = await import(pathToFileURL(outfile).href));
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
function harness<P>(component: (props: P) => View, props: P) {
  const old = shared.__surfaceDomainHooks, states: unknown[] = [], dependencies: unknown[][] = [];
  let cursor = 0, effectCursor = 0, dirty = false;
  let effects: (() => void)[] = [];
  shared.__surfaceDomainHooks = {
    useState(value) { const index = cursor++; if (!(index in states)) states[index] = value;
      return [states[index], next => { if (!Object.is(states[index], next)) { states[index] = next; dirty = true; } }]; },
    useEffect(effect, deps) { const index = effectCursor++, previous = dependencies[index];
      if (!previous || !deps.every((value, i) => Object.is(previous[i], value))) { dependencies[index] = deps; effects.push(effect); } },
  };
  return { props,
    render() { for (let i = 0; i < 10; i++) { cursor = 0; effectCursor = 0; dirty = false;
      const view = component(props), pending = effects; effects = []; pending.forEach(effect => effect()); if (!dirty) return view;
    } throw new Error('Weight render did not settle'); },
    cleanup() { shared.__surfaceDomainHooks = old; },
  };
}

const source = '@model test { version: 0; length-unit: mm; @surface #panel { type: nurbs; degree-u:1; degree-v:1; knots-u:[-2,-2,6,6]; knots-v:[1,1,7,7]; control-points:[[[10,-6,3],[10,24,3]],[[50,-6,3],[50,24,3]]]; weights:[[1,1],[1,1]]; } }';
function seed() { return importSource({ sources: {}, objects: [] }, source, 'Surface domain'); }
function parameter(view: View, label: string) {
  const node = elements(view).find(element => element.type === SurfaceParameter && element.props.label === label); assert.ok(node, label); return node;
}
function input(view: View, label: string) {
  const node = elements(SurfaceParameter(parameter(view, label).props)).find(element => element.props['aria-label'] === label); assert.ok(node); return node.props;
}
function change(view: View, label: string, value: string) { (input(view, label).onChange as (event: unknown) => void)({ target: { value } }); }
function action(view: View, name: string) { const node = elements(view).find(element => text(element) === name && element.props.onClick); assert.ok(node, name); return node.props; }
function measurement(view: View) { return elements(view).find(element => element.type === Analysis); }
function point() {
  const direct = seed(), props: PointProps = { id: direct.objects[0].id, direct, u: [-2, 6], v: [1, 7] };
  return harness(SurfacePoint, props);
}

// Real private UI components and native geometry. Scheduling is controlled;
// browser QA separately qualifies actual typing, focus and Undo/Redo controls.
test('surface inspector invalid drafts identify their own inclusive range and remove all old measurements', () => {
  const h = point();
  try {
    let view = h.render(); assert.ok(measurement(view));
    assert.match(text(Analysis(measurement(view)!.props)), /Point 30, 9, 3/);
    for (const [label, drafts] of [['u', ['7', '-3', '', ' ', 'NaN', 'Infinity']], ['v', ['0', '8', '', '-Infinity']]] as const) {
      for (const draft of drafts) {
        change(h.render(), label, draft); view = h.render(); const field = input(view, label);
        assert.equal(field.value, draft); assert.equal(field['aria-invalid'], true); assert.equal(measurement(view), undefined);
        const rendered = SurfaceParameter(parameter(view, label).props);
        const message = elements(rendered).find(element => element.props.id === field['aria-describedby']); assert.ok(message);
        assert.equal(text(message), label === 'u' ? 'Enter a finite u from -2 to 6 (inclusive).' : 'Enter a finite v from 1 to 7 (inclusive).');
        assert.equal(input(view, label === 'u' ? 'v' : 'u')['aria-invalid'], undefined);
      }
      change(h.render(), label, label === 'u' ? '2' : '4'); assert.ok(measurement(h.render()));
    }
    assert.deepEqual(h.props.direct, seed(), 'inspection does not change the native document');
  } finally { h.cleanup(); }
});

test('inclusive surface endpoints still evaluate; id/domain/history changes immediately discard drafts', () => {
  const h = point();
  try {
    for (const [u, v] of [[-2, 1], [-2, 7], [6, 1], [6, 7]]) {
      change(h.render(), 'u', String(u)); change(h.render(), 'v', String(v)); const view = h.render();
      assert.equal(input(view, 'u')['aria-invalid'], undefined); assert.equal(input(view, 'v')['aria-invalid'], undefined);
      assert.ok(measurement(view)); assert.match(text(Analysis(measurement(view)!.props)), /Point/);
    }
    change(h.render(), 'u', '7'); assert.equal(measurement(h.render()), undefined);
    h.props.direct = structuredClone(h.props.direct); assert.equal(input(h.render(), 'u').value, '2');
    change(h.render(), 'u', '7'); h.props.u = [-4, 4]; assert.equal(input(h.render(), 'u').value, '0');
    change(h.render(), 'u', '7'); h.props.id = 'different-owner'; assert.equal(input(h.render(), 'u').value, '0');
  } finally { h.cleanup(); }
});

test('Split uses strict original-axis interior without restricting endpoint Iso/knot native semantics', () => {
  const direct = seed(), before = structuredClone(direct), calls: (() => DirectGeometry)[] = [];
  const h = harness(SurfaceTools, { id: direct.objects[0].id, direct, run: (op: () => DirectGeometry) => calls.push(op), added: () => [] });
  try {
    for (const draft of ['-2', '6', '-3', '7', '', 'NaN', 'Infinity']) {
      change(h.render(), 'At u', draft); const view = h.render(), split = action(view, 'Split');
      assert.equal(input(view, 'At u').value, draft); assert.equal(input(view, 'At u')['aria-invalid'], true);
      assert.match(text(SurfaceParameter(parameter(view, 'At u').props)), /Split requires -2 < u < 6 \(endpoints excluded\)\./);
      assert.equal(split.disabled, true); (split.onClick as () => void)(); assert.equal(calls.length, 0);
      const finite = draft.trim() !== '' && Number.isFinite(Number(draft));
      assert.equal(action(view, 'Iso-curve').disabled, !finite); assert.equal(action(view, 'Insert knot').disabled, !finite);
      if (!finite) {
        (action(view, 'Iso-curve').onClick as () => void)(); (action(view, 'Insert knot').onClick as () => void)(); assert.equal(calls.length, 0);
      }
    }
    change(h.render(), 'At u', '6'); (action(h.render(), 'Iso-curve').onClick as () => void)();
    assert.equal(calls.length, 1); assert.doesNotThrow(() => calls.pop()!(), 'native Iso accepts the domain endpoint');
    change(h.render(), 'At u', '7'); (action(h.render(), 'Iso-curve').onClick as () => void)();
    assert.equal(calls.length, 1, 'finite outside input still reaches the native operation');
    assert.throws(() => calls.pop()!(), 'native Iso refuses outside its original domain');
    change(h.render(), 'At u', '6'); (action(h.render(), 'Insert knot').onClick as () => void)();
    assert.equal(calls.length, 1, 'endpoint knot semantics stay with the native operation'); calls.pop();
    change(h.render(), 'At u', '2'); let view = h.render(); assert.equal(action(view, 'Split').disabled, false);
    (action(view, 'Split').onClick as () => void)(); const split = calls.pop()!(); assert.ok(split.objects.length > direct.objects.length);
    assert.deepEqual(direct, before);
    const select = elements(view).find(element => element.props['aria-label'] === 'Surface direction')!;
    (select.props.onChange as (event: unknown) => void)({ target: { value: 'v' } }); view = h.render();
    assert.equal(input(view, 'At v').value, '4');
    for (const draft of ['1', '7']) { change(h.render(), 'At v', draft); assert.equal(action(h.render(), 'Split').disabled, true); }
    change(h.render(), 'At v', '4'); assert.equal(action(h.render(), 'Split').disabled, false);
    change(h.render(), 'At v', '8'); h.props.direct = structuredClone(direct); assert.equal(input(h.render(), 'At v').value, '4');
  } finally { h.cleanup(); }
});


test('blank and nonfinite Thickness drafts cannot silently reuse 2 or start Thicken', () => {
  const direct = seed(), before = structuredClone(direct), calls: unknown[][] = [];
  const props: ToolsProps = { id: direct.objects[0].id, direct, run() {}, added: () => [], onThicken: (...args) => { calls.push(args); } };
  const h = harness(SurfaceTools, props);
  const thickness = (view: View) => elements(view).find(element => element.props['aria-label'] === 'Thickness')!.props;
  const enter = (draft: string) => (thickness(h.render()).onChange as (event: unknown) => void)({ target: { value: draft } });
  try {
    assert.equal(thickness(h.render()).value, '2');
    for (const draft of ['', ' ', 'Infinity', '-Infinity', 'NaN']) {
      enter(draft); const view = h.render(), field = thickness(view), start = action(view, 'Thicken into a body');
      assert.equal(field.value, draft); assert.equal(field['aria-invalid'], true); assert.equal(start.disabled, true);
      const message = elements(view).find(element => element.props.id === field['aria-describedby']); assert.ok(message);
      assert.equal(text(message), 'Enter a finite thickness.'); assert.equal(message.props.role, 'status');
      assert.ok(String(start['aria-describedby']).split(/\s+/).includes(String(field['aria-describedby'])));
      assert.ok(String(start['aria-describedby']).split(/\s+/).includes('direct-thicken-scope-obj_1'));
      (start.onClick as () => void)(); assert.deepEqual(calls, []);
      assert.equal(thickness(h.render()).value, draft, 'leaving/re-rendering does not restore a hidden default');
    }
    enter('3'); let view = h.render(); assert.equal(thickness(view)['aria-invalid'], undefined);
    assert.equal(thickness(view)['aria-describedby'], undefined); assert.equal(action(view, 'Thicken into a body').disabled, false);
    (action(view, 'Thicken into a body').onClick as () => void)(); assert.deepEqual(calls, [[props.id, 3, 'normal']]);
    const side = elements(view).find(element => element.props['aria-label'] === 'Thicken side')!;
    (side.props.onChange as (event: unknown) => void)({ target: { value: 'both' } });
    enter('3.125'); view = h.render(); (action(view, 'Thicken into a body').onClick as () => void)();
    assert.deepEqual(calls[1], [props.id, 3.125, 'both']);
    for (const draft of ['0', '-1']) { enter(draft); assert.equal(action(h.render(), 'Thicken into a body').disabled, false, 'finite admission stays with the native editor'); }
    assert.deepEqual(direct, before);
    enter(''); props.direct = structuredClone(direct); assert.equal(thickness(h.render()).value, '2');
    assert.equal(thickness(h.render())['aria-invalid'], undefined, 'history reset does not retain an old field error');
    enter(''); const other = importSource(direct, source, 'Other surface'); props.direct = other; props.id = other.objects.at(-1)!.id;
    assert.equal(thickness(h.render()).value, '2', 'a different surface owns a fresh visible initial value');
  } finally { h.cleanup(); }
});

test('Extend requires an owned finite-positive raw draft and refuses stale numeric fallback', () => {
  const direct = seed(), before = structuredClone(direct), calls: (() => DirectGeometry)[] = [];
  const props: ToolsProps = { id: direct.objects[0].id, direct, run: op => { calls.push(op); }, added: () => [] };
  const h = harness(SurfaceTools, props);
  const field = () => elements(h.render()).find(e => e.props['aria-label'] === 'Extend by')!.props;
  const enter = (value: string) => (field().onChange as (event: unknown) => void)({ target: { value } });
  try {
    assert.equal(field().value, '5');
    for (const value of ['', ' ', '0', '-1', 'Infinity', 'NaN']) {
      enter(value);
      const view = h.render(), start = action(view, 'Extend');
      assert.equal(field().value, value); assert.equal(field()['aria-invalid'], true); assert.equal(start.disabled, true);
      assert.equal(start['aria-describedby'], field()['aria-describedby']);
      assert.equal(text(elements(view).find(e => e.props.id === field()['aria-describedby'])), 'Enter a finite positive extension distance.');
      (start.onClick as () => void)(); assert.equal(calls.length, 0);
    }
    enter('2.5'); assert.equal(action(h.render(), 'Extend').disabled, false);
    (action(h.render(), 'Extend').onClick as () => void)(); assert.equal(calls.length, 1);
    assert.deepEqual(direct, before);
    enter(''); props.direct = structuredClone(direct); assert.equal(field().value, '5');
    enter('9'); const other = importSource(direct, source, 'Other surface'); props.direct = other; props.id = other.objects.at(-1)!.id;
    assert.equal(field().value, '5');
  } finally { h.cleanup(); }
});

test('Region owns all four raw bounds and blocks blank/nonfinite scheduling without changing interval admission', () => {
  const direct = seed(), before = structuredClone(direct), calls: (() => DirectGeometry)[] = [];
  const props: ToolsProps = { id: direct.objects[0].id, direct, run: op => { calls.push(op); }, added: () => [] };
  const h = harness(SurfaceTools, props), labels = ['u from', 'u to', 'v from', 'v to'];
  const input = (view: View, label: string) => elements(view).find(e => e.props['aria-label'] === label)!.props;
  const change = (view: View, label: string, value: string) => (input(view, label).onChange as (event: unknown) => void)({ target: { value } });
  try {
    const initial = labels.map(label => input(h.render(), label).value);
    for (const label of labels) {
      for (const raw of ['', ' ', 'NaN', 'Infinity', '-Infinity']) {
        change(h.render(), label, raw); const view = h.render(), field = input(view, label), start = action(view, 'Extract region');
        assert.equal(field.value, raw); assert.equal(field['aria-invalid'], true); assert.equal(start.disabled, true);
        assert.equal(start['aria-describedby'], field['aria-describedby']);
        (start.onClick as () => void)(); assert.equal(calls.length, 0);
        props.direct = structuredClone(direct);
        assert.deepEqual(labels.map(name => input(h.render(), name).value), initial);
      }
    }
    for (const raw of ['0', '-1', '99']) {
      change(h.render(), 'u to', raw); assert.equal(action(h.render(), 'Extract region').disabled, false);
      (action(h.render(), 'Extract region').onClick as () => void)();
    }
    assert.equal(calls.length, 3, 'finite interval validity remains with the producer, without clamping');
    change(h.render(), 'v to', ''); const other = importSource(direct, source, 'Other surface'); props.direct = other; props.id = other.objects.at(-1)!.id;
    assert.deepEqual(labels.map(name => input(h.render(), name).value), initial);
    assert.deepEqual(direct, before);
  } finally { h.cleanup(); }
});


test('Move owns finite raw vector drafts by exact direct and stable selected IDs', () => {
  const direct = seed(), before = structuredClone(direct), calls: number[][] = [];
  const props: MoveProps = { direct, selected: [direct.objects[0].id], onMove: by => calls.push(by) };
  const h = harness(DirectMoveControls, props), labels = ['ΔX', 'ΔY', 'ΔZ'];
  const field = (label: string) => elements(h.render()).find(e => e.props['aria-label'] === label)!.props;
  const enter = (label: string, value: string) => (field(label).onChange as (e: unknown) => void)({ target: { value } });
  try {
    for (const label of labels) for (const raw of ['', ' ', 'NaN', 'Infinity', '-Infinity']) {
      enter(label, raw); const start = action(h.render(), 'Move');
      assert.equal(field(label).value, raw); assert.equal(field(label)['aria-invalid'], true); assert.equal(start.disabled, true);
      assert.equal(start['aria-describedby'], field(label)['aria-describedby']);
      (start.onClick as () => void)(); assert.deepEqual(calls, []);
      props.direct = structuredClone(direct); assert.deepEqual(labels.map(l => field(l).value), ['0', '0', '10']);
    }
    enter('ΔX', '-2.5'); enter('ΔY', '0'); enter('ΔZ', '2.5');
    props.selected = [...props.selected]; assert.equal(field('ΔX').value, '-2.5', 'new equivalent selection array preserves drafts');
    (action(h.render(), 'Move').onClick as () => void)(); assert.deepEqual(calls, [[-2.5, 0, 2.5]]);
    props.selected = ['other']; assert.deepEqual(labels.map(l => field(l).value), ['0', '0', '10']);
    assert.deepEqual(direct, before);
  } finally { h.cleanup(); }
});


test('remaining Transform drafts guard only their own operations and retain stable selection ownership', () => {
  const direct = seed(), calls: unknown[][] = [];
  const props: TransformProps = { direct, selected: ['a', 'b'], moveControls: null, onRotate: (...args) => calls.push(['Rotate', ...args]), onScale: n => calls.push(['Scale', n]), onStretch: n => calls.push(['Stretch', ...n]), onShear: (...args) => calls.push(['Shear', ...args]), onDuplicate: () => calls.push(['Duplicate']) };
  const h = harness(Transform, props);
  const labels = ['Angle °', 'Factor', '× X', '× Y', '× Z', 'Shear factor'], operations = ['Rotate', 'Scale', 'Stretch', 'Stretch', 'Stretch', 'Shear'];
  const field = (label: string) => {
    const child = elements(h.render()).find(e => e.type === TransformDraft && e.props.label === label)!;
    return elements(TransformDraft(child.props)).find(e => e.props['aria-label'] === label)!.props;
  };
  const enter = (label: string, value: string) => (field(label).onChange as (e: unknown) => void)({ target: { value } });
  try {
    for (let i = 0; i < labels.length; i++) for (const raw of ['', ' ', 'NaN', 'Infinity', '-Infinity']) {
      enter(labels[i], raw); const view = h.render();
      assert.equal(field(labels[i]).value, raw); assert.equal(field(labels[i])['aria-invalid'], true);
      for (const op of ['Rotate', 'Scale', 'Stretch', 'Shear']) assert.equal(Boolean(action(view, op).disabled), op === operations[i]);
      (action(view, operations[i]).onClick as () => void)(); assert.deepEqual(calls, []);
      assert.equal(Boolean(action(view, 'Duplicate').disabled), false);
      props.direct = structuredClone(direct); h.render();
    }
    enter('Angle °', '-45'); enter('Factor', '0'); enter('× X', '-1'); enter('× Y', '0'); enter('× Z', '1.25'); enter('Shear factor', '-0.5');
    props.selected = ['b', 'a']; assert.equal(field('Angle °').value, '-45');
    props.selected = [...props.selected]; assert.equal(field('Factor').value, '0');
    for (const op of ['Rotate', 'Scale', 'Stretch', 'Shear', 'Duplicate']) (action(h.render(), op).onClick as () => void)();
    assert.deepEqual(calls, [['Rotate', 'z', -45], ['Scale', 0], ['Stretch', -1, 0, 1.25], ['Shear', 'x', 'z', -0.5], ['Duplicate']]);
    props.selected = ['a']; assert.deepEqual(labels.map(l => field(l).value), ['90', '2', '1', '1', '2', '0.5']);
    enter('Factor', ''); props.direct = structuredClone(direct); assert.equal(field('Factor').value, '2');
  } finally { h.cleanup(); }
});
