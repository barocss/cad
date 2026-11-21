// The part's view handlers (R3, moved verbatim from chat/tools.ts's runPartTool): rendered views, a face's or an
// edge's detail, and the selection by name.
import { resolveNames, resolveSelectors, type NameSelection } from '../names';
import { edgeDetail, faceDetail } from '../observe';
import { renderViews } from '../views';
import { type ChatState, type Evaluate, type ToolOutcome, type PartHandler, json, fail, strings, list } from '../toolKit';
import { isObj } from '../../util/guards';
import { revisionOf } from '../../util/revision';
import { loadDirect } from '../../engine/directModule';
import { directInspectionRevision } from '../sweepSource';
import { evaluateCurve } from '@barocss/cad';

async function renderViewsTool(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate): Promise<ToolOutcome> {
  if (args.expectedRevision !== undefined && (typeof args.expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(args.expectedRevision)))
    return fail(state, 'expectedRevision must be the 16-digit revision from query.rebuild for the same part.', { code: 'RENDER_INPUT' });
  const revision = revisionOf(state.doc);
  if (args.expectedRevision !== undefined && args.expectedRevision !== revision)
    return fail(state, 'The part changed since the requested revision. Read query.rebuild again for the same part.', { code: 'RENDER_STALE', expectedRevision: args.expectedRevision, revision });
  const highlight = strings(args.highlight), sec = isObj(args.section) ? args.section : undefined;
  if (sec && (!['x', 'y', 'z'].includes(String(sec.axis)) || !Number.isFinite(Number(sec.at)))) return fail(state, 'A section takes an axis (x, y or z) and at (mm).');
  const r = await renderViews(state.doc, state.bodies, evaluate, { ...(highlight.length ? { highlight } : {}), ...(sec ? { section: { axis: String(sec.axis) as 'x' | 'y' | 'z', at: Number(sec.at) } } : {}) });
  if (typeof r === 'string') return fail(state, r);
  const { image, ...rest } = r;
  return { state, content: json({ revision, ...rest }), isError: false, changed: false, summary: `views (${Object.keys(r.legend).length} faces labelled)`, images: [{ data: image, mediaType: 'image/png' }] };
}
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
async function inspectTool(state: ChatState, args: Record<string, unknown>): Promise<ToolOutcome> {
  if (args.curve !== undefined || args.parameter !== undefined || args.expectedDirectRevision !== undefined)
    return inspectCurveJoin(state, args);
  const r = resolveSelectors(state.doc.nodes, state.bodies, { faces: list(args.faces), edges: list(args.edges) });
  if (r.error) return fail(state, r.error);
  const faces = r.names.faces.map(n => faceDetail(state.doc, state.bodies, n) ?? { name: n, error: 'no such face' });
  const edges = r.names.edges.map(n => edgeDetail(state.doc, state.bodies, n) ?? { name: n, error: 'no such edge' });
  const out = { ...(faces.length ? { faces } : {}), ...(edges.length ? { edges } : {}), ...(r.resolved.length ? { resolved: r.resolved } : {}) };
  return { state, content: json(out), isError: false, changed: false, summary: `${faces.length + edges.length} inspected` };
}
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
