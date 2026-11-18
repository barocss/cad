import { flatPatternOf, massPropertiesOf } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command } from './commands';
import { prepareSheetReliefHistory } from './sheetReliefHistoryProof';
export function sheetReliefCornerHistoryEdit(doc:StudioDoc,index:number):Command|null{
 const state=prepareSheetReliefHistory(doc,index);if(!state)return null;
 const {n,base,corners,current,solid,prove,fail}=state;
 return {id:'edit',label:'Edit relief corner',icon:'cad-sheet-corner',group:'modify',
  available:ctx=>current(ctx.doc)?{ok:true}:{ok:false,reason:'Open the current Corner relief in History again.'},
  defaults:()=>({corner:n.edges[0]}),fields:()=>[{kind:'choice',key:'corner',label:'Corner',options:corners.map(c=>({value:c.name,label:`X ${c.x}, Y ${c.y} mm`}))}],
  steps:()=>[{label:'Saved relief',text:`Move the ${n.shape} relief (${n.size} mm) to the selected plate corner. Shape and size stay unchanged; face and edge identities may change.`,done:true},{label:'Sheet rules',text:`Thickness ${base.thickness} mm · Bend radius ${base.bendRadius} mm · K ${base.kFactor}. The flat pattern is preserved when preview succeeds.`,done:true}],
  build:(ctx,values)=>{
   if(!current(ctx.doc))fail();if(typeof values.corner!=='string'||!corners.some(c=>c.name===values.corner))throw refusal('VALUE','Choose one of the four plate corners.');
   const proof=prove();if(values.corner===n.edges[0])return doc;
   const corner=values.corner,sig=proof.sigs.get(corner);if(!sig)return fail();
   const result:StudioDoc={...doc,nodes:doc.nodes.map((node,i)=>i===2?{...n,edges:[corner],sigs:{[corner]:sig}}:node)};
   const output=solid(result,n.id!),flat=flatPatternOf(output);
   if(canonical(output.sheet)!==canonical(proof.original.sheet)||flat.bends.length!==0||flat.loops.length!==1||!flat.loops[0].outer)fail();
   const a=massPropertiesOf(proof.original).volume,b=massPropertiesOf(output).volume;
   if(Math.abs(a-b)>1e-8*Math.max(1,a))fail();return result;
  }};
}
