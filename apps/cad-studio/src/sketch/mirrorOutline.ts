import { CadNumericPolicy } from '@barocss/cad';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { rotateOutline } from './rotateOutline';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const refusal=(error:string)=>({error:error.replace(/Rotation/g,'Mirror').replace(/rotation/g,'mirror').replace(/Rotate/g,'Mirror').replace(/rotate/g,'mirror')});
/** Replace one unconstrained outline by its reflection across sketch X=value or Y=value.
 * Keep authored vertex order and side IDs: side i still joins reflected vertices i and i+1.
 * Winding reverses naturally; existing profile/kernel consumers own orientation normalization.
 */
export function mirrorOutline(sketch:SketchState,axis:'x'|'y',value:number):{shape:Polygon}|{error:string}{
  if((axis!=='x'&&axis!=='y')||!Number.isFinite(value)||Math.abs(value)>CadNumericPolicy.coordinateAbs)return {error:'Choose sketch X or Y and a finite mirror line within the modeling range.'};
  // Zero rotation is a pure admission check with identity output. Reuse its bounded guard,
  // never infer or discard constraints, and never create a second material outline.
  const admitted=rotateOutline(sketch,0,[0,0]);if('error' in admitted)return refusal(admitted.error);
  const source=admitted.shape,k=axis==='x'?0:1;
  const points=source.points.map(p=>{const q:[number,number]=[...p];q[k]=2*value-p[k];return q;});
  const shape={...source,points};
  const checked=rotateOutline({...sketch,shape},0,[0,0]);if('error' in checked)return refusal(checked.error);
  return {shape:points.every((p,i)=>p.every((v,j)=>v===source.points[i][j]))?source:shape};
}
