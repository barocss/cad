import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { defaultDrawing, type DrawingDimension } from '@barocss/cad-model/drawing/types';
import { drawingDimensionChanges } from '../src/storage/drawingDimensionChanges';
const point={edge:'n1.side0|bottom',at:'end' as const,near:[0,0,0] as [number,number,number]};
const d1:DrawingDimension={id:'D1',kind:'linear',view:'front',a:point,b:{...point,near:[20,0,0]},orient:'horizontal',place:[10,-5],tol:{kind:'symmetric',value:.1}};
const d2:DrawingDimension={id:'D2',kind:'angle',view:'top',a:{edge:'a',near:[0,0,0]},b:{edge:'b',near:[0,0,0]},place:[1,2],tol:{kind:'deviation',upper:.2,lower:-.1}};
const fixture=():StudioDoc=>({...rectanglePart(20,10,5),drawing:{...defaultDrawing(),dimensions:[structuredClone(d1),structuredClone(d2)]}});
function changed(patch:Record<string,unknown>){const from=fixture(),to=structuredClone(from);to.drawing!.dimensions[0]={...to.drawing!.dimensions[0],...patch} as DrawingDimension;return {from,to};}
test('original tolerance values, direction, units and mutation freedom',()=>{
 const {from,to}=changed({tol:{kind:'symmetric',value:.05}}),saved=JSON.stringify({from,to});const r=drawingDimensionChanges(from,to);
 assert.deepEqual(r.incomplete,[]);assert.equal(r.changes.length,1);assert.deepEqual(r.changes[0].fields,['tolerance']);assert.equal(r.changes[0].before!.toleranceUnit,'mm');
 assert.deepEqual((r.changes[0].before!.definition as DrawingDimension).tol,{kind:'symmetric',value:.1});assert.deepEqual((r.changes[0].after!.definition as DrawingDimension).tol,{kind:'symmetric',value:.05});
 const reverse=drawingDimensionChanges(to,from);assert.deepEqual(reverse.changes[0].before,r.changes[0].after);assert.equal(JSON.stringify({from,to}),saved);
 const angular=structuredClone(from);angular.drawing!.dimensions[1]={...d2,tol:{kind:'deviation',upper:.2000000001,lower:-.1}};assert.equal(drawingDimensionChanges(from,angular).changes[0].after!.toleranceUnit,'degrees');
});
test('optional/raw field differences and reference diagnostics remain distinct',()=>{
 for(const [patch,fields] of [
  [{tol:{kind:'deviation',upper:.1,lower:-.2}},['tolerance']],[{tol:{kind:'fit',code:'H7'}},['tolerance']],
  [{basic:false},['basic']],[{basic:true,count:2,auto:false},['basic','count','auto']],
  [{place:[1,2]},['place']],[{view:'top'},['view']],
  [{a:{...point,edge:'other'}},['reference']],
  [{a:{...point,sig:{k:'line',p:[0,0,0],s:20},was:'old'}},['signature']],
 ] as [Record<string,unknown>,string[]][]){const {from,to}=changed(patch);assert.deepEqual(drawingDimensionChanges(from,to).changes[0].fields,fields);}
 const {from,to}=changed({tol:{kind:'symmetric',value:0}});delete from.drawing!.dimensions[0].tol;assert.deepEqual(drawingDimensionChanges(from,to).changes[0].fields,['tolerance']);
});
test('stable IDs, order-only, kind replacement, additions/removals and other drawing/geometry changes',()=>{
 const from=fixture(),to=structuredClone(from);to.drawing!.dimensions.reverse();assert.deepEqual(drawingDimensionChanges(from,to),{changes:[],incomplete:[]});
 to.drawing!.dimensions=[d2];assert.equal(drawingDimensionChanges(from,to).changes[0].change,'removed');assert.equal(drawingDimensionChanges(to,from).changes[0].change,'added');
 to.drawing!.dimensions=[{id:'D1',kind:'radius',view:'front',edge:'circle',near:[0,0,0],place:[10,-5],tol:{kind:'symmetric',value:.1}},d2];assert.deepEqual(drawingDimensionChanges(from,to).changes[0].fields,['kind','reference']);
 const other=structuredClone(from);other.nodes[1]={...other.nodes[1],height:8} as typeof other.nodes[number];other.drawing!.notes=[{id:'N',text:'changed',at:[0,0]}];assert.deepEqual(drawingDimensionChanges(from,other).changes,[]);
});
test('first sheet versus additional stable ID, rename, reorder and move without dimension mutation',()=>{
 const from=fixture(),to=structuredClone(from);to.drawing!.sheets=[{id:'S2',name:'Second',views:['front']},{id:'S3',name:'Third',views:['right']}];
 const r=drawingDimensionChanges(from,to);assert.deepEqual(r.changes[0].fields,['sheet']);assert.deepEqual(r.changes[0].before!.sheet,{id:null,number:1,name:'Sheet 1'});assert.deepEqual(r.changes[0].after!.sheet,{id:'S2',number:2,name:'Second'});
 const reorder=structuredClone(to);reorder.drawing!.sheets!.reverse();const moved=drawingDimensionChanges(to,reorder);assert.equal(moved.changes[0].after!.sheet!.id,'S2');assert.equal(moved.changes[0].after!.sheet!.number,3);
 const rename=structuredClone(to);rename.drawing!.sheets![0].name='Renamed';assert.deepEqual(drawingDimensionChanges(to,rename).changes[0].fields,['sheet']);
});
test('malformed/unsupported/duplicate identities are incomplete, not guessed add/remove',()=>{
 for(const corrupt of [null,{...d1,kind:'unknown'},{...d1,future:1},{...d1,place:[NaN,0]},{...d1,tol:undefined}]){
  const from=fixture(),to=structuredClone(from);to.drawing!.dimensions[0]=corrupt as DrawingDimension;const result=drawingDimensionChanges(from,to);assert.ok(result.incomplete.length);assert.equal(result.changes.length,0);
 }
 const from=fixture(),to=structuredClone(from);to.drawing!.dimensions.push(structuredClone(d1));assert.ok(drawingDimensionChanges(from,to).incomplete.some(s=>s.includes('duplicate')));assert.equal(drawingDimensionChanges(from,to).changes.length,0);
 (to as unknown as {drawing:unknown}).drawing={dimensions:null};assert.equal(drawingDimensionChanges(from,to).changes.length,0);
});
test('PCD ring and nested signature are compared, stale section membership stays incomplete',()=>{
 const from=fixture();from.drawing!.dimensions=[{id:'P',kind:'pcd',view:'top',ring:[{edge:'a',near:[0,0,0]},{edge:'b',near:[1,0,0]},{edge:'c',near:[0,1,0]}],place:[0,0]}];
 const to=structuredClone(from);const d=to.drawing!.dimensions[0];if(d.kind==='pcd')d.ring[1].sig={k:'circle',p:[1,0,0],s:1,r:1};assert.deepEqual(drawingDimensionChanges(from,to).changes[0].fields,['signature']);
 d.view='section:Z';assert.ok(drawingDimensionChanges(from,to).incomplete.length);assert.equal(drawingDimensionChanges(from,to).changes[0].after!.sheet,null);
});

test('sheet metadata ambiguity does not manufacture a sheet move',()=>{
 const from=fixture(),to=structuredClone(from);to.drawing!.sheets=[{id:'S',views:['section:Z']}];
 const r=drawingDimensionChanges(from,to);assert.ok(r.incomplete.length);assert.deepEqual(r.changes,[]);
 to.drawing!.sheets=[{id:'S',views:['front']},{id:'S',views:['top']}];assert.ok(drawingDimensionChanges(from,to).incomplete.length);
});

test('malformed detail and section metadata remains incomplete while legacy section maps through its parent',()=>{
 const from=fixture();from.drawing!.dimensions[0].view='section:A';from.drawing!.section={y:5};
 const to=structuredClone(from);to.drawing!.sheets=[{id:'S2',views:['front']}];
 assert.deepEqual(drawingDimensionChanges(from,to).changes[0].fields,['sheet']);
 for(const extra of [{sections:[{id:'A',view:'front',at:NaN}]},{details:[{id:'B',view:'front',center:[0,0],radius:-1}]}]){
  const raw={...to,drawing:{...to.drawing,...extra}} as StudioDoc;assert.ok(drawingDimensionChanges(from,raw).incomplete.length);
 }
});

test('unsupported tolerance grammar is incomplete without normalizing raw zero',()=>{
 for(const tol of [{kind:'symmetric',value:-.1},{kind:'deviation',upper:-.2,lower:-.1},{kind:'fit',code:'not a fit'}]){
  const {from,to}=changed({tol});const saved=JSON.stringify(to),result=drawingDimensionChanges(from,to);assert.ok(result.incomplete.length);assert.equal(result.changes.length,0);assert.equal(JSON.stringify(to),saved);
 }
 const {from,to}=changed({tol:{kind:'deviation',upper:-.1,lower:-.2}});assert.deepEqual(drawingDimensionChanges(from,to).incomplete,[]);
});
