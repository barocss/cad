// The part's view handlers (R3, moved verbatim from chat/tools.ts's runPartTool): rendered views, a face's or an
// edge's detail, and the selection by name.
import { resolveNames, resolveSelectors, type NameSelection } from '../names';
import { edgeDetail, faceDetail } from '../observe';
import { renderDirectViews, renderViews } from '../views';
import { partBreps, type BodyResult } from '../../engine/evaluate';
import type { StudioDoc } from '../../engine/doc';
import { type ChatState, type Evaluate, type ToolOutcome, type PartHandler, type PartRun, json, fail, strings, list } from '../toolKit';
import { isObj } from '../../util/guards';
import { revisionOf } from '../../util/revision';
import { loadDirect } from '../../engine/directModule';
import { directInspectionRevision } from '../sweepSource';
import { isDirectPin, pinnedDirectCandidate, type DirectCandidatePin } from './directCandidate';
import { reviewModelCandidate } from './modelCandidate';
import { evaluateCurve, faceGeometry, surfaceDomain } from '@barocss/cad';

async function renderDirectReview(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate, dispatch: PartRun): Promise<ToolOutcome> {
  const { expectedDirectRevision, proposal, expectedProposalRevision } = args;
  if (!isDirectPin(expectedDirectRevision) || args.expectedRevision !== undefined || args.highlight !== undefined || args.section !== undefined)
    return fail(state, 'For Direct review, pass direct_revision from query.summary as expectedDirectRevision without expectedRevision, highlight or section.', { code: 'DIRECT_RENDER_INPUT' });
  if (state.partOf || state.doc.instances?.length)
    return fail(state, 'Use Direct review in the base part of a document without placed parts.', { code: 'DIRECT_RENDER_SCOPE' });
  if (state.bodies.length && proposal === undefined && expectedProposalRevision === undefined)
    return fail(state, 'Use sheet and curve review on a base document with only Direct geometry to display.', { code: 'DIRECT_RENDER_SCOPE' });

  let doc = state.doc;
  const baseDirectRevision = directInspectionRevision(doc);
  if (expectedDirectRevision !== baseDirectRevision)
    return fail(state, 'The Direct inputs changed. Read query.summary again.', { code: 'DIRECT_RENDER_STALE', expectedDirectRevision, revision: baseDirectRevision });
  let candidate: DirectCandidatePin | undefined;
  if (proposal !== undefined || expectedProposalRevision !== undefined) {
    const replay = await pinnedDirectCandidate(state, args, baseDirectRevision, evaluate, dispatch, 'RENDER');
    if ('refusal' in replay) return replay.refusal;
    const { preview } = replay;
    candidate = replay.candidate;
    if (replay.kind === 'solid') {
      const result = await renderViews(preview.doc, preview.bodies, evaluate);
      if (typeof result === 'string') return fail(state, result, { code: 'DIRECT_RENDER_PROPOSAL_FAILED' });
      const { image, ...rest } = result;
      return { state, content: json({ revision: revisionOf(preview.doc), ...rest, candidate: { ...candidate, directRevision: directInspectionRevision(preview.doc) } }),
        isError: false, changed: false, summary: `Solid proposal ${candidate.proposal}`, images: [{ data: image, mediaType: 'image/png' }] };
    }
    if (preview.doc.direct === doc.direct)
      return fail(state, 'The replay did not produce a Direct candidate.', { code: 'DIRECT_RENDER_PROPOSAL_FAILED' });
    doc = preview.doc;
  }
  const result = await renderDirectViews(doc);
  if (!result) return fail(state, 'There is no visible Direct curve or sheet to render.', { code: 'DIRECT_RENDER_EMPTY' });
  const { image, ...rest } = result;
  return { state, content: json({ revision: candidate ? directInspectionRevision(doc) : baseDirectRevision, ...rest, ...(candidate ? { candidate } : {}) }),
    isError: false, changed: false, summary: candidate ? `Direct proposal ${candidate.proposal}` : `Direct views (${rest.directObjects.length} objects)`,
    images: [{ data: image, mediaType: 'image/png' }] };
}

const renderViewsTool: PartHandler = async (state, args, evaluate, _options, dispatch) => {
  const orientation = args.orientation === 'opposite' ? 'opposite' as const : undefined;
  if (orientation && (args.expectedDirectRevision !== undefined || args.section !== undefined))
    return fail(state, 'Use opposite orientation for solid views without a section.', { code: 'RENDER_ORIENTATION_SCOPE' });
  if (args.expectedDirectRevision === undefined && args.expectedRevision !== undefined &&
    (args.proposal !== undefined || args.expectedProposalRevision !== undefined)) {
    const review = await reviewModelCandidate(state, args, evaluate, dispatch, false);
    if ('refusal' in review) return review.refusal;
    const { image, ...views } = review.result;
    const ductKind = 'rectangularDuct' in review.geometry ? review.geometry.rectangularDuct.pathKind ?? 'S-bend' : undefined;
    const label = ductKind ? `Rectangular ${ductKind} duct`
      : 'rectangularDuctIntersection' in review.geometry ? 'Offset rectangular duct Intersect'
        : 'chamferResize' in review.geometry ? 'Saved Chamfer resize'
          : 'cornerBatch' in review.geometry ? 'Sketch corner proposal' : 'Bored wall proposal';
    return { state, content: json({ revision: review.revision, ...views, candidate: review.candidate, ...review.geometry }),
      isError: false, changed: false, summary: `${label} ${review.candidate.proposal}`, images: [{ data: image, mediaType: 'image/png' }] };
  }
  if (args.expectedDirectRevision !== undefined || args.proposal !== undefined || args.expectedProposalRevision !== undefined)
    return renderDirectReview(state, args, evaluate, dispatch);
  if (args.expectedRevision !== undefined && (typeof args.expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(args.expectedRevision)))
    return fail(state, 'expectedRevision must be the 16-digit revision from query.rebuild for the same part.', { code: 'RENDER_INPUT' });
  const revision = revisionOf(state.doc);
  if (args.expectedRevision !== undefined && args.expectedRevision !== revision)
    return fail(state, 'The part changed since the requested revision. Read query.rebuild again for the same part.', { code: 'RENDER_STALE', expectedRevision: args.expectedRevision, revision });
  const highlight = strings(args.highlight), sec = isObj(args.section) ? args.section : undefined;
  if (sec && (!['x', 'y', 'z'].includes(String(sec.axis)) || !Number.isFinite(Number(sec.at)))) return fail(state, 'A section takes an axis (x, y or z) and at (mm).');
  const r = await renderViews(state.doc, state.bodies, evaluate, {
    ...(highlight.length ? { highlight } : {}),
    ...(sec ? { section: { axis: String(sec.axis) as 'x' | 'y' | 'z', at: Number(sec.at) } } : {}),
    ...(orientation ? { orientation } : {}),
  });
  if (typeof r === 'string') return fail(state, r);
  const { image, ...rest } = r;
  return { state, content: json({ revision, ...rest }), isError: false, changed: false, summary: `views (${Object.keys(r.legend).length} faces labelled)`, images: [{ data: image, mediaType: 'image/png' }] };
};
async function inspectCurveJoin(state: ChatState, args: Record<string, unknown>): Promise<ToolOutcome> {
  const { curve, parameter, expectedDirectRevision } = args;
  if (args.faces !== undefined || args.edges !== undefined || typeof curve !== 'string' || !curve
    || typeof parameter !== 'number' || !Number.isFinite(parameter)
    || typeof expectedDirectRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDirectRevision))
    return fail(state, 'Use a curve ID, a finite parameter and the direct_revision from query.summary, without faces or edges.', { code: 'DIRECT_JOIN_INPUT' });
  if (state.partOf) return fail(state, 'Inspect a Direct join in the base part.', { code: 'DIRECT_JOIN_SCOPE' });
  const revision = directInspectionRevision(state.doc);
  if (revision !== expectedDirectRevision)
    return fail(state, 'The Direct inputs changed. Read query.summary again.', { code: 'DIRECT_JOIN_STALE', revision });
  const direct = state.doc.direct;
  const matches = direct?.objects.filter(object => object.id === curve) ?? [];
  if (!direct || matches.length !== 1 || matches[0].hidden)
    return fail(state, 'Use the ID of a unique visible Direct curve from query.summary.', { code: 'DIRECT_JOIN_CURVE' });

  const { geometryOf, directJoinTangentAngle } = await loadDirect();
  try {
    const geometry = geometryOf(direct, matches[0]);
    if (geometry.kind === 'curve') {
      const angleDegrees = directJoinTangentAngle(geometry, parameter);
      if (angleDegrees !== null) {
        const curveJoin = { curveId: curve, parameter, point: evaluateCurve(geometry, parameter), angleDegrees, unit: 'degrees', revision };
        return { state, content: json({ curveJoin }), isError: false, changed: false, summary: 'Direct join tangent angle' };
      }
    }
  } catch {
    return fail(state, 'The Direct curve could not be read.', { code: 'DIRECT_JOIN_CURVE' });
  }
  return fail(state, 'The parameter has no supported exact Direct join angle.', { code: 'DIRECT_JOIN_UNAVAILABLE' });
}
async function inspectSurfacePoint(state: ChatState, args: Record<string, unknown>): Promise<ToolOutcome> {
  const { surface, u, v, expectedDirectRevision } = args;
  if (args.faces !== undefined || args.edges !== undefined || args.curve !== undefined || args.parameter !== undefined
    || typeof surface !== 'string' || !surface || typeof u !== 'number' || typeof v !== 'number'
    || !Number.isFinite(u) || !Number.isFinite(v)
    || typeof expectedDirectRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDirectRevision))
    return fail(state, 'Use one surface ID, finite native u and v, and the direct_revision from query.summary.', { code: 'DIRECT_SURFACE_INPUT' });
  if (state.partOf) return fail(state, 'Inspect a Direct surface in the base part.', { code: 'DIRECT_SURFACE_SCOPE' });
  const revision = directInspectionRevision(state.doc);
  if (revision !== expectedDirectRevision)
    return fail(state, 'The Direct inputs changed. Read query.summary again.', { code: 'DIRECT_SURFACE_STALE', revision });
  const direct = state.doc.direct, matches = direct?.objects.filter(object => object.id === surface) ?? [];
  const unavailable = () => fail(state, 'Use the ID of a unique visible untrimmed Direct surface from query.summary.', { code: 'DIRECT_SURFACE_SOURCE' });
  if (!direct || matches.length !== 1 || matches[0].hidden || matches[0].trims?.length) return unavailable();

  const { geometryOf, analyzeSurface } = await loadDirect();
  let domain: ReturnType<typeof surfaceDomain>;
  try {
    const geometry = geometryOf(direct, matches[0]);
    if (geometry.kind !== 'surface') return unavailable();
    domain = surfaceDomain(geometry);
  } catch { return unavailable(); }
  if (u < domain.u[0] || u > domain.u[1] || v < domain.v[0] || v > domain.v[1])
    return fail(state, 'Choose u and v inside the native surface domain.', { code: 'DIRECT_SURFACE_DOMAIN', domain });
  try {
    const { point, normal } = analyzeSurface(direct, surface, u, v);
    return { state, content: json({ surfacePoint: { surfaceId: surface, u, v, point, normal, unit: 'mm', revision } }),
      isError: false, changed: false, summary: 'Direct surface point and normal' };
  } catch {
    return fail(state, 'The native surface normal is unavailable at this parameter pair.', { code: 'DIRECT_SURFACE_NORMAL' });
  }
}

type ModelReview = Extract<Awaited<ReturnType<typeof reviewModelCandidate>>, { result: unknown }>;
type NativeReviewEvidence = { candidate: DirectCandidatePin & { directRevision: string } } |
  ({ candidate: ModelReview['candidate']; imageSha256: string } & ModelReview['geometry']);

function nativeFaceReview(state: ChatState, doc: StudioDoc, bodies: readonly BodyResult[], names: readonly string[],
  review?: NativeReviewEvidence): ToolOutcome {
  const keys = new Set(bodies.map(body => body.key));
  const native = partBreps(doc).filter(({ key }) => keys.has(key)).flatMap(({ key, brep }) => brep.faces.map(face => ({ key, face })));
  const faces = [];
  for (const name of names) {
    const matches = native.filter(({ face }) => (face.name ?? face.id) === name);
    if (matches.length !== 1)
      return fail(state, `Use a unique native face name from the image. ${JSON.stringify(name)} has ${matches.length} matches.`, { code: 'NATIVE_FACE_NAME' });
    const [{ face, key }] = matches;
    const geometry = face.surface.kind === 'surface' ? faceGeometry(face) : null;
    if (!geometry || geometry.kind === 'other')
      return fail(state, `${JSON.stringify(name)} has no supported analytic plane or cylinder.`, { code: 'NATIVE_FACE_GEOMETRY' });
    faces.push({ name, body: key, geometry: geometry.kind === 'plane'
      ? { kind: 'plane', point: geometry.o, outwardNormal: geometry.n }
      : { kind: 'cylinder', radius: geometry.r, axis: { point: geometry.c, direction: geometry.a },
        outwardNormal: geometry.out === 1 ? 'away-from-axis' : 'toward-axis' } });
  }
  return { state, content: json({ revision: revisionOf(doc), unit: 'mm', faces, ...review }),
    isError: false, changed: false, summary: `${faces.length} native faces inspected` };
}

async function inspectNativeFaces(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate, dispatch: PartRun): Promise<ToolOutcome> {
  const { faces, expectedRevision, expectedDirectRevision, proposal, expectedProposalRevision } = args;
  if (!Array.isArray(faces) || !faces.length || !faces.every(name => typeof name === 'string' && name.length > 0)
    || [args.edges, args.curve, args.parameter, args.surface, args.u, args.v].some(value => value !== undefined))
    return fail(state, 'For pinned native inspection, supply exact face names in faces.', { code: 'NATIVE_FACE_INPUT' });
  if (expectedDirectRevision === undefined && (args.expectedReviewRevision !== undefined ||
    (expectedRevision !== undefined && (proposal !== undefined || expectedProposalRevision !== undefined)))) {
    const review = await reviewModelCandidate(state, args, evaluate, dispatch, true);
    if ('refusal' in review) return review.refusal;
    return nativeFaceReview(state, review.preview.doc, review.preview.bodies, faces, {
      candidate: review.candidate, ...review.geometry, imageSha256: review.result.imageSha256,
    });
  }
  if (proposal === undefined && expectedProposalRevision === undefined) {
    if (expectedDirectRevision !== undefined || typeof expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(expectedRevision))
      return fail(state, 'For the current part, supply its model revision as expectedRevision.', { code: 'NATIVE_FACE_INPUT' });
    const revision = revisionOf(state.doc);
    if (expectedRevision !== revision)
      return fail(state, 'The part revision changed. Read query.rebuild again before inspecting faces.', { code: 'NATIVE_FACE_STALE', revision });
    return nativeFaceReview(state, state.doc, state.bodies, faces);
  }
  if (expectedRevision !== undefined || args.expectedReviewRevision !== undefined || !isDirectPin(expectedDirectRevision))
    return fail(state, 'For a pending proposal, supply the Direct and proposal revision pins.', { code: 'DIRECT_INSPECT_INPUT' });
  if (state.partOf || state.doc.instances?.length)
    return fail(state, 'Use pending native face review in the base part of a document without placed parts.', { code: 'DIRECT_INSPECT_SCOPE' });
  const baseDirectRevision = directInspectionRevision(state.doc);
  if (expectedDirectRevision !== baseDirectRevision)
    return fail(state, 'The Direct inputs changed. Read query.summary again.', { code: 'DIRECT_INSPECT_STALE', revision: baseDirectRevision });
  const replay = await pinnedDirectCandidate(state, args, baseDirectRevision, evaluate, dispatch, 'INSPECT');
  if ('refusal' in replay) return replay.refusal;
  const { preview, candidate } = replay;
  return nativeFaceReview(state, preview.doc, preview.bodies, faces, { candidate: { ...candidate, directRevision: directInspectionRevision(preview.doc) } });
}

const inspectTool: PartHandler = async (state, args, evaluate, _options, dispatch) => {
  if (args.orientation === 'opposite' && (args.expectedReviewRevision === undefined || args.expectedDirectRevision !== undefined))
    return fail(state, 'Use opposite orientation with the pinned pending solid image.', { code: 'MODEL_REVIEW_INPUT' });
  if (args.expectedRevision !== undefined || args.proposal !== undefined || args.expectedProposalRevision !== undefined || args.expectedReviewRevision !== undefined)
    return inspectNativeFaces(state, args, evaluate, dispatch);
  if (args.surface !== undefined || args.u !== undefined || args.v !== undefined)
    return inspectSurfacePoint(state, args);
  if (args.curve !== undefined || args.parameter !== undefined || args.expectedDirectRevision !== undefined)
    return inspectCurveJoin(state, args);
  const r = resolveSelectors(state.doc.nodes, state.bodies, { faces: list(args.faces), edges: list(args.edges) });
  if (r.error) return fail(state, r.error);
  const faces = r.names.faces.map(n => faceDetail(state.doc, state.bodies, n) ?? { name: n, error: 'no such face' });
  const edges = r.names.edges.map(n => edgeDetail(state.doc, state.bodies, n) ?? { name: n, error: 'no such edge' });
  const out = { ...(faces.length ? { faces } : {}), ...(edges.length ? { edges } : {}), ...(r.resolved.length ? { resolved: r.resolved } : {}) };
  return { state, content: json(out), isError: false, changed: false, summary: `${faces.length + edges.length} inspected` };
};
async function selectTool(state: ChatState, args: Record<string, unknown>): Promise<ToolOutcome> {
  const r = resolveSelectors(state.doc.nodes, state.bodies, { faces: list(args.faces), edges: list(args.edges), bodies: list(args.bodies) });
  if (r.error) return fail(state, r.error);
  const sel: NameSelection = r.names, { unknown } = resolveNames(state.bodies, sel);
  if (unknown.length) return fail(state, `No face, edge or body named ${unknown.map(n => `"${n}"`).join(', ')}.`);
  const count = sel.faces.length + sel.edges.length + sel.bodies.length;
  return { state: { ...state, selection: sel }, content: json({ ok: true, selected: sel, ...(r.resolved.length ? { resolved: r.resolved } : {}) }), isError: false, changed: false, summary: `${count} selected` };
}

/** The view group's handlers, by v1 tool name (R3). */
export const VIEW_HANDLERS: Readonly<Record<string, PartHandler>> = { render_views: renderViewsTool, inspect: inspectTool, select: selectTool };
