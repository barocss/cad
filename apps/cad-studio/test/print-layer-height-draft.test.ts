import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidElement, type ReactElement } from 'react';

type Props = { value?: number; resetKey?: unknown; onCommit(value: number): void };
type ElementProps = { children?: unknown; [key: string]: unknown };
type View = ReactElement<ElementProps>;
const shared = globalThis as typeof globalThis & { __printHeightState?: (initial: unknown) => [unknown, (next: unknown) => void] };
const studio = existsSync(resolve('src/viewport/PrintLayerHeight.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'print-height-draft-'));
let PrintLayerHeight: (props: Props) => View;
try {
  const outfile = join(temporary, 'field.mjs');
  await build({ entryPoints: [join(studio, 'src/viewport/PrintLayerHeight.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'height-state', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/PrintLayerHeight.tsx') ? { path: 'react', namespace: 'height-state' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'height-state' }, () => ({ contents: 'export const useState=initial=>globalThis.__printHeightState(initial),useId=()=>"print-height-status";' }));
    } }],
  });
  ({ PrintLayerHeight } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }
function elements(node: unknown): View[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<ElementProps>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function input(view: View) { return elements(view).find(element => element.props['aria-label'] === 'Print layer height (mm)')!.props; }
function fixture(accept = true, value: number | undefined = 0.301) {
  const old = shared.__printHeightState, states: unknown[] = [], commits: number[] = [];
  let cursor = 0, dirty = false;
  shared.__printHeightState = initial => { const index = cursor++; if (!(index in states)) states[index] = initial;
    return [states[index], next => { if (!Object.is(next, states[index])) { states[index] = next; dirty = true; } }]; };
  const props: Props = { value, resetKey: {}, onCommit: next => { commits.push(next); if (accept) { props.value = next; props.resetKey = {}; } } };
  const render = () => { for (let i = 0; i < 10; i++) { cursor = 0; dirty = false; const view = PrintLayerHeight(props); if (!dirty) return view; } throw new Error('Draft did not settle'); };
  return { props, commits, render,
    type(value: string) { (input(render()).onChange as (event: unknown) => void)({ target: { value } }); },
    key(key: string, isComposing = false) { (input(render()).onKeyDown as (event: unknown) => void)({ key, nativeEvent: { isComposing }, preventDefault() {}, stopPropagation() {} }); },
    blur() { (input(render()).onBlur as () => void)(); },
    cleanup() { shared.__printHeightState = old; },
  };
}

// Actual field and controlled scheduling. Raw intermediate strings here are
// handler inputs, not proof that Chrome retains a particular partial decimal.
test('clearing and sequential replacement never appends the old saved value; Enter commits once and blur does not repeat', () => {
  const h = fixture();
  try {
    for (const draft of ['', '0', '0.', '0.3', '0.35']) {
      h.type(draft); assert.equal(input(h.render()).value, draft); assert.deepEqual(h.commits, []);
      assert.match(text(h.render()), /Preview uses 0.301 mm/);
    }
    assert.match(text(h.render()), /Not applied/); assert.equal(input(h.render())['aria-invalid'], undefined);
    h.key('Enter'); assert.deepEqual(h.commits, [0.35]); assert.equal(input(h.render()).value, '0.35');
    assert.equal(input(h.render())['aria-describedby'], undefined); h.blur(); assert.deepEqual(h.commits, [0.35]);
    h.type('0.4'); h.blur(); assert.deepEqual(h.commits, [0.35, 0.4]);
  } finally { h.cleanup(); }
});

test('invalid drafts stay visibly unapplied with a linked positive condition and the actual saved preview value', () => {
  const h = fixture();
  try {
    for (const draft of ['', ' ', '0', '-1', 'Infinity', 'NaN', '1e']) {
      h.type(draft); h.key('Enter'); h.blur(); const view = h.render(), field = input(view);
      assert.equal(field.value, draft); assert.equal(field['aria-invalid'], true);
      const status = elements(view).find(element => element.props.id === field['aria-describedby']); assert.ok(status);
      assert.equal(status.props.role, 'status'); assert.equal(text(status), 'Enter a finite positive layer height. Preview uses 0.301 mm.');
      assert.deepEqual(h.commits, []); assert.equal(h.props.value, 0.301);
    }
    h.key('Escape'); h.blur(); assert.equal(input(h.render()).value, '0.301'); assert.deepEqual(h.commits, []);
    assert.equal(input(h.render())['aria-invalid'], undefined);
    h.type('0.35'); h.key('Escape'); h.blur(); assert.deepEqual(h.commits, [], 'valid but canceled draft does not add an undo edit');
  } finally { h.cleanup(); }
});

test('history/document ownership and toggle changes reset drafts, not ordinary worker rerenders', () => {
  const h = fixture();
  try {
    h.type(''); assert.equal(input(h.render()).value, ''); assert.equal(input(h.render()).value, '', 'stable owner retains the draft across renders');
    h.props.resetKey = {}; assert.equal(input(h.render()).value, '0.301', 'same-value new document cancels old draft');
    for (const value of [0.35, 0.301, 0.35]) {
      h.type('-1'); h.props.value = value; h.props.resetKey = {};
      assert.equal(input(h.render()).value, String(value)); assert.equal(input(h.render())['aria-invalid'], undefined);
    }
    h.type(''); h.props.value = undefined; h.props.resetKey = {};
    assert.equal(input(h.render()).disabled, true); assert.equal(input(h.render()).value, '0.2'); assert.doesNotMatch(text(h.render()), /Preview uses/);
    h.key('Enter'); assert.deepEqual(h.commits, []);
    h.props.value = 0.2; h.props.resetKey = {}; assert.equal(input(h.render()).disabled, false); assert.equal(input(h.render()).value, '0.2');
  } finally { h.cleanup(); }
});

test('exact positive values commit without rounding and rejected commits never masquerade as saved', () => {
  const h = fixture();
  try {
    for (const draft of ['0.0001', '0.12345678901234568', String(Number.MIN_VALUE), String(Number.MAX_VALUE)]) {
      h.type(draft); h.key('Enter'); assert.equal(h.commits.at(-1), Number(draft)); assert.equal(h.props.value, Number(draft));
      assert.equal(input(h.render()).min, Number.MIN_VALUE); assert.equal(input(h.render()).step, 'any');
    }
  } finally { h.cleanup(); }
  const refused = fixture(false);
  try {
    refused.type('0.35'); refused.key('Enter'); assert.deepEqual(refused.commits, [0.35]);
    assert.equal(refused.props.value, 0.301); assert.match(text(refused.render()), /Not applied. Preview uses 0.301 mm/);
    refused.key('Escape'); refused.blur(); assert.deepEqual(refused.commits, [0.35]);
  } finally { refused.cleanup(); }
});

test('composing Enter does not apply, and unmount discards an unapplied draft', () => {
  const h = fixture();
  try { h.type('0.35'); h.key('Enter', true); assert.deepEqual(h.commits, []); } finally { h.cleanup(); }
  const reopened = fixture();
  try { assert.equal(input(reopened.render()).value, '0.301'); assert.deepEqual(reopened.commits, []); } finally { reopened.cleanup(); }
});
