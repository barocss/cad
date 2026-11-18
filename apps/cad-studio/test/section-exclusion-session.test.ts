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

function rig(run: (render: (doc: Parameters<typeof SectionHook>[0], section: Section | null) => ReturnType<typeof SectionHook>) => void) {
  const previous = shared.__sectionExclusionHooks, slots: unknown[] = []; let index = 0;
  shared.__sectionExclusionHooks = {
    useState(value) {
      const i = index++; if (!(i in slots)) slots[i] = value;
      return [slots[i], (next: unknown) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo(make) { const i = index++; if (!(i in slots)) slots[i] = make(); return slots[i]; },
    useRef(value) { const i = index++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
  };
  try { run((doc, section) => { index = 0; return useSectionExclusion(doc, section); }); }
  finally { shared.__sectionExclusionHooks = previous; }
}

const plane: Section = { mode: 'plane', planes: [axisPlane('x', 0, 'positive')] };
test('display exclusions survive plane motion but retire on model/Close/mode boundaries without mutating documents', () => {
 const doc=emptyDoc(), changed={...doc, parameters:{x:1}}, before=JSON.stringify(doc);
 rig(render=>{
  let state=render(doc,plane);state.set(['p2','p2']);assert.deepEqual(render(doc,plane).ids,['p2']);
  assert.deepEqual(render(doc,{...plane,planes:[axisPlane('x',1,'positive')]}).ids,['p2']);
  assert.deepEqual(render(changed,plane).ids,[]);assert.deepEqual(render(doc,plane).ids,[],'Undo does not revive display state');
  state=render(doc,plane);state.set(['p2']);assert.deepEqual(render(doc,null).ids,[]);assert.deepEqual(render(doc,plane).ids,[]);
  state=render(doc,plane);state.set(['p2']);assert.deepEqual(render(doc,{...plane,mode:'box'}).ids,[]);assert.deepEqual(render(doc,plane).ids,[]);
 });
 assert.equal(JSON.stringify(doc),before);
});
test('exclusion selection requires exact unique top-level IDs, never promotes nested paths',()=>{
 const doc={...emptyDoc(),instances:[{id:'p1',name:'Part',doc:emptyDoc(),position:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number]}]};
 assert.equal(sectionExclusionReason(doc,['p1']),null);
 for(const selection of [[],['missing'],['p1/child'],['p1','missing']])assert.ok(sectionExclusionReason(doc,selection));
 assert.ok(sectionExclusionReason({...doc,instances:[...doc.instances,...doc.instances]},['p1']));
});
