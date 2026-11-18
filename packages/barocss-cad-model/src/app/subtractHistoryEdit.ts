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
/** Change operand roles, never rematch topology or rewrite the independent source features. */
export function subtractHistoryEdit(doc: StudioDoc, index: number): Command | null {
 if(index!==4||doc.nodes.length!==5||doc.direct!==undefined
  ||!only(doc,['format','schema','units','parameters','nextId','nodes','outputs','direct']))return null;
 const n=doc.nodes[4];
 if(n.kind!=='difference'||!only(n,['id','kind','parent','tool'])||!rectangle(doc.nodes[0])||!rectangle(doc.nodes[2])
  ||!extrusion(doc.nodes[1],0)||!extrusion(doc.nodes[3],2)
  ||doc.nodes.some(n=>typeof n.id!=='string'||!n.id)||new Set(doc.nodes.map(n=>n.id)).size!==5
  ||![n.parent,n.tool].every(r=>only(r,['node','side'])&&(r.node===1||r.node===3)&&r.side==='solid')||n.parent.node===n.tool.node
  ||Object.values(doc.outputs).some(r=>!only(r,['node','side'])||r.node!==index||r.side!=='solid'))return null;
 const revision=canonical(doc),current=(d:StudioDoc)=>d===doc&&canonical(d)===revision;
 const prove=(d:StudioDoc)=>{
  const outputs=partSnapshot(d).outputs;
  if(outputs.length!==1||outputs[0].id!==n.id||outputs[0].bodyCount!==1||!checkBrep(outputs[0].brep,{strict:true}).valid)
   throw refusal('BAD_REFERENCE','Subtract must produce one valid nonempty solid.');
  const volume=massPropertiesOf(outputs[0]).volume;
  if(!Number.isFinite(volume)||volume<=0)throw refusal('BAD_REFERENCE','Subtract must produce one valid nonempty solid.');
 };
 const target=doc.nodes[n.parent.node].id,tool=doc.nodes[n.tool.node].id;
 return {id:'edit',label:'Edit Subtract operands',icon:'cad-subtract',group:'modify',
  available:ctx=>current(ctx.doc)?{ok:true}:{ok:false,reason:'Open the current Subtract in History again.'},
  defaults:()=>({order:'keep'}),
  fields:()=>[{kind:'choice',key:'order',label:'Order',options:[{value:'keep',label:`Keep: ${target} minus ${tool}`},{value:'swap',label:`Swap: ${tool} minus ${target}`}]}],
  steps:()=>[{label:'Saved operands',text:'Original source features stay in History. Swapping target and tool changes the remaining solid; face and edge identities may change.',done:true}],
  build:(ctx,values)=>{
   if(!current(ctx.doc))throw refusal('BAD_REFERENCE','Open the current Subtract in History again.');
   if(values.order!=='keep'&&values.order!=='swap')throw refusal('VALUE','Choose Keep or Swap.');
   prove(doc);if(values.order==='keep')return doc;
   const result={...doc,nodes:doc.nodes.map((node,i)=>i===index?{...n,parent:n.tool,tool:n.parent}:node)};
   prove(result);return result;
  }};
}
