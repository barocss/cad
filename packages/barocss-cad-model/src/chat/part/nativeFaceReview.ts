import { faceGeometry, type Brep } from '@barocss/cad';
import { readTwoThroughBorePlate } from '@barocss/cad/internal/bored-cap-offset';
import type { StudioDoc } from '../../engine/doc';
import { partBreps, type BodyResult } from '../../engine/evaluate';
import { revisionOf } from '../../util/revision';
import { fail, json, type ChatState, type ToolOutcome } from '../toolKit';
import type { DirectCandidatePin } from './directCandidate';
import type { reviewModelCandidate } from './modelCandidate';

type ModelReview = Extract<Awaited<ReturnType<typeof reviewModelCandidate>>, { result: unknown }>;
type NativeReviewEvidence = { candidate: DirectCandidatePin & { directRevision: string } } |
  ({ candidate: ModelReview['candidate']; imageSha256: string } & ModelReview['geometry']);

export function nativeFaceReview(state: ChatState, doc: StudioDoc, bodies: readonly BodyResult[], names: readonly string[],
  review?: NativeReviewEvidence): ToolOutcome {
  const keys = new Set(bodies.map(body => body.key));
  const native = partBreps(doc).filter(({ key }) => keys.has(key));
  const owners = native.flatMap(({ key, brep }) => brep.faces.map(face => ({ key, brep, face })));
  const reviewedPlates = new Map<Brep, ReturnType<typeof readTwoThroughBorePlate>>();
  function throughBorePlate(brep: Brep) {
    if (!reviewedPlates.has(brep)) reviewedPlates.set(brep, readTwoThroughBorePlate(brep));
    return reviewedPlates.get(brep);
  }
  const faces = [];
  const boredPlates = new Map<string, NonNullable<ReturnType<typeof readTwoThroughBorePlate>>>();
  const pinnedPlates = review && 'throughBorePlates' in review ? review.throughBorePlates : undefined;
  for (const name of names) {
    const matches = owners.filter(({ face }) => (face.name ?? face.id) === name);
    if (matches.length !== 1)
      return fail(state, `Use a unique native face name from the image. ${JSON.stringify(name)} has ${matches.length} matches.`, { code: 'NATIVE_FACE_NAME' });
    const [{ face, key, brep }] = matches;
    const geometry = face.surface.kind === 'surface' ? faceGeometry(face) : null;
    if (!geometry || geometry.kind === 'other')
      return fail(state, `${JSON.stringify(name)} has no supported analytic plane or cylinder.`, { code: 'NATIVE_FACE_GEOMETRY' });
    if (!pinnedPlates && geometry.kind === 'cylinder' && geometry.out === -1) {
      const plate = throughBorePlate(brep);
      if (plate?.bores.some(bore => bore.faces.includes(name))) boredPlates.set(key, plate);
    }
    faces.push({ name, body: key, geometry: geometry.kind === 'plane'
      ? { kind: 'plane', point: geometry.o, outwardNormal: geometry.n }
      : { kind: 'cylinder', radius: geometry.r, axis: { point: geometry.c, direction: geometry.a },
        outwardNormal: geometry.out === 1 ? 'away-from-axis' : 'toward-axis' } });
  }
  return { state, content: json({ revision: revisionOf(doc), unit: 'mm', faces,
      ...(boredPlates.size ? { throughBorePlates: [...boredPlates].map(([body, plate]) => ({ body, ...plate })) } : {}),
      ...review }),
    isError: false, changed: false, summary: `${faces.length} native faces inspected` };
}
