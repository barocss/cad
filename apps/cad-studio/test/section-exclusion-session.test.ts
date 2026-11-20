import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import type { useSectionExclusion as SectionHook } from '../src/viewport/useSectionExclusion';
import { sectionExclusionReason } from '../src/viewport/useSectionExclusion';
import { axisPlane, type Section } from '../src/viewport/sectionView';
// Run the real state hook with deterministic React slots, including the render gap
// between Escape and the next pointer event. This does not simulate DOM focus.
type Hooks = { useState(value: unknown): unknown; useRef(value: unknown): unknown; useMemo(make: () => unknown): unknown };
type Doc = Parameters<typeof SectionHook>[0];
type Controls = ReturnType<typeof SectionHook>;
type RenderOptions = { selected?: readonly string[]; ready?: boolean };

const shared = globalThis as typeof globalThis & { __sectionExclusionHooks?: Hooks };
const studio = existsSync(resolve('src/viewport/useSectionExclusion.ts')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'section-exclusion-'));
let useSectionExclusion: typeof SectionHook;
try {
  const outfile = join(temporary, 'section.mjs');
  await build({ entryPoints: [join(studio, 'src/viewport/useSectionExclusion.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'section-hooks', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'section-hooks' }));
      builder.onLoad({ filter: /.*/, namespace: 'section-hooks' }, () => ({ contents:
        'export const useState=(v)=>globalThis.__sectionExclusionHooks.useState(v),useRef=(v)=>globalThis.__sectionExclusionHooks.useRef(v),useMemo=(f)=>globalThis.__sectionExclusionHooks.useMemo(f),useCallback=(f)=>f,useSyncExternalStore=(_s,get)=>get();' }));
    } }],
  });
  ({ useSectionExclusion } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }

function rig(run: (render: (doc: Doc, section: Section | null, options?: RenderOptions) => Controls, notices: string[]) => void) {
  const docNow = { current: emptyDoc() }, sectionRef = { current: null as Section | null };
  const notices: string[] = [];
  const previous = shared.__sectionExclusionHooks, slots: unknown[] = []; let index = 0;
  shared.__sectionExclusionHooks = {
    useState(value) {
      const i = index++; if (!(i in slots)) slots[i] = value;
      return [slots[i], (next: unknown) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo(make) { const i = index++; if (!(i in slots)) slots[i] = make(); return slots[i]; },
    useRef(value) { const i = index++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
  };
  try {
    run((doc, section, { selected = ['p1'], ready = true } = {}) => {
      index = 0;
      docNow.current = doc;
      sectionRef.current = section;
      return useSectionExclusion(doc, section, {
        selected, ready, onNotice: notice => notices.push(notice.hint),
        isCurrent: () => docNow.current === doc && sectionRef.current === section,
      });
    }, notices);
  } finally { shared.__sectionExclusionHooks = previous; }
}

const plane: Section = { mode: 'plane', planes: [axisPlane('x', 0, 'positive')] };
const doc = {
  ...emptyDoc(),
  instances: ['p1', 'p2'].map(id => ({ id, name: 'Part ' + id, doc: emptyDoc(),
    position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] })),
};
const moved: Section = { ...plane, planes: [axisPlane('x', 1, 'positive')] };

test('display exclusions survive plane motion but retire on model, Close and mode boundaries', () => {
  const changed = { ...doc, parameters: { x: 1 } }, before = JSON.stringify(doc);
  rig(render => {
    render(doc, plane, { selected: ['p1', 'p1'] }).excludeSelected();
    assert.deepEqual(render(doc, plane).ids, ['p1']);
    assert.deepEqual(render(doc, moved).labels, [{ id: 'p1', name: 'Part p1' }]);
    assert.deepEqual(render(changed, moved).ids, []);
    assert.deepEqual(render(doc, plane).ids, [], 'Undo does not revive display state');

    render(doc, plane).excludeSelected();
    assert.deepEqual(render(doc, null).ids, []);
    assert.deepEqual(render(doc, plane).ids, []);

    render(doc, plane).excludeSelected();
    assert.deepEqual(render(doc, { ...plane, mode: 'box' }).ids, []);
    assert.deepEqual(render(doc, plane).ids, []);
  });
  assert.equal(JSON.stringify(doc), before);
});

test('exclusion actions check the exact section and document that supplied the controls', () => {
  rig((render, notices) => {
    render(doc, plane).excludeSelected();
    const previousPlane = render(doc, plane, { selected: ['p2'] });
    render(doc, moved);
    previousPlane.excludeSelected();
    previousPlane.restore('p1');
    previousPlane.clear();
    assert.deepEqual(render(doc, moved).ids, ['p1']);

    const previousDoc = render(doc, moved, { selected: ['p2'] });
    const changed = { ...doc };
    render(changed, moved).excludeSelected();
    previousDoc.excludeSelected();
    previousDoc.restore('p1');
    previousDoc.clear();
    assert.deepEqual(render(changed, moved).ids, ['p1']);
    assert.deepEqual(notices, []);

    const busy = render(changed, moved, { selected: ['p2'], ready: false });
    assert.equal(busy.selectionReason, 'Wait for a current model before excluding instances.');
    busy.excludeSelected();
    const blocked = render(changed, moved, { selected: ['p2/child'] });
    blocked.excludeSelected();
    assert.deepEqual(notices, [blocked.selectionReason]);
    assert.deepEqual(render(changed, moved).ids, ['p1']);
    render(changed, moved, { ready: false }).restore('p1');
    assert.deepEqual(render(changed, moved).ids, []);
    render(changed, moved).excludeSelected();
    render(changed, moved, { ready: false }).clear();
    assert.deepEqual(render(changed, moved).ids, []);
  });
});

test('exclusion selection requires exact unique top-level IDs and refuses nested paths', () => {
  assert.equal(sectionExclusionReason(doc, ['p1']), null);
  for (const selection of [[], ['missing'], ['p1/child'], ['p1', 'missing']]) {
    assert.ok(sectionExclusionReason(doc, selection));
  }
  assert.ok(sectionExclusionReason({ ...doc, instances: [...doc.instances, ...doc.instances] }, ['p1']));
});
