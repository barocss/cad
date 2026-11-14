import { sampleEdgeCurvature, type EdgeCurvatureMeasurement } from './edgeCurvature';
import { measureBrepEdgeContinuity, type BrepEdgeContinuityResult } from '@barocss/cad';
import { partBreps } from './evaluate';
import type { StudioDoc } from './doc';
import type { DisplayEdge } from './mesh';

export interface ContinuityEdge {
  id: string;
  name: string;
  faces: [string, string];
}

export type ContinuityRequest =
  | { kind: 'list'; picked?: DisplayEdge['nativeJoint'] }
  | { kind: 'measure'; edgeId: string; curvature?: boolean }
  | { kind: 'curve'; edgeId: string; picked?: NonNullable<DisplayEdge['nativeJoint']> };
type ListReply = { edges: ContinuityEdge[]; selected: string | null } | { error: string };
type MeasureReply = { measurement: BrepEdgeContinuityResult } | { error: string };
type CurveReply = { curve: EdgeCurvatureMeasurement } | { error: string };
export type ContinuityReply = ListReply | MeasureReply | CurveReply;

export function readEdgeContinuity(doc: StudioDoc, bodyKey: string, request: Extract<ContinuityRequest, { kind: 'list' }>): ListReply;
export function readEdgeContinuity(doc: StudioDoc, bodyKey: string, request: Extract<ContinuityRequest, { kind: 'measure' }>): MeasureReply;
export function readEdgeContinuity(doc: StudioDoc, bodyKey: string, request: Extract<ContinuityRequest, { kind: 'curve' }>): CurveReply;
export function readEdgeContinuity(doc: StudioDoc, bodyKey: string, request: ContinuityRequest): ContinuityReply;
export function readEdgeContinuity(doc: StudioDoc, bodyKey: string, request: ContinuityRequest): ContinuityReply {
  let bodies: ReturnType<typeof partBreps>;
  try {
    bodies = partBreps(doc).filter(body => body.key === bodyKey);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (bodies.length !== 1) return { error: 'The selected body has no unique native geometry.' };
  const { brep } = bodies[0];
  if (request.kind === 'curve' && brep.source.family === 'mesh')
    return { error: 'Curve curvature needs a native edge on a non-faceted body.' };
  if (request.kind === 'measure') return { measurement: measureBrepEdgeContinuity(brep, request.edgeId, { curvature: request.curvature }) };

  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop.face]));
  const uses = new Map<string, (string | undefined)[]>();
  for (const use of brep.coedges) {
    const list = uses.get(use.edge) ?? [];
    list.push(loops.get(use.loop));
    uses.set(use.edge, list);
  }

  const edges: ContinuityEdge[] = [];
  let selected: string | null = null;
  for (const edge of brep.edges) {
    const on = uses.get(edge.id);
    if (on?.length !== 2 || on[0] === on[1]) continue;
    const a = faces.get(on[0] ?? ''), b = faces.get(on[1] ?? '');
    if (a?.surface.kind !== 'surface' || b?.surface.kind !== 'surface') continue;
    const picked = request.picked;
    const matchesPick = picked?.edgeId === edge.id && picked.faces.includes(a.id) && picked.faces.includes(b.id);
    if (request.kind === 'curve') {
      if (request.edgeId !== edge.id || (picked && !matchesPick)) continue;
      if (brep.edges.filter(candidate => candidate.id === edge.id).length !== 1) break;
      try {
        const spans = sampleEdgeCurvature(edge.curve);
        const magnitudes = spans.flatMap(span => span.map(sample => sample.magnitude));
        return { curve: { edgeId: edge.id, edgeName: edge.name ?? edge.id, unit: '1/mm',
          minimum: Math.min(...magnitudes), maximum: Math.max(...magnitudes), spans } };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'The native edge curvature is unavailable.' };
      }
    }
    if (matchesPick) selected = edge.id;
    edges.push({ id: edge.id, name: edge.name ?? edge.id, faces: [a.name ?? a.id, b.name ?? b.id] });
  }

  return request.kind === 'curve' ? { error: 'The selected edge has no unique native curve on this body.' } : { edges, selected };
}
