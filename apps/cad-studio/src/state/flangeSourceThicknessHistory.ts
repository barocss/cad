import { flangeRadiusEdit } from '@barocss/cad-model/app/flangeRadiusEdit';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { canonical } from '@barocss/cad-model/util/revision';
import { rectangleTopology } from './rectangleFinishResize';

/** Detect dependent flanges broadly: unsupported recipes must not retain stale signatures. */
export function isFlangeSourceThicknessChange(before: StudioDoc, next: StudioDoc, index: number): boolean {
  const a=before.nodes[index],b=next.nodes[index];
  return a?.kind==='sheet-base' && b?.kind==='sheet-base'
    && canonical(a.thickness)!==canonical(b.thickness)
    && [before,next].some(doc=>doc.nodes.some((n,i)=>{
      if(i<=index || n.kind!=='sheet-flange'||n.held||n.suppressed)return false;
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
export function admitFlangeSourceThicknessChange(before: StudioDoc, next: StudioDoc, index: number): boolean {
  if(index!==1 || !isFlangeSourceThicknessChange(before,next,index))return false;
  // These factories only inspect metadata. Their synchronous native prove methods are NOT called.
  if(!flangeRadiusEdit(before,before.nodes,2)||!flangeRadiusEdit(next,next.nodes,2))return false;
  const a=before.nodes[1],b=next.nodes[1];
  if(a.kind!=='sheet-base'||b.kind!=='sheet-base')return false;
  return canonical({...before,nodes:before.nodes.map((n,i)=>i===1?{...a,thickness:b.thickness}:n)})===canonical(next);
}
/** Full worker-parent evidence; temporary extrude descriptions are never evaluated or saved. */
export function proveFlangeSourceThicknessChange(before: StudioDoc,next: StudioDoc,
  beforeBodies: readonly BodyResult[],afterBodies: readonly BodyResult[]): StudioDoc|null {
  if(!admitFlangeSourceThicknessChange(before,next,1))return null;
  const feature=before.nodes[2];if(feature.kind!=='sheet-flange')return null;
  const name=feature.edges[0];
  const signature=(doc:StudioDoc,bodies:readonly BodyResult[])=>{
    const base=doc.nodes[1],sk=doc.nodes[0];
    if(base.kind!=='sheet-base'||typeof base.thickness!=='number'||sk.kind!=='sketch'||sk.profile!=='rectangle'||bodies.length!==1)return null;
    const body=bodies[0];
    if(body.key!==bodyKeyFor(doc.nodes,1,'solid')||body.ref?.node!==1||body.ref.side!=='solid')return null;
    const proof:StudioDoc={...doc,nodes:doc.nodes.map((n,i)=>i===1?{id:base.id,kind:'extrude',sketch:0,height:base.thickness}:n)};
    if(!rectangleTopology(proof,body))return null;
    const matching=body.mesh.edges.filter(e=>e.names.includes(name));
    if(matching.length!==1)return null;
    const edge=matching[0];
    if(edge.names.length!==1||!edge.nativeLine||edge.a[2]!==base.thickness||edge.b[2]!==base.thickness
      ||edge.a[0]===edge.b[0]&&edge.a[1]===edge.b[1]
      ||!edge.faces.some(i=>body.mesh.faces[i]?.name===`${base.id}.top`))return null;
    const sig=signaturesOf(body).edges.get(name);
    return sig?.kind==='line'&&sig.shared===undefined?{sig,xy:[edge.a.slice(0,2),edge.b.slice(0,2)]}:null;
  };
  const old=signature(before,beforeBodies),updated=signature(next,afterBodies);
  if(!old||!updated||!(canonical(old.xy)===canonical(updated.xy)||canonical(old.xy)===canonical([...updated.xy].reverse()))
    ||!feature.sigs||Object.keys(feature.sigs).length!==1||!Object.hasOwn(feature.sigs,name)
    ||canonical(feature.sigs[name])!==canonical(toSig(old.sig)))return null;
  return {...next,nodes:next.nodes.map((n,i)=>i===2?{...n,sigs:{[name]:toSig(updated.sig)}}:n)};
}
