import assert from 'node:assert/strict';
import { editCommand } from '@barocss/cad-model/app/editCommand';
import { withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import {
  admitPlateReference, evaluatePlate, hole, lockedPlateFixture, stock, withPlateReference, type PlateEvidence,
} from './locked-plate-target';

const budget = 6;
const features = [
  [5, 6],
  [15, 18],
  [0, 4.9],
] as const;
type Policy = 'final-only' | 'per-feature';
type Target = Exclude<ReturnType<typeof admitPlateReference>, { error: string }>;
type Observation = { path: number[]; revision?: string; error?: string; evidence?: PlateEvidence };

function append(doc: StudioDoc, step: number, choice: number) {
  const value = features[step][choice];
  if (step === 0) return stock(doc, value);
  if (step === 1) return hole(doc, [value, 20], 3);
  return hole(doc, [45, 20], 4, value || undefined);
}

function plansOf(order: number) {
  const choice = (step: number) => order & (1 << step) ? [1, 0] : [0, 1];
  return choice(0).flatMap(a => choice(1).flatMap(b => choice(2).map(c => [a, b, c])));
}

function selectPlate(base: StudioDoc, target: Target, plans: number[][], policy: Policy) {
  const observations: Observation[] = [];
  const built = new Map<string, StudioDoc>([['', base]]);
  const rejected = new Set<string>();
  let accepted: StudioDoc | undefined, passing: PlateEvidence | undefined, best: PlateEvidence | undefined;
  for (const plan of plans) {
    if (accepted || observations.length === budget) break;
    for (let step = 0; step < plan.length; step++) {
      const path = plan.slice(0, step + 1), key = path.join('');
      if (rejected.has(key) || observations.length === budget) break;
      if (built.has(key)) continue;
      const doc = append(built.get(key.slice(0, -1))!, step, plan[step]);
      const terminal = step === plan.length - 1;
      const result = evaluatePlate(doc, target, terminal || policy === 'per-feature');
      observations.push({ path, ...result });
      if ('error' in result) { rejected.add(key); break; }
      built.set(key, doc);
      if (!result.evidence) continue;

      const { evidence } = result;
      if (!best || evidence.iou > best.iou) best = evidence;
      if (terminal && !evidence.issues.length) {
        accepted = doc;
        passing = evidence;
        break;
      }
      // Only prune a measured error that later actions in this catalog cannot change.
      if (!evidence.boundsMatch) { rejected.add(key.slice(0, 1)); break; }
      if (step >= 1 && !evidence.firstBoreMatches) { rejected.add(key.slice(0, 2)); break; }
      if (terminal) rejected.add(key);
    }
  }
  return { policy, observations, accepted: accepted?.nodes, passing, best };
}

function exactEvidence(doc: StudioDoc, target: Target): PlateEvidence {
  const result = evaluatePlate(doc, target, true);
  assert.ok('evidence' in result && result.evidence, JSON.stringify(result));
  return result.evidence;
}

function scoreDropWitness(base: StudioDoc, target: Target) {
  const start = stock(base, 5);
  const edit = editCommand(1, start.nodes, start);
  assert.ok(edit?.build);
  const oversized = edit.build({ doc: start, bodies: [], selection: { faces: [], edges: [], bodies: [] } }, { h: 6 });
  const trimmed = withNode(oversized, { kind: 'split', parent: { node: 1, side: 'solid' }, axis: 'z', at: 5, outputSide: 'negative' });
  const left = hole(trimmed, [15, 20], 3);
  const completed = hole(left, [45, 20], 4);
  return [start, oversized, trimmed, left, completed].map(doc => exactEvidence(doc, target));
}

/** Fixed-budget synthetic comparison. The two runs differ only in visibility of valid prefix evidence. */
export function runLockedPlateStudy() {
  const { doc: base, reference, mesh } = lockedPlateFixture(), target = admitPlateReference(base, 'mm');
  assert.ok(!('error' in target), JSON.stringify(target));
  const open = withPlateReference({ ...reference, source: { mesh: { ...mesh, indices: mesh.indices.slice(3) } } });
  const refusedReferences = {
    unknownScale: admitPlateReference(base),
    openMesh: admitPlateReference(open, 'mm'),
  };

  const plate = stock(base, 5), left = hole(plate, [15, 20], 3);
  const controls = {
    wrongCentre: exactEvidence(hole(hole(plate, [18, 20], 3), [45, 20], 4), target),
    missingHole: exactEvidence(left, target),
    wrongThickness: exactEvidence(hole(hole(stock(base, 6), [15, 20], 3), [45, 20], 4), target),
    nearlyThrough: exactEvidence(hole(left, [45, 20], 4, 4.9), target),
    swapped: exactEvidence(hole(hole(plate, [15, 20], 4), [45, 20], 3), target),
  };
  const runs = Array.from({ length: 8 }, (_, order) => {
    const plans = plansOf(order);
    return { order, finalOnly: selectPlate(base, target, plans, 'final-only'), perFeature: selectPlate(base, target, plans, 'per-feature') };
  });
  // This order offers the three wrong choices first. Only a fully qualified candidate can be staged.
  const winner = runs[7].perFeature;
  assert.ok(winner.accepted && winner.passing);
  return { budget, mesh, referenceSha256: target.referenceSha256, triangleCount: target.triangleCount,
    runs, controls, refusedReferences, witness: scoreDropWitness(base, target),
    winner: { features: winner.accepted, evidence: winner.passing } };
}
