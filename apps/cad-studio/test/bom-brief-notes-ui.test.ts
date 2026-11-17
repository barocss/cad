import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A recording UI boundary: native Model grouping/CSV contracts have separate tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const shared = globalThis as typeof globalThis & { __briefUi?: Loose };
const { build } = createRequire(join(process.cwd(), 'package.json'))('esbuild') as typeof import('esbuild');
const temp = await mkdtemp(join(tmpdir(), 'cad-brief-ui-'));
let Panel: (props: Loose) => Loose;
try {
  const outfile = join(temp, 'panel.mjs');
  await build({ entryPoints: [resolve('src/ui/BomBriefNotes.tsx')], outfile, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', logLevel: 'silent',
    plugins: [{ name: 'record', setup(b) {
      b.onResolve({ filter: /^(react(?:\/jsx-runtime)?|@barocss\/cad-model\/bom\/designBriefNotes|@\/components\/ui\/button|\.\/files)$/ }, a => ({ path: a.path, namespace: 'record' }));
      b.onLoad({ filter: /.*/, namespace: 'record' }, ({ path }) => ({ contents:
        path === 'react' ? 'export const useState=()=>[globalThis.__briefUi.state,v=>globalThis.__briefUi.state=v],useMemo=f=>f();'
          : path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment="fragment";'
          : path.includes('designBriefNotes') ? 'export const designBriefNotes=(...a)=>{globalThis.__briefUi.reads.push(a);return globalThis.__briefUi.result;},designBriefNotesCsv=(...a)=>{globalThis.__briefUi.exports.push(a);return globalThis.__briefUi.csv;};'
          : path === './files' ? 'export const downloadBytes=(...a)=>globalThis.__briefUi.downloads.push(a);'
          : 'export const Button="button";',
      }));
    } }],
  });
  ({ BomBriefNotes: Panel } = await import(pathToFileURL(outfile).href));
} finally { await rm(temp, { recursive: true, force: true }); }
const walk = (n: Loose): Loose[] => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(walk) : [n, ...walk(n.props?.children)];
const find = (n: Loose, label: string) => walk(n).find(e => e.props?.['aria-label'] === label);
const text = (n: Loose): string => typeof n === 'string' || typeof n === 'number' ? String(n) : !n ? '' : Array.isArray(n) ? n.map(text).join(' ') : text(n.props?.children);
function fixture() {
  const record = { state: null, reads: [] as Loose[], exports: [] as Loose[], downloads: [] as Loose[], result: { ok: true, lines: [{ itemNo: 1, parts: ['p1', 'p2', 'p3'], groups: [
    { parts: ['p1', 'p2'], state: 'note', field: { value: 'Intent A', basis: 'assumed', source: 'Synthetic source' } },
    { parts: ['p3'], state: 'absent' },
  ] }], excluded: [] }, csv: { ok: true, text: 'safe csv' } };
  shared.__briefUi = record;
  let current = true;
  const errors: Loose[] = [];
  const props = { doc: {}, data: {}, name: 'Synthetic', isCurrent: () => current, onError: (...a: Loose[]) => errors.push(a) };
  const render = () => Panel(props);
  const include = () => find(render(), 'Include design-brief notes').props.onChange({ currentTarget: { checked: true } });
  return { record, props, render, include, errors, stale: () => { current = false; } };
}
test('notes are opt-in, preserve groups and never imply absent confirmation', () => {
  const f = fixture();
  assert.equal(find(f.render(), 'Include design-brief notes').props.checked, false);
  assert.equal(f.record.reads.length, 0);
  f.include();
  const output = text(f.render()).replace(/\s+/g, ' ');
  for (const s of ['Different notes', 'p1, p2', 'p3', 'Intent A', 'assumed', 'Synthetic source', 'Confirmation: Not recorded', 'No design-brief note', 'not verified part instructions']) assert.ok(output.includes(s), s);
  assert.equal(f.record.exports.length, 0);
});
test('new document, data or name requires fresh opt-in; retained stale callbacks cannot export', () => {
  for (const field of ['doc', 'data', 'name'] as const) {
    const f = fixture(); f.include();
    if (field === 'name') f.props.name = 'Other'; else f.props[field] = {};
    assert.equal(find(f.render(), 'Include design-brief notes').props.checked, false);
  }
  const f = fixture(); f.include();
  const click = find(f.render(), 'Export design-brief notes').props.onClick;
  f.stale(); click();
  assert.equal(f.record.exports.length, 0); assert.equal(f.record.downloads.length, 0);
});
test('separate export checks current Model result and does not download a refusal', () => {
  const f = fixture(); f.include();
  find(f.render(), 'Export design-brief notes').props.onClick();
  assert.equal(f.record.downloads.length, 1);
  assert.equal(f.record.downloads[0][1], 'Synthetic design-brief notes.csv');
  f.record.csv = { ok: false, error: 'Current owner changed' } as Loose;
  find(f.render(), 'Export design-brief notes').props.onClick();
  assert.equal(f.record.downloads.length, 1);
  assert.equal(f.errors[0][1], 'Current owner changed');
});
