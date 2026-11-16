import { detailOk } from '@barocss/cad-model/drawing/detail';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { checkSheetsInput, sheetMap, sheetName, sheetsProblem } from '@barocss/cad-model/drawing/sheets';
import { isDimView, halfOk, stepsOk, removedOk, sectionDirOk, sectionsOf, type DrawingSettings } from '@barocss/cad-model/drawing/types';

export interface DimensionSnapshot {
  definition: unknown; view: string;
  sheet: { id: string | null; number: number; name: string } | null;
  toleranceUnit: 'mm' | 'degrees';
}
export interface DimensionChange { id: string; change: 'added' | 'removed' | 'edited'; before?: DimensionSnapshot; after?: DimensionSnapshot; fields: string[] }
export interface DrawingDimensionChanges { changes: DimensionChange[]; incomplete: string[] }
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (v: Obj, k: string) => Object.hasOwn(v, k);
const keys = (v: Obj, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vector = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(finite);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
/** JSON-only canonical comparison; no rounding, normalization or snapshot reader. */
function canonical(value: unknown, seen = new Set<object>(), depth = 0): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value)) return JSON.stringify(value);
  if (depth > 64 || !value || typeof value !== 'object' || seen.has(value)) throw Error('Unsupported raw JSON value');
  seen.add(value);
  let out: string;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw Error('Sparse or extended array');
    out = '[' + value.map(v => canonical(v, seen, depth + 1)).join(',') + ']';
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw Error('Non-JSON object');
    out = '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Obj)[k], seen, depth + 1)).join(',') + '}';
  }
  seen.delete(value); return out;
}
function sectionOk(v: unknown): boolean {
  if (!object(v) || !keys(v,['id','view','at','dir','half','steps','along','removed','revolved'])
    || typeof v.id!=='string' || !/^[A-Z]{1,2}$/.test(v.id) || !['front','top','right'].includes(String(v.view)) || !finite(v.at)) return false;
  if (own(v,'dir') && !sectionDirOk(v.dir) || own(v,'half') && !halfOk(v.half) || own(v,'steps') && !stepsOk(v.steps)
    || own(v,'removed') && !removedOk(v.removed) || own(v,'revolved') && v.revolved!==true
    || own(v,'along') && !['horizontal','vertical'].includes(String(v.along))) return false;
  return [v.dir,v.half,v.steps].filter(x=>x!==undefined).length<=1
    && !(v.removed && v.revolved) && !((v.removed||v.revolved)&&(v.half||v.steps));
}
const signature = (v: unknown) => object(v) && keys(v, ['k','p','d','s','r','n']) && text(v.k) && vector(v.p,3) && finite(v.s)
  && (!own(v,'d') || vector(v.d,3)) && ['r','n'].every(k => !own(v,k) || finite(v[k]));
function reference(v: unknown, point = false): boolean {
  return object(v) && keys(v,point?['edge','near','sig','was','at','ring']:['edge','near','sig','was']) && text(v.edge) && vector(v.near,3)
    && (!own(v,'sig') || signature(v.sig)) && (!own(v,'was') || typeof v.was === 'string')
    && (!point || ['end','center','pcd'].includes(String(v.at)))
    && (!own(v,'ring') || Array.isArray(v.ring) && v.ring.length >= 3 && v.ring.every(x=>reference(x)))
    && (!point || v.at !== 'pcd' || own(v,'ring'));
}
function validDimension(v: unknown): v is Obj {
  if (!object(v) || !text(v.id) || !isDimView(v.view) || !vector(v.place,2)) return false;
  const common = ['id','kind','view','place','tol','count','auto','basic'];
  if (['basic','auto'].some(k=>own(v,k) && typeof v[k] !== 'boolean') || own(v,'count') && (!Number.isSafeInteger(v.count) || Number(v.count)<1)) return false;
  if (own(v,'tol')) {
    const t=v.tol;
    if (!object(t) || !(t.kind==='symmetric' && keys(t,['kind','value']) && finite(t.value) && t.value>=0
      || t.kind==='deviation' && keys(t,['kind','upper','lower']) && finite(t.upper) && finite(t.lower) && t.upper>=t.lower
      || t.kind==='fit' && keys(t,['kind','code']) && typeof t.code==='string' && /^[A-Za-z]{1,2}\d{1,2}$/.test(t.code))) return false;
  }
  if (v.kind==='linear') return keys(v,[...common,'a','b','orient']) && reference(v.a,true) && reference(v.b,true) && ['horizontal','vertical','aligned'].includes(String(v.orient));
  if (v.kind==='angle') return keys(v,[...common,'a','b']) && reference(v.a) && reference(v.b);
  if (v.kind==='diameter' || v.kind==='radius') return keys(v,[...common,'edge','near','sig','was']) && reference(Object.fromEntries(['edge','near','sig','was'].filter(k=>own(v,k)).map(k=>[k,v[k]])));
  return v.kind==='pcd' && keys(v,[...common,'ring']) && Array.isArray(v.ring) && v.ring.length>=3 && v.ring.every(x=>reference(x));
}
function read(doc: StudioDoc, side: string, incomplete: string[]) {
  const result = new Map<string,DimensionSnapshot>(), rejected = new Set<string>();
  const raw: unknown = doc.drawing;
  if (raw === undefined) return { result, rejected, allUnknown:false };
  if (!object(raw) || !Array.isArray(raw.dimensions)) { incomplete.push(`${side}: dimensions are missing or malformed.`); return {result,rejected,allUnknown:true}; }
  let map: Map<string,number> | null = null;
  try {
    if (own(raw,'sheets') && checkSheetsInput(raw.sheets).length) throw Error();
    if (own(raw,'sections') && !Array.isArray(raw.sections) || own(raw,'details') && !Array.isArray(raw.details)
      || own(raw,'section') && (!object(raw.section) || !keys(raw.section,['y']) || !finite(raw.section.y))) throw Error();
    const settings=raw as unknown as DrawingSettings, sections=sectionsOf(settings), details=settings.details??[];
    if (sections.some(x=>!sectionOk(x)) || details.some(x=>!detailOk(x)||!keys(x as unknown as Obj,['id','view','center','radius','scale','at']))) throw Error();
    const refs=[...sections.map(x=>`section:${x.id}`),...details.map(x=>`detail:${x.id}`)];
    if (new Set(refs).size!==refs.length || sheetsProblem(settings)) throw Error();
    map=sheetMap(settings);
    if (details.some(x=>!map!.has(x.view))) throw Error();
  } catch { map=null; incomplete.push(`${side}: sheet/view membership cannot be compared reliably.`); }
  let allUnknown=false;
  const counts=new Map<string,number>();
  for(const d of raw.dimensions)if(object(d)&&text(d.id))counts.set(d.id,(counts.get(d.id)??0)+1);
  for(const [i,d] of raw.dimensions.entries()){
    const id=object(d)&&text(d.id)?d.id:null;
    if(!id)allUnknown=true;
    if(id && counts.get(id)!>1){rejected.add(id);continue;}
    try {canonical(d);if(!validDimension(d))throw Error();}catch{if(id)rejected.add(id);incomplete.push(`${side}: dimension ${id??`at index ${i}`} has malformed or unsupported raw data.`);continue;}
    const definition=d as Obj, view=definition.view as string;
    const k=map?.get(view), settings=raw as unknown as DrawingSettings;
    const sheet=k===undefined?null:{id:k===0?null:settings.sheets![k-1].id,number:k+1,name:sheetName(settings,k)};
    if(!sheet)incomplete.push(`${side}: dimension ${id} has unknown sheet/view membership.`);
    result.set(id!,{definition,view,sheet,toleranceUnit:definition.kind==='angle'?'degrees':'mm'});
  }
  for(const [id,n] of counts)if(n>1)incomplete.push(`${side}: duplicate dimension ID ${id}; no matching attempted.`);
  return {result,rejected,allUnknown};
}
function groups(snapshot:DimensionSnapshot):Obj {
  const d=snapshot.definition as Obj, refs:Obj={}, diagnostics:Obj={};
  function split(v:unknown,path:string):unknown {
    if(Array.isArray(v))return v.map((x,i)=>split(x,`${path}[${i}]`));
    if(!object(v))return v;
    return Object.fromEntries(Object.entries(v).filter(([k,value])=>{if(k==='sig'||k==='was'){diagnostics[`${path}.${k}`]=value;return false;}return true;}).map(([k,value])=>[k,split(value,`${path}.${k}`)]));
  }
  for(const k of ['a','b','edge','near','ring','orient','sig','was'])if(own(d,k)){
    if(k==='sig'||k==='was')diagnostics[k]=d[k];else refs[k]=split(d[k],k);
  }
  return {kind:d.kind,tolerance:own(d,'tol')?{value:d.tol}:{},basic:own(d,'basic')?{value:d.basic}:{},count:own(d,'count')?{value:d.count}:{},auto:own(d,'auto')?{value:d.auto}:{},reference:refs,signature:diagnostics,place:d.place,view:d.view,sheet:snapshot.sheet};
}
/** Authored dimension definitions only. Empty changes never certifies the whole drawing or measured values unchanged. */
export function drawingDimensionChanges(from: StudioDoc, to: StudioDoc): DrawingDimensionChanges {
  const incomplete:string[]=[],changes:DimensionChange[]=[];
  const a=read(from,'Before',incomplete),b=read(to,'After',incomplete);
  if(a.allUnknown||b.allUnknown)return {changes,incomplete};
  for(const id of new Set([...a.result.keys(),...b.result.keys()])){
    if(a.rejected.has(id)||b.rejected.has(id))continue;
    const before=a.result.get(id),after=b.result.get(id);
    if(!before||!after){changes.push({id,change:before?'removed':'added',before,after,fields:['definition']});continue;}
    const x=groups(before),y=groups(after),fields=Object.keys(x).filter(k=>(k!=='sheet'||before.sheet!==null&&after.sheet!==null)&&canonical(x[k])!==canonical(y[k]));
    if(fields.length)changes.push({id,change:'edited',before,after,fields});
  }
  return {changes,incomplete};
}
