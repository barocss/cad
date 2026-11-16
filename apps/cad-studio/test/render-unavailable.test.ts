import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {isValidElement, type ReactElement} from 'react';
import {defaultRender} from '@barocss/cad-model/engine/render';
type View = ReactElement<Record<string, unknown>>;
const studio=process.cwd().endsWith('cad-studio')?process.cwd():resolve('apps/cad-studio');
const {build}=createRequire(join(studio,'package.json'))('esbuild') as typeof import('esbuild');
const shared=globalThis as typeof globalThis & {__renderTestHooks?: {state(v:unknown):unknown;ref(v:unknown):unknown}};
const dir=await mkdtemp(join(tmpdir(),'render-unavailable-'));
let Panel: (props: Record<string,unknown>)=>View;
try {
 const file=join(dir,'panel.mjs');
 await build({entryPoints:[join(studio,'src/ui/RenderPanel.tsx')],outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'panel-hooks',setup(b){
  b.onResolve({filter:/^react$/},a=>a.importer.endsWith('/RenderPanel.tsx')?{path:'react',namespace:'panel-hooks'}:undefined);
  b.onLoad({filter:/.*/,namespace:'panel-hooks'},()=>({contents:'export const useState=v=>globalThis.__renderTestHooks.state(v),useRef=v=>globalThis.__renderTestHooks.ref(v),useId=()=>"unavailable-test",useEffect=()=>{},useLayoutEffect=()=>{};'}));
 }}]});
 ({RenderPanel:Panel}=await import(pathToFileURL(file).href));
}finally{await rm(dir,{recursive:true,force:true});}
function nodes(v:unknown):View[]{if(Array.isArray(v))return v.flatMap(nodes);if(!isValidElement(v))return [];const e=v as View;return [e,...nodes(e.props.children)];}
test('WebGPU trace creation failure remains visible and retry clears it without a stale busy lock',async()=>{
 const states:unknown[]=[],refs:{current:unknown}[]=[];let si=0,ri=0,attempt=0;
 shared.__renderTestHooks={state(initial){const i=si++;if(!(i in states))states[i]=i===0?'path-tracing':initial;return [states[i],(v:unknown)=>{states[i]=typeof v==='function'?(v as (x:unknown)=>unknown)(states[i]):v;}];},ref(initial){const i=ri++;return refs[i]??(refs[i]={current:initial});}};
 const props={render:defaultRender(),selectedKeys:[],available:true,geometryReady:true,fov:45,imageName:'test.png',onChange(){},onSaveCamera(){},onUseCamera(){},onExport(){},onFov(){},onPickFocus(){},async onCreatePathTrace(){attempt++;throw new Error(attempt===1?'Test adapter session refusal':'Test retry refusal');}};
 const render=()=>{si=0;ri=0;return nodes(Panel(props));};
 const start=(tree:View[])=>tree.find(e=>e.props['aria-label']==='Start path tracing')!;
 let tree=render();assert.equal(start(tree).props.disabled,false);
 (start(tree).props.onClick as ()=>void)();await new Promise(r=>setImmediate(r));tree=render();
 assert.equal(tree.find(e=>e.props.role==='alert')?.props.children,'Test adapter session refusal');
 assert.equal(start(tree).props.disabled,false);
 (start(tree).props.onClick as ()=>void)();tree=render();assert.equal(tree.some(e=>e.props.role==='alert'),false);assert.equal(start(tree).props.disabled,true);
 await new Promise(r=>setImmediate(r));tree=render();assert.equal(tree.find(e=>e.props.role==='alert')?.props.children,'Test retry refusal');assert.equal(start(tree).props.disabled,false);
 delete shared.__renderTestHooks;
});
