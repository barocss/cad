import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { DisplayEdge, Vec3 } from '@barocss/cad-model/engine/mesh';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
function same(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a),bk=Object.keys(b);
 return ak.length===bk.length&&ak.every(key=>Object.hasOwn(b,key)&&same((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
const only=(node:object,keys:readonly string[])=>Object.keys(node).every(key=>keys.includes(key));
function positiveDimension(dim:unknown,parameters?:StudioDoc['parameters']):boolean {
 if(finite(dim))return dim>0;
 if(!parameters||!dim||typeof dim!=='object'||Array.isArray(dim)||Object.keys(dim).length!==1||!Object.hasOwn(dim,'parameter'))return false;
 const key=(dim as {parameter:unknown}).parameter;
 return typeof key==='string'&&Object.hasOwn(parameters,key)&&finite(parameters[key])&&parameters[key]>0;
}
function plain(nodes:readonly ModelNode[],parameters?:StudioDoc['parameters']):boolean {
 if(nodes.length!==3)return false;const [sk,ex,f]=nodes;
 if(sk.kind!=='sketch'||sk.profile!=='rectangle'||!only(sk,['id','kind','profile','min','max'])
  ||![...sk.min,...sk.max].every(finite)||!(Number(sk.max[0])>Number(sk.min[0])&&Number(sk.max[1])>Number(sk.min[1])))return false;
 if(ex.kind!=='extrude'||ex.sketch!==0||!only(ex,['id','kind','sketch','height','from','draft'])||!finite(ex.height)||ex.height<=0
  ||(ex.from!==undefined&&!finite(ex.from))||(ex.draft!==undefined&&ex.draft!==0))return false;
 if((f.kind!=='fillet'&&f.kind!=='chamfer')||f.parent.node!==1||f.parent.side!=='solid'||f.edges.length!==1||!f.edges[0]||f.edges[0].includes('+'))return false;
 if(f.kind==='chamfer')return only(f,['id','kind','parent','edges','distance','sigs'])&&positiveDimension(f.distance,parameters);
 if(!only(f,['id','kind','parent','edges','radius','radii','sigs'])||!positiveDimension(f.radius,parameters))return false;
 if(f.radii===undefined)return true; // A constant circular law has no endpoint assignment.
 if(!Array.isArray(f.radii)||f.radii.length<2||f.radii.length>4)return false;
 const last=f.radii.length-1;
 return f.radii.every((p,i)=>p.at.length===3&&p.at.every(finite)&&positiveDimension(p.radius,parameters)
  &&(i===0||i===last?p.atEnd===true&&p.fraction===undefined:p.atEnd===undefined&&finite(p.fraction)&&p.fraction>1e-9&&p.fraction<1-1e-9&&(i===1||p.fraction-f.radii![i-1].fraction!>1e-9)))
  &&f.radii[0].at.some((v,i)=>v!==f.radii![last].at[i]);
}
/** Height may retain a numeric radius law on a top edge; native topology and pairing are proved later. */
function heightFinishLaw(finish:ModelNode,extrude:Extract<ModelNode,{kind:'extrude'}>):boolean {
 if(finish.kind==='chamfer')return true;
 if(finish.kind!=='fillet')return false;
 if(finish.radii===undefined)return true;
 // plain() already checked both ends and any ordered interior fractions.
 if(!finite(finish.radius)||!finish.radii.every(p=>finite(p.radius)))return false;
 const sig=finish.sigs?.[finish.edges[0]],top=Number(extrude.from??0)+Number(extrude.height);
 // Admission only: no edge name is trusted, and the complete native proof below remains mandatory.
 const storedTop=toSig({kind:'line',at:[0,0,top],dir:null,size:1}).p[2];
 // Route a signed top-edge station law through the proof even if its saved height is stale.
 // The name can require a check, but only the actual old and new native edges can pass it.
 const namedStationTop=finish.radii.length>2&&!!sig&&finish.edges[0].split('|').includes(`${extrude.id??'n1'}.top`);
 return namedStationTop||sig?.k==='line'&&sig.p[2]===storedTop&&sig.d?.[2]===0;
}
/** Resolve only a Height proof copy. Authored bindings must never be committed as numbers. */
function heightProofDoc(doc:StudioDoc):StudioDoc|null {
 const ex=doc.nodes[1];if(ex?.kind!=='extrude')return null;
 if(finite(ex.height))return doc;
 const finish=doc.nodes[2];
 if(finish?.kind!=='chamfer'&&(finish?.kind!=='fillet'||finish.radii!==undefined))return null;
 if(!positiveDimension(ex.height,doc.parameters))return null;
 const height=doc.parameters[(ex.height as {parameter:string}).parameter];
 return {...doc,nodes:doc.nodes.map((node,i)=>i===1?{...ex,height}:node)};
}
/** Height-only edit with unchanged parameters; bindings are limited to constant finishing laws. */
export function isRectangleFinishHeightResize(before:StudioDoc,next:StudioDoc,index:number):boolean {
 const oldProof=heightProofDoc(before),newProof=heightProofDoc(next);
 if(index!==1||before.direct!==undefined||next.direct!==undefined||before.instances?.length||next.instances?.length||!oldProof||!newProof||!plain(oldProof.nodes,before.parameters)||!plain(newProof.nodes,next.parameters))return false;
 const old=before.nodes[1],now=next.nodes[1],finish=before.nodes[2],provedExtrude=oldProof.nodes[1];
 return old.kind==='extrude'&&now.kind==='extrude'&&!same(old.height,now.height)
  &&provedExtrude.kind==='extrude'&&heightFinishLaw(finish,provedExtrude)
  &&same({...before,nodes:[]},{...next,nodes:[]})&&same(before.nodes[0],next.nodes[0])
  &&same({...old,height:0},{...now,height:0})&&same(finish,next.nodes[2]);
}
/** Only proven Width/Depth or Height-only edits of a plain three-node root rectangle part. */
export function isRectangleFinishResize(before:StudioDoc,next:StudioDoc,index:number):boolean {
 if(isRectangleFinishHeightResize(before,next,index))return true;
 if(index!==1||before.direct!==undefined||next.direct!==undefined||before.instances?.length||next.instances?.length||!plain(before.nodes,before.parameters)||!plain(next.nodes,next.parameters))return false;
 const old=before.nodes[0],now=next.nodes[0];if(old.kind!=='sketch'||old.profile!=='rectangle'||now.kind!=='sketch'||now.profile!=='rectangle')return false;
 return !same(old.max,now.max)&&same({...before,nodes:[]},{...next,nodes:[]})&&same({...old,max:[]},{...now,max:[]})
  &&same(before.nodes[1],next.nodes[1])&&same(before.nodes[2],next.nodes[2]);
}
function parent(doc:StudioDoc,bodies:readonly BodyResult[]):BodyResult|null {
 if(bodies.length!==1)return null;
 const found=bodies.filter(body=>body.ref?.node===1&&body.ref.side==='solid');
 return found.length===1&&found[0].key===bodyKeyFor(doc.nodes,1,'solid')?found[0]:null;
}
function exactEdge(body:BodyResult,name:string):DisplayEdge|null {
 const matches=body.mesh.edges.filter(edge=>edge.names.includes(name));if(matches.length!==1)return null;
 const edge=matches[0];return edge.nativeLine&&edge.nativeVertices?.length===2&&edge.nativeVertices[0]!==edge.nativeVertices[1]
  &&edge.nativeJoint?.edgeId&&edge.nativeJoint.faces.length===2&&edge.nativeJoint.faces[0]!==edge.nativeJoint.faces[1]
  &&edge.names.length===1&&[...edge.a,...edge.b].every(finite)?edge:null;
}
function corner(doc:StudioDoc,p:Vec3):number[]|null {
 const sk=doc.nodes[0],ex=doc.nodes[1];if(sk.kind!=='sketch'||sk.profile!=='rectangle'||ex.kind!=='extrude')return null;
 const low=[sk.min[0],sk.min[1],ex.from??0],high=[sk.max[0],sk.max[1],Number(ex.from??0)+Number(ex.height)];
 const bits=p.map((value,i)=>value===low[i]?0:value===high[i]?1:-1);return bits.includes(-1)?null:bits;
}
type Topology = {vertices:Map<string,string>;edges:Map<string,string>;faces:Map<string,string>;edgeRoles:Map<string,string>;faceNames:Map<string,string>};
/** Validate the whole unmerged cuboid, not an ID prefix or a nearest-looking selected edge. */
export function rectangleTopology(doc:StudioDoc,body:BodyResult):Topology|null {
 const {mesh}=body,sk=doc.nodes[0],ex=doc.nodes[1];
 if(mesh.edges.length!==12||mesh.faces.length!==6||sk.kind!=='sketch'||sk.profile!=='rectangle'||ex.kind!=='extrude')return null;
 const low=[sk.min[0],sk.min[1],ex.from??0],high=[sk.max[0],sk.max[1],Number(ex.from??0)+Number(ex.height)];
 const out:Topology={vertices:new Map(),edges:new Map(),faces:new Map(),edgeRoles:new Map(),faceNames:new Map()};
 const faceRoles:string[]=[],vertexIds=new Map<string,string>(),edgeIds=new Set<string>(),faceIds=new Set<string>(),names=new Set<string>(),degrees=new Map<string,number>(),incidence=new Map<string,number>();
 for(const [index,face] of mesh.faces.entries()){
  const axis=face.nativeAxisPlane,k=axis?'xyz'.indexOf(axis.axis):-1;
  if(face.index!==index||k<0||!axis||face.kind!=='plane'||face.facet||face.nativeFaces||!face.nativePlaneName||face.nativePlaneName!==face.name||!face.nativeAlignFace||face.nativeAlignFace.axis!==axis.axis||!face.nativeInsetOutline||face.exact?.kind!=='plane'||!face.id||faceIds.has(face.id)||names.has(face.name))return null;
  const side=axis.at===low[k]?0:axis.at===high[k]?1:-1,sign=side===0?-1:1,role=`${k}:${side}`;
  if(side<0||out.faces.has(role)||face.nativeAlignFace.sign!==sign||face.exact.o[k]!==axis.at||!face.exact.n.every((v,i)=>v===(i===k?sign:0)))return null;
  out.faces.set(role,face.id);out.faceNames.set(role,face.name);faceIds.add(face.id);names.add(face.name);faceRoles.push(role);
 }
 for(const [index,edge] of mesh.edges.entries()){
  if(edge.index!==index||!exactEdge(body,edge.names[0]??'')||!edge.nativeJoint||!edge.nativeVertices)return null;
  const a=corner(doc,edge.a),b=corner(doc,edge.b);if(!a||!b||a.filter((v,i)=>v!==b[i]).length!==1)return null;
  const ar=a.join(''),br=b.join(''),role=[ar,br].sort().join('|'),id=edge.nativeJoint.edgeId;
  if(out.edges.has(role)||edgeIds.has(id))return null;
  const expected=a.flatMap((v,k)=>v===b[k]?[`${k}:${v}`]:[]).sort(),actual=edge.faces.map(i=>faceRoles[i]).sort();
  if(!same(expected,actual)||!same([...edge.nativeJoint.faces].sort(),edge.faces.map(i=>mesh.faces[i]?.id).sort()))return null;
  if(edge.names[0]!==edge.faces.map(i=>mesh.faces[i].name).sort().join('|'))return null;
  out.edges.set(role,id);edgeIds.add(id);out.edgeRoles.set(role,`${edge.names[0]}:${ar}>${br}`);
  for(const f of expected)incidence.set(f,(incidence.get(f)??0)+1);
  for(const [cornerRole,vertex] of [[ar,edge.nativeVertices[0]],[br,edge.nativeVertices[1]]]){
   if(!vertex||(out.vertices.has(cornerRole)&&out.vertices.get(cornerRole)!==vertex)||(vertexIds.has(vertex)&&vertexIds.get(vertex)!==cornerRole))return null;
   out.vertices.set(cornerRole,vertex);vertexIds.set(vertex,cornerRole);degrees.set(cornerRole,(degrees.get(cornerRole)??0)+1);
  }
 }
 return out.vertices.size===8&&[...degrees.values()].every(n=>n===3)&&out.edges.size===12&&out.faces.size===6&&[...incidence.values()].every(n=>n===4)?out:null;
}
function equalRoles(a:Map<string,string>,b:Map<string,string>):boolean {return a.size===b.size&&[...a].every(([role,value])=>b.get(role)===value);}
/** IDs are opaque: either retained consistently, or a complete disjoint relabeling proved by incidence. */
function consistentIds(a:Map<string,string>,b:Map<string,string>):boolean {
 if(equalRoles(a,b))return true;
 const ids=new Set(a.values());return [...b.values()].every(id=>!ids.has(id));
}
function endpointAssignment(feature:Extract<ModelNode,{kind:'fillet'}>,edge:DisplayEdge):number|null {
 const radii=feature.radii!,first=radii[0].at,last=radii[radii.length-1].at;
 if(radii.some(control=>control.fraction!==undefined)){
  const original=last.map((v,i)=>v-first[i]),live=edge.b.map((v,i)=>v-edge.a[i]),ol=Math.hypot(...original),ll=Math.hypot(...live);
  if(!(ol>0&&ll>0))return null;
  const a=original.map(v=>v/ol),b=live.map(v=>v/ll);
  const cross=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]),dot=a.reduce((sum,v,i)=>sum+v*b[i],0);
  return Number.isFinite(cross)&&cross<=1e-9&&Number.isFinite(dot)&&dot!==0?Math.sign(dot):null;
 }
 const distance=(a:Vec3,b:Vec3)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 const keep=distance(first,edge.a)+distance(last,edge.b),swap=distance(first,edge.b)+distance(last,edge.a);
 return Number.isFinite(keep)&&Number.isFinite(swap)&&Math.abs(keep-swap)>1e-9*Math.max(1,keep,swap)?Math.sign(swap-keep):null;
}
/** Proof, not geometric rematching: whole native topology bijection AND the same semantic rectangle corners. */
export function proveRectangleFinishResize(before:StudioDoc,next:StudioDoc,oldBodies:readonly BodyResult[],newBodies:readonly BodyResult[]):StudioDoc|null {
 if(!isRectangleFinishResize(before,next,1))return null;
 const authoredNext=next;
 if(isRectangleFinishHeightResize(before,next,1)){before=heightProofDoc(before)!;next=heightProofDoc(next)!;}
 const feature=next.nodes[2];if(feature.kind!=='fillet'&&feature.kind!=='chamfer')return null;
 const name=feature.edges[0],oldBody=parent(before,oldBodies),newBody=parent(next,newBodies);if(!oldBody||!newBody)return null;
 const oldTopology=rectangleTopology(before,oldBody),newTopology=rectangleTopology(next,newBody);
 if(!oldTopology||!newTopology||!equalRoles(oldTopology.edgeRoles,newTopology.edgeRoles)||!equalRoles(oldTopology.faceNames,newTopology.faceNames)
  ||!consistentIds(oldTopology.vertices,newTopology.vertices)||!consistentIds(oldTopology.edges,newTopology.edges)||!consistentIds(oldTopology.faces,newTopology.faces))return null;
 const oldEdge=exactEdge(oldBody,name),newEdge=exactEdge(newBody,name);if(!oldEdge||!newEdge)return null;
 const a=corner(before,oldEdge.a),b=corner(before,oldEdge.b),c=corner(next,newEdge.a),d=corner(next,newEdge.b);
 if(!a||!b||!c||!d||!same(a,c)||!same(b,d)||a.filter((v,i)=>v!==b[i]).length!==1)return null;
 // Equal-distance Chamfer and constant circular Fillet have no endpoint radius law.
 if(feature.kind==='fillet'&&feature.radii!==undefined){
  if(isRectangleFinishHeightResize(before,next,1)){
   const oldExtrude=before.nodes[1],newExtrude=next.nodes[1];
   if(oldExtrude.kind!=='extrude'||newExtrude.kind!=='extrude')return null;
   const oldTop=Number(oldExtrude.from??0)+Number(oldExtrude.height),newTop=Number(newExtrude.from??0)+Number(newExtrude.height);
   if(oldEdge.a[2]!==oldTop||oldEdge.b[2]!==oldTop||newEdge.a[2]!==newTop||newEdge.b[2]!==newTop)return null;
  }
  const oldAssignment=endpointAssignment(feature,oldEdge),newAssignment=endpointAssignment(feature,newEdge);
  if(oldAssignment===null||newAssignment===null||oldAssignment!==newAssignment)return null;
 }
 const oldSig=signaturesOf(oldBody).edges.get(name),newSig=signaturesOf(newBody).edges.get(name);
 if(!oldSig||!newSig||oldSig.shared!==undefined||newSig.shared!==undefined||!same(feature.sigs?.[name],toSig(oldSig)))return null;
 return {...authoredNext,nodes:authoredNext.nodes.map((node,i)=>i===2?{...feature,sigs:{...feature.sigs,[name]:toSig(newSig)}}:node)};
}
