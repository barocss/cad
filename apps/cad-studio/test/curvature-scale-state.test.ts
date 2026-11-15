import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { useDirectCurveCurvature as DirectHook } from '../src/app/useDirectCurveCurvature';
import type { useEdgeCurvature as EdgeHook } from '../src/app/useEdgeCurvature';
import type { ContinuityReply } from '@barocss/cad-model/engine/edgeContinuity';
// Actual hooks; controlled React scheduling and native completion timing only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const shared = globalThis as typeof globalThis & { __mateHooks?: Loose };
const studio=process.cwd();
const {build}=createRequire(join(studio,'package.json'))('esbuild') as typeof import('esbuild');
const temporary=await mkdtemp(join(tmpdir(),'curvature-hooks-'));
let useDirectCurveCurvature:typeof DirectHook,useEdgeCurvature:typeof EdgeHook;
try {
 await build({entryPoints:[resolve(studio,'src/app/useDirectCurveCurvature.ts'),resolve(studio,'src/app/useEdgeCurvature.ts')],outdir:temporary,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'hooks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'hooks'}));b.onLoad({filter:/.*/,namespace:'hooks'},()=>({contents:'export const useState=(...a)=>globalThis.__mateHooks.useState(...a),useRef=(...a)=>globalThis.__mateHooks.useRef(...a),useMemo=(...a)=>globalThis.__mateHooks.useMemo(...a),useLayoutEffect=(...a)=>globalThis.__mateHooks.useEffect(...a);'}));}}]});
 ({useDirectCurveCurvature}=await import(pathToFileURL(join(temporary,'useDirectCurveCurvature.mjs')).href));
 ({useEdgeCurvature}=await import(pathToFileURL(join(temporary,'useEdgeCurvature.mjs')).href));
}finally{await rm(temporary,{recursive:true,force:true});}
function harness() {
  const old = shared.__mateHooks, slots: Loose[] = [], effects = new Map<number, () => void>();
  let cursor = 0;
  const same = (a: Loose[], b: Loose[]) => a?.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const memo = (make: () => Loose, deps: Loose[]) => {
    const i = cursor++, before = slots[i];
    if (!before || !same(before.deps, deps)) slots[i] = { deps, value: make() };
    return slots[i].value;
  };
  shared.__mateHooks = {
    useRef(value: Loose) { return slots[cursor++] ??= { current: value }; },
    useState(value: Loose) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [slots[i], (next: Loose) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo: memo,
    useCallback: (callback: Loose, deps: Loose[]) => memo(() => callback, deps),
    useEffect(make: () => Loose, deps: Loose[]) {
      const i = cursor++, before = slots[i];
      if (!before || !same(before.deps, deps)) {
        effects.set(i, () => { before?.cleanup?.(); slots[i] = { deps, cleanup: make() }; });
      }
    },
  };
  return {render<T>(fn:()=>T):T {cursor=0;const result=fn();const jobs=[...effects.values()];effects.clear();for(const job of jobs)job();return result;},cleanup(){for(const slot of slots)slot?.cleanup?.();shared.__mateHooks=old;}};
}
const measurement={unit:'1/mm' as const,minimum:.1,maximum:.8,spans:[]};
const curve={...measurement,edgeId:'e1',edgeName:'edge'};
const picked: NonNullable<Parameters<typeof EdgeHook>[1]>={edgeId:'e1',faces:['f1','f2']};
function held(){let resolve!:(value:ContinuityReply)=>void;const promise=new Promise<ContinuityReply>(r=>{resolve=r;});return{promise,resolve};}
test('direct same selection hide/show keeps scale; edit recomputes; id/generation reset',()=>{
 const h=harness();let generation=1,id:string|null='a',direct={sources:{},objects:[]},calls=0;
 const measure:Parameters<typeof DirectHook>[4]=()=>{calls++;return measurement;};
 const render=()=>h.render(()=>useDirectCurveCurvature(generation,id,true,direct,measure));
 try{render().show();render().setScale(8);assert.equal(render().overlay?.scale,8);render().clear();assert.equal(render().overlay,null);render().show();assert.equal(render().overlay?.scale,8);
 const before=calls;direct={...direct};assert.equal(render().overlay?.scale,8);assert.equal(calls,before+1);
 id='b';assert.equal(render().overlay,null);render().show();assert.equal(render().overlay?.scale,4);render().setScale(16);generation++;assert.equal(render().overlay,null);render().show();assert.equal(render().overlay?.scale,4);
 id=null;assert.equal(render().overlay,null);id='b';render().show();assert.equal(render().overlay?.scale,4);for(const bad of [NaN,Infinity,-1,10001])render().setScale(bad);assert.equal(render().overlay?.scale,4);
 }finally{h.cleanup();}
});
test('native pending scale survives completion; hide invalidates result/error and preserves scale',async()=>{
 const h=harness(),owner={},requests:ReturnType<typeof held>[]=[];const read=()=>{const r=held();requests.push(r);return r.promise;};const render=()=>h.render(()=>useEdgeCurvature(owner,picked,read));
 try{const first=render().show();render().setScale(8);assert.equal(render().pending,true);requests[0].resolve({curve});await first;assert.equal(render().overlay?.scale,8);
 render().clear();assert.equal(render().overlay,null);assert.equal(render().pending,false);const second=render().show();render().setScale(16);render().clear();requests[1].resolve({curve});await second;assert.equal(render().overlay,null);
 const third=render().show();requests[2].resolve({curve});await third;assert.equal(render().overlay?.scale,16);render().clear();const fourth=render().show();requests[3].resolve({error:'refusal'});await fourth;assert.equal(render().error,'refusal');render().clear();assert.equal(render().error,undefined);const fifth=render().show();requests[4].resolve({curve});await fifth;assert.equal(render().overlay?.scale,16);
 }finally{h.cleanup();}
});
test('native owner/new request invalidates stale response and resets scale; unmount invalidates pending',async()=>{
 const h=harness();let owner:object|null={};const requests:ReturnType<typeof held>[]=[];const read=()=>{const r=held();requests.push(r);return r.promise;};const render=()=>h.render(()=>useEdgeCurvature(owner,picked,read));
 try{const first=render().show();render().setScale(8);owner={};assert.equal(render().overlay,null);requests[0].resolve({curve});await first;assert.equal(render().overlay,null);
 const second=render().show(),third=render().show();render().setScale(32);requests[1].resolve({error:'stale'});await second;assert.equal(render().error,undefined);requests[2].resolve({curve});await third;assert.equal(render().overlay?.scale,32);
 owner=null;assert.equal(render().overlay,null);owner={};const fourth=render().show();requests[3].resolve({curve});await fourth;assert.equal(render().overlay?.scale,4);const fifth=render().show();h.cleanup();requests[4].resolve({curve});await fifth;
 }finally{h.cleanup();}
});
