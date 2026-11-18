import { prepareSheetReliefHistory } from '@barocss/cad-model/app/sheetReliefHistoryProof';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { canonical } from '@barocss/cad-model/util/revision';
import { rectangleTopology } from './rectangleFinishResize';

/** Detect dependent relief broadly: unsupported recipes must not retain stale signatures. */
export function isSheetReliefThicknessChange(before: StudioDoc, next: StudioDoc, index: number): boolean {
  const a=before.nodes[index],b=next.nodes[index];
  return a?.kind==='sheet-base' && b?.kind==='sheet-base'
    && canonical(a.thickness)!==canonical(b.thickness)
    && [before,next].some(doc=>doc.nodes.some((n,i)=>{
      if(i<=index || n.kind!=='sheet-corner-relief')return false;
      // Follow the existing single-parent chain only. An unrelated sheet is not
      // affected; an intervening operation on this sheet is detected then refused
      // by the strict three-node admission rather than silently refreshed.
      let at=n.parent.node;
      const seen=new Set<number>();
      while(Number.isInteger(at) && at>=0 && at<i && !seen.has(at)){
        if(at===index)return true;
        seen.add(at);
        const parent=doc.nodes[at];
        if(!parent || !('parent' in parent) || !parent.parent || typeof parent.parent!=='object'
          || !('node' in parent.parent) || typeof parent.parent.node!=='number')return false;
        at=parent.parent.node;
      }
      return false;
    }));
}
export function admitSheetReliefThicknessChange(before: StudioDoc, next: StudioDoc, index: number): boolean {
  if(index!==1 || !isSheetReliefThicknessChange(before,next,index))return false;
  // These factories only inspect metadata. Their synchronous native prove methods are NOT called.
  if(!prepareSheetReliefHistory(before,2)||!prepareSheetReliefHistory(next,2))return false;
  const a=before.nodes[1],b=next.nodes[1];
  if(a.kind!=='sheet-base'||b.kind!=='sheet-base')return false;
  return canonical({...before,nodes:before.nodes.map((n,i)=>i===1?{...a,thickness:b.thickness}:n)})===canonical(next);
}
/** Full worker-parent evidence; temporary extrude descriptions are never evaluated or saved. */
export function proveSheetReliefThicknessChange(before: StudioDoc,next: StudioDoc,
  beforeBodies: readonly BodyResult[],afterBodies: readonly BodyResult[]): StudioDoc|null {
  if(!admitSheetReliefThicknessChange(before,next,1))return null;
  const feature=before.nodes[2];if(feature.kind!=='sheet-corner-relief')return null;
  const name=feature.edges[0];
  const signature=(doc:StudioDoc,bodies:readonly BodyResult[])=>{
    const base=doc.nodes[1],sk=doc.nodes[0];
    if(base.kind!=='sheet-base'||typeof base.thickness!=='number'||sk.kind!=='sketch'||sk.profile!=='rectangle'||bodies.length!==1)return null;
    const body=bodies[0];
    if(body.key!==bodyKeyFor(doc.nodes,1,'solid')||body.ref?.node!==1||body.ref.side!=='solid')return null;
    const proof:StudioDoc={...doc,nodes:doc.nodes.map((n,i)=>i===1?{id:base.id,kind:'extrude',sketch:0,height:base.thickness}:n)};
    if(!rectangleTopology(proof,body))return null;
    const edge=body.mesh.edges.find(e=>e.names.length===1&&e.names[0]===name);
    if(!edge?.nativeLine||edge.a[0]!==edge.b[0]||edge.a[1]!==edge.b[1]
      ||!(edge.a[2]===0&&edge.b[2]===base.thickness||edge.b[2]===0&&edge.a[2]===base.thickness)
      ||![0,1].every(i=>edge.a[i]===sk.min[i]||edge.a[i]===sk.max[i]))return null;
    const sig=signaturesOf(body).edges.get(name);
    return sig?.kind==='line'&&sig.shared===undefined?{sig,xy:[edge.a[0],edge.a[1]]}:null;
  };
  const old=signature(before,beforeBodies),updated=signature(next,afterBodies);
  if(!old||!updated||canonical(old.xy)!==canonical(updated.xy)
    ||canonical(feature.sigs?.[name])!==canonical(toSig(old.sig)))return null;
  return {...next,nodes:next.nodes.map((n,i)=>i===2?{...n,sigs:{[name]:toSig(updated.sig)}}:n)};
}
