import test from 'node:test';
import assert from 'node:assert/strict';
import { filletEdgeEndpoints, activeFilletEndpoints } from '../src/app/filletEndpoints';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
const edge:DisplayEdge={index:0,faces:[0,1],a:[0,0,0],b:[10,0,0],straight:true,axis:'x',names:['edge'],nativeLine:true};
const node:Extract<ModelNode,{kind:'fillet'}>={kind:'fillet',parent:{node:1,side:'solid'},edges:['edge'],radius:1,radii:[{at:[0,0,0],radius:1,atEnd:true},{at:[10,0,0],radius:3,atEnd:true}]};
test('source orientation is fixed and history radii swaps do not exchange endpoint locations',()=>{
 assert.deepEqual(filletEdgeEndpoints(edge),{start:[0,0,0],end:[10,0,0]});
 const reversed={...edge,a:edge.b,b:edge.a};
 assert.deepEqual(filletEdgeEndpoints(reversed,node),filletEdgeEndpoints(edge,node));
 const swapped={...node,radius:3,radii:node.radii!.map((p,i)=>({...p,radius:i?1:3}))};
 assert.deepEqual(filletEdgeEndpoints(reversed,swapped),filletEdgeEndpoints(edge,node));
 assert.deepEqual(filletEdgeEndpoints({...edge,b:[20,0,0]},node),{start:[0,0,0],end:[20,0,0]});
});
test('interior follows original direction; ambiguous, curved, multiple and held sources refuse',()=>{
 const interior={...node,radii:[node.radii![0],{at:[5,0,0] as [number,number,number],radius:2,fraction:0.5},node.radii![1]]};
 assert.deepEqual(filletEdgeEndpoints({...edge,a:edge.b,b:edge.a},interior),{start:[0,0,0],end:[10,0,0]});
 for(const result of [filletEdgeEndpoints({...edge,nativeLine:undefined}),filletEdgeEndpoints(edge,{...node,edges:['edge','other']}),filletEdgeEndpoints(edge,{...node,held:'missing'}),filletEdgeEndpoints(edge,{...node,radii:node.radii!.map(p=>({...p,at:[5,0,0]}))}),filletEdgeEndpoints({...edge,b:[0,10,0]},interior),filletEdgeEndpoints({...edge,b:[1,1e-6,0]},interior)]) assert.ok('reason'in result);
 assert.equal(activeFilletEndpoints(null),null);
});
