import { faceProfile } from '@barocss/cad-model/app/faceProfile';
import { sectionSketchProfile, type SectionOutlineMode } from '@barocss/cad-model/app/sectionSketchProfile';
import type { SketchNode } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { cutAfter } from '@barocss/cad-model/engine/ids';
import { planeOfDisplayFace, type SketchPlane } from '@barocss/cad-model/sketch/plane';
import { sketchShapes } from '@barocss/cad-model/sketch/reopen';
import type { SketchShape } from '@barocss/cad-model/sketch/types';

const unreadable = { title: 'The section’s outline could not be read', hint: 'Move the plane and try again.', detail: '' };
const unsupported = { title: 'Outline selection unavailable', hint: 'Cut one body with one outer outline and up to two inner outlines, or choose All.', detail: '' };
const noInner = { title: 'The section has no inner outlines', hint: 'Choose All or Outer only, or move the plane.', detail: '' };

function outlineShapes(profile: SketchNode): SketchShape[] {
  const { shape, done } = sketchShapes(profile);
  return shape ? [shape, ...done] : done;
}

export function sectionSketch(
  exact: { bodies: readonly BodyResult[]; sourceBodies: readonly BodyResult[]; from: ReadonlyMap<string, string> },
  from: number,
  mode: SectionOutlineMode,
): { plane: SketchPlane; shapes: SketchShape[] } | { error: FriendlyError } {
  const faces = exact.bodies.flatMap(body => body.mesh.faces
    .filter(face => face.kind === 'plane' && cutAfter(face.name, from))
    .map(face => ({ body, face })));
  const missingCap = exact.bodies.some(body => body.sectionCaps?.some(cap => cutAfter(cap.name, from) && (!faces.length
    || (cap.status !== 'unsupported' && !faces.some(({ body: shown, face }) =>
      shown === body && face.id === cap.faceId && face.nativePlaneName === cap.name)))));
  if (missingCap) return { error: unreadable };
  if (!faces.length) return { error: { title: 'Nothing is cut there', hint: 'Move the section plane through the part first.', detail: '' } };

  const first = faces[0];
  const plane = planeOfDisplayFace(first.face);
  if (!plane) return { error: unreadable };
  const singleCap = exact.sourceBodies.length === 1 && exact.bodies.length === 1 && faces.length === 1
    && exact.from.get(first.body.key) === exact.sourceBodies[0].key;
  if (!singleCap && mode !== 'all') return { error: unsupported };

  const shapes: SketchShape[] = [];
  for (const { body, face } of faces) {
    const evidence = body.sectionCaps?.some(cap => cap.faceId === face.id);
    const result = singleCap || evidence ? sectionSketchProfile(body, face, mode) : null;
    if (result && !result.ok) return { error: result.reason === 'no-inner' ? noInner : result.reason === 'unsupported' ? unsupported : unreadable };
    const profile = result?.profile ?? faceProfile(body.mesh, face.index);
    if (!profile) return { error: unreadable };
    const outlines = outlineShapes(profile);
    if (!outlines.length) return { error: unreadable };
    shapes.push(...outlines);
  }
  return { plane, shapes };
}
