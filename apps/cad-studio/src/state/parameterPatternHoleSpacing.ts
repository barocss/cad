import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { prepareLinearPatternHoleEdit } from '../app/patternHoleSpacing';
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const positive=(v:unknown):v is number=>finite(v)&&v>0;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const only=(v:object,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k));
const pair=(v:unknown):v is [number,number]=>Array.isArray(v)&&v.length===2&&finite(v[0])&&finite(v[1]);
function same(a:unknown,b:unknown):boolean {
 if(Object.is(a,b))return true;
 if(!record(a)||!record(b)){if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&Array.from(a).every((v,i)=>same(v,b[i]));return false;}
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
}
function fail():never {throw new Error('Pattern spacing not applied: the numbered Hole cannot safely follow this parameter change. Keep its spacing or edit the Hole and pattern separately. The accepted document is unchanged.');}
// Detection is deliberately broader than admission. Unsupported active dependencies must
// refuse a changed pitch, not silently retain an old world-space bore centre.
function affected(before:StudioDoc,next:StudioDoc):boolean {
 for(const doc of [before,next])for(const hole of doc.nodes){
  if(hole.kind!=='hole'||hole.held||hole.suppressed||typeof hole.face!=='string'||!/@\d+(?:#\d+)?$/.test(hole.face))continue;
  const index=hole.parent.node,a=before.nodes[index],b=next.nodes[index];
  for(const pattern of [a,b]){
   if(pattern?.kind!=='linear-pattern'||!record(pattern.spacing)||typeof pattern.spacing.parameter!=='string')continue;
   const key=pattern.spacing.parameter;
   if(Object.hasOwn(before.parameters,key)!==Object.hasOwn(next.parameters,key)||!Object.is(before.parameters[key],next.parameters[key])
    ||a?.kind!=='linear-pattern'||b?.kind!=='linear-pattern'||!same(a.spacing,b.spacing))return true;
  }
 }
 return false;
}
/** Prepare only a bounded authored centre update; caller owns final native evaluation and commit. */
export function prepareParameterPatternHoleSpacing(before:StudioDoc,next:StudioDoc):StudioDoc {
 if(!affected(before,next))return next;
 const allowed=['format','schema','units','nextId','parameters','nodes','outputs'];
 if([before,next].some(d=>d.format!=='barocss-cad-model'||d.schema!==3||d.units!=='mm'||d.nodes.length!==4
  ||Object.entries(d).some(([k,v])=>v!==undefined&&!allowed.includes(k))))fail();
 const rest=(d:StudioDoc)=>Object.fromEntries(Object.entries(d).filter(([k,v])=>k!=='parameters'&&v!==undefined));
 if(!same(rest(before),rest(next)))fail();
 const [sk,ex,pattern,hole]=before.nodes;
 if(sk.kind!=='sketch'||sk.profile!=='rectangle'||!only(sk,['id','kind','profile','min','max'])||!pair(sk.min)||!pair(sk.max)
  ||sk.max[0]<=sk.min[0]||sk.max[1]<=sk.min[1]
  ||ex.kind!=='extrude'||!only(ex,['id','kind','sketch','height','from','draft'])||ex.sketch!==0||!positive(ex.height)
  ||(ex.from!==undefined&&!finite(ex.from))||(ex.draft!==undefined&&ex.draft!==0)
  ||pattern.kind!=='linear-pattern'||!only(pattern,['id','kind','parent','axis','spacing','count'])
  ||!same(pattern.parent,{node:1,side:'solid'})||(pattern.axis!=='x'&&pattern.axis!=='y')||!Number.isInteger(pattern.count)||pattern.count<2||pattern.count>64
  ||hole.kind!=='hole'||!only(hole,['id','kind','parent','center','radius','face','axis','side'])||!same(hole.parent,{node:2,side:'solid'})
  ||!pair(hole.center)||!positive(hole.radius)||(hole.axis!==undefined&&hole.axis!=='z')||(hole.side!==undefined&&hole.side!=='max'))fail();
 const ids=before.nodes.map(n=>n.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==4)fail();
 const outputs=Object.entries(before.outputs);if(outputs.length!==1||outputs[0][0]!==bodyKeyFor(before.nodes,3,'solid')||!same(outputs[0][1],{node:3,side:'solid'}))fail();
 const binding=pattern.spacing;
 if(!record(binding)||!only(binding,['parameter'])||!Object.hasOwn(binding,'parameter')||typeof binding.parameter!=='string')fail();
 const key=binding.parameter,keys=Object.keys(before.parameters),oldPitch=before.parameters[key],newPitch=next.parameters[key];
 if(!Object.hasOwn(before.parameters,key)||!Object.hasOwn(next.parameters,key)||keys.length!==Object.keys(next.parameters).length
  ||!keys.every(k=>Object.hasOwn(next.parameters,k)&&(k===key||same(before.parameters[k],next.parameters[k])))
  ||!finite(oldPitch)||!finite(newPitch)||oldPitch===0||newPitch===0||oldPitch===newPitch)fail();
 // All other dimensions above are literal: the changed key has no second consumer.
 // Resolve pitch only in temporary proof copies. Never replace the saved binding.
 const oldNodes=before.nodes.map((n,i)=>i===2?{...pattern,spacing:oldPitch}:n);
 const newNodes=next.nodes.map((n,i)=>i===2?{...pattern,spacing:newPitch}:n);
 const prepared=prepareLinearPatternHoleEdit({...before,nodes:oldNodes},newNodes,2);
 if('error' in prepared)throw new Error(prepared.error.hint);
 const moved=prepared.nodes[3];if(moved.kind!=='hole'||moved===hole||!pair(moved.center))fail();
 return {...next,nodes:next.nodes.map((n,i)=>i===3?{...hole,center:moved.center}:n)};
}
