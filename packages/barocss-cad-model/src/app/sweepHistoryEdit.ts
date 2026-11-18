import { checkBrep, validateCurve } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import { geometryOf } from '../engine/direct';
import { partSnapshot } from '../engine/part';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command } from './commands';

const profileFields = new Set(['id', 'kind', 'profile', 'center', 'radius']);
const sweepFields = new Set(['id', 'kind', 'sketch', 'name', 'path', 'mode']);
const sourceFields = new Set(['format', 'schema', 'units', 'parameters', 'nextId', 'nodes', 'outputs', 'direct']);
/** Explicit representation opt-in for an unpublished standalone disk sweep, never a topology rematch. */
export function sweepHistoryEdit(doc: StudioDoc, index: number): Command | null {
  if (index !== 1 || doc.nodes.length !== 2 || Object.keys(doc).some(key => !sourceFields.has(key))) return null;
  const profile = doc.nodes[0], sweep = doc.nodes[1];
  if (Object.keys(profile).some(key => !profileFields.has(key)) || Object.keys(sweep).some(key => !sweepFields.has(key))) return null;
  if (profile.kind !== 'sketch' || profile.profile !== 'circle' || sweep.kind !== 'sweep-curve' || sweep.sketch !== 0
    || (sweep.mode !== undefined && sweep.mode !== 'exact-straight') || sweep.routeBundleMember
    || doc.nodes.some(node => !node.id || node.held || node.suppressed || node.rematched || node.sigs)
    || profile.id === sweep.id || profile.plane || profile.on || profile.association || profile.pocketFloor
    || profile.holes || profile.regions || profile.outline || profile.sideTags || profile.construction
    || typeof profile.radius !== 'number' || !Number.isFinite(profile.radius) || profile.radius <= 0
    || profile.center.some(value => typeof value !== 'number' || !Number.isFinite(value))) return null;
  if (Object.values(doc.outputs).some(ref => ref.node !== index || ref.side !== 'solid')) return null;
  const path = sweep.path;
  if (!((path.degree === 1 && path.controlPoints.length === 2) || (path.degree === 2 && path.controlPoints.length === 3))) return null;
  try {
    validateCurve({ ...path, kind: 'curve', id: 'saved-sweep-path' });
    // Only the original independent copied curve, not additional downstream Direct consumers.
    if (doc.direct) {
      if (doc.direct.objects.length !== 1 || doc.direct.objects[0].name !== sweep.name) return null;
      const curve = geometryOf(doc.direct, doc.direct.objects[0]);
      if (curve.kind !== 'curve' || canonical({ degree: curve.degree, knots: curve.knots,
        controlPoints: curve.controlPoints, weights: curve.weights }) !== canonical(path)) return null;
    }
  } catch { return null; }
  const revision = canonical(doc);
  const current = (candidate: StudioDoc) => candidate === doc && canonical(candidate) === revision;
  const requireSolid = (candidate: StudioDoc) => {
    const outputs = partSnapshot(candidate).outputs;
    if (outputs.length !== 1 || outputs[0].id !== sweep.id || outputs[0].bodyCount !== 1
      || !checkBrep(outputs[0].brep, { strict: true }).valid)
      throw refusal('BAD_REFERENCE', 'The saved Sweep must evaluate to one valid solid.');
  };
  return {
    id: 'edit', label: 'Edit Sweep', icon: 'cad-sweep', group: 'modify',
    available: ctx => current(ctx.doc) ? { ok: true } : { ok: false, reason: 'Open the current Sweep in History again.' },
    defaults: () => ({ representation: sweep.mode ?? 'faceted' }),
    fields: () => [{ key: 'representation', label: 'Representation', kind: 'choice', options: [
      { value: 'faceted', label: 'Faceted (approximate)' }, { value: 'exact-straight', label: 'Exact straight path' },
    ] }],
    steps: () => [{ label: 'Saved inputs', text: 'Same disk and copied path. Exact requires one straight segment; Faceted is approximate. Face and edge identities may change.', done: true }],
    build: (ctx, values) => {
      if (!current(ctx.doc)) throw refusal('BAD_REFERENCE', 'Open the current Sweep in History again.');
      if (values.representation !== 'faceted' && values.representation !== 'exact-straight')
        throw refusal('VALUE', 'Choose Faceted or Exact straight path.');
      requireSolid(doc);
      const next = { ...sweep };
      if (values.representation === 'faceted') delete next.mode;
      else next.mode = 'exact-straight';
      if (canonical(next) === canonical(sweep)) return doc;
      // A change in either direction requires the same native exact admission; no-op keeps the original.
      requireSolid({ ...doc, nodes: [profile, { ...sweep, mode: 'exact-straight' }] });
      const result = { ...doc, nodes: [profile, next] };
      requireSolid(result);
      return result;
    },
  };
}
