import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { canonical } from '@barocss/cad-model/util/revision';
import { isFlangeRadiusSourceChange } from '@barocss/cad-model/app/flangeRadiusSourceEdit';
import { rectangleTopology } from './rectangleFinishResize';
/** Prove the actual unchanged plate; the temporary cuboid description is never evaluated or saved. */
export function proveFlangeRadiusSourceChange(before:StudioDoc,next:StudioDoc,bodies:readonly BodyResult[]):boolean {
 if(!isFlangeRadiusSourceChange(before,next,2)||bodies.length!==1)return false;
 const base=before.nodes[1],flange=before.nodes[2],body=bodies[0];
 if(base.kind!=='sheet-base'||flange.kind!=='sheet-flange'||typeof base.thickness!=='number'
  ||body.key!==bodyKeyFor(before.nodes,1,'solid')||body.ref?.node!==1||body.ref.side!=='solid')return false;
 const proof:StudioDoc={...before,nodes:before.nodes.map((n,i)=>i===1?{id:base.id,kind:'extrude',sketch:0,height:base.thickness}:n)};
 const topology=rectangleTopology(proof,body);if(!topology)return false;
 const edge=body.mesh.edges.find(e=>e.names.length===1&&e.names[0]===flange.edges[0]);
 if(!edge?.nativeLine||edge.a[2]!==base.thickness||edge.b[2]!==base.thickness||edge.a[0]===edge.b[0]&&edge.a[1]===edge.b[1])return false;
 if(!edge.faces.some(i=>body.mesh.faces[i]?.name===`${base.id}.top`))return false;
 const sig=signaturesOf(body).edges.get(flange.edges[0]);
 return !!sig&&sig.kind==='line'&&sig.shared===undefined&&!!flange.sigs&&Object.keys(flange.sigs).length===1
  &&Object.hasOwn(flange.sigs,flange.edges[0])&&canonical(flange.sigs[flange.edges[0]])===canonical(toSig(sig));
}
