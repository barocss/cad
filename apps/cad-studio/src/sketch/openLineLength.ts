import { CadNumericPolicy } from '@barocss/cad';
import type { SketchShape } from '@barocss/cad-model/sketch/types';
import { canonical } from '@barocss/cad-model/util/revision';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const {coordinateAbs,linearTolerance}=CadNumericPolicy;
const point=(p:unknown):p is [number,number]=>Array.isArray(p)&&p.length===2&&[p[0],p[1]].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=coordinateAbs);
const emptyRecord=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0;
/** Coordinate edit, not a driving dimension or an inferred constraint removal. */
export function canEditOpenLineLength(shape:SketchShape|null):shape is Polygon{
 if(!shape||shape.kind!=='polygon'||shape.closed!==false||(shape.pending!==undefined&&shape.pending!==false)
  ||!Array.isArray(shape.points)||shape.points.length!==2||!point(shape.points[0])||!point(shape.points[1]))return false;
 const allowed=['kind','points','closed','pending','ids','construction','bulges','lengths','radii','rules','tangents','equalRadii','concentric','circles','circleIds','hv'];
 if(Object.entries(shape).some(([k,v])=>v!==undefined&&!allowed.includes(k)))return false;
 if(shape.construction!==undefined&&shape.construction!==true)return false;
 if(shape.ids!==undefined&&(!Array.isArray(shape.ids)||shape.ids.some(id=>typeof id!=='string'||!id)||new Set(shape.ids).size!==shape.ids.length))return false;
 if(shape.bulges!==undefined&&(!Array.isArray(shape.bulges)||![0,2].includes(shape.bulges.length)||Array.from(shape.bulges).some(v=>v!==0)))return false;
 for(const k of ['lengths','radii'] as const)if(shape[k]!==undefined&&!emptyRecord(shape[k]))return false;
 for(const k of ['rules','tangents','equalRadii','concentric','circles','circleIds'] as const)if(shape[k]!==undefined&&(!Array.isArray(shape[k])||shape[k]!.length!==0))return false;
 if(shape.hv!==undefined&&(!shape.hv||Object.keys(shape.hv).some(k=>k!=='h'&&k!=='v')||!Array.isArray(shape.hv.h)||!Array.isArray(shape.hv.v)||shape.hv.h.length||shape.hv.v.length))return false;
 const [a,b]=shape.points,len=Math.hypot(b[0]-a[0],b[1]-a[1]);return Number.isFinite(len)&&len>linearTolerance;
}
export function openLineLength(shape:SketchShape,length:number):SketchShape|null{
 if(!canEditOpenLineLength(shape)||!Number.isFinite(length)||length<=linearTolerance)return null;
 const [a,b]=shape.points,dx=b[0]-a[0],dy=b[1]-a[1],old=Math.hypot(dx,dy);
 if(length===old)return shape;
 const end:[number,number]=[a[0]+dx/old*length,a[1]+dy/old*length];
 if(!point(end)||Math.hypot(end[0]-a[0],end[1]-a[1])<=linearTolerance)return null;
 return {...shape,points:[a,end]};
}
/** Narrow event proof used before recording whole-draft history. No topology matcher. */
export function isOpenLineLengthChange(before:SketchShape|null,after:SketchShape|null):boolean{
 if(!canEditOpenLineLength(before)||!canEditOpenLineLength(after)||before.points[1].every((v,i)=>v===after.points[1][i]))return false;
 if(canonical({...before,points:[]})!==canonical({...after,points:[]})||before.points[0].some((v,i)=>v!==after.points[0][i]))return false;
 const [a,b]=before.points,c=after.points[1],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-a[0],c[1]-a[1]],ul=Math.hypot(...u),vl=Math.hypot(...v);
 const ux=u[0]/ul,uy=u[1]/ul,vx=v[0]/vl,vy=v[1]/vl;
 return ux*vx+uy*vy>0&&Math.abs(ux*vy-uy*vx)<=16*Number.EPSILON;
}
