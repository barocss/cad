import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart,withNode,prefixDoc,type StudioDoc,type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc,type BodyResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { isRectangleFinishResize,proveRectangleFinishResize } from '../src/state/rectangleFinishResize';
function bodies(doc:StudioDoc){const result=evaluateDoc(prefixDoc(doc,2),1);if(!result.ok)throw new Error(result.error.hint);return result.bodies;}
function fixture(){
 const base=rectanglePart(30,20,10),oldBodies=bodies(base),edge=oldBodies[0].mesh.edges.find(e=>e.nativeLine&&e.a[2]===10&&e.b[2]===10&&e.a[1]===20&&e.b[1]===20)!;assert.ok(edge);
 const name=edge.names[0],before=withNode(base,{kind:'fillet',parent:{node:1,side:'solid'},edges:[name],radius:1,radii:[{at:[...edge.a],radius:1,atEnd:true},{at:[...edge.b],radius:2,atEnd:true}],sigs:{[name]:toSig(signaturesOf(oldBodies[0]).edges.get(name)!)}});
 const sk=before.nodes[0];assert.ok(sk.kind==='sketch'&&sk.profile==='rectangle');if(sk.kind!=='sketch'||sk.profile!=='rectangle')throw new Error('rectangle');
 const next={...before,nodes:before.nodes.map((node,i)=>i===0?{...sk,max:[40,25] as [number,number]}:node)};
 return {before,next,oldBodies,newBodies:bodies(next),name};
}
test('native rectangle resize proves stable IDs and semantic corners and updates only selected signature',()=>{
 const {before,next,oldBodies,newBodies,name}=fixture(),copy=structuredClone(before),result=proveRectangleFinishResize(before,next,oldBodies,newBodies);assert.ok(result);assert.equal(isRectangleFinishResize(before,next,1),true);
 const changed=result.nodes[2],old=before.nodes[2];assert.ok(changed.kind==='fillet'&&old.kind==='fillet');if(changed.kind!=='fillet'||old.kind!=='fillet')return;
 assert.equal(changed.radii,old.radii);assert.equal(changed.edges,old.edges);assert.equal(result.nodes[0],next.nodes[0]);assert.equal(result.nodes[1],next.nodes[1]);
 assert.deepEqual(changed,{...old,sigs:{...old.sigs,[name]:toSig(signaturesOf(newBodies[0]).edges.get(name)!)}});assert.deepEqual(before,copy);
 const evaluated=evaluateDoc(result,2);assert.ok(evaluated.ok,evaluated.ok?'':evaluated.error.hint);
});
test('non-Width/Depth, nonplain, held, bound and unsupported feature edits do not qualify',()=>{
 const {before,next}=fixture();assert.equal(isRectangleFinishResize(before,next,0),false);assert.equal(isRectangleFinishResize(before,before,1),false);
 const changed=(index:number,patch:object):StudioDoc=>({...next,nodes:next.nodes.map((node,i)=>i===index?{...node,...patch} as ModelNode:node)});
 for(const candidate of [changed(0,{min:[1,0]}),changed(0,{plane:'xy'}),changed(0,{holes:[]}),changed(0,{max:[0,20]}),changed(0,{max:[{parameter:'W'},20]}),changed(1,{height:12}),changed(1,{draft:1}),changed(1,{from:1}),changed(2,{radius:2}),changed(2,{held:'missing'}),changed(2,{section:{kind:'conic',rho:0.5}}),{...next,parameters:{W:40}}, {...next,nodes:[...next.nodes,next.nodes[0]]}])assert.equal(isRectangleFinishResize(before,candidate,1),false);
 for(const patch of [{radii:null},{radii:[]},{rematched:{}},{held:'missing'},{suppressed:true},{radius:{parameter:'R'}},{edges:['a','b']}]){const a={...before,nodes:before.nodes.map((node,i)=>i===2?{...node,...patch} as ModelNode:node)},b:StudioDoc={...next,nodes:next.nodes.map((node,i)=>i===2?{...node,...patch} as ModelNode:node)};assert.equal(isRectangleFinishResize(a,b,1),false);}
});
test('proof rejects duplicate sources, moved IDs, wrong corners, merged edges and stale or shared signatures',()=>{
 const {before,next,oldBodies,newBodies,name}=fixture();
 const mutate=(change:(body:BodyResult)=>void)=>{const bs=structuredClone(newBodies);change(bs[0]);return bs;};
 const edgeOf=(body:BodyResult)=>body.mesh.edges.find(e=>e.names.includes(name))!;
 const invalid=[[],[...newBodies,...newBodies],[...newBodies,{...newBodies[0],key:'different'}],mutate(b=>{b.ref={node:0,side:'solid'};}),mutate(b=>{edgeOf(b).nativeLine=undefined;}),mutate(b=>{edgeOf(b).nativeVertices=['different','other'];}),mutate(b=>{edgeOf(b).nativeJoint={...edgeOf(b).nativeJoint!,edgeId:'wrong'};}),mutate(b=>{edgeOf(b).nativeJoint={...edgeOf(b).nativeJoint!,faces:['wrong','faces']};}),mutate(b=>{edgeOf(b).a=[0,0,10];}),mutate(b=>{edgeOf(b).names.push('merged');}),mutate(b=>{b.mesh.edges.push({...edgeOf(b)});})];
 for(const bs of invalid)assert.equal(proveRectangleFinishResize(before,next,oldBodies,bs),null);
 const feature=before.nodes[2];assert.ok(feature.kind==='fillet');if(feature.kind!=='fillet')return;
 for(const patch of [{n:1},{n:2},{s:999}]){const sigs={...feature.sigs,[name]:{...feature.sigs![name],...patch}},a:StudioDoc={...before,nodes:before.nodes.map((node,i)=>i===2?{...feature,sigs}:node)},b:StudioDoc={...next,nodes:next.nodes.map((node,i)=>i===2?{...feature,sigs}:node)};assert.equal(proveRectangleFinishResize(a,b,oldBodies,newBodies),null);}
});

test('endpoint pairing ambiguity or reversal and interior direction drift cannot be silently re-signed',()=>{
 const {before,next,oldBodies,newBodies}=fixture(),f=before.nodes[2];assert.ok(f.kind==='fillet');if(f.kind!=='fillet')return;
 const prove=(radii:NonNullable<typeof f.radii>)=>{
  const a:StudioDoc={...before,nodes:before.nodes.map((n,i)=>i===2?{...f,radii}:n)},b:StudioDoc={...next,nodes:next.nodes.map((n,i)=>i===2?{...f,radii}:n)};
  return proveRectangleFinishResize(a,b,oldBodies,newBodies);
 };
 assert.equal(prove([{at:[-20,20,10],radius:1,atEnd:true},{at:[-10,20,10],radius:2,atEnd:true}]),null,'collinear points outside the source have an ambiguous pairing');
 assert.equal(prove([{at:[30,20,10],radius:1,atEnd:true},{at:[30,25,10],radius:2,atEnd:true}]),null,'old and new nearest pairing reverse');
 const oldLaw:NonNullable<typeof f.radii>=[{at:[20,20,10],radius:1,atEnd:true},{at:[30,20,10],radius:2,atEnd:true}];
 const oldSource:StudioDoc={...before,nodes:before.nodes.map((n,i)=>i===2?{...f,radii:oldLaw}:n)};
 const shrink:StudioDoc={...oldSource,nodes:oldSource.nodes.map((n,i)=>i===0&&n.kind==='sketch'&&n.profile==='rectangle'?{...n,max:[10,20]}:n)};
 assert.equal(proveRectangleFinishResize(oldSource,shrink,oldBodies,bodies(shrink)),null,'old pairing unique but resized pairing tied');
 const first=f.radii![0],last=f.radii![1];
 assert.ok(prove([first,{at:[15,20,10],radius:1.5,fraction:0.5},last]));
 assert.equal(prove([first,{at:[15,20,10],radius:1.5,fraction:0.5},{...last,at:[last.at[0],last.at[1]+1e-5,last.at[2]]}]),null,'interior original direction must remain parallel to the native edge');
});

test('whole cuboid topology permits coherent opaque ID relabeling but rejects aliases and partial corruptions',()=>{
 const {before,next,oldBodies,newBodies}=fixture();
 const rename=()=>{const bs=structuredClone(newBodies),b=bs[0];for(const face of b.mesh.faces)face.id='new-face:'+face.id;for(const edge of b.mesh.edges){edge.nativeVertices=edge.nativeVertices!.map(id=>'new-vertex:'+id) as [string,string];edge.nativeJoint={edgeId:'new-edge:'+edge.nativeJoint!.edgeId,faces:edge.nativeJoint!.faces.map(id=>'new-face:'+id) as [string,string]};}return bs;};
 assert.ok(proveRectangleFinishResize(before,next,oldBodies,rename()),'opaque namespaces may change as a whole');
 const corruptions:((b:BodyResult)=>void)[]=[
  b=>{b.mesh.edges[0].nativeJoint!.edgeId=b.mesh.edges[1].nativeJoint!.edgeId;},
  b=>{b.mesh.edges[0].nativeVertices=['wrong',b.mesh.edges[0].nativeVertices![1]];},
  b=>{b.mesh.edges[0].nativeJoint!.faces=['wrong',b.mesh.edges[0].nativeJoint!.faces[1]];},
  b=>{b.mesh.faces[0].id='wrong';},
  b=>{b.mesh.faces[0].nativePlaneName=b.mesh.faces[1].nativePlaneName;},
  b=>{b.mesh.faces[0].nativeAxisPlane={...b.mesh.faces[0].nativeAxisPlane!,at:999};},
  b=>{b.mesh.edges[0].faces=[0,0];},
  b=>{b.mesh.edges[0].names=[b.mesh.edges[1].names[0]];},
 ];
 for(const corrupt of corruptions){const bs=rename();corrupt(bs[0]);assert.equal(proveRectangleFinishResize(before,next,oldBodies,bs),null);}
 const partial=structuredClone(newBodies);partial[0].mesh.edges[0].nativeJoint!.edgeId='one-only';assert.equal(proveRectangleFinishResize(before,next,oldBodies,partial),null);
 const swapped=structuredClone(newBodies),[a,b]=swapped[0].mesh.edges;[a.nativeJoint!.edgeId,b.nativeJoint!.edgeId]=[b.nativeJoint!.edgeId,a.nativeJoint!.edgeId];assert.equal(proveRectangleFinishResize(before,next,oldBodies,swapped),null);
});

test('terminal numeric equal-distance Chamfer reuses the full cuboid proof without an endpoint law',()=>{
 const f=fixture(),old=f.before.nodes[2];assert.ok(old.kind==='fillet');if(old.kind!=='fillet')return;
 const chamfer:ModelNode={id:old.id,kind:'chamfer',parent:old.parent,edges:old.edges,distance:2,sigs:old.sigs};
 const before={...f.before,nodes:f.before.nodes.map((n,i)=>i===2?chamfer:n)},next={...f.next,nodes:f.next.nodes.map((n,i)=>i===2?chamfer:n)};
 assert.ok(isRectangleFinishResize(before,next,1));const result=proveRectangleFinishResize(before,next,f.oldBodies,f.newBodies);assert.ok(result);
 const changed=result.nodes[2];assert.equal(changed.kind,'chamfer');assert.deepEqual(changed,{...chamfer,sigs:{...chamfer.sigs,[f.name]:toSig(signaturesOf(f.newBodies[0]).edges.get(f.name)!)}});
 assert.equal(changed.edges,chamfer.edges);const evaluation=evaluateDoc(result,3);assert.ok(evaluation.ok);if(evaluation.ok)assert.ok(Math.abs(evaluation.bodies[0].volume!-(40*25*10-40*2*2/2))<1e-8);
 for(const patch of [{distance:0},{distance:-1},{distance:NaN},{distance:Infinity},{distance:{parameter:'D'}},{distance2:3},{angle:30},{section:{kind:'conic',rho:0.5}},{held:'missing'},{suppressed:true},{rematched:{}},{edges:['a','b']}]){
  const a:StudioDoc={...before,nodes:before.nodes.map((n,i)=>i===2?{...chamfer,...patch} as ModelNode:n)},b:StudioDoc={...next,nodes:next.nodes.map((n,i)=>i===2?{...chamfer,...patch} as ModelNode:n)};
  assert.equal(isRectangleFinishResize(a,b,1),false);assert.equal(proveRectangleFinishResize(a,b,f.oldBodies,f.newBodies),null);
 }
});


test('constant circular Fillet retains its numeric law and updates only the proven selected signature',()=>{
 const f=fixture(),old=f.before.nodes[2];assert.ok(old.kind==='fillet');if(old.kind!=='fillet')return;
 const constant:ModelNode={id:old.id,kind:'fillet',parent:old.parent,edges:old.edges,radius:2,sigs:old.sigs};
 const before:StudioDoc={...f.before,nodes:f.before.nodes.map((n,i)=>i===2?constant:n)};
 const next:StudioDoc={...f.next,nodes:f.next.nodes.map((n,i)=>i===2?constant:n)};
 const snapshot=structuredClone({before,next});
 assert.ok(isRectangleFinishResize(before,next,1));
 const result=proveRectangleFinishResize(before,next,f.oldBodies,f.newBodies);assert.ok(result);
 assert.equal(result.nodes[0],next.nodes[0]);assert.equal(result.nodes[1],next.nodes[1]);
 assert.deepEqual(result.nodes[2],{...constant,sigs:{...constant.sigs,[f.name]:toSig(signaturesOf(f.newBodies[0]).edges.get(f.name)!)}});
 assert.equal(result.nodes[2].edges,constant.edges);
 const evaluated=evaluateDoc(result,4);assert.ok(evaluated.ok,evaluated.ok?'':evaluated.error.hint);
 if(evaluated.ok)assert.ok(Math.abs(evaluated.bodies[0].volume!-(40*25*10-40*(4-Math.PI)))<1e-8);
 assert.deepEqual({before,next},snapshot);
 // Undefined is the exact constant-law sentinel; malformed laws must not fall through to it.
 for(const patch of [{radii:null},{radii:[]},{radii:{}},{radius:0},{radius:-1},{radius:NaN},{radius:Infinity},{radius:{parameter:'R'}},{section:{kind:'conic',rho:0.5}},{section:{kind:'g2'}},{held:'missing'},{suppressed:true},{rematched:{}},{edges:[f.name,'another']}]){
  const a:StudioDoc={...before,nodes:before.nodes.map((n,i)=>i===2?{...constant,...patch} as ModelNode:n)},b:StudioDoc={...next,nodes:next.nodes.map((n,i)=>i===2?{...constant,...patch} as ModelNode:n)};
  assert.equal(isRectangleFinishResize(a,b,1),false);assert.equal(proveRectangleFinishResize(a,b,f.oldBodies,f.newBodies),null);
 }
 const explicitUndefined={...constant,radii:undefined};
 assert.ok(proveRectangleFinishResize({...before,nodes:[before.nodes[0],before.nodes[1],explicitUndefined]},{...next,nodes:[next.nodes[0],next.nodes[1],explicitUndefined]},f.oldBodies,f.newBodies));
 const stale={...constant,sigs:{...constant.sigs,[f.name]:{...constant.sigs![f.name],s:999}}};
 assert.equal(proveRectangleFinishResize({...before,nodes:[before.nodes[0],before.nodes[1],stale]},{...next,nodes:[next.nodes[0],next.nodes[1],stale]},f.oldBodies,f.newBodies),null);
 const corrupt=structuredClone(f.newBodies);corrupt[0].mesh.edges[0].nativeLine=undefined;
 assert.equal(proveRectangleFinishResize(before,next,f.oldBodies,corrupt),null,'constant laws still require the whole cuboid topology proof');
});

test('Height-only constant finishes retain every cuboid edge role and refresh only its signature',()=>{
 const base=rectanglePart(30,20,10),oldBodies=bodies(base);
 for(const edge of oldBodies[0].mesh.edges)for(const kind of ['fillet','chamfer'] as const)for(const height of [6,30]){
  const name=edge.names[0],law=kind==='fillet'?{kind,radius:2}:{kind,distance:2};
  const before=withNode(base,{...law,parent:{node:1,side:'solid'},edges:[name],sigs:{[name]:toSig(signaturesOf(oldBodies[0]).edges.get(name)!)}});
  const next={...before,nodes:before.nodes.map(node=>node.kind==='extrude'?{...node,height}:node)},newBodies=bodies(next);
  const result=proveRectangleFinishResize(before,next,oldBodies,newBodies);assert.ok(result,`${kind} ${name} height${height}`);
  assert.equal(result.nodes[0],before.nodes[0]);assert.equal(result.nodes[1],next.nodes[1]);
  assert.deepEqual(result.nodes[2],{...before.nodes[2],sigs:{[name]:toSig(signaturesOf(newBodies[0]).edges.get(name)!)}});
  const evaluated=evaluateDoc(result,5);assert.ok(evaluated.ok,evaluated.ok?'':evaluated.error.hint);
  const length=edge.a[2]!==edge.b[2]?height:Math.hypot(...edge.b.map((v,i)=>v-edge.a[i]));
  if(evaluated.ok)assert.ok(Math.abs(evaluated.bodies[0].volume!-(30*20*height-length*(kind==='fillet'?4-Math.PI:2)))<1e-7);
 }
});

test('Height admission does not include combined dimensions, translation, bindings, varying law or stale signatures',()=>{
 const f=fixture(),feature=f.before.nodes[2];assert.ok(feature.kind==='fillet');if(feature.kind!=='fillet')return;
 const constant={...feature};delete constant.radii;
 const before={...f.before,nodes:[f.before.nodes[0],f.before.nodes[1],constant]};
 const height={...before,nodes:before.nodes.map(node=>node.kind==='extrude'?{...node,height:30}:node)};
 assert.ok(isRectangleFinishResize(before,height,1));
 const patch=(index:number,value:object):StudioDoc=>({...height,nodes:height.nodes.map((node,i)=>i===index?{...node,...value} as ModelNode:node)});
 for(const next of [patch(0,{max:[40,25]}),patch(1,{from:2}),patch(1,{draft:1}),patch(1,{height:0}),patch(1,{height:-2}),patch(1,{height:{parameter:'H'}}),patch(2,{radius:3})])assert.equal(isRectangleFinishResize(before,next,1),false);
 assert.equal(isRectangleFinishResize(f.before,{...f.before,nodes:f.before.nodes.map(n=>n.kind==='extrude'?{...n,height:30}:n)},1),false);
 const stale={...constant,sigs:{[f.name]:{...constant.sigs![f.name],p:[0,0,0] as [number,number,number]}}};
 assert.equal(proveRectangleFinishResize({...before,nodes:[before.nodes[0],before.nodes[1],stale]},{...height,nodes:[height.nodes[0],height.nodes[1],stale]},f.oldBodies,bodies(height)),null);
});
