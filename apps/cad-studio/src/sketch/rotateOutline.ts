import { CadNumericPolicy } from '@barocss/cad';
import { segmentDistance, signedArea } from '@barocss/cad-model/engine/geom2';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
type Polygon = Extract<SketchShape,{kind:'polygon'}>;
type P = [number,number];
const {coordinateAbs,linearTolerance}=CadNumericPolicy;
const inRange=(p:readonly number[])=>p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=coordinateAbs);
const turn=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function geometryError(points:P[]):string|null {
  if(!points.every(inRange))return 'Coordinates must be finite and within the modeling range.';
  const local=points.map(p=>[p[0]-points[0][0],p[1]-points[0][1]] as P);
  const extent=Math.max(...local.map(p=>Math.hypot(...p)));
  if(Math.abs(signedArea(local))<=linearTolerance*Math.max(extent,linearTolerance))return 'The outline is collapsed or too thin to rotate safely.';
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<=linearTolerance)return 'The outline has a zero or too-short segment.';
    for(let j=i+1;j<points.length;j++){
      if(j===i+1||(i===0&&j===points.length-1))continue;
      const c=points[j],d=points[(j+1)%points.length];
      if((turn(a,b,c)*turn(a,b,d)<0&&turn(c,d,a)*turn(c,d,b)<0)||Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b))<=linearTolerance)return 'The outline crosses or touches itself.';
    }
  }
  return null;
}
/** Coordinate snapshot edit only. Never drops constraints or edits other/linked outlines. */
export function rotateOutline(sketch:SketchState,degrees:number,pivot:readonly [number,number]):{shape:Polygon}|{error:string}{
  const shape=sketch.shape;
  if(sketch.association||sketch.band||sketch.bandPicks?.length||(sketch.done??[]).some(s=>!s.construction))return {error:'Rotate one independent active outline; linked, band and multiple material outlines are not supported.'};
  if(shape?.kind!=='polygon'||!shape.closed||shape.pending||shape.construction||shape.points.length<3||shape.points.length>16)return {error:'Pick one settled closed straight polygon with 3 to 16 points.'};
  if(!shape.hv||shape.hv.h.length||shape.hv.v.length||shape.bulges?.some(v=>v!==0)||shape.fromSpline||shape.spline||shape.fromEllipse||shape.ellipse||shape.circles?.length||shape.circleIds?.length||shape.rules?.length||shape.tangents?.length||shape.equalRadii?.length||shape.concentric?.length||Object.keys(shape.lengths??{}).length||Object.keys(shape.radii??{}).length)return {error:'Rotation requires an explicitly unconstrained straight outline. Existing constraints are never removed.'};
  if(shape.ids&&(shape.ids.length!==shape.points.length||new Set(shape.ids).size!==shape.ids.length))return {error:'Outline side IDs are invalid.'};
  if(!Number.isFinite(degrees)||!inRange(pivot))return {error:'Enter finite degrees and a pivot within the modeling range.'};
  const before=geometryError(shape.points);if(before)return {error:before};
  const remainder=degrees%360,angle=remainder<0?remainder+360:remainder;if(angle===0)return {shape};
  const cardinal=angle===90?[0,1]:angle===180?[-1,0]:angle===270?[0,-1]:null;
  const [c,s]=cardinal??[Math.cos(angle*Math.PI/180),Math.sin(angle*Math.PI/180)];
  const points=shape.points.map(([x,y])=>{const u=x-pivot[0],v=y-pivot[1];return [pivot[0]+c*u-s*v,pivot[1]+s*u+c*v] as P;});
  const after=geometryError(points);if(after)return {error:after};
  if(points.every((p,i)=>p.every((v,k)=>v===shape.points[i][k])))return {shape};
  return {shape:{...shape,points}};
}
