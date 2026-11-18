import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { filletRadiusMode, setFilletRadiusMode } from '@barocss/cad-model/app/filletRadiusMode';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { rectangleTopology } from './rectangleFinishResize';
function same(a: unknown,b: unknown): boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x);
  return keys.length===Object.keys(y).length&&keys.every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));
}
/** Mode conversion alone: never discard unequal radii, interior stations or simultaneous edits. */
export function isFilletRadiusModeChange(before:StudioDoc,next:StudioDoc,index:number):boolean {
  if(before.direct!==undefined||next.direct!==undefined||before.instances?.length||next.instances?.length)return false;
  const old=filletRadiusMode(before.nodes,index),now=filletRadiusMode(next.nodes,index);
  if(!old||!now||old.mode===now.mode)return false;
  return same({...before,nodes:[]},{...next,nodes:[]})
    &&same(setFilletRadiusMode(before.nodes,index,now.mode),next.nodes);
}
/** Candidate endpoints are not authority: exact native endpoints and full source topology must agree. */
export function proveFilletRadiusModeChange(before:StudioDoc,next:StudioDoc,bodies:readonly BodyResult[]):boolean {
  if(!isFilletRadiusModeChange(before,next,2)||bodies.length!==1)return false;
  const body=bodies[0],feature=before.nodes[2];if(feature.kind!=='fillet')return false;
  if(body.ref?.node!==1||body.ref.side!=='solid'||body.key!==bodyKeyFor(before.nodes,1,'solid'))return false;
  const topology=rectangleTopology(before,body);if(!topology)return false;
  const name=feature.edges[0],edges=body.mesh.edges.filter(e=>e.names.length===1&&e.names[0]===name);
  if(edges.length!==1)return false;
  const edge=edges[0],sig=signaturesOf(body).edges.get(name);
  if(!edge.nativeLine||!edge.nativeJoint||!edge.nativeVertices||edge.nativeVertices.length!==2||edge.nativeVertices[0]===edge.nativeVertices[1]
    ||![...topology.edges.values()].includes(edge.nativeJoint.edgeId)||!sig||sig.kind!=='line'||sig.shared!==undefined||!same(feature.sigs?.[name],toSig(sig)))return false;
  for(const doc of [before,next]){
    const info=filletRadiusMode(doc.nodes,2);if(!info)return false;
    if(!(same(info.ends[0],edge.a)&&same(info.ends[1],edge.b)||same(info.ends[0],edge.b)&&same(info.ends[1],edge.a)))return false;
    const f=doc.nodes[2];if(f.kind!=='fillet')return false;
    if(f.radii&&!(same(f.radii[0].at,edge.a)&&same(f.radii[1].at,edge.b)||same(f.radii[0].at,edge.b)&&same(f.radii[1].at,edge.a)))return false;
  }
  return true;
}
