import { flatPatternOf, massPropertiesOf } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command } from './commands';
import { prepareSheetReliefHistory } from './sheetReliefHistoryProof';
/** Explicit saved-shape edit; native proof is evaluated only in command build. */
export function sheetReliefShapeHistoryEdit(doc:StudioDoc,index:number):Command|null{
 const state=prepareSheetReliefHistory(doc,index);if(!state)return null;
 const {n,base,sk,current,solid,prove,fail}=state;
 const area=(Number(sk.max[0])-Number(sk.min[0]))*(Number(sk.max[1])-Number(sk.min[1]));
 const size=Number(n.size),thickness=Number(base.thickness);
 const verify=(shape:'square'|'round',output:ReturnType<typeof solid>)=>{
  const expectedArea=area-(shape==='square'?size*size:Math.PI*size*size/4),expectedVolume=expectedArea*thickness;
  const flat=flatPatternOf(output),volume=massPropertiesOf(output).volume;
  if(!(expectedArea>0)||!Number.isFinite(expectedVolume)||!(expectedVolume>0)
   ||Math.abs(volume-expectedVolume)>1e-8*Math.max(1,expectedVolume)
   ||flat.bends.length!==0||flat.loops.length!==1||!flat.loops[0].outer
   ||!Number.isFinite(flat.loops[0].area)||Math.abs(Math.abs(flat.loops[0].area)-expectedArea)>1e-8*Math.max(1,expectedArea))fail();
 };
 return {id:'edit',label:'Edit relief shape',icon:'cad-sheet-corner',group:'modify',
  available:ctx=>current(ctx.doc)?{ok:true}:{ok:false,reason:'Open the current Corner relief in History again.'},
  defaults:()=>({shape:n.shape}),fields:()=>[{kind:'choice',key:'shape',label:'Shape',options:[{value:'square',label:'Square'},{value:'round',label:'Round'}]}],
  steps:()=>[{label:'Saved corner',text:`Keep ${n.edges[0]} and Size ${n.size} mm. Size is the square side or round radius. Only Shape changes; resulting face and edge identities may change.`,done:true},{label:'Sheet rules',text:`Thickness ${base.thickness} mm · Bend radius ${base.bendRadius} mm · K ${base.kFactor}. A flat pattern is available only when the evaluated result passes the sheet checks.`,done:false}],
  build:(ctx,values)=>{
   if(!current(ctx.doc))fail();
   if(Object.keys(values).some(k=>k!=='shape')||(values.shape!=='square'&&values.shape!=='round'))throw refusal('VALUE','Choose Square or Round only; edit Size and Corner separately.');
   const proof=prove();verify(n.shape,proof.original);if(values.shape===n.shape)return doc;
   const shape=values.shape,result:StudioDoc={...doc,nodes:doc.nodes.map((node,i)=>i===index?{...n,shape}:node)};
   const output=solid(result,n.id!);if(canonical(output.sheet)!==canonical(proof.original.sheet))fail();verify(shape,output);return result;
  }};
}
