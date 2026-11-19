import { CadNumericPolicy } from '@barocss/cad';
import { splineEditError, splineOutline } from '@barocss/cad-model/sketch/spline';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
type Polygon = Extract<SketchShape, {kind:'polygon'}>;
const dropped = ['lengths','radii','equalRadii','concentric','rules','hv'];
const point = (p:unknown):p is [number,number] => Array.isArray(p) && p.length === 2 && [p[0],p[1]].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= CadNumericPolicy.coordinateAbs);
function completed(shape:SketchShape|null):shape is Polygon {
 if (!shape || shape.kind !== 'polygon' || shape.closed !== false || (shape.pending !== undefined && shape.pending !== false) || shape.fromSpline !== true) return false;
 const allowed=['kind','closed','pending','fromSpline','spline','points','bulges','ids','construction','lengths','radii','equalRadii','concentric','rules','hv','tangents','circles','circleIds'];
 if (Object.entries(shape).some(([k,v])=>v!==undefined&&!allowed.includes(k))) return false;
 if (shape.construction !== undefined && shape.construction !== true) return false;
 if (shape.ids !== undefined && (!Array.isArray(shape.ids) || Array.from(shape.ids).some(id=>typeof id!=='string'||!id) || new Set(shape.ids).size!==shape.ids.length)) return false;
 for (const key of ['lengths','radii'] as const) { const v=shape[key]; if(v!==undefined&&(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length)) return false; }
 for (const key of ['equalRadii','concentric','rules','tangents','circles','circleIds'] as const) { const v=shape[key]; if(v!==undefined&&(!Array.isArray(v)||v.length)) return false; }
 if(shape.hv!==undefined&&(!shape.hv||Object.keys(shape.hv).some(k=>k!=='h'&&k!=='v')||!Array.isArray(shape.hv.h)||!Array.isArray(shape.hv.v)||shape.hv.h.length||shape.hv.v.length)) return false;
 const d=shape.spline;
 if(!d||Object.keys(d).some(k=>!['fit','closed','handles'].includes(k))||d.closed!==false||!Array.isArray(d.fit)||d.fit.length!==3||Array.from(d.fit).some(p=>!point(p))) return false;
 if(d.handles!==undefined&&(!Array.isArray(d.handles)||d.handles.length!==3||Array.from(d.handles).some(h=>h!==null))) return false;
 if(!Array.isArray(shape.points)||shape.points.length!==5||Array.from(shape.points).some(p=>!point(p))||!Array.isArray(shape.bulges)||shape.bulges.length!==5||Array.from(shape.bulges).some(b=>typeof b!=='number'||!Number.isFinite(b))) return false;
 try {
  if(splineEditError(d)) return false;
  const o=splineOutline(d.fit,false,d.handles);
  return o.points.length===5&&o.bulges.length===5&&o.points.every((p,i)=>p[0]===shape.points[i][0]&&p[1]===shape.points[i][1])&&o.bulges.every((b,i)=>b===shape.bulges![i]);
 } catch { return false; }
}
export function canRecordOpenSplineFitPointDraft(sketch:SketchState|null):boolean {
 return !!sketch&&completed(sketch.shape)&&(sketch.done?.length??0)===0&&sketch.editNode===undefined&&!sketch.association&&!sketch.band&&!sketch.anchor?.face?.linkSource;
}
/** Recognize only the existing respline result of one numeric fit-coordinate edit. */
export function isOpenSplineFitPointChange(before:SketchShape|null,after:SketchShape|null):boolean {
 if(!completed(before)||!completed(after)) return false;
 const a=before.spline!,b=after.spline!;
 if((a.handles===undefined)!==(b.handles===undefined)) return false;
 let changes=0;
 for(let i=0;i<3;i++)for(let k=0;k<2;k++)if(a.fit[i][k]!==b.fit[i][k])changes++;
 if(changes!==1) return false;
 for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
  if(['points','bulges','spline'].includes(key)) continue;
  if(dropped.includes(key)&&!Object.hasOwn(after,key)) continue;
  if(!Object.is(Reflect.get(before,key),Reflect.get(after,key))) return false;
 }
 return true;
}
