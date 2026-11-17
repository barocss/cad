import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { build } = createRequire(resolve('package.json'))('esbuild') as typeof import('esbuild');
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { usePinnedMass as Hook } from '../src/state/usePinnedMass';

const holder = globalThis as typeof globalThis & { __massHooks?: { useState(v: unknown): unknown; useRef(v: unknown): unknown } };
test('session pin survives selection/candidate gates, becomes unavailable on pending, and clears across owner resets', async () => {
  const temp=await mkdtemp(join(tmpdir(),'cad-pin-mass-'));const old=holder.__massHooks;
  try {
    const file=join(temp,'hook.mjs');
    await build({entryPoints:[resolve('src/state/usePinnedMass.ts')],outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'hooks',setup(b){
      b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'hooks'}));
      b.onLoad({filter:/.*/,namespace:'hooks'},()=>({contents:'export const useState=v=>globalThis.__massHooks.useState(v),useRef=v=>globalThis.__massHooks.useRef(v);'}));
    }}]});
    const {usePinnedMass} = await import(pathToFileURL(file).href) as {usePinnedMass:typeof Hook};
    const slots:unknown[]=[];let cursor=0,dirty=false;
    holder.__massHooks={useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],(next:unknown)=>{slots[i]=next;dirty=true;}];},useRef(v){const i=cursor++;if(!(i in slots))slots[i]={current:v};return slots[i];}};
    const input:Parameters<typeof Hook>[0]={session:{},doc:{format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[10,10]},{kind:'extrude',id:'n1',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2},bodies:[{key:'b1',ref:{node:1,side:'solid'},topology:{kind:'solid',openShells:0,boundaryEdges:0},family:'planar',volume:1000,mass:2.7,centroid:[5,5,5],inertia:[[45,0,0],[0,45,0],[0,0,45]],massMethod:'planar-exact'} as Parameters<typeof Hook>[0]['bodies'][number]],current:true,canPin:true,selected:[0],material:'al6061'};
    const render=()=>{for(let i=0;i<5;i++){cursor=0;dirty=false;const result=usePinnedMass({...input});if(!dirty)return result;}throw Error('unsettled');};
    assert.equal(render().canPin,true);
    const sameOwner = render().pin; render(); sameOwner();
    assert.equal(render().result?.ok,true,'retained callback accepts a new wrapper with identical authority');
    render().clear();
    for (const key of ['session','doc','bodies','selected','current','canPin','material'] as const) {
      const before = {...input}, stale = render().pin;
      if (key === 'session') input.session = {};
      else if (key === 'doc') input.doc = {...input.doc};
      else if (key === 'bodies') input.bodies = [...input.bodies];
      else if (key === 'selected') input.selected = [];
      else if (key === 'material') input.material = 'steel';
      else input[key] = false;
      render(); stale(); assert.equal(render().pinned,false,`old ${key} callback refuses changed authority`);
      Object.assign(input,before); render();
    }
    render().pin();assert.equal(render().result?.ok,true);
    input.selected=[];input.canPin=false;assert.equal(render().pinned,true);assert.equal(render().result?.ok,true,'candidate gate does not replace accepted result');
    input.current=false;assert.equal(render().result?.ok,false);input.current=true;assert.equal(render().result?.ok,true);
    render().clear();assert.equal(render().pinned,false);input.bodies=[...input.bodies];assert.equal(render().pinned,false,'later mass array cannot recreate cleared pin');
    input.selected=[0];input.canPin=true;render().pin();assert.equal(render().pinned,true);
    input.session={};assert.equal(render().pinned,false);assert.equal(render().result,null);
  }finally{holder.__massHooks=old;await rm(temp,{recursive:true,force:true});}
});
