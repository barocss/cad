import type { Ctx, Command, HandleSpec } from '@barocss/cad-model/app/commands';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import { bodyKeyFor, featureId } from '@barocss/cad-model/engine/ids';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import type { Active } from '../app/commandState';

type Fillet = Extract<ModelNode,{kind:'fillet'}>;
export type HistoryFilletReceipt = {
  index: number; document: StudioDoc; commandDoc: StudioDoc; bodies: readonly BodyResult[];
  edge: string; face: BodyResult['mesh']['faces'][number];
  /** Also attached to the resulting active edit, so preview/apply checks use the same live owner. */
  isCurrent(): boolean;
};

export function ordinaryHistoryFillet(doc: StudioDoc,index: number|null): Fillet | null {
  if (index!==2 || doc.schema!==3 || doc.nodes.length!==3 || doc.direct!==undefined ||
      doc.instances?.length || doc.variability || doc.configurations || Object.hasOwn(doc,'routeBundles')) return null;
  const [sketch,stock,fillet]=doc.nodes;
  if(sketch.kind!=='sketch'||sketch.profile!=='rectangle'||Object.keys(sketch).some(k=>!['id','kind','profile','min','max'].includes(k))||
    [...sketch.min,...sketch.max].some(x=>typeof x!=='number'||!Number.isFinite(x))||
    stock.kind!=='extrude'||stock.sketch!==0||stock.suppressed||stock.held!==undefined||stock.cutDepth!==undefined||
    stock.draft!==undefined||stock.from!==undefined||typeof stock.height!=='number'||!Number.isFinite(stock.height)||stock.height<=0||
    fillet.kind!=='fillet'||fillet.suppressed||fillet.held||fillet.rematched!==undefined||fillet.radii!==undefined||
    fillet.section!==undefined||fillet.edges.length!==1||typeof fillet.radius!=='number'||!Number.isFinite(fillet.radius)||fillet.radius<=0||
    fillet.parent.node!==1||fillet.parent.side!=='solid'||Object.keys(doc.outputs).length!==1||!fillet.sigs ||
    Object.keys(fillet.sigs).length!==1) return null;
  const out=doc.outputs[bodyKeyFor(doc.nodes,index,'solid')];
  return out?.node===index&&out.side==='solid'?fillet:null;
}
const sameVec=(a:readonly number[],b:readonly number[])=>a.length===3&&b.length===3&&a.every((v,k)=>Number.isFinite(v)&&v===b[k]);

export function historyFilletReceipt(doc:StudioDoc,commandDoc:StudioDoc,index:number,bodies:readonly BodyResult[],
  reply:EvalResult,revision:number,isCurrent:()=>boolean):HistoryFilletReceipt|null {
  const fillet=ordinaryHistoryFillet(doc,index);
  if(!fillet||!isCurrent()||!reply.ok||reply.revision!==revision||reply.bodies.length!==1||
    commandDoc.nodes.length!==3||!commandDoc.nodes.every((n,i)=>n===doc.nodes[i])||bodies.length!==1) return null;
  const [stock]=reply.bodies, [finished]=bodies, edge=fillet.edges[0];
  if(stock.key!==bodyKeyFor(doc.nodes,1,'solid')||stock.ref?.node!==1||stock.ref?.side!=='solid'||
    finished.key!==bodyKeyFor(doc.nodes,index,'solid')||finished.ref?.node!==index||finished.ref?.side!=='solid'||
    (stock.pieces??1)!==1||(finished.pieces??1)!==1) return null;
  const source=stock.mesh.edges.filter(e=>e.names.includes(edge));
  if(source.length!==1||source[0].names.length!==1||!source[0].straight||!source[0].nativeLine||!source[0].nativeJoint) return null;
  const sig=signaturesOf(stock).edges.get(edge), stored=fillet.sigs?.[edge];
  if(sig?.kind!=='line'||sig.shared||!stored||stored.k!=='line'||!stored.d||stored.n!==undefined) return null;
  const native=toSig(sig);
  if(!native.d||stored.s!==native.s||!sameVec(stored.p,native.p)||!sameVec(stored.d,native.d)) return null;
  const name=featureId(doc.nodes,index)+'.face', face=finished.mesh.faces.filter(f=>f.name.startsWith(featureId(doc.nodes,index)+'.'));
  if(face.length!==1||face[0].name!==name||face[0].exact?.kind!=='cylinder'||
    Math.abs(face[0].exact.r-Number(fillet.radius))>1e-8||!face[0].normal.every(Number.isFinite)||
    Math.abs(Math.hypot(...face[0].normal)-1)>1e-8) return null;
  return {document:doc,commandDoc,index,bodies,edge,face:face[0],isCurrent};
}

export function ownedHistoryFilletHandle(receipt:HistoryFilletReceipt|undefined, cmd:Command, ctx:Ctx,
  handle:HandleSpec, active:Active|null): HistoryFilletReceipt | undefined {
  if(!receipt?.isCurrent() || cmd.id!=='edit' || handle.key!=='r' || handle.arc || handle.pair ||
    ctx.doc!==receipt.commandDoc || ctx.bodies!==receipt.bodies ||
    (active && (active.cmd!==cmd || active.ctx!==ctx || active.historyFilletRadius!==true || active.ownsSource!==receipt.isCurrent)) ||
    !sameVec(handle.at,receipt.face.centroid) || !sameVec(handle.dir,receipt.face.normal)) return;
  return receipt;
}
export function historyFilletCanPatch(receipt:HistoryFilletReceipt,cmd:Command,ctx:Ctx,current:Active|null,
  captured:Active|null): boolean {
  return receipt.isCurrent() && (current===null ? captured===null :
    current.cmd===cmd && current.ctx===ctx && current.historyFilletRadius===true && current.ownsSource===receipt.isCurrent);
}

/** No change to the eligibility of untagged legacy preview commands. */
export const historyFilletPreviewCurrent = (active: Active): boolean =>
  active.historyFilletRadius!==true || active.ownsSource?.()===true;

/** One uncancelable exact refs request per current source, even if the editor briefly leaves idle. */
export function createHistoryFilletReads<T>() {
  let key:object|undefined, pending:Promise<T>|undefined;
  return (source:object,start:()=>Promise<T>):Promise<T>=>{
    if (key!==source || !pending) { key=source; pending=Promise.resolve().then(start); }
    return pending;
  };
}
