import { CadNumericPolicy } from '@barocss/cad';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { featureId } from '@barocss/cad-model/engine/ids';
import { canonical } from '@barocss/cad-model/util/revision';
type Result={nodes:ModelNode[]}|{error:FriendlyError};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const pair=(v:unknown):v is [number,number]=>Array.isArray(v)&&v.length===2&&finite(v[0])&&finite(v[1]);
const only=(v:object,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k));
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const pivot=(v:unknown):[number,number,number]|null=>v===undefined?[0,0,0]:Array.isArray(v)&&v.length===3&&finite(v[0])&&finite(v[1])&&finite(v[2])?[v[0],v[1],v[2]]:null;
const refuse=():Result=>({error:{title:'Pattern axis not changed',hint:'This Hole cannot safely follow the circular axis edit. Keep the axis or edit the Hole and pattern separately.',detail:'The accepted document is unchanged.'}});
/** Only numeric XY pivot edits on the legacy half-turn copy. Final native evaluation remains mandatory. */
export function prepareCircularPatternHolePivot(doc:StudioDoc,draft:ModelNode[],index:number):Result {
 const old=doc.nodes[index],next=draft[index];
 if(old?.kind!=='circular-pattern'||next?.kind!=='circular-pattern'||same(old.pivot,next.pivot))return {nodes:draft};
 const active=(nodes:ModelNode[])=>nodes.some(n=>n.kind==='hole'&&!n.held&&!n.suppressed&&n.parent.node===index);
 if(!active(doc.nodes)&&!active(draft))return {nodes:draft};
 const [sk,ex,,hole]=doc.nodes;
 if(index!==2||doc.nodes.length!==4||draft.length!==4||doc.format!=='barocss-cad-model'||doc.schema!==3||doc.units!=='mm'
  ||Object.entries(doc).some(([k,v])=>v!==undefined&&!['format','schema','units','parameters','nextId','nodes','outputs'].includes(k))
  ||Object.values(doc.outputs).length!==1||!same(Object.values(doc.outputs)[0],{node:3,side:'solid'})
  ||sk.kind!=='sketch'||sk.profile!=='rectangle'||!only(sk,['id','kind','profile','min','max'])||!pair(sk.min)||!pair(sk.max)||sk.max.some((v,i)=>v<=Number(sk.min[i]))
  ||ex.kind!=='extrude'||!only(ex,['id','kind','sketch','height','from','draft'])||ex.sketch!==0||!finite(ex.height)||ex.height<=0||(ex.from!==undefined&&!finite(ex.from))||(ex.draft??0)!==0
  ||!only(old,['id','kind','parent','axis','angle','count','span','pivot'])||!same(old.parent,{node:1,side:'solid'})||old.axis!=='z'||old.angle!==90||old.count!==4||old.span!==360
  ||!same({...old,pivot:next.pivot},next)
  ||hole.kind!=='hole'||!only(hole,['id','kind','parent','center','radius','face','axis','side'])||!same(hole.parent,{node:2,side:'solid'})
  ||!pair(hole.center)||!finite(hole.radius)||hole.radius<=0||(hole.axis!==undefined&&hole.axis!=='z')||(hole.side!==undefined&&hole.side!=='max')
  ||hole.face!==`${featureId(doc.nodes,1)}.top@2`||doc.nodes.some((n,i)=>i!==index&&!same(n,draft[i])))return refuse();
 const ids=doc.nodes.map(n=>n.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==4)return refuse();
 const a=pivot(old.pivot),b=pivot(next.pivot);if(!a||!b||a[2]!==b[2])return refuse();
 const {coordinateAbs,linearTolerance}=CadNumericPolicy,margin=4*linearTolerance;
 const bounded=(v:number)=>finite(v)&&Math.abs(v)<=coordinateAbs;
 if(![...a,...b,...sk.min,...sk.max,ex.from??0,(ex.from??0)+ex.height].every(v=>typeof v==='number'&&bounded(v)))return refuse();
 type Box={min:[number,number];max:[number,number]};
 const boxes=(p:[number,number,number]):Box[]=>Array.from({length:4},(_,k)=>{
  const corners: [number,number][]=[];
  for(const x of [Number(sk.min[0]),Number(sk.max[0])])for(const y of [Number(sk.min[1]),Number(sk.max[1])]){
   let u=x-p[0],v=y-p[1];for(let j=0;j<k;j++)[u,v]=[-v,u];corners.push([u+p[0],v+p[1]]);
  }
  return {min:[Math.min(...corners.map(c=>c[0])),Math.min(...corners.map(c=>c[1]))],max:[Math.max(...corners.map(c=>c[0])),Math.max(...corners.map(c=>c[1]))]};
 });
 const before=boxes(a),after=boxes(b);
 for(const layout of [before,after]){
  if(layout.some(box=>![...box.min,...box.max].every(bounded)))return refuse();
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(![0,1].some(k=>layout[i].min[k]-layout[j].max[k]>margin||layout[j].min[k]-layout[i].max[k]>margin))return refuse();
 }
 const radius=hole.radius;
 const center:[number,number]=[hole.center[0]+2*(b[0]-a[0]),hole.center[1]+2*(b[1]-a[1])];
 const inside=(c:[number,number],box:Box)=>c.every((v,k)=>bounded(v)&&v-box.min[k]>radius+margin&&box.max[k]-v>radius+margin);
 if(!inside(hole.center,before[2])||!inside(center,after[2]))return refuse();
 return {nodes:draft.map((n,i)=>i===3?{...hole,center}:n)};
}
