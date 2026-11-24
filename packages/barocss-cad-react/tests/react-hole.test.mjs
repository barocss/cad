/** Ordinary ReactDOM lifecycle; no Worker or GPU. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {loadSource} from './compile.mjs';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});globalThis.window=dom.window;globalThis.document=dom.window.document;Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const h=React.createElement;
async function setup(t){const api=await loadSource(t,'src/index.ts'),div=document.createElement('div');document.body.append(div);const root=createRoot(div),complete=[],errors=[];const lifecycle={dirty(){},invalid(error){errors.push(error);},complete(value){complete.push(value);},detached(){}};const render=children=>React.act(async()=>root.render(h(api.Part,{admission:'synchronous',lifecycle},children)));t.after(async()=>{await React.act(async()=>root.unmount());div.remove();});return{...api,render,complete,errors};}
const stock=f=>h(f.Extrude,{distance:20},h(f.Rectangle,{min:[0,0],max:[60,40]}));
test('leaf depth props update the same Hole and invalid recovery restores the exact document',async t=>{
 const f=await setup(t);let setDepth;
 function Plate(){const[depth,set]=React.useState(6);setDepth=set;return h(f.Hole,{center:[30,20],radius:4,depth},stock(f));}
 await f.render(h(Plate));const a=f.complete.at(-1);assert.equal(f.errors.length,0);
 await React.act(async()=>setDepth(10));assert.equal(f.complete.at(-1).doc.nodes.at(-1).depth,10);assert.deepEqual(f.complete.at(-1).doc.nodes.map(n=>n.id),a.doc.nodes.map(n=>n.id));
 const count=f.complete.length;await React.act(async()=>setDepth(NaN));assert.equal(f.complete.length,count);assert.equal(f.errors.at(-1).code,'INVALID_PARAMETER');await React.act(async()=>setDepth(6));assert.deepEqual(f.complete.at(-1).doc,a.doc);
});
test('forward solid refs produce a reusable Hole and mixed child/ref inputs refuse',async t=>{
 const f=await setup(t);
 function Shared(){const source=React.useRef(null),bore=React.useRef(null);return h(React.Fragment,null,h(f.Translate,{offset:[0,0,0],solid:bore}),h(f.Definitions,null,h(f.Hole,{ref:bore,solid:source,center:[30,20],radius:4,depth:6}),h(f.Extrude,{ref:source,distance:20},h(f.Rectangle,{min:[0,0],max:[60,40]}))));}
 await f.render(h(Shared));assert.equal(f.errors.length,0);assert.deepEqual(f.complete.at(-1).doc.nodes.map(n=>n.kind),['sketch','extrude','hole','translate']);
 await f.render(h(f.Hole,{solid:React.createRef(),center:[30,20],radius:4},stock(f)));assert.equal(f.errors.at(-1).code,'EXCLUSIVE_INPUT');
});

test('keyed Hole siblings retain mounted IDs when a Union reorders them',async t=>{
 const f=await setup(t),view=keys=>h(f.Union,null,keys.map(key=>h(f.Hole,{key,center:[30,20],radius:key==='a'?3:4,depth:6},stock(f))));
 await f.render(view(['a','b']));const ids=f.complete.at(-1).doc.nodes.filter(n=>n.kind==='hole').map(n=>n.id);await f.render(view(['b','a']));assert.equal(f.errors.length,0);assert.deepEqual(f.complete.at(-1).doc.nodes.filter(n=>n.kind==='hole').map(n=>n.id),ids.toReversed());
});
