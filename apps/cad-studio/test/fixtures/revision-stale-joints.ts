import {emptyDoc, rectanglePart, withNode, type PartInstance} from '@barocss/cad-model/engine/doc';
import {solveDoc} from '@barocss/cad-model/assembly/edit';
import {setInstanceJoints} from '@barocss/cad-model/assembly/flexible';
const plate=(w:number,d:number,h:number,c:[number,number])=>{const p=rectanglePart(w,d,h);return withNode(p,{kind:'hole',parent:{node:p.nodes.length-1,side:'solid'},center:c,radius:5} as never);};
export function revisionJointFixture(){
 const lid:PartInstance={id:'lid',name:'Lid',doc:plate(60,20,5,[10,10]),position:[0,0,30],rotation:[0,0,0]};
 const sub=solveDoc({...plate(100,40,10,[20,20]),instances:[lid],mates:[{id:'c',kind:'concentric',a:{part:'base',face:'n2.side0'},b:{part:'lid',face:'n2.side0'}},{id:'f',kind:'coincident',a:{part:'base',face:'n1.top'},b:{part:'lid',face:'n1.bottom'}}]}).doc;
 const door:PartInstance={id:'door',name:'Door',part:{id:'door-def',rev:'A'},doc:sub,position:[0,0,0],rotation:[0,0,0],grounded:true};
 const doc=setInstanceJoints({...emptyDoc(),instances:[door]},{part:'door',joints:{'base~lid':30}}).doc;
 return {doc,incoming:rectanglePart(80,30,8)};
}
