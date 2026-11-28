import { buildBrep, checkBrep, type Brep, type BrepFaceInput } from './brep-core.js';
import type { Curve, Surface } from '../types.js';

const kinds = ['vertices', 'edges', 'coedges', 'loops', 'faces', 'shells', 'bodies'] as const;
type RecordKind = typeof kinds[number];
const curveData = (curve: Curve | null) => curve && [curve.degree, curve.knots, curve.controlPoints, curve.weights];
const surfaceData = (surface: Surface) =>
  [surface.degreeU, surface.degreeV, surface.knotsU, surface.knotsV, surface.controlPoints, surface.weights];

/** Record ordinals identify the same connections across two separately named inputs. */
function signature(brep: Brep): string {
  const ordinals = Object.fromEntries(kinds.map(kind =>
    [kind, new Map(brep[kind].map((record, index) => [record.id, index]))])) as Record<RecordKind, Map<string, number>>;
  const at = (kind: RecordKind, ref: string) => ordinals[kind].get(ref);
  return JSON.stringify([
    brep.vertices.map(vertex => [vertex.point, vertex.tolerance]),
    brep.edges.map(edge => [curveData(edge.curve), edge.vertices.map(vertex => at('vertices', vertex)), edge.tolerance]),
    brep.coedges.map(use => [
      at('edges', use.edge), use.sense, at('loops', use.loop), at('coedges', use.next),
      at('coedges', use.prev), use.twin === null ? null : at('coedges', use.twin), curveData(use.pcurve),
    ]),
    brep.loops.map(loop => [at('faces', loop.face), loop.kind, loop.coedges.map(use => at('coedges', use))]),
    brep.faces.map(face => [
      at('shells', face.shell), surfaceData(face.surface as Surface), face.sense, face.loops.map(loop => at('loops', loop)),
    ]),
    brep.shells.map(shell => [at('bodies', shell.body), shell.closed, shell.faces.map(face => at('faces', face))]),
    brep.bodies.map(body => [body.kind, body.shells.map(shell => at('shells', shell))]),
  ]);
}

function withId(record: Curve, id: string): Curve;
function withId(record: Surface, id: string): Surface;
function withId(record: Curve | Surface, id: string): Curve | Surface {
  return { ...record, id };
}

/** Preserve the native boundary of two exactly matching, ordered gear solids. */
export function exactCoincidentGear(a: Brep, b: Brep, id: string): { brep: Brep; facePairs: ReadonlyMap<string, readonly [string, string]> } | null {
  if ([a, b].some(gear => gear.source.family !== 'gear' || gear.bodies.length !== 1 || gear.shells.length !== 1
    || gear.bodies[0].kind !== 'solid' || gear.bodies[0].shells.length !== 1 || !gear.shells[0].closed
    || gear.faces.some(face => face.surface.kind !== 'surface'))) return null;
  if (kinds.some(kind => a[kind].length !== b[kind].length) || signature(a) !== signature(b)) return null;
  if (![a, b].every(gear => checkBrep(gear, { strict: true }).valid)) return null;

  const vertices = new Map(a.vertices.map((vertex, index) => [vertex.id, `${id}_v${index}`]));
  const edges = new Map(a.edges.map((edge, index) => [edge.id, `${id}_e${index}`]));
  const faces = new Map(a.faces.map((face, index) => [face.id, { face, index }]));
  const loops = new Map(a.loops.map(loop => [loop.id, loop]));
  const uses = new Map(a.coedges.map(use => [use.id, use]));
  const pairs: (readonly [string, string])[] = [];
  const resultFaces = a.shells[0].faces.map((faceId): BrepFaceInput => {
    const { face, index } = faces.get(faceId)!;
    pairs.push([face.id, b.faces[index].id]);
    return {
      id: `f${index}`, surface: withId(face.surface as Surface, `${id}_surface${index}`), sense: face.sense, name: face.name,
      loops: face.loops.map(loopId => {
        const loop = loops.get(loopId)!;
        return { kind: loop.kind, uses: loop.coedges.map(useId => {
          const use = uses.get(useId)!;
          return { edge: edges.get(use.edge)!, sense: use.sense, pcurve: use.pcurve };
        }) };
      }),
    };
  });
  const brep = buildBrep({
    source: { family: 'analytic-boolean', id },
    vertices: a.vertices.map(vertex => ({ id: vertices.get(vertex.id)!, point: vertex.point, tolerance: vertex.tolerance })),
    edges: a.edges.map((edge, index) => ({
      id: edges.get(edge.id)!, curve: withId(edge.curve, `${id}_curve${index}`),
      vertices: [vertices.get(edge.vertices[0])!, vertices.get(edge.vertices[1])!],
      tolerance: edge.tolerance, name: edge.name,
    })),
    bodies: [{ id: `${id}_body0`, kind: 'solid', shells: [{ id: 's0', closed: true, faces: resultFaces }] }],
  });
  if (!checkBrep(brep, { strict: true }).valid) return null;
  return { brep, facePairs: new Map(brep.faces.map((face, i) => [face.id, pairs[i]])) };
}
