import { checkBrep, flatPatternOf, massPropertiesOf } from '@barocss/cad';
import { prefixDoc, type StudioDoc } from '../engine/doc';
import { bodyMesh } from '../engine/mesh';
import { partSnapshot } from '../engine/part';
import { toSig } from '../engine/references';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command } from './commands';
import { flangeRadiusSourceEdit } from './flangeRadiusSourceEdit';
function fail():never {throw refusal('BAD_REFERENCE','Open the current numeric partial Flange relief in History again.');}
/** Existing partial relief dimensions or a separate kind-only change; native evidence runs in build, never render. */
export function flangeReliefDimensionsHistoryEdit(doc:StudioDoc,index:number):Command|null{
 if(!doc||!Array.isArray(doc.nodes)||doc.nodes.length!==3||index!==2)return null;
 const [sk,base,n]=doc.nodes;
 const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 if(!n||n.kind!=='sheet-flange'||!Array.isArray(n.offsets)||n.offsets.length!==2
  ||!positive(n.offsets[0])||!positive(n.offsets[1])||!n.relief||typeof n.relief!=='object'
  ||!['rectangular','obround'].includes(n.relief.kind)
  ||Object.keys(n.relief).some(k=>!['kind','width','depth'].includes(k))
  ||!('width' in n.relief)||!('depth' in n.relief)||!positive(n.relief.width)||!positive(n.relief.depth))return null;
 const rw=n.relief.width,rd=n.relief.depth,kind=n.relief.kind as 'rectangular'|'obround';
 // Metadata-only projection: never evaluate this temporary full-width description.
 const {offsets,relief,...plain}=n;
 const admission={...doc,nodes:doc.nodes.map((node,i)=>i===index?plain:node)};
 if(!flangeRadiusSourceEdit(admission,admission.nodes,index))return null;
 if(sk.kind!=='sketch'||sk.profile!=='rectangle'||base.kind!=='sheet-base'
  ||n.bendRadius!==undefined||n.edges[0]!==`${base.id}.side1|${base.id}.top`
  ||!n.sigs||Object.keys(n.sigs).length!==1||!Object.hasOwn(n.sigs,n.edges[0]))return null;
 const id=base.id!,low=[Number(sk.min[0]),Number(sk.min[1]),0],high=[Number(sk.max[0]),Number(sk.max[1]),Number(base.thickness)];
 const revision=canonical(doc),current=(d:StudioDoc)=>d===doc&&canonical(d)===revision;
 const solid=(d:StudioDoc,expectedId:string)=>{
  const outputs=partSnapshot(d).outputs,o=outputs[0];
  if(outputs.length!==1||o.id!==expectedId||o.bodyCount!==1||o.brep.bodies.length!==1||o.brep.bodies[0].kind!=='solid'||!checkBrep(o.brep,{strict:true}).valid)fail();
  const volume=massPropertiesOf(o).volume;if(!Number.isFinite(volume)||volume<=0||!o.sheet)fail();return o;
 };
 const verifyFlat=(o:ReturnType<typeof solid>)=>{
  const flat=flatPatternOf(o);
  if(!Number.isFinite(flat.area)||flat.area<=0||flat.bends.length!==1||!flat.loops.length
   ||!flat.loops.some(l=>l.outer)||flat.loops.some(l=>!Number.isFinite(l.area)))fail();
  return flat;
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

  const e=mesh.edges.find(e=>e.names[0]===n.edges[0]);
  if(!e||e.a[0]!==high[0]||e.b[0]!==high[0]||e.a[2]!==high[2]||e.b[2]!==high[2])fail();
  const delta=e.b.map((v,i)=>v-e.a[i]),length=Math.hypot(...delta);
  if(length!==high[1]-low[1])fail();
  const sig=toSig({kind:'line',at:e.a.map((v,i)=>(v+e.b[i])/2) as [number,number,number],dir:delta.map(v=>v/length) as [number,number,number],size:length});
  if(canonical(n.sigs![n.edges[0]])!==canonical(sig))fail();
  const original=solid(doc,n.id!);verifyFlat(original);return original;
 };
 return {id:'edit',label:'Edit flange relief',icon:'cad-sheet-flange',group:'modify',
  available:ctx=>current(ctx.doc)?{ok:true}:{ok:false,reason:'Open the current Flange in History again.'},
  defaults:()=>({rw,rd,kind}),
  fields:()=>[{key:'kind',label:'Relief',kind:'choice',options:[{value:'rectangular',label:'Rectangular'},{value:'obround',label:'Obround'}]},{key:'rw',label:'Relief width',kind:'mm',min:0},{key:'rd',label:'Relief depth',kind:'mm',min:0}],
  steps:()=>[{label:'Saved relief',text:`Saved ${relief.kind}. Keep offsets ${offsets[0]} / ${offsets[1]} mm and ${n.edges[0]}. Change relief kind separately from width and depth.`,done:true},
   {label:'Explicit dimensions',text:'For a kind change, keep the saved dimensions. Apply dimension changes separately. There are no automatic thickness defaults or manufacturing recommendations.',done:false}],
  build:(ctx,v)=>{
   if(!current(ctx.doc))fail();
   if(Object.keys(v).some(k=>!['rw','rd','kind'].includes(k)))throw refusal('VALUE','Edit relief kind or dimensions only.');
   const numeric=(x:number|string|undefined)=>(typeof x==='number'||typeof x==='string')&&String(x).trim()!==''&&Number.isFinite(Number(x))&&Number(x)>0;
   if(!numeric(v.rw)||!numeric(v.rd))throw refusal('VALUE','Enter finite positive relief width and depth.');
   // Missing kind preserves older numeric-only command callers.
   const nextKind=v.kind===undefined?kind:v.kind;
   if(nextKind!=='rectangular'&&nextKind!=='obround')throw refusal('VALUE','Choose Rectangular or Obround relief.');
   const width=Number(v.rw),depth=Number(v.rd);
   if(nextKind!==kind&&(width!==rw||depth!==rd))throw refusal('VALUE','Apply relief kind and dimension changes separately.');
   const original=prove();
   if(nextKind===kind&&width===rw&&depth===rd)return doc;
   const result:StudioDoc={...doc,nodes:doc.nodes.map((node,i)=>i===index?{...n,relief:{kind:nextKind,width,depth}}:node)};
   const output=solid(result,n.id!);verifyFlat(output);
   if(canonical(output.sheet)!==canonical(original.sheet))fail();
   return result;
  }};
}
