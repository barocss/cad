import { CadNumericPolicy } from '@barocss/cad';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { orthogonalConstraintError, hasOrthogonalConstraints, settlesExactly } from './orthogonalOutlineConstraints';
import { rotateOutline } from './rotateOutline';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const refusal=(error:string)=>({error:error==='Rotation supports only horizontal/vertical and edge-length constraints on a straight outline. Other constraints are never removed.'?'Mirror supports only horizontal/vertical and edge-length constraints on a straight outline. Other constraints are never removed.':error.replace(/Rotation/g,'Mirror').replace(/rotation/g,'mirror').replace(/Rotate/g,'Mirror').replace(/rotate/g,'mirror')});
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
  const source=original as Polygon,error=orthogonalConstraintError(source);if(error)return {error};
  const constrained=hasOrthogonalConstraints(source);
  const k=axis==='x'?0:1;
  const points=source.points.map(p=>{const q:[number,number]=[...p];q[k]=2*value-p[k];return q;});
  const shape={...source,points};
  const checked=rotateOutline({...sketch,shape:{...shape,hv:{h:[],v:[]},lengths:undefined}},0,[0,0]);if('error' in checked)return refusal(checked.error);
  if(constrained&&!settlesExactly(shape,source))return {error:'Mirror would require repairing or rounding the constrained outline.'};
  return {shape:points.every((p,i)=>p.every((v,j)=>v===source.points[i][j]))?source:shape};
}
