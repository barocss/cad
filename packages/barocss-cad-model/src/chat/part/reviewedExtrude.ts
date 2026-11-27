import { type Ctx } from '../../app/commands';
import { extrudeEndFaceValues } from '../../app/extrudeEndFacePick';
import { extrudeCommand } from '../../app/profileCommands';
import { type StudioDoc } from '../../engine/doc';
import { featureId } from '../../engine/ids';
import { isRefusal } from '../../engine/refusal';
import { resolveNames } from '../names';
import { accept, checkValues, fail, type CallOptions, type ChatState, type Evaluate, type ToolOutcome } from '../toolKit';

export async function extrudeToReviewedFace(state: ChatState, args: Record<string, unknown>, values: Record<string, unknown>,
  evaluate: Evaluate, options: CallOptions): Promise<ToolOutcome> {
  if (args.expectedRevision === undefined || typeof values.sketch !== 'string' || Object.keys(values).length !== 2
      || !Array.isArray(args.faces) || args.faces.length !== 1 || typeof args.faces[0] !== 'string' || !args.faces[0].trim()
      || args.bodies !== undefined || args.edges !== undefined || args.point !== undefined || state.partOf)
    return fail(state, 'Extrude to face needs the current expectedRevision, one exact native face name, and only values.depth and values.sketch for this base part.',
      { code: 'COMMAND_INPUT' });
  const { doc, bodies } = state, sketch = values.sketch, face = args.faces[0];
  const matches = doc.nodes.flatMap((node, index) => node.id === sketch ? [index] : []);
  const index = matches[0], source = doc.nodes[index];
  if (matches.length !== 1 || source?.kind !== 'sketch' || source.suppressed || source.held)
    return fail(state, 'Extrude to face needs one active finished sketch with the given ID.', { code: 'COMMAND_INPUT' });
  const { selection, unknown } = resolveNames(bodies, { faces: [face] }, true);
  if (unknown.length || selection.faces.length !== 1)
    return fail(state, 'Extrude to face needs one unique original native face on the current part.', { code: 'COMMAND_INPUT' });
  const [hit] = selection.faces;
  if (bodies[hit.body].mesh.faces[hit.face].nativePlaneName !== face)
    return fail(state, 'Extrude to face needs the exact original planar face name.', { code: 'COMMAND_INPUT' });
  const ctx: Ctx = { doc, bodies, selection: { bodies: [], faces: [], edges: [], sketches: [index] }, viewportEndFace: true };
  const picked = extrudeEndFaceValues(ctx, { depth: 'to-face' }, hit);
  if (!picked)
    return fail(state, 'Extrude to face needs one original planar face of a current solid.', { code: 'COMMAND_INPUT' });
  let next: StudioDoc;
  try { next = extrudeCommand.build!(ctx, picked); }
  catch (error) {
    if (isRefusal(error, 'VALUE', 'BAD_REFERENCE')) return fail(state, error.message, { code: 'COMMAND_INPUT' });
    throw error;
  }
  return accept(state, next, evaluate, options, 'Extrude to face', { sketch, target: face,
    added: [`${doc.nodes.length}: Extrude to face`] });
}

/** The caller checks the revision before resolving either reviewed Extrude selection. */
export async function extrudeReviewedDraft(state: ChatState, args: Record<string, unknown>, values: Record<string, unknown>,
  evaluate: Evaluate, options: CallOptions): Promise<ToolOutcome> {
  const { sketch, h, draft, depth, ...extra } = values;
  if (args.expectedRevision === undefined || state.partOf ||
      args.faces !== undefined || args.edges !== undefined || args.bodies !== undefined || args.point !== undefined ||
      typeof sketch !== 'string' || !sketch.trim() || (depth !== undefined && depth !== 'distance') || Object.keys(extra).length ||
      typeof h !== 'number' || !Number.isFinite(h) || typeof draft !== 'number' || !Number.isFinite(draft) || draft === 0)
    return fail(state, 'Distance Draft needs the current expectedRevision, one stable sketch ID, a finite distance h and a finite nonzero draft angle. Send no other selections.', { code: 'COMMAND_INPUT' });

  const { doc, bodies } = state;
  const matches = doc.nodes.flatMap((_, index) => featureId(doc.nodes, index) === sketch ? [index] : []);
  const [index] = matches;
  const source = doc.nodes[index];
  if (matches.length !== 1 || source?.kind !== 'sketch' || source.suppressed || source.held ||
      source.on || source.pocketFloor || source.association || source.regions?.length || source.holes?.length || source.holeOutlines?.length)
    return fail(state, 'Distance Draft needs one active standalone sketch with the given ID and no holes or extra regions.', { code: 'COMMAND_INPUT' });

  const ctx: Ctx = { doc, bodies, selection: { bodies: [], faces: [], edges: [], sketches: [index] } };
  const sizes = { h, draft };
  const issue = checkValues(extrudeCommand.fields!(ctx, sizes), sizes);
  if (issue) return fail(state, issue, { code: 'COMMAND_INPUT' });
  const next = extrudeCommand.build!(ctx, sizes);
  return accept(state, next, evaluate, options, `Draft Extrude from ${sketch}`, { sketch, added: [`${doc.nodes.length}: Draft Extrude`] });
}
