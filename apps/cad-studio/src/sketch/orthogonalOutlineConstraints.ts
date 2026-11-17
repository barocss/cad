import { CadNumericPolicy } from '@barocss/cad';
import type { SketchShape } from '@barocss/cad-model/sketch/types';
import { settleShape } from '@barocss/cad-model/sketch/settle';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
// H/V are exact coordinate equalities; lengths may differ only by the existing mm tolerance.
// Reject malformed/stale metadata ourselves: the solver filters some invalid H/V indices.
export function orthogonalConstraintError(s:Polygon):string|null {
  if(!s.hv)return 'The outline requires explicit horizontal/vertical metadata.';
  const n=s.points.length,seen=new Set<number>();
  for(const [axis,indices] of [[1,s.hv.h],[0,s.hv.v]] as const)for(const i of indices){
    if(!Number.isInteger(i)||i<0||i>=n||seen.has(i))return 'Invalid or duplicate horizontal/vertical edge index.';
    seen.add(i);if(s.points[i][axis]!==s.points[(i+1)%n][axis])return 'The outline does not satisfy its horizontal/vertical constraints.';
  }
  for(const [key,length] of Object.entries(s.lengths??{})){
    const i=Number(key);
    if(!Number.isInteger(i)||i<0||i>=n||String(i)!==key||!Number.isFinite(length)||length<=0)return 'Invalid edge length constraint.';
    const a=s.points[i],b=s.points[(i+1)%n];
    if(Math.abs(Math.hypot(b[0]-a[0],b[1]-a[1])-length)>CadNumericPolicy.linearTolerance)return 'The outline does not satisfy its edge length constraints.';
  }
  return null;
}

export const hasOrthogonalConstraints=(s:Polygon)=>!!(s.hv!.h.length+s.hv!.v.length+Object.keys(s.lengths??{}).length);
/** Never silently accept solver repair or grid rounding of a snapshot transform. */
export function settlesExactly(shape:Polygon,source:Polygon):boolean {
  const settled=settleShape(shape,source);
  return !settled.error&&settled.shape?.kind==='polygon'&&settled.shape.points.length===shape.points.length&&settled.shape.points.every((p,i)=>p.every((v,j)=>v===shape.points[i][j]));
}
