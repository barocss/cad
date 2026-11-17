import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { hasOrthogonalConstraints, settlesExactly } from './orthogonalOutlineConstraints';
import { rotateOutline } from './rotateOutline';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const refusal=(error:string)=>({error:error.replace(/Rotation/g,'Translation').replace(/rotation/g,'translation').replace(/Rotate/g,'Translate').replace(/rotate/g,'translate')});
/** Replace one independent straight outline; preserve authored side IDs and invariant constraints.
 * Deltas are finite displacements, not coordinates: only the resulting points must be in range.
 */
export function translateOutline(sketch:SketchState,dx:number,dy:number):{shape:Polygon}|{error:string}{
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return {error:'Enter finite X and Y displacements.'};
  const admitted=rotateOutline(sketch,0,[0,0]);if('error'in admitted)return refusal(admitted.error);
  const source=admitted.shape;if(dx===0&&dy===0)return {shape:source};
  const points=source.points.map(([x,y])=>[x+dx,y+dy] as [number,number]);
  const shape={...source,points};
  const checked=rotateOutline({...sketch,shape},0,[0,0]);if('error'in checked)return refusal(checked.error);
  if(hasOrthogonalConstraints(source)&&!settlesExactly(shape,source))return {error:'Translation would require repairing or rounding the constrained outline.'};
  return {shape:points.every((p,i)=>p.every((v,j)=>v===source.points[i][j]))?source:shape};
}
