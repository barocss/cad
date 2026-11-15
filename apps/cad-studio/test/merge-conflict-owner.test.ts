import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidElement, type ReactElement } from 'react';
import { emptyDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { makeVersions, makeVersion, makeBranch } from '@barocss/cad-model/versions/log';
import { applyMerge, type MergeResult, type Resolutions } from '@barocss/cad-model/versions/merge';
import type { ProjectActions } from '../src/storage/useProject';

type PanelProps = Parameters<typeof import('../src/storage/VersionsPanel').VersionsPanel>[0];
type Props = { children?: unknown; [key: string]: unknown };
type View = ReactElement<Props>;
const hooks = globalThis as typeof globalThis & { __mergeState?: (initial: unknown) => [unknown, (next: unknown) => void]; __mergeMemo?: (compute: () => unknown, deps: unknown[]) => unknown };
const studio = existsSync(resolve('src/storage/VersionsPanel.tsx')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'merge-conflict-owner-'));
let VersionsPanel: (props: PanelProps) => View;
try {
  const outfile = join(temporary, 'panel.mjs');
  await build({ entryPoints: [join(studio, 'src/storage/VersionsPanel.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'panel-hooks', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/VersionsPanel.tsx') ? { path: 'react', namespace: 'panel-hooks' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'panel-hooks' }, () => ({ contents: 'export const useState=x=>globalThis.__mergeState(x),useMemo=(f,d)=>globalThis.__mergeMemo(f,d);' }));
    } }],
  });
  ({ VersionsPanel } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }
function elements(node: unknown): View[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const field = (node: View, name: string) => { const element = elements(node).find(e => e.props['aria-label'] === name); assert.ok(element, name); return element.props; };
function fixture() {
  const previous = { state: hooks.__mergeState, memo: hooks.__mergeMemo }, slots: unknown[] = [];
  let cursor = 0, dirty = false;
  hooks.__mergeState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(slots[i], value)) { slots[i] = value; dirty = true; } }]; };
  hooks.__mergeMemo = (compute, deps) => { const i = cursor++, old = slots[i] as { deps: unknown[]; value: unknown } | undefined;
    if (!old || deps.some((value, k) => !Object.is(value, old.deps[k]))) slots[i] = { deps, value: compute() };
    return (slots[i] as { value: unknown }).value;
  };
  const base = { ...emptyDoc(), bodies: { b1: { name: 'Base' } } };
  let log = makeVersions(base, { at: '2026-11-01T00:00:00Z' });
  for (const name of ['name-side', 'gamma-side']) log = makeBranch(log, name);
  for (const [i, [branch, name]] of [['main', 'Alpha'], ['name-side', 'Beta'], ['gamma-side', 'Gamma']].entries()) log = makeVersion({ ...log, current: branch }, { ...base, bodies: { b1: { name } } }, { at: `2026-11-01T00:0${i + 1}:00Z` }).log;
  log = { ...log, current: 'main' };
  const doc = { ...base, bodies: { b1: { name: 'Alpha' } } }, opened: StudioDoc[] = [], calls: { from: string; resolve?: Resolutions }[] = [];
  let intercept: ((from: string, working: StudioDoc, resolve?: Resolutions) => Promise<MergeResult | null>) | undefined;
  let latest: Promise<MergeResult | null>;
  const view = { store: { kind: 'browser', name: 'Project' }, part: 'part.bcad', parts: [{ path: 'part.bcad' }], log, offered: null } as ProjectActions['view'];
  const project = { view, merge(from: string, working: StudioDoc, resolve?: Resolutions) { calls.push({ from, resolve }); latest = intercept ? intercept(from, working, resolve) : Promise.resolve(applyMerge(view.log!, { from, working, resolve, at: '2026-11-01T00:10:00Z' })); return latest; } } as ProjectActions;
  const props: PanelProps = { project, doc, comparing: null, onMakeVersion: async () => true, onOpen: next => opened.push(next), onCompare() {}, onInsert() {}, evaluate: async () => null };
  const render = () => { for (let i = 0; i < 10; i++) { cursor = 0; dirty = false; const node = VersionsPanel(props); if (!dirty) return node; } throw new Error('Owner did not settle'); };
  return { view, props, opened, calls, render,
    async merge() { (field(render(), 'Merge').onClick as () => void)(); await latest; await Promise.resolve(); },
    async apply() { const p = field(render(), 'Merge with these answers'); assert.equal(p.disabled, false); (p.onClick as () => void)(); await latest; await Promise.resolve(); },
    choose() { const c = elements(render()).find(e => e.props.conflict); assert.ok(c); (c.props.onAnswer as (side: string) => void)('theirs'); },
    source(value: string) { (field(render(), 'Merge from').onChange as (event: unknown) => void)({ target: { value } }); render(); },
    intercept(next: typeof intercept) { intercept = next; },
    cleanup() { hooks.__mergeState = previous.state; hooks.__mergeMemo = previous.memo; },
  };
}
test('target change retires previous same-key answers and shows fresh Beta/Gamma conflict values', async () => {
  const h = fixture();
  try {
    await h.merge(); assert.equal(field(h.render(), 'Merge with these answers').disabled, true);
    h.choose(); assert.equal(field(h.render(), 'Merge with these answers').disabled, false);
    h.source('gamma-side'); assert.ok(!elements(h.render()).some(e => e.props['aria-label'] === 'Merge conflicts'));
    await h.merge(); assert.equal(field(h.render(), 'Merge with these answers').disabled, true);
    const c = elements(h.render()).find(e => e.props.conflict)!; assert.equal((c.props.conflict as { theirs: { name: string } }).theirs.name, 'Gamma');
    h.choose(); await h.apply(); assert.equal(h.opened[0].bodies?.b1.name, 'Gamma'); assert.equal(h.calls.at(-1)?.from, 'gamma-side');
  } finally { h.cleanup(); }
});
test('document, store, path, current branch and either head changes retire conflict answers', async () => {
  for (const change of ['doc', 'store', 'part', 'current', 'ours', 'theirs']) {
    const h = fixture();
    try {
      await h.merge(); h.choose();
      if (change === 'doc') h.props.doc = structuredClone(h.props.doc);
      else if (change === 'store') h.view.store = { ...h.view.store! };
      else if (change === 'part') h.view.part = 'other.bcad';
      else if (change === 'current') h.view.log = { ...h.view.log!, current: 'gamma-side' };
      else if (change === 'ours') h.view.log = makeVersion(h.view.log!, { ...h.props.doc, bodies: { b1: { name: 'Alpha 2' } } }, { at: '2026-11-01T00:20:00Z' }).log;
      else h.view.log = { ...makeVersion({ ...h.view.log!, current: 'name-side' }, { ...h.props.doc, bodies: { b1: { name: 'Beta 2' } } }, { at: '2026-11-01T00:20:00Z' }).log, current: 'main' };
      assert.ok(!elements(h.render()).some(e => e.props['aria-label'] === 'Merge conflicts'), change); assert.equal(h.opened.length, 0);
    } finally { h.cleanup(); }
  }
});
test('late conflicts retain their captured old owner and cannot populate a newly selected target', async () => {
  const h = fixture();
  try {
    let release!: (result: MergeResult) => void;
    const pending = new Promise<MergeResult>(resolve => { release = resolve; });
    h.intercept(async () => pending); const done = h.merge(); h.source('gamma-side');
    h.intercept(undefined); await h.merge(); h.choose();
    release({ conflicts: [{ code: 'FIELD_BOTH', where: 'bodies:b1', message: 'old Beta', ours: { name: 'Alpha' }, theirs: { name: 'Beta' } }] });
    await done;
    assert.equal(field(h.render(), 'Merge with these answers').disabled, false, 'late old reply cannot erase the new target answer');
    const current = elements(h.render()).find(e => e.props.conflict)!;
    assert.equal(current.props.answer, 'theirs'); assert.equal((current.props.conflict as { theirs: { name: string } }).theirs.name, 'Gamma');
  } finally { h.cleanup(); }
});
test('successful merge follows the original receipt contract even after project.merge advances the head', async () => {
  const h = fixture();
  try {
    await h.merge(); h.choose();
    h.intercept(async (from, working, resolve) => {
      const r = applyMerge(h.view.log!, { from, working, resolve, at: '2026-11-01T00:30:00Z' }); assert.ok('doc' in r);
      h.view.log = r.log; h.render(); // The real action commits its log before returning.
      return r;
    });
    await h.apply(); assert.equal(h.opened.length, 1); assert.equal(h.opened[0].bodies?.b1.name, 'Beta');
    assert.ok(!elements(h.render()).some(e => e.props['aria-label'] === 'Merge conflicts'));
  } finally { h.cleanup(); }
});
