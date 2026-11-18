import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidElement, type ReactElement } from 'react';
import { importSource, type DirectGeometry } from '@barocss/cad-model/engine/direct';
import { directExtendGuidance } from '../src/ui/directExtendGuidance';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}

test('Extend preflight matches the engine trim boundary without mutating metadata', () => {
  for (const trims of [undefined, [], [{ keep: 'outside', uv: [[0, 0], [1, 0], [0, 1]] }], null, {}, '', 0, false]) {
    const object = deepFreeze({ trims }), before = structuredClone(object);
    const result = directExtendGuidance(object);
    assert.equal(result.blocked, trims !== undefined && (!Array.isArray(trims) || trims.length > 0));
    assert.match(result.text, /does not preserve surface trims/);
    assert.match(result.text, /Untrim removes the existing trim boundaries as a separate explicit edit/);
    assert.match(result.text, /only if intended/);
    assert.deepEqual(object, before);
  }
  assert.equal(directExtendGuidance({}).blocked, false);
});

type Props = { children?: unknown; [key: string]: unknown };
type View = ReactElement<Props>;
type ToolsProps = { id: string; direct: DirectGeometry; run(op: () => DirectGeometry): void; added(): string[] };
type Hooks = { useState(value: unknown): [unknown, (next: unknown) => void]; useEffect(effect: () => void, deps: unknown[]): void };
const shared = globalThis as typeof globalThis & { __extendTrimHooks?: Hooks };
const studio = existsSync(resolve('src/ui/DirectPanel.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
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
const source = '@model test { version: 0; length-unit: mm; @surface #panel { type: nurbs; degree-u:1; degree-v:1; knots-u:[0,0,1,1]; knots-v:[0,0,1,1]; control-points:[[[0,0,0],[0,10,0]],[[20,0,0],[20,10,0]]]; weights:[[1,1],[1,1]]; } }';

// Real private UI component with a controlled hook scheduler. Calls the handler even when disabled.
// This does not qualify browser focus/ARIA rendering, Undo, or general native Extend geometry support.
test('trim preflight and distance guards agree in rendered props, descriptions and programmatic handlers', async () => {
  const old = shared.__extendTrimHooks, temporary = await mkdtemp(join(tmpdir(), 'cad-extend-trim-'));
  try {
    const outfile = join(temporary, 'panel.mjs');
    await build({ entryPoints: [join(studio, 'src/ui/DirectPanel.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'extend-trim-hooks', setup(builder) {
      builder.onLoad({ filter: /DirectPanel\.tsx$/ }, args => ({ contents: readFileSync(args.path, 'utf8') + '\nexport { SurfaceTools };', loader: 'tsx', resolveDir: dirname(args.path) }));
      builder.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/DirectPanel.tsx') ? { path: 'react', namespace: 'extend-trim-hooks' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'extend-trim-hooks' }, () => ({ contents: 'export const useState=(...a)=>globalThis.__extendTrimHooks.useState(...a),useEffect=(...a)=>globalThis.__extendTrimHooks.useEffect(...a);' }));
    } }] });
    const { SurfaceTools } = await import(pathToFileURL(outfile).href) as { SurfaceTools(props: ToolsProps): View };
    const seed = importSource({ sources: {}, objects: [] }, source, 'Synthetic Extend panel');
    for (const trims of [undefined, [], [{ keep: 'outside', uv: [[.2, .2], [.8, .2], [.8, .8], [.2, .8]] }], null, {}, '', 0, false]) {
      // Deliberately malformed trim values exercise defensive UI admission, not native file acceptance.
      const direct = structuredClone(seed);
      Object.assign(direct.objects[0], { trims });
      const before = structuredClone(direct), id = direct.objects[0].id;
      deepFreeze(direct);
      const states: unknown[] = [], deps: unknown[][] = [];
      let cursor = 0, effectCursor = 0, dirty = false, calls = 0, effects: (() => void)[] = [];
      shared.__extendTrimHooks = {
        useState(value) { const k = cursor++; if (!(k in states)) states[k] = value;
          return [states[k], next => { if (!Object.is(states[k], next)) { states[k] = next; dirty = true; } }]; },
        useEffect(effect, values) { const k = effectCursor++, prior = deps[k]; if (!prior || !values.every((v, i) => Object.is(v, prior[i]))) { deps[k] = values; effects.push(effect); } },
      };
      const props: ToolsProps = { direct, id, run() { calls++; }, added: () => [] };
      const render = () => {
        for (let n = 0; n < 10; n++) { cursor = effectCursor = 0; dirty = false;
          const view = SurfaceTools(props), pending = effects; effects = []; pending.forEach(effect => effect());
          if (!dirty) return view;
        } throw Error('SurfaceTools did not settle');
      };
      const find = (view: View, label: string) => {
        const element = elements(view).find(e => e.props['aria-label'] === label); assert.ok(element, label); return element.props;
      };
      const blocked = directExtendGuidance({ trims }).blocked;
      for (const draft of ['5', '', ' ', '0', '-1', 'NaN', 'Infinity', '2.5']) {
        const initial = render();
        (find(initial, 'Extend by').onChange as (event: unknown) => void)({ target: { value: draft } });
        const view = render(), button = find(view, 'Extend the surface'), field = find(view, 'Extend by');
        const numeric = draft.trim() !== '' && Number.isFinite(Number(draft)) && Number(draft) > 0;
        assert.equal(button.disabled, blocked || !numeric);
        assert.equal(field['aria-invalid'], numeric ? undefined : true);
        const scopeId = `direct-extend-scope-${encodeURIComponent(id)}`, distanceId = `direct-extend-distance-${encodeURIComponent(id)}`;
        const expected = [...(blocked ? [scopeId] : []), ...(!numeric ? [distanceId] : [])].join(' ') || undefined;
        assert.equal(button['aria-describedby'], expected);
        for (const description of expected?.split(' ') ?? []) assert.ok(elements(view).some(e => e.props.id === description));
        const note = elements(view).find(e => e.props['aria-label'] === 'Extend source scope');
        if (blocked) { assert.ok(note); assert.equal(note.props.role, 'note'); assert.match(text(note), /separate explicit edit/); }
        else assert.equal(note, undefined);
        const previousCalls = calls;
        (button.onClick as () => void)();
        assert.equal(calls, previousCalls + (!blocked && numeric ? 1 : 0));
        assert.deepEqual(direct, before, 'render and refused handler never remove trim boundaries or edit source');
      }
      // Immutable source replacement models the panel's recomputation, not a real Undo UI action.
      const whole = structuredClone(seed); whole.objects[0].trims = []; deepFreeze(whole);
      props.direct = whole;
      assert.equal(find(render(), 'Extend the surface').disabled, false);
      props.direct = direct;
      assert.equal(find(render(), 'Extend the surface').disabled, blocked);
      assert.deepEqual(direct, before);
    }
  } finally { shared.__extendTrimHooks = old; await rm(temporary, { recursive: true, force: true }); }
});

test('explicit source replacement and restoring prior trim metadata recompute guidance without automatic Untrim', () => {
  const trimmed = { trims: [{ keep: 'outside', uv: [[0, 0], [1, 0], [0, 1]] }] }, whole = { trims: [] };
  const before = structuredClone(trimmed);
  assert.equal(directExtendGuidance(trimmed).blocked, true);
  assert.equal(directExtendGuidance(whole).blocked, false);
  assert.equal(directExtendGuidance(trimmed).blocked, true);
  assert.deepEqual(trimmed, before);
});
