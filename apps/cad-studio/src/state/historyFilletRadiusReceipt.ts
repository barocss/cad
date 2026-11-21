import type { Ctx, Command, HandleSpec } from '@barocss/cad-model/app/commands';
import type { ModelNode, SketchNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import { bodyKeyFor, featureId } from '@barocss/cad-model/engine/ids';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import { add, cross, dot, len, scale, sub, unit, type Vec3 } from '@barocss/cad-model/engine/vec3';
import type { Active } from '../app/commandState';

type Fillet = Extract<ModelNode,{kind:'fillet'}>;
export type HistoryFilletReceipt = {
  index: number; document: StudioDoc; commandDoc: StudioDoc; bodies: readonly BodyResult[];
  edge: string; face: BodyResult['mesh']['faces'][number];
  frame?: Pick<HandleSpec,'at'|'dir'>;
  /** Also attached to the resulting active edit, so preview/apply checks use the same live owner. */
  isCurrent(): boolean;
};

const numericPoint = (point: readonly unknown[]): point is readonly [number, number] =>
  point.length === 2 && point.every(value => typeof value === 'number' && Number.isFinite(value));

function plainQuarterSector(sketch: Extract<SketchNode, { profile: 'loop' }>): boolean {
  if (Object.keys(sketch).some(key => !['id','kind','profile','segments'].includes(key)) || sketch.segments.length !== 3) return false;
  const [first, arc, last] = sketch.segments;
  if (first.kind !== 'line' || arc.kind !== 'arc' || last.kind !== 'line' ||
    !numericPoint(arc.center) || !numericPoint(arc.start) || !numericPoint(last.start) ||
    !arc.center.every((value, k) => value === first.start[k])) return false;
  const [ux, uy] = [arc.start[0] - arc.center[0], arc.start[1] - arc.center[1]];
  const [vx, vy] = [last.start[0] - arc.center[0], last.start[1] - arc.center[1]];
  const u = Math.hypot(ux, uy), v = Math.hypot(vx, vy);
  if (!(u > 0) || !Number.isFinite(u) || !(v > 0) || Math.abs(v / u - 1) > 1e-12) return false;
  const cosine = (ux / u) * (vx / v) + (uy / u) * (vy / v);
  const sine = (ux / u) * (vy / v) - (uy / u) * (vx / v);
  return Math.abs(cosine) <= 1e-12 && (arc.direction === 'ccw' ? sine > 0 : arc.direction === 'cw' && sine < 0);
}

function historyTopEdges(doc: StudioDoc, fillet: Fillet) {
  if (fillet.edges.length !== 2) return;
  const id = featureId(doc.nodes, 1), first = `${id}.side0|${id}.top`;
  const adjacent = fillet.edges.includes(`${id}.side1|${id}.top`);
  const pair = [first, `${id}.side${adjacent ? 1 : 2}|${id}.top`] as const;
  if (pair.every(edge => fillet.edges.includes(edge) && fillet.sigs?.[edge]?.k === 'line')) return { pair, adjacent };
}

export function ordinaryHistoryFillet(doc: StudioDoc,index: number|null,bodies?:readonly BodyResult[]): Fillet | null {
  if (index!==2 || doc.schema!==3 || doc.nodes.length!==3 || doc.direct!==undefined ||
      doc.instances?.length || doc.variability || doc.configurations || Object.hasOwn(doc,'routeBundles')) return null;
  const [sketch,stock,fillet]=doc.nodes;
  if(sketch.kind!=='sketch'||stock.kind!=='extrude'||stock.sketch!==0||stock.suppressed||stock.held!==undefined||stock.cutDepth!==undefined||
    stock.draft!==undefined||stock.from!==undefined||typeof stock.height!=='number'||!Number.isFinite(stock.height)||stock.height<=0||
    fillet.kind!=='fillet'||fillet.suppressed||fillet.held||fillet.rematched!==undefined||fillet.radii!==undefined||
    fillet.section!==undefined||typeof fillet.radius!=='number'||!Number.isFinite(fillet.radius)||fillet.radius<=0||
    fillet.parent.node!==1||fillet.parent.side!=='solid'||Object.keys(doc.outputs).length!==1||!fillet.sigs ||
    Object.keys(fillet.sigs).length!==fillet.edges.length) return null;
  const stored = fillet.sigs[fillet.edges[0]];
  const plain = sketch.profile === 'rectangle' && Object.keys(sketch).every(k => ['id','kind','profile','min','max'].includes(k))
    && numericPoint(sketch.min) && numericPoint(sketch.max);
  const circular = sketch.profile === 'loop' && stored?.k === 'curve' && plainQuarterSector(sketch);
  if (!plain && !circular) return null;
  const pair = historyTopEdges(doc, fillet);
  if (fillet.edges.length !== 1 && (!plain || !pair)) return null;
  if (pair?.adjacent && bodies && (bodies.length !== 1 || bodies[0].nativeFilletPair?.adjacentTop !== true)) return null;
  const out=doc.outputs[bodyKeyFor(doc.nodes,index,'solid')];
  return out?.node===index&&out.side==='solid'?fillet:null;
}
const sameVec=(a:readonly number[],b:readonly number[])=>a.length===3&&b.length===3&&a.every((v,k)=>Number.isFinite(v)&&v===b[k]);

function originalFilletEdge(stock: BodyResult, fillet: Fillet, edge: string, signatures: ReturnType<typeof signaturesOf>) {
  const sources = stock.mesh.edges.filter(source => source.names.includes(edge));
  const [source] = sources, sig = signatures.edges.get(edge), stored = fillet.sigs?.[edge];
  if (sources.length !== 1 || source.names.length !== 1 || !source.nativeJoint ||
    !sig || sig.shared || !stored || stored.k !== sig.kind || stored.n !== undefined) return;
  const native = toSig(sig);
  if (stored.s === native.s && sameVec(stored.p, native.p)) return { source, sig, stored, native };
}

function exactStraightEdge(match: NonNullable<ReturnType<typeof originalFilletEdge>>) {
  const { sig, source, stored, native } = match;
  return sig.kind === 'line' && source.straight && source.nativeLine && stored.d && native.d && sameVec(stored.d, native.d);
}

function closedSolid(body: BodyResult) {
  return body.topology?.kind === 'solid' && body.topology.bodyCount === 1 &&
    body.topology.openShells === 0 && body.topology.boundaryEdges === 0;
}

function pairedHistoryFrame(doc: StudioDoc, fillet: Fillet, stock: BodyResult, finished: BodyResult,
  radius: number): HistoryFilletReceipt['frame'] {
  const spec = historyTopEdges(doc, fillet), accepted = finished.nativeFilletPair;
  if (!spec || !accepted || !closedSolid(stock) || !closedSolid(finished)) return;
  const { pair, adjacent } = spec;
  if ((adjacent && accepted.adjacentTop !== true) || accepted.targets.length !== 2
    || !pair.every(edge => accepted.targets.includes(edge)) || accepted.cylinders.length !== 2) return;
  const signatures = signaturesOf(stock);
  const rims = pair.map((edge, i) => {
    const match = originalFilletEdge(stock, fillet, edge, signatures);
    if (!match || !exactStraightEdge(match) || !match.source.nativeVertices || !match.source.nativeJoint) return;
    const [wallName, topName] = edge.split('|');
    const faces = match.source.nativeJoint.faces.map(id => stock.mesh.faces.find(face => face.id === id));
    const top = faces.find(face => face?.nativePlaneName === topName);
    const wall = faces.find(face => face?.nativePlaneName === wallName);
    const secondAdjacent = adjacent && i === 1;
    const wallNormal: Vec3 = secondAdjacent ? [1, 0, 0] : [0, i === 0 ? -1 : 1, 0];
    const axis = secondAdjacent ? 1 : 0;
    if (top?.exact?.kind !== 'plane' || wall?.exact?.kind !== 'plane' ||
      !sameVec(top.exact.n, [0, 0, 1]) || !sameVec(wall.exact.n, wallNormal)) return;
    const { a, b, nativeVertices } = match.source;
    if (nativeVertices[0] === nativeVertices[1] || ![...a, ...b].every(Number.isFinite)
      || a[axis] === b[axis] || a.some((coord, k) => k !== axis && coord !== b[k])) return;
    const direction: Vec3 = secondAdjacent ? [0, 1, 0] : [1, 0, 0];
    const midpoint = scale(add(a, b), .5), outward = add(top.exact.n, wall.exact.n);
    return { midpoint, outward, direction, nativeVertices, top: top.id };
  });
  const [first, second] = rims;
  if (!first || !second || first.top !== second.top || first.midpoint[2] !== second.midpoint[2] ||
    new Set([...first.nativeVertices, ...second.nativeVertices]).size !== (adjacent ? 3 : 4)) return;
  if (!adjacent && (first.midpoint[0] !== second.midpoint[0] || second.midpoint[1] - first.midpoint[1] <= 2 * radius)) return;
  const indices = [first, second].map(rim => {
    const center = sub(rim.midpoint, scale(rim.outward, radius));
    return accepted.cylinders.flatMap((cylinder, index) => {
      const { c, a, r } = cylinder, tolerance = Math.max(1e-8, radius * 1e-9);
      return [...c, ...a, r].every(Number.isFinite) && Math.abs(len(a) - 1) <= 1e-9 &&
        len(cross(a, rim.direction)) <= 1e-9 && Math.abs(r - radius) <= tolerance &&
        len(cross(sub(c, center), rim.direction)) <= tolerance ? [index] : [];
    });
  });
  if (indices.some(matches => matches.length !== 1) || indices[0][0] === indices[1][0]) return;
  const dir = unit(first.outward);
  return { at: add(first.midpoint, scale(dir, radius)), dir };
}

function circularHistoryFrame(source: DisplayEdge, finished: BodyResult, edge: string, face: string, radius: number):
  HistoryFilletReceipt['frame'] {
  const rim = source.nativeFilletRim, circle = source.nativeCircle, torus = finished.nativeFilletTorus;
  if (source.straight || !rim?.quarter || !circle || !torus || torus.edge !== edge || torus.face !== face
    || !closedSolid(finished)) return;
  if (![...rim.midpoint, ...rim.direction, ...circle.centre, ...circle.normal, circle.radius,
    ...torus.centre, ...torus.axis, torus.radius, torus.majorRadius].every(Number.isFinite)
    || Math.abs(len(torus.axis) - 1) > 1e-9 || Math.abs(len(rim.direction) - 1) > 1e-9) return;
  const tolerance = Math.max(1e-8, circle.radius * 1e-9);
  const capSign = Math.sign(dot(circle.normal, rim.direction));
  const expectedCentre = add(circle.centre, scale(circle.normal, -capSign * radius));
  if (!capSign || len(cross(torus.axis, circle.normal)) > 1e-9 || len(sub(torus.centre, expectedCentre)) > tolerance
    || Math.abs(torus.radius - radius) > tolerance || Math.abs(torus.majorRadius - (circle.radius - radius)) > tolerance) return;
  return { at: add(rim.midpoint, scale(rim.direction, radius)), dir: rim.direction };
}

export function historyFilletReceipt(doc:StudioDoc,commandDoc:StudioDoc,index:number,bodies:readonly BodyResult[],
  reply:EvalResult,revision:number,isCurrent:()=>boolean):HistoryFilletReceipt|null {
  const fillet=ordinaryHistoryFillet(doc,index,bodies);
  if(!fillet||!isCurrent()||!reply.ok||reply.revision!==revision||reply.bodies.length!==1||
    commandDoc.nodes.length!==3||!commandDoc.nodes.every((n,i)=>n===doc.nodes[i])||bodies.length!==1) return null;
  const [stock]=reply.bodies, [finished]=bodies, edge=fillet.edges[0];
  if(stock.key!==bodyKeyFor(doc.nodes,1,'solid')||stock.ref?.node!==1||stock.ref?.side!=='solid'||
    finished.key!==bodyKeyFor(doc.nodes,index,'solid')||finished.ref?.node!==index||finished.ref?.side!=='solid'||
    (stock.pieces??1)!==1||(finished.pieces??1)!==1) return null;
  const name=featureId(doc.nodes,index)+'.face', face=finished.mesh.faces.filter(f=>f.name.startsWith(featureId(doc.nodes,index)+'.'));
  const topPair = historyTopEdges(doc, fillet);
  // The joined fillet patches share one display face under the feature name.
  const expectedFaces = topPair?.adjacent ? 1 : fillet.edges.length;
  if(face.length!==expectedFaces||face.some(item=>item.name!==name)||!face[0].normal.every(Number.isFinite)||
    Math.abs(Math.hypot(...face[0].normal)-1)>1e-8) return null;
  const radius = Number(fillet.radius), sketch = doc.nodes[0];
  if (fillet.edges.length === 2) {
    const frame = pairedHistoryFrame(doc, fillet, stock, finished, radius);
    return frame ? { document:doc,commandDoc,index,bodies,edge:topPair?.adjacent ? topPair.pair[0] : edge,face:face[0],isCurrent,frame } : null;
  }
  const match = originalFilletEdge(stock, fillet, edge, signaturesOf(stock));
  if (!match) return null;
  let frame: HistoryFilletReceipt['frame'];
  if (sketch.kind === 'sketch' && sketch.profile === 'loop') {
    if (match.sig.kind !== 'curve' || match.stored.d !== undefined || match.stored.r !== undefined) return null;
    frame = circularHistoryFrame(match.source, finished, edge, name, radius);
    if (!frame) return null;
  } else if (!exactStraightEdge(match) || face[0].exact?.kind !== 'cylinder' || Math.abs(face[0].exact.r - radius) > 1e-8) return null;
  return {document:doc,commandDoc,index,bodies,edge,face:face[0],isCurrent,...(frame?{frame}:{})};
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

/** One uncancelable exact refs request per current source, even if the editor briefly leaves idle. */
export function createHistoryFilletReads<T>() {
  let key:object|undefined, pending:Promise<T>|undefined;
  return (source:object,start:()=>Promise<T>):Promise<T>=>{
    if (key!==source || !pending) { key=source; pending=Promise.resolve().then(start); }
    return pending;
  };
}
