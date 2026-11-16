import test from 'node:test';
import assert from 'node:assert/strict';
import { filletEdgeEndpoints, activeFilletEndpoints, withFilletStations, filletStationInputKey } from '../src/app/filletEndpoints';
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
 assert.deepEqual(filletEdgeEndpoints({...edge,a:edge.b,b:edge.a},interior),{start:[0,0,0],end:[10,0,0],stations:[{label:'Interior',at:[5,0,0],fraction:0.5}]});
 for(const result of [filletEdgeEndpoints({...edge,nativeLine:undefined}),filletEdgeEndpoints(edge,{...node,edges:['edge','other']}),filletEdgeEndpoints(edge,{...node,held:'missing'}),filletEdgeEndpoints(edge,{...node,radii:node.radii!.map(p=>({...p,at:[5,0,0]}))}),filletEdgeEndpoints({...edge,b:[0,10,0]},interior),filletEdgeEndpoints({...edge,b:[1,1e-6,0]},interior)]) assert.ok('reason'in result);
 assert.equal(activeFilletEndpoints(null),null);
});

test('stations interpolate current source endpoints; invalid draft stations hide without hiding endpoints',()=>{
 const ends={start:[0,0,0] as [number,number,number],end:[40,0,0] as [number,number,number]};
 assert.deepEqual(withFilletStations(ends,[0.4,0.6]),{...ends,stations:[{label:'Interior 1',at:[16,0,0],fraction:0.4},{label:'Interior 2',at:[24,0,0],fraction:0.6}]});
 const exact=0.12345678912345678,result=withFilletStations(ends,[exact]);assert.ok('start'in result);if('start'in result)assert.equal(result.stations![0].fraction,exact);
 assert.deepEqual(withFilletStations(withFilletStations(ends,[0.25]),[]),ends);
 for(const fractions of [[NaN],[Infinity],[0],[1],[0.75,0.25],[0.5,0.5],[0.2,0.4,0.6]]){const result=withFilletStations(ends,fractions);assert.ok('start'in result);if('start'in result){assert.equal(result.stations,undefined);assert.ok(result.stationProblem);assert.deepEqual(result.start,ends.start);}}
});

test('station input subscription changes immediately for fractions and modes, not radii or unrelated commands',()=>{
 const active={cmd:{id:'fillet'},fillet:{radiusMode:'varying'},values:{stationMode:'interior',stationAt:25,station2At:75,radius:2}};
 const key=filletStationInputKey(active);
 assert.equal(filletStationInputKey({...active,values:{...active.values,radius:3}}),key);
 for(const patch of [{stationAt:50},{stationAt:''},{stationAt:' '},{stationAt:'bad'},{station2At:60},{stationMode:'ends'}])assert.notEqual(filletStationInputKey({...active,values:{...active.values,...patch}}),key);
 assert.notEqual(filletStationInputKey({...active,values:{...active.values,stationAt:''}}),filletStationInputKey({...active,values:{...active.values,stationAt:'bad'}}));
 assert.equal(filletStationInputKey({...active,fillet:{radiusMode:'constant'}}),'');
 assert.equal(filletStationInputKey({...active,cmd:{id:'hole'}}),'');
 assert.equal(filletStationInputKey(null),'');
});
