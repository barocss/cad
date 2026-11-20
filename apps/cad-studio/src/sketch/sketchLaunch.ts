import { refOf, type Ctx } from '@barocss/cad-model/app/commands';
import { faceProfile } from '@barocss/cad-model/app/faceProfile';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { featureId } from '@barocss/cad-model/engine/ids';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { bindPocketFloor, canBindPocketFloor, type PocketFloorBinding } from '@barocss/cad-model/engine/pocketFloor';
import { orderedVertexPlane, planeOfDisplayFace, xyPlane, type SketchPlane } from '@barocss/cad-model/sketch/plane';
import { sketchShapes } from '@barocss/cad-model/sketch/reopen';
import type { Make, SketchAnchor, SketchState } from '@barocss/cad-model/sketch/types';
import { currentNativePlanePick } from '../app/midpointSketch';
import { sketchRegion } from '../app/sketchControls';
import { currentNativeVertexPoints } from '../viewport/vertexPick';

function refuse(title: string, hint: string) {
  return { ok: false as const, notice: { title, hint, detail: '' } };
}

/** Check explicit vertex picks before the command closes other tools. */
export function resolveSketchLaunchVertices(doc: StudioDoc, { selection, bodies }: Ctx, nativeVertexReady: boolean) {
  const picks = selection.vertices;
  if (!picks?.length) return { ok: true as const, plane: null };
  const mixedBodies = picks.length === 3 && picks.some(pick => pick.body !== picks[0].body);
  const points = nativeVertexReady && !selection.faces.length && !selection.edges.length && !selection.bodies.length
    && !selection.sketches?.length ? currentNativeVertexPoints(doc, bodies, picks) : null;
  const plane = points ? orderedVertexPlane(points) : null;
  if (plane) return { ok: true as const, plane };
  const hint = mixedBodies ? 'Selected vertices belong to different bodies. Select three vertices on one body.'
    : points ? 'Selected vertices are collinear or too close to define a plane. Select a vertex away from the line.'
    : 'Select three distinct, non-collinear native vertices on the same current body.';
  return refuse('Sketch plane not set', hint);
}

interface SketchLaunch {
  command: string;
  doc: StudioDoc;
  ctx: Ctx;
  hasPlacedSelection: boolean;
  vertexPlane?: SketchPlane | null;
}

/** Prepare the starting sketch and the bounds used to frame its plane. */
export function prepareSketchLaunch({ command, doc, ctx, hasPlacedSelection, vertexPlane }: SketchLaunch) {
  const { bodies, selection } = ctx;
  if (hasPlacedSelection && !selection.faces.length) {
    return refuse('Placed face sketch unavailable', 'Use Edit part to sketch on a placed face, or clear the selection to start on XY.');
  }
  const pick = selection.faces[0], face = pick && bodies[pick.body]?.mesh.faces[pick.face];
  const plane = vertexPlane ?? (face ? planeOfDisplayFace(face) : xyPlane());
  if (!plane) return refuse('Can’t sketch on this face', 'Pick a flat face, or clear the selection to sketch on XY.');
  const base = face ? refOf(bodies[pick.body]) : null;
  const make: Make | undefined = command === 'revolve' ? 'revolve-y' : command === 'pipe' ? 'pipe' : command === 'loft' ? 'loft' : undefined;
  const profile = face ? faceProfile(bodies[pick.body].mesh, pick.face) : null;
  const outline = profile ? (({ shape, done }) => [...(shape ? [shape] : []), ...done])(sketchShapes(profile)) : undefined;
  const canLinkFace = face && base?.side === 'solid' && !doc.instances?.length;
  const straightOutline = face?.nativeInsetOutline && profile?.profile === 'loop' && !profile.holes?.length
    && profile.segments.length >= 3 && profile.segments.every(segment => segment.kind === 'line');
  const linkSource = canLinkFace && base && straightOutline && face.nativePlaneName
    ? { kind: 'planar-face-outline-inset' as const, version: 1 as const, source: base, sourceFeature: featureId(doc.nodes, base.node), face: face.nativePlaneName } : undefined;
  const linkSourceHint = canLinkFace && !linkSource && outline?.length
    ? profile?.profile === 'loop' && profile.holes?.length ? 'Linked inset needs a face without holes.'
      : face.curvedBoundary ? 'Linked inset needs a straight outer boundary.'
      : 'Linked inset needs one native straight outline without holes.'
    : undefined;
  const nativeFloor = command === 'sketch' && pick && base && !doc.instances?.length && currentNativePlanePick(ctx, pick, doc);
  let pocketFloor: PocketFloorBinding | undefined;
  if (nativeFloor && base && canBindPocketFloor(doc, base, plane, nativeFloor.face.name)) {
    try {
      pocketFloor = bindPocketFloor(doc, base, plane, nativeFloor.face.name, toPartDocument(prefixDoc(doc, base.node + 1)).features);
    } catch {
      // An unsupported native floor remains an ordinary fixed face sketch.
    }
  }
  const anchor: SketchAnchor = vertexPlane ? { kind: 'vertices', offset: 0, vertexPlane }
    : face ? { kind: 'face', offset: 0, face: { plane, base, ...(outline?.length ? { outline } : {}),
      ...(linkSource ? { linkSource } : {}), ...(linkSourceHint ? { linkSourceHint } : {}), ...(pocketFloor ? { pocketFloor } : {}) } }
    : { kind: 'xy', offset: 0 };
  const sketch: SketchState = { plane, anchor, tool: make && make !== 'loft' ? 'circle' : 'rectangle', shape: null, base, ...(make ? { make } : {}) };
  const bounds = sketchRegion(base && pick ? [bodies[pick.body]] : bodies, plane);
  return { ok: true as const, sketch, bounds };
}
