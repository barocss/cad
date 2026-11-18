import type { ModelNode, StudioDoc } from '../engine/doc';
import { bodyKeyFor } from '../engine/ids';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { EditField } from './editFields';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: object, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0;
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]);
function admitted(doc: unknown, nodes: readonly ModelNode[], index: number): doc is StudioDoc {
 if (!record(doc) || doc.format !== 'barocss-cad-model' || doc.schema !== 3 || doc.units !== 'mm'
  || !record(doc.parameters) || !Number.isInteger(doc.nextId) || !Array.isArray(doc.nodes) || doc.nodes.length !== 3
  || !record(doc.outputs) || Object.entries(doc).some(([k,v]) => v !== undefined && !['format','schema','units','nextId','parameters','nodes','outputs'].includes(k))
  || index !== 2 || nodes.length !== 3 || nodes[0] !== doc.nodes[0] || nodes[1] !== doc.nodes[1]) return false;
 const [sk,base,flange] = nodes, original = doc.nodes[2];
 if (sk?.kind !== 'sketch' || sk.profile !== 'rectangle' || !only(sk,['id','kind','profile','min','max'])
  || !pair(sk.min) || !pair(sk.max) || !sk.max.every((v,i)=>v>Number(sk.min[i]))
  || base?.kind !== 'sheet-base' || base.sketch !== 0 || !only(base,['id','kind','sketch','thickness','bendRadius','kFactor'])
  || !positive(base.thickness) || !positive(base.bendRadius) || !finite(base.kFactor) || base.kFactor < 0 || base.kFactor > 1
  || flange?.kind !== 'sheet-flange' || !only(flange,['id','kind','parent','edges','length','angle','bendRadius','measure','position','sigs'])
  || !record(flange.parent) || !only(flange.parent,['node','side']) || flange.parent.node !== 1 || flange.parent.side !== 'solid'
  || !positive(flange.length) || (flange.bendRadius !== undefined && !positive(flange.bendRadius)) || (flange.angle !== undefined && flange.angle !== 90)
  || (flange.measure !== undefined && flange.measure !== 'outer') || (flange.position !== undefined && flange.position !== 'material-inside')
  || !Array.isArray(flange.edges) || flange.edges.length !== 1 || typeof flange.edges[0] !== 'string' || !flange.edges[0]
  || !record(original) || original.kind !== 'sheet-flange'
  || nodes.some(n=>typeof n.id !== 'string'||!n.id) || new Set(nodes.map(n=>n.id)).size !== 3) return false;
 // The native evaluator remains responsible for edge identity, radius fit and valid sheet geometry.
 if (canonical({...flange,bendRadius:0}) !== canonical({...original,bendRadius:0}) || (original.bendRadius !== undefined && !positive(original.bendRadius))) return false;
 const entries = Object.entries(doc.outputs);
 return entries.length === 1 && entries[0][0] === bodyKeyFor(nodes,2,'solid')
  && record(entries[0][1]) && only(entries[0][1],['node','side']) && entries[0][1].node === 2 && entries[0][1].side === 'solid';
}
/** Explicit radius source only; switching does not edit the numeric override in the same draft. */
export function flangeRadiusSourceEdit(doc: unknown, nodes: readonly ModelNode[], index: number): EditField | null {
 if (!admitted(doc,nodes,index)) return null;
 const source=canonical(doc),revision=canonical(nodes);
 return {kind:'choice',key:'flangeRadiusSource',label:'Radius source',options:[{value:'sheet',label:'Sheet radius'},{value:'own',label:'Own radius'}],
  get:current=>current[index]?.kind==='sheet-flange'?(current[index].bendRadius===undefined?'sheet':'own'):'',
  set:(current,value)=>{
   if(current!==nodes||canonical(doc)!==source||canonical(current)!==revision||!admitted(doc,current,index))throw refusal('BAD_REFERENCE','Open the current Flange in History again.');
   if(value!=='sheet'&&value!=='own')throw refusal('VALUE','Choose Sheet radius or Own radius.');
   const flange=current[index],base=current[1];
   if(flange.kind!=='sheet-flange'||base.kind!=='sheet-base'||!positive(base.bendRadius))throw refusal('BAD_REFERENCE','Open the current Flange in History again.');
   if((flange.bendRadius===undefined?'sheet':'own')===value)return [...current];
   const changed={...flange};if(value==='sheet')delete changed.bendRadius;else changed.bendRadius=base.bendRadius;
   return current.map((n,i)=>i===index?changed:n);
  }};
}
export function isFlangeRadiusSourceChange(before:StudioDoc,next:StudioDoc,index:number):boolean {
 if(!admitted(before,before.nodes,index)||!admitted(before,next.nodes,index))return false;
 const a=before.nodes[index],b=next.nodes[index],base=before.nodes[1];
 if(a.kind!=='sheet-flange'||b.kind!=='sheet-flange'||base.kind!=='sheet-base'||(a.bendRadius===undefined)===(b.bendRadius===undefined))return false;
 const expected={...a};if(b.bendRadius===undefined)delete expected.bendRadius;else expected.bendRadius=base.bendRadius;
 return canonical(expected)===canonical(b)&&canonical({...before,nodes:[]})===canonical({...next,nodes:[]});
}
