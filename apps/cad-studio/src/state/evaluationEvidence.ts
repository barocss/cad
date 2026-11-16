import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { sameMeshes, withMasses, type MassFields } from '../app/bodyResults';

type Result = Extract<EvalResult, { ok: true }>;
type Accepted = { key: string; result: Result };
type Handoff = Accepted & { target: StudioDoc };
type PendingMass = { request: number; result: Result; target?: StudioDoc; installedFor?: StudioDoc };

/** Result evidence lifecycle, not document authority. App still owns run tokens, commit and UI installation. */
export function createEvaluationEvidence() {
  let accepted: Accepted | null = null;
  let handoff: Handoff | null = null;
  let mass: PendingMass | null = null;
  return {
    accepted: () => accepted,
    remember(key: string, result: Result) { accepted = { key, result }; },
    retainAcceptedBodies(bodies: BodyResult[]) {
      if (accepted) accepted = { ...accepted, result: { ...accepted.result, bodies } };
    },
    restoreAccepted(target: StudioDoc, bodies: BodyResult[]) {
      if (accepted) handoff = { target, ...accepted, result: { ...accepted.result, bodies } };
    },
    stage(request: number, result: Result) { mass = { request, result }; },
    accept(request: number, target: StudioDoc, key: string, result: Result) {
      handoff = { target, key, result };
      if (mass?.request === request) mass.target = target;
    },
    takeHandoff() { const next = handoff; handoff = null; return next; },
    clearHandoff() { handoff = null; },
    discardUninstalled(request?: number) {
      if (mass && !mass.target && (request === undefined || mass.request === request)) mass = null;
    },
    patchMasses(patches: ReadonlyMap<number, MassFields>) {
      if (mass) mass.result.bodies = withMasses(mass.result.bodies, patches);
    },
    markInstalled(result: Result, target: StudioDoc, evaluated: StudioDoc) {
      if (mass?.result === result && mass.target === target) mass.installedFor = evaluated;
    },
    settle(doc: StudioDoc, evaluated: StudioDoc, bodiesFor: StudioDoc | null, bodies: BodyResult[]) {
      if (!mass?.target) return;
      if (mass.target !== doc || (mass.installedFor && mass.installedFor !== evaluated)) { mass = null; return; }
      // Release the bridge only after the actual accepted array has no deferred patch left.
      if (mass.installedFor === evaluated && bodiesFor === evaluated && sameMeshes(bodies, mass.result.bodies)
        && !bodies.some(body => body.massRef !== undefined)) mass = null;
    },
    reset() { accepted = null; handoff = null; mass = null; },
  };
}
