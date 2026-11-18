import { checkBrep, massPropertiesOf } from '@barocss/cad';
import type { ModelNode, StudioDoc } from '../engine/doc';
import { partSnapshot } from '../engine/part';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command } from './commands';
const only = (v: object, keys: readonly string[]) => Object.keys(v).every(k => keys.includes(k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pair = (v: unknown): v is [number,number] => Array.isArray(v) && v.length === 2 && v.every(finite);
function rectangle(n: ModelNode): boolean {
 return n.kind === 'sketch' && n.profile === 'rectangle' && only(n,['id','kind','profile','min','max'])
  && pair(n.min) && pair(n.max) && n.max.every((v,i)=>v>Number(n.min[i]));
}
function extrusion(n: ModelNode, sketch: number): boolean {
 return n.kind === 'extrude' && only(n,['id','kind','sketch','height','from','draft']) && n.sketch === sketch
  && finite(n.height) && n.height>0 && (n.from===undefined||finite(n.from)) && (n.draft===undefined||n.draft===0);
}
/** Change the saved Boolean operation, never rematch topology or rewrite the independent source features. */
export function booleanHistoryEdit(doc: StudioDoc, index: number): Command | null {
 if(index!==4||doc.nodes.length!==5||doc.direct!==undefined
  ||!only(doc,['format','schema','units','parameters','nextId','nodes','outputs','direct']))return null;
 const n=doc.nodes[4];
 if((n.kind!=='union'&&n.kind!=='intersect')||!only(n,['id','kind','left','right'])||!rectangle(doc.nodes[0])||!rectangle(doc.nodes[2])
  ||!extrusion(doc.nodes[1],0)||!extrusion(doc.nodes[3],2)
  ||doc.nodes.some(n=>typeof n.id!=='string'||!n.id)||new Set(doc.nodes.map(n=>n.id)).size!==5
  ||![n.left,n.right].every(r=>only(r,['node','side'])&&(r.node===1||r.node===3)&&r.side==='solid')||n.left.node===n.right.node
  ||Object.values(doc.outputs).some(r=>!only(r,['node','side'])||r.node!==index||r.side!=='solid'))return null;
 const revision=canonical(doc),current=(d:StudioDoc)=>d===doc&&canonical(d)===revision;
 const prove=(d:StudioDoc)=>{
  const outputs=partSnapshot(d).outputs;
  if(outputs.length!==1||outputs[0].id!==n.id||outputs[0].bodyCount!==1||outputs[0].brep.bodies.length!==1||outputs[0].brep.bodies[0].kind!=='solid'||!checkBrep(outputs[0].brep,{strict:true}).valid)
   throw refusal('BAD_REFERENCE','Boolean operation must produce one valid nonempty solid.');
  const volume=massPropertiesOf(outputs[0]).volume;
  if(!Number.isFinite(volume)||volume<=0)throw refusal('BAD_REFERENCE','Boolean operation must produce one valid nonempty solid.');
 };
 return {id:'edit',label:'Edit Boolean operation',icon:'cad-union',group:'modify',
  available:ctx=>current(ctx.doc)?{ok:true}:{ok:false,reason:'Open the current Boolean operation in History again.'},
  defaults:()=>({operation:n.kind}),
  fields:()=>[{kind:'choice',key:'operation',label:'Operation',options:[{value:'union',label:'Union'},{value:'intersect',label:'Intersect'}]}],
  steps:()=>[{label:'Saved operands',text:'Original source features stay in History. Union keeps both bodies together; Intersect keeps their overlap. Face and edge identities may change.',done:true}],
  build:(ctx,values)=>{
   if(!current(ctx.doc))throw refusal('BAD_REFERENCE','Open the current Boolean operation in History again.');
   if(values.operation!=='union'&&values.operation!=='intersect')throw refusal('VALUE','Choose Union or Intersect.');
   prove(doc);if(values.operation===n.kind)return doc;
   const kind=values.operation;
   const result:StudioDoc={...doc,nodes:doc.nodes.map((node,i):ModelNode=>i===index?{...n,kind}:node)};
   prove(result);return result;
  }};
}
