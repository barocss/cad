import type { ModelNode, StudioDoc } from '../engine/doc';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { EditField } from './editFields';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: object, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(finite);
function admitted(doc: unknown, nodes: readonly ModelNode[], index: number): doc is StudioDoc {
 if (!record(doc) || doc.format !== 'barocss-cad-model' || doc.schema !== 3 || doc.units !== 'mm'
  || !record(doc.parameters) || !Number.isInteger(doc.nextId) || !Array.isArray(doc.nodes) || doc.nodes.length !== 3
  || !record(doc.outputs) || doc.direct !== undefined || !only(doc,['format','schema','units','parameters','nextId','nodes','outputs','direct'])
  || index !== 2 || nodes.length !== 3 || nodes[0] !== doc.nodes[0] || nodes[1] !== doc.nodes[1]) return false;
 const [sk,ex,s] = nodes, original = doc.nodes[2];
 if (!record(original) || original.kind !== 'split' || sk.kind !== 'sketch' || sk.profile !== 'rectangle'
  || !only(sk,['id','kind','profile','min','max']) || !pair(sk.min) || !pair(sk.max) || !sk.max.every((v,i)=>v>Number(sk.min[i]))
  || ex.kind !== 'extrude' || !only(ex,['id','kind','sketch','height','from','draft']) || ex.sketch !== 0
  || !finite(ex.height) || ex.height <= 0 || (ex.from !== undefined && !finite(ex.from)) || (ex.draft !== undefined && ex.draft !== 0)
  || s.kind !== 'split' || !only(s,['id','kind','parent','axis','at','normal','outputSide']) || s.normal !== undefined
  || !['x','y','z'].includes(s.axis) || !finite(s.at) || !record(s.parent) || !only(s.parent,['node','side']) || s.parent.node !== 1 || s.parent.side !== 'solid'
  || (s.outputSide !== undefined && s.outputSide !== 'negative' && s.outputSide !== 'positive')
  || nodes.some(n=>typeof n.id !== 'string'||!n.id) || new Set(nodes.map(n=>n.id)).size !== 3) return false;
 const unchanged = (node: object) => Object.fromEntries(Object.entries(node).filter(([key]) => !['axis','at','outputSide'].includes(key)));
 if (canonical(unchanged(s)) !== canonical(unchanged(original))) return false;
 const k='xyz'.indexOf(s.axis), lo=k===2?(ex.from??0):sk.min[k], hi=k===2?Number(ex.from??0)+ex.height:sk.max[k];
 if (!(s.at>Number(lo)&&s.at<Number(hi))) return false;
 return Object.values(doc.outputs).every(r=>record(r)&&only(r,['node','side'])&&r.node===2
  && (r.side==='negative'||r.side==='positive') && (original.outputSide===undefined||r.side===original.outputSide));
}
/** Opt into editable coefficients without changing the current positive cardinal plane. */
export function splitNormalComponentsField(doc: unknown, nodes: readonly ModelNode[], index: number): EditField | null {
 if (!admitted(doc,nodes,index)) return null;
 const source=canonical(doc), revision=canonical(nodes);
 return {kind:'choice',key:'axis',label:'Normal',options:[{value:'x',label:'X'},{value:'y',label:'Y'},{value:'z',label:'Z'},{value:'n',label:'Any direction'}],
 get: current=>current[index]?.kind==='split'?current[index].axis:'',
 set:(current,value)=>{
  if(current!==nodes||canonical(doc)!==source||canonical(current)!==revision||!admitted(doc,current,index)) throw refusal('BAD_REFERENCE','Open the current Split in History again.');
  if(!['x','y','z','n'].includes(value))throw refusal('VALUE','Choose X, Y, Z or Any direction.');
  const split=current[index];if(split.kind!=='split')throw refusal('BAD_REFERENCE','Open the current Split in History again.');
  const normal:[number,number,number]=[0,0,0];normal['xyz'.indexOf(split.axis)]=1;
  const next=value==='n'?{...split,normal}:{...split,axis:value as 'x'|'y'|'z'};
  return current.map((n,i)=>i===index?next:n);
 }};
}
