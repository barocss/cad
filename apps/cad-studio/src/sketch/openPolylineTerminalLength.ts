import { CadNumericPolicy } from '@barocss/cad';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { canonical } from '@barocss/cad-model/util/revision';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const {coordinateAbs,linearTolerance}=CadNumericPolicy;
const point=(p:unknown):p is [number,number]=>Array.isArray(p)&&p.length===2&&[p[0],p[1]].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=coordinateAbs);
const emptyRecord=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0;
/** Terminal coordinate edit only. Earlier segments stay authored; this is not a constraint solver. */
export function canEditOpenPolylineTerminalLength(shape:SketchShape|null):shape is Polygon{
 if(!shape||shape.kind!=='polygon'||shape.closed!==false||(shape.pending!==undefined&&shape.pending!==false)
  ||!Array.isArray(shape.points)||shape.points.length<3||Array.from(shape.points).some(p=>!point(p)))return false;
 const allowed=['kind','points','closed','pending','ids','construction','bulges','lengths','radii','rules','tangents','equalRadii','concentric','circles','circleIds','hv'];
 if(Object.entries(shape).some(([k,v])=>v!==undefined&&!allowed.includes(k)))return false;
 if(shape.construction!==undefined&&shape.construction!==true)return false;
 if(shape.ids!==undefined&&(!Array.isArray(shape.ids)||Array.from(shape.ids).some(id=>typeof id!=='string'||!id)||new Set(shape.ids).size!==shape.ids.length))return false;
 if(shape.bulges!==undefined&&(!Array.isArray(shape.bulges)||![0,shape.points.length].includes(shape.bulges.length)||Array.from(shape.bulges).some(v=>v!==0)))return false;
 for(const k of ['lengths','radii'] as const)if(shape[k]!==undefined&&!emptyRecord(shape[k]))return false;
 for(const k of ['rules','tangents','equalRadii','concentric','circles','circleIds'] as const)if(shape[k]!==undefined&&(!Array.isArray(shape[k])||shape[k]!.length!==0))return false;
 if(shape.hv!==undefined&&(!shape.hv||Object.keys(shape.hv).some(k=>k!=='h'&&k!=='v')||!Array.isArray(shape.hv.h)||!Array.isArray(shape.hv.v)||shape.hv.h.length||shape.hv.v.length))return false;
 for(let i=1;i<shape.points.length;i++){const a=shape.points[i-1],b=shape.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!Number.isFinite(len)||len<=linearTolerance)return false;}
 const first=shape.points[0],last=shape.points[shape.points.length-1];return Math.hypot(last[0]-first[0],last[1]-first[1])>1e-4;
}
export function openPolylineTerminalLength(shape:SketchShape,length:number):SketchShape|null{
 if(!canEditOpenPolylineTerminalLength(shape)||!Number.isFinite(length)||length<=linearTolerance)return null;
 const a=shape.points[shape.points.length-2],b=shape.points[shape.points.length-1],dx=b[0]-a[0],dy=b[1]-a[1],old=Math.hypot(dx,dy);
 if(length===old)return shape;
 const end:[number,number]=[a[0]+dx/old*length,a[1]+dy/old*length];
 if(!point(end)||Math.hypot(end[0]-a[0],end[1]-a[1])<=linearTolerance)return null;
 const first=shape.points[0];if(Math.hypot(end[0]-first[0],end[1]-first[1])<=1e-4)return null;
 return {...shape,points:[...shape.points.slice(0,-1),end]};
}
/** Narrow event proof used before recording whole-draft history. No topology matcher. */
export function isOpenPolylineTerminalLengthChange(before:SketchShape|null,after:SketchShape|null):boolean{
 if(!canEditOpenPolylineTerminalLength(before)||!canEditOpenPolylineTerminalLength(after)||before.points.length!==after.points.length)return false;
 const last=before.points.length-1;
 if(before.points[last].every((v,i)=>v===after.points[last][i]))return false;
 if(canonical({...before,points:[]})!==canonical({...after,points:[]})||before.points.slice(0,last).some((p,i)=>p!==after.points[i]))return false;
 const a=before.points[last-1],b=before.points[last],c=after.points[last],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-a[0],c[1]-a[1]],ul=Math.hypot(...u),vl=Math.hypot(...v);
 const ux=u[0]/ul,uy=u[1]/ul,vx=v[0]/vl,vy=v[1]/vl;
 return ux*vx+uy*vy>0&&Math.abs(ux*vy-uy*vx)<=16*Number.EPSILON;
}

/** Same context admission for the panel and action-time history guard. */
export function canEditOpenPolylineTerminalDraft(sketch:SketchState|null):boolean{
 return !!sketch && canEditOpenPolylineTerminalLength(sketch.shape) && (sketch.done?.length ?? 0) === 0
  && sketch.editNode === undefined && !sketch.association && !sketch.band && !sketch.anchor?.face?.linkSource;
}
