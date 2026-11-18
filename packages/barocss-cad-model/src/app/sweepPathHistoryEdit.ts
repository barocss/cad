import { checkBrep, massPropertiesOf, validateCurve } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import { geometryOf, modelOf } from '../engine/direct';
import { partSnapshot } from '../engine/part';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command } from './commands';
const only=(v:object,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k));
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
/** Copy a visible world-mm line; never infer transforms, trims or a live dependency. */
function copiedPath(doc:StudioDoc,id:string){
 const d=doc.direct;if(!d||!only(d,['sources','objects']))return null;
 const matches=d.objects.filter(o=>o.id===id);if(matches.length!==1)return null;
 const o=matches[0];if(!o.id||!o.name||o.hidden||o.trims!==undefined||!only(o,['id','name','source','geometry','hidden','trims'])
  ||!Object.hasOwn(d.sources,o.source)||typeof d.sources[o.source]!=='string')return null;
 try{
  const m=modelOf(d.sources[o.source]);if(m.lengthUnit!=='mm'||!only(m,['name','version','lengthUnit','objects'])
   ||m.objects.filter(g=>g.id===o.geometry).length!==1)return null;
  const g=geometryOf(d,o);if(g.kind!=='curve'||!only(g,['kind','id','degree','knots','controlPoints','weights'])
   ||!((g.degree===1&&g.controlPoints.length===2)||(g.degree===2&&g.controlPoints.length===3)))return null;
  validateCurve(g);
  return {name:o.name,path:{degree:g.degree,knots:[...g.knots],controlPoints:g.controlPoints.map(p=>[p[0],p[1],p[2]] as [number,number,number]),weights:[...g.weights]}};
 }catch{return null;}
}
export function sweepPathHistoryEdit(doc:StudioDoc,index:number):Command|null{
 if(index!==1||doc.nodes.length!==2||!only(doc,['format','schema','units','parameters','nextId','nodes','outputs','direct']))return null;
 const [profile,sweep]=doc.nodes;
 if(profile.kind!=='sketch'||profile.profile!=='circle'||!only(profile,['id','kind','profile','center','radius'])
  ||!Array.isArray(profile.center)||profile.center.length!==2||!profile.center.every(finite)||!finite(profile.radius)||profile.radius<=0
  ||sweep.kind!=='sweep-curve'||sweep.mode!=='exact-straight'||sweep.sketch!==0||!only(sweep,['id','kind','sketch','name','path','mode'])
  ||doc.nodes.some(n=>typeof n.id!=='string'||!n.id)||profile.id===sweep.id
  ||Object.values(doc.outputs).some(r=>!only(r,['node','side'])||r.node!==1||r.side!=='solid'))return null;
 const prove=(d:StudioDoc)=>{
  const outputs=partSnapshot(d).outputs,o=outputs[0];
  if(outputs.length!==1||o.id!==sweep.id||o.bodyCount!==1||o.brep.bodies.length!==1||o.brep.bodies[0].kind!=='solid'||!checkBrep(o.brep,{strict:true}).valid)
   throw refusal('BAD_REFERENCE','Sweep needs one valid nonempty solid.');
  const volume=massPropertiesOf(o).volume;if(!finite(volume)||volume<=0)throw refusal('BAD_REFERENCE','Sweep needs one valid nonempty solid.');
 };
 const replace=(copy:NonNullable<ReturnType<typeof copiedPath>>):StudioDoc=>({...doc,nodes:[profile,{...sweep,...copy}]});
 const options=(doc.direct?.objects??[]).flatMap(o=>{
  const copy=copiedPath(doc,o.id);if(!copy)return [];
  return [{value:o.id,label:o.name}];
 });
 if(!options.length)return null;
 const revision=canonical(doc),current=(d:StudioDoc)=>d===doc&&canonical(d)===revision;
 return {id:'edit',label:'Edit Sweep path',icon:'cad-sweep',group:'modify',
  available:ctx=>current(ctx.doc)?{ok:true}:{ok:false,reason:'Open the current Sweep in History again.'},
  defaults:()=>({path:''}),fields:()=>[{kind:'choice',key:'path',label:'Path',options:[{value:'',label:'Current copied path'},...options]}],
  steps:()=>[{label:'Copied path',text:'Exact requires a straight path; unsupported paths are refused in preview. Copy the selected curve. The original profile and source curves stay unchanged; later curve edits do not update this Sweep. Face and edge identities may change.',done:true}],
  build:(ctx,values)=>{
   if(!current(ctx.doc))throw refusal('BAD_REFERENCE','Open the current Sweep in History again.');
   if(typeof values.path!=='string'||values.path!==''&&!options.some(o=>o.value===values.path))throw refusal('VALUE','Choose a current supported straight path.');
   prove(doc);if(values.path==='')return doc;
   const copy=copiedPath(doc,values.path);if(!copy)throw refusal('BAD_REFERENCE','The selected path is no longer available.');
   if(canonical(copy)===canonical({name:sweep.name,path:sweep.path}))return doc;
   const next=replace(copy);prove(next);return next;
  }};
}
