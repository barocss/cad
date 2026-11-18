import { checkBrep, flatPatternOf, massPropertiesOf } from '@barocss/cad';
import { prefixDoc, type StudioDoc } from '../engine/doc';
import { bodyKeyFor } from '../engine/ids';
import { bodyMesh } from '../engine/mesh';
import { partSnapshot } from '../engine/part';
import { toSig } from '../engine/references';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const only=(v:object,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k));
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const positive=(v:unknown):v is number=>finite(v)&&v>0;
const pair=(v:unknown):v is [number,number]=>Array.isArray(v)&&v.length===2&&finite(v[0])&&finite(v[1]);
function fail():never {throw refusal('BAD_REFERENCE','Open a valid single Corner relief on a plain rectangular sheet in History again.');}
/** Explicit reattachment, not reference repair. Native proof runs in build, never during UI rendering. */
export function prepareSheetReliefHistory(doc:StudioDoc,index:number){
 if(!record(doc)||doc.format!=='barocss-cad-model'||doc.schema!==3||doc.units!=='mm'||!record(doc.parameters)
  ||!Number.isInteger(doc.nextId)||!Array.isArray(doc.nodes)||doc.nodes.length!==3||index!==2||!record(doc.outputs)
  ||Object.entries(doc).some(([k,v])=>v!==undefined&&!['format','schema','units','parameters','nextId','nodes','outputs'].includes(k)))return null;
 const [sk,base,n]=doc.nodes;
 if(!sk||!base||!n||sk.kind!=='sketch'||sk.profile!=='rectangle'||!only(sk,['id','kind','profile','min','max'])
  ||!pair(sk.min)||!pair(sk.max)||!sk.max.every((v,i)=>v>Number(sk.min[i]))
  ||base.kind!=='sheet-base'||base.sketch!==0||!only(base,['id','kind','sketch','thickness','bendRadius','kFactor'])
  ||!positive(base.thickness)||!positive(base.bendRadius)||!finite(base.kFactor)||base.kFactor<0||base.kFactor>1
  ||n.kind!=='sheet-corner-relief'||!only(n,['id','kind','parent','edges','shape','size','sigs'])
  ||!record(n.parent)||!only(n.parent,['node','side'])||n.parent.node!==1||n.parent.side!=='solid'
  ||!positive(n.size)||(n.shape!=='square'&&n.shape!=='round')||!Array.isArray(n.edges)||n.edges.length!==1
  ||typeof n.edges[0]!=='string'||!record(n.sigs)||Object.keys(n.sigs).length!==1||!Object.hasOwn(n.sigs,n.edges[0])
  ||doc.nodes.some(v=>typeof v.id!=='string'||!v.id)||new Set(doc.nodes.map(v=>v.id)).size!==3)return null;
 const entries=Object.entries(doc.outputs);
 if(entries.length!==1||entries[0][0]!==bodyKeyFor(doc.nodes,2,'solid')||!record(entries[0][1])
  ||!only(entries[0][1],['node','side'])||entries[0][1].node!==2||entries[0][1].side!=='solid')return null;
 const low=[Number(sk.min[0]),Number(sk.min[1]),0],high=[Number(sk.max[0]),Number(sk.max[1]),base.thickness];
 const id=base.id!,corners=[{x:low[0],y:low[1],s:[0,3]},{x:high[0],y:low[1],s:[0,1]},{x:high[0],y:high[1],s:[1,2]},{x:low[0],y:high[1],s:[2,3]}]
  .map(c=>({...c,name:c.s.map(i=>`${id}.side${i}`).join('|')}));
 if(!corners.some(c=>c.name===n.edges[0]))return null;
 const revision=canonical(doc),current=(d:StudioDoc)=>d===doc&&canonical(d)===revision;
 const solid=(d:StudioDoc,expectedId:string)=>{
  const outputs=partSnapshot(d).outputs,o=outputs[0];
  if(outputs.length!==1||o.id!==expectedId||o.bodyCount!==1||o.brep.bodies.length!==1||o.brep.bodies[0].kind!=='solid'||!checkBrep(o.brep,{strict:true}).valid)fail();
  const volume=massPropertiesOf(o).volume;if(!positive(volume)||!o.sheet)fail();
  return o;
 };
 const prove=()=>{
  const source=solid(prefixDoc(doc,2),id),mesh=bodyMesh(source.brep,0);
  if(source.brep.vertices.length!==8||mesh.edges.length!==12||mesh.faces.length!==6)fail();
  const role=(p:readonly number[])=>p.length===3&&p.every((v,i)=>v===low[i]||v===high[i])?p.map((v,i)=>v===low[i]?0:1).join(''):null;
  const vertexRoles=new Map(source.brep.vertices.map(v=>[v.id,role(v.point)]));
  if(vertexRoles.size!==8||[...vertexRoles.values()].some(v=>v===null)||new Set(vertexRoles.values()).size!==8)fail();
  const faceRoles=new Map<number,string>(),faceNames=new Set<string>();
  for(const face of mesh.faces){
   const axis=face.nativeAxisPlane,k=axis?'xyz'.indexOf(axis.axis):-1;
   if(!axis||k<0||face.exact?.kind!=='plane'||face.kind!=='plane'||face.facet||face.name!==face.nativePlaneName||faceNames.has(face.name))fail();
   const side=axis.at===low[k]?0:axis.at===high[k]?1:-1;
   if(side<0||!face.exact.n.every((v,i)=>v===(i===k?(side?1:-1):0)))fail();
   const expected=k===2?`${id}.${side?'top':'bottom'}`:`${id}.side${k===0?(side?1:3):(side?2:0)}`;
   if(face.name!==expected)fail();faceRoles.set(face.index,`${k}:${side}`);faceNames.add(face.name);
  }
  if(new Set(faceRoles.values()).size!==6)fail();
  const roles=new Set<string>(),names=new Set<string>(),degrees=new Map<string,number>(),incidence=new Map<number,number>();
  for(const e of mesh.edges){
   const a=role(e.a),b=role(e.b);
   if(!a||!b||!e.straight||!e.nativeLine||!e.nativeVertices||e.names.length!==1||names.has(e.names[0])||e.faces.length!==2)fail();
   if([...a].filter((v,i)=>v!==b[i]).length!==1||vertexRoles.get(e.nativeVertices[0])!==a||vertexRoles.get(e.nativeVertices[1])!==b)fail();
   const r=[a,b].sort().join('|');if(roles.has(r))fail();roles.add(r);names.add(e.names[0]);
   const expected=[...a].flatMap((v,i)=>v===b[i]?[`${i}:${v}`]:[]).sort();
   if(canonical(expected)!==canonical(e.faces.map(i=>faceRoles.get(i)).sort())||e.names[0]!==e.faces.map(i=>mesh.faces[i].name).sort().join('|'))fail();
   for(const v of [a,b])degrees.set(v,(degrees.get(v)??0)+1);for(const i of e.faces)incidence.set(i,(incidence.get(i)??0)+1);
  }
  if(degrees.size!==8||[...degrees.values()].some(v=>v!==3)||incidence.size!==6||[...incidence.values()].some(v=>v!==4))fail();
  const sigs=new Map(corners.map(c=>{
   const e=mesh.edges.find(e=>e.names[0]===c.name);if(!e||e.a[0]!==c.x||e.b[0]!==c.x||e.a[1]!==c.y||e.b[1]!==c.y)fail();
   const delta=e.b.map((v,i)=>v-e.a[i]),length=Math.hypot(...delta);if(length!==base.thickness)fail();
   return [c.name,toSig({kind:'line',at:[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2,(e.a[2]+e.b[2])/2],dir:[delta[0]/length,delta[1]/length,delta[2]/length],size:length})] as const;
  }));
  if(canonical(n.sigs![n.edges[0]])!==canonical(sigs.get(n.edges[0])))fail();
  const original=solid(doc,n.id!);const flat=flatPatternOf(original);
  if(canonical(original.sheet)!==canonical(source.sheet)||flat.bends.length!==0||flat.loops.length!==1||!flat.loops[0].outer)fail();
  return {sigs,original,flat};
 };
 return {n,base,sk,corners,current,solid,prove,fail};
}
