import { CadNumericPolicy } from '@barocss/cad';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import { rotateOutline } from './rotateOutline';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const refusal=(error:string)=>({error:error==='Rotation requires an explicitly unconstrained straight outline. Existing constraints are never removed.'?'Mirror supports only horizontal/vertical and edge-length constraints on a straight outline. Other constraints are never removed.':error.replace(/Rotation/g,'Mirror').replace(/rotation/g,'mirror').replace(/Rotate/g,'Mirror').replace(/rotate/g,'mirror')});
// H/V are exact coordinate equalities; lengths may differ only by the existing mm tolerance.
// Reject malformed/stale metadata ourselves: the solver filters some invalid H/V indices.
function constraintError(s:Polygon):string|null {
  if(!s.hv)return 'Mirror requires explicit horizontal/vertical metadata.';
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
/** Replace one independent outline by its reflection across sketch X=value or Y=value.
 * Keep authored vertex order and side IDs: side i still joins reflected vertices i and i+1.
 * Winding reverses naturally; existing profile/kernel consumers own orientation normalization.
 */
export function mirrorOutline(sketch:SketchState,axis:'x'|'y',value:number):{shape:Polygon}|{error:string}{
  if((axis!=='x'&&axis!=='y')||!Number.isFinite(value)||Math.abs(value)>CadNumericPolicy.coordinateAbs)return {error:'Choose sketch X or Y and a finite mirror line within the modeling range.'};
  const original=sketch.shape;
  // The temporary geometry-admission copy omits ONLY mirror-invariant metadata.
  // The returned shape always comes from the original, never from this copy.
  const validationShape=original?.kind==='polygon'?{...original,hv:original.hv?{h:[],v:[]}:undefined,lengths:undefined}:original;
  const admitted=rotateOutline({...sketch,shape:validationShape},0,[0,0]);if('error' in admitted)return refusal(admitted.error);
  const source=original as Polygon,error=constraintError(source);if(error)return {error};
  const constrained=source.hv!.h.length+source.hv!.v.length+Object.keys(source.lengths??{}).length>0;
  const k=axis==='x'?0:1;
  const points=source.points.map(p=>{const q:[number,number]=[...p];q[k]=2*value-p[k];return q;});
  const shape={...source,points};
  const checked=rotateOutline({...sketch,shape:{...shape,hv:{h:[],v:[]},lengths:undefined}},0,[0,0]);if('error' in checked)return refusal(checked.error);
  if(constrained){
    const settled=settleShape(shape,source);
    if(settled.error||settled.shape?.kind!=='polygon'||!settled.shape.points.every((p,i)=>p.every((v,j)=>v===points[i][j])))return {error:'Mirror would require repairing or rounding the constrained outline.'};
  }
  return {shape:points.every((p,i)=>p.every((v,j)=>v===source.points[i][j]))?source:shape};
}
