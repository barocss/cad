import { checkBrep, diagnoseMesh, faceGeometry, tessellateBrep, type Brep, type Point } from '@barocss/cad';
import { readTwoThroughBorePlate } from '@barocss/cad/internal/bored-cap-offset';
import { emptyDoc, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import type { Reference } from '@barocss/cad-model/engine/schema/references';
import { readReferences } from '@barocss/cad-model/chat/references';
import { digestOf } from '@barocss/cad-model/util/digest';
import { revisionOf } from '@barocss/cad-model/util/revision';
import { plateOverlap, samplePlateColumns } from './locked-plate-overlap';

const min: Point = [0, 0, 0];
const max: Point = [60, 40, 5];
const bores = [{ center: [15, 20], diameter: 6 }, { center: [45, 20], diameter: 8 }] as const;
const tolerance = 1e-7;
const close = (actual: number, expected: number) => Math.abs(actual - expected) < tolerance;
const closePoint = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => close(value, b[index]));

export function stock(base: StudioDoc, height: number) {
  const sketch = withNode(base, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] });
  return withNode(sketch, { kind: 'extrude', sketch: 0, height });
}

export function hole(doc: StudioDoc, center: [number, number], radius: number, depth?: number) {
  const outputs = Object.values(doc.outputs);
  if (outputs.length !== 1) throw new Error('A plate Hole requires one current output.');
  return withNode(doc, {
    kind: 'hole', parent: outputs[0], center, radius, axis: 'z', side: 'max',
    ...(depth === undefined ? {} : { depth }),
  });
}

export function lockedPlateFixture() {
  const geometry = hole(hole(stock(emptyDoc(), 5), [15, 20], 3), [45, 20], 4);
  const { positions, indices } = tessellateBrep(partBreps(geometry)[0].brep);
  const mesh = { positions: Array.from(positions), indices: Array.from(indices) };
  const reference: Reference = {
    id: 'ref1', name: 'Locked plate · millimetres', at: { position: [0, 0, 0], rotation: [0, 0, 0] }, source: { mesh },
  };
  return { mesh, reference, doc: withPlateReference(reference) };
}

export function withPlateReference(reference: Reference): StudioDoc {
  return { ...emptyDoc(), references: { version: 1, references: [reference], keepouts: [], datums: [] } };
}

/** The trial requires explicitly declared millimetres and one closed locked mesh in the authored frame. */
export function admitPlateReference(doc: StudioDoc, unit?: 'mm') {
  if (unit !== 'mm') return { error: 'REFERENCE_SCALE_UNKNOWN' } as const;
  const refs = readReferences(doc.references).references;
  const [reference] = refs;
  if (refs.length !== 1 || !('mesh' in reference.source) || [...reference.at.position, ...reference.at.rotation].some(value => value !== 0))
    return { error: 'REFERENCE_FRAME' } as const;
  const { mesh } = reference.source;
  const diagnosis = diagnoseMesh(mesh.positions, mesh.indices, { weldDistance: tolerance });
  if (!diagnosis.closed || diagnosis.degenerate || diagnosis.duplicates || diagnosis.selfIntersections || diagnosis.pieces !== 1)
    return { error: 'REFERENCE_MESH_OPEN_OR_INVALID' } as const;
  return { referenceSha256: digestOf(reference), samples: samplePlateColumns(mesh), triangleCount: diagnosis.triangles };
}

type Target = Exclude<ReturnType<typeof admitPlateReference>, { error: string }>;
type Bore = { center: [number, number]; diameter: number };

function nativeBores(brep: Brep) {
  const bores: Bore[] = [];
  for (const face of brep.faces) {
    const g = faceGeometry(face);
    if (g.kind !== 'cylinder' || g.out !== -1 || !close(Math.abs(g.a[2]), 1)) continue;
    const center: [number, number] = [g.c[0], g.c[1]], diameter = 2 * g.r;
    if (!bores.some(bore => closePoint(bore.center, center) && close(bore.diameter, diameter))) bores.push({ center, diameter });
  }
  return bores.sort((a, b) => a.center[0] - b.center[0]);
}

export interface PlateEvidence {
  revision: string;
  bodySha256: string;
  iou: number;
  boundsMatch: boolean;
  firstBoreMatches: boolean;
  issues: string[];
}

export function evaluatePlate(doc: StudioDoc, target: Target, exposeGeometry: boolean) {
  // Count one exact body evaluation per action. The final-only policy receives no prefix score.
  const bodies = partBreps(doc);
  if (bodies.length !== 1 || !checkBrep(bodies[0].brep, { strict: true }).valid)
    return { error: 'INVALID_NATIVE_SOLID' } as const;
  const revision = revisionOf(doc);
  const references = readReferences(doc.references).references;
  if (references.length !== 1 || digestOf(references[0]) !== target.referenceSha256)
    return { error: 'REFERENCE_CHANGED' } as const;
  if (!exposeGeometry) return { revision };
  const { brep } = bodies[0];
  const vertices = brep.vertices.map(vertex => vertex.point);
  const boundsMatch = [0, 1, 2].every(axis => close(Math.min(...vertices.map(point => point[axis])), min[axis])
    && close(Math.max(...vertices.map(point => point[axis])), max[axis]));
  const measured = nativeBores(brep), issues: string[] = [];
  if (!boundsMatch) issues.push('WRONG_PLATE_BOUNDS');
  if (measured.length < bores.length) issues.push('MISSING_BORE');
  if (measured.length > bores.length) issues.push('EXTRA_BORE');
  const first = measured[0];
  const firstBoreMatches = !!first && closePoint(first.center, bores[0].center) && close(first.diameter, bores[0].diameter);
  for (const actual of measured) {
    const expected = bores.find(bore => closePoint(actual.center, bore.center));
    if (!expected) issues.push('WRONG_BORE_LOCATION');
    else if (!close(actual.diameter, expected.diameter)) issues.push('WRONG_BORE_DIAMETER');
  }
  const through = readTwoThroughBorePlate(brep);
  if (!through || !close(through.openings[0].z, min[2]) || !close(through.openings[1].z, max[2]))
    issues.push('UNVERIFIED_THROUGH_BORE');
  const evidence: PlateEvidence = {
    revision, bodySha256: digestOf(brep), iou: plateOverlap(target.samples, samplePlateColumns(tessellateBrep(brep))),
    boundsMatch, firstBoreMatches, issues: [...new Set(issues)],
  };
  return { revision, evidence };
}
