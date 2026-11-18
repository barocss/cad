import type { ModelNode, StudioDoc } from '../engine/doc';
import { bodyKeyFor } from '../engine/ids';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { EditField } from './editFields';
const MEASURES = ['outer','inner','tangent'];
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
  || !positive(flange.length) || !positive(flange.bendRadius) || (flange.angle !== undefined && flange.angle !== 90)
  || (flange.position !== undefined && flange.position !== 'material-inside') || (flange.measure !== undefined && !MEASURES.includes(flange.measure))
  || !Array.isArray(flange.edges) || flange.edges.length !== 1 || typeof flange.edges[0] !== 'string' || !flange.edges[0]
  || !record(original) || original.kind !== 'sheet-flange'
  || nodes.some(n=>typeof n.id !== 'string'||!n.id) || new Set(nodes.map(n=>n.id)).size !== 3) return false;
 // The owned History Apply path separately proves the unchanged native parent and original edge signature.
 if (canonical({...flange,measure:undefined}) !== canonical({...original,measure:undefined}) || !positive(original.bendRadius) || (original.measure !== undefined && !MEASURES.includes(String(original.measure)))) return false;
 const entries = Object.entries(doc.outputs);
 return entries.length === 1 && entries[0][0] === bodyKeyFor(nodes,2,'solid')
  && record(entries[0][1]) && only(entries[0][1],['node','side']) && entries[0][1].node === 2 && entries[0][1].side === 'solid';
}
/** Length measurement only; the native parent/edge proof is required again at History Apply. */
export function flangeMeasureEdit(doc: unknown, nodes: readonly ModelNode[], index: number): EditField | null {
 if (!admitted(doc,nodes,index)) return null;
 const source=canonical(doc),revision=canonical(nodes);
 return {kind:'choice',key:'flangeMeasure',label:'Length to',options:MEASURES.map(value=>({value,label:value==='outer'?'Outer sharp':value==='inner'?'Inner sharp':'From the bend'})),
  get:current=>current[index]?.kind==='sheet-flange'?current[index].measure??'outer':'',
  set:(current,value)=>{
   if(current!==nodes||canonical(doc)!==source||canonical(current)!==revision||!admitted(doc,current,index))throw refusal('BAD_REFERENCE','Open the current Flange in History again.');
   if(!MEASURES.includes(String(value)))throw refusal('VALUE','Choose Outer sharp, Inner sharp or From the bend.');
   const flange=current[index];if(flange.kind!=='sheet-flange')throw refusal('BAD_REFERENCE','Open the current Flange in History again.');
   if((flange.measure??'outer')===value)return [...current];
   const changed={...flange};
   if(value==='outer')delete changed.measure;
   else changed.measure=value as 'inner'|'tangent';
   return current.map((node,i)=>i===index?changed:node);
  }};
}
export function isFlangeMeasureChange(before:StudioDoc,next:StudioDoc,index:number):boolean {
 if(!admitted(before,before.nodes,index)||!admitted(before,next.nodes,index))return false;
 const a=before.nodes[index],b=next.nodes[index];
 return a.kind==='sheet-flange'&&b.kind==='sheet-flange'&&(a.measure??'outer')!==(b.measure??'outer')
  &&canonical({...before,nodes:[]})===canonical({...next,nodes:[]});
}
