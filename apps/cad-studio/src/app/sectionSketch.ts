import { faceProfile } from '@barocss/cad-model/app/faceProfile';
import { sectionSketchProfile, type SectionOutlineMode } from '@barocss/cad-model/app/sectionSketchProfile';
import type { SketchNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { cutAfter, nextSerial } from '@barocss/cad-model/engine/ids';
import { planeOfDisplayFace } from '@barocss/cad-model/sketch/plane';
import { sketchShapes } from '@barocss/cad-model/sketch/reopen';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import type { OpenScope } from '../state/openOwnership';
import type { Section } from '../viewport/sectionView';
import type { ViewportHandle } from '../viewport/Viewport';
import { sketchRegion } from './sketchControls';
import type { StudioNotice } from './studioNotice';

type SectionCut = { bodies: readonly BodyResult[]; sourceBodies: readonly BodyResult[]; from: ReadonlyMap<string, string> };

const unreadable = { title: 'The section’s outline could not be read', hint: 'Move the plane and try again.', detail: '' };
const unsupported = { title: 'Outline selection unavailable', hint: 'Cut one body with one outer outline and up to two inner outlines, or choose All.', detail: '' };
const noInner = { title: 'The section has no inner outlines', hint: 'Choose All or Outer only, or move the plane.', detail: '' };

function outlineShapes(profile: SketchNode): SketchShape[] {
  const { shape, done } = sketchShapes(profile);
  return shape ? [shape, ...done] : done;
}

export function sectionSketch(
  exact: SectionCut,
  from: number,
  mode: SectionOutlineMode,
): { draft: SketchState } | { error: FriendlyError } {
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
  return { draft: {
    plane, anchor: { kind: 'face', offset: 0, face: { plane, base: null } },
    tool: 'rectangle', shape: null, done: shapes, base: null,
  } };
}

/** Start an independent sketch from the exact section owned by this rendered view. */
export function sectionSketchAction({ section, model, opening, view }: {
  section: {
    current: { readonly current: Section | null };
    live: { get(): Section | null };
    value: Section | null;
    exact: SectionCut | null;
    exactShown: boolean;
    hasExclusions: boolean;
  };
  model: {
    doc: StudioDoc;
    evaluated: StudioDoc;
    bodies: BodyResult[];
    ready: boolean;
    ownsEvaluation(): boolean;
    canChangeDocument(): boolean;
  };
  opening: { intent: { readonly current: OpenScope }; pending(): boolean };
  view: {
    viewport: { readonly current: Pick<ViewportHandle, 'frameSketch'> | null };
    setNotice(notice: StudioNotice | null): void;
    setSection(value: null): void;
    clearSelection(): void;
    setSketch(draft: SketchState): void;
  };
}) {
  const openScope = opening.intent.current;
  return (mode: SectionOutlineMode) => {
    if (section.hasExclusions) {
      view.setNotice({
        title: 'Restore section instances first',
        hint: 'Selective clipping is display-only; restore excluded instances before creating a section sketch.',
        detail: '',
      });
      return;
    }
    const { value, exact } = section;
    if (value?.mode !== 'plane' || value.planes.length !== 1) return;
    if (!section.exactShown || !exact || section.current.current !== value || section.live.get()
      || !model.ready || !model.ownsEvaluation() || openScope !== opening.intent.current || opening.pending()) {
      view.setNotice({ title: 'The section is still being cut', hint: 'Wait a moment for the exact section, then try again.', detail: '' });
      return;
    }
    if (!model.canChangeDocument()) return;
    const result = sectionSketch(exact, nextSerial(model.evaluated), mode);
    if ('error' in result) {
      view.setNotice({ ...result.error, documentSource: { doc: model.doc, evaluated: model.evaluated } });
      return;
    }
    const { draft } = result;
    view.setNotice(null);
    view.setSection(null);
    view.clearSelection();
    view.setSketch(draft);
    const [min, max] = sketchRegion(model.bodies, draft.plane);
    view.viewport.current?.frameSketch(min, max, draft.plane);
  };
}
