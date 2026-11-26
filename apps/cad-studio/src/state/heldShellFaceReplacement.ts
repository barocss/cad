import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig, type Problem, type Sig } from '@barocss/cad-model/engine/references';
import { heldShellCandidateFace } from './referenceDecisions';

export type HeldShellNode = Extract<ModelNode, { kind: 'shell' }>;

export interface HeldShellFaceHit {
  face: { body: number; face: number } | null;
  faceMesh?: BodyResult['mesh'];
  instance?: string;
}

export interface HeldShellFaceProblem {
  problem: Problem;
  body: BodyResult;
  bodyIndex: number;
  allowedNames: ReadonlySet<string>;
}

export interface HeldShellFaceTarget {
  problem: Problem;
  body: BodyResult;
  bodyIndex: number;
  faceIndex: number;
  name: string;
  signature: Sig;
}

export type HeldShellFacePickResult =
  | { ok: true; target: HeldShellFaceTarget }
  | { ok: false; reason: string };

/**
 * Admit direct 3D viewport face replacement only for a held single-opening Shell
 * whose visible passthrough solid exposes verified planar candidate opening faces.
 */
export function heldShellFaceProblem(
  doc: StudioDoc,
  index: number,
  problems: readonly Problem[],
  bodies: readonly BodyResult[],
): HeldShellFaceProblem | undefined {
  if (index < 0 || index >= doc.nodes.length) return undefined;
  const node = doc.nodes[index];
  if (node?.kind !== 'shell' || !node.held || node.suppressed !== true || node.parent.side !== 'solid' || node.open.length !== 1) {
    return undefined;
  }
  const matches = problems.filter(problem => problem.node === index && problem.name === node.open[0]);
  if (matches.length !== 1) return undefined;
  const [problem] = matches;
  const verified = new Set<string>();
  let bodyIndex: number | undefined;
  for (const name of problem.candidates) {
    const candidate = heldShellCandidateFace(doc, bodies, problem, name);
    if (!candidate) continue;
    if (bodyIndex !== undefined && bodyIndex !== candidate.body) return undefined;
    bodyIndex = candidate.body;
    verified.add(name);
  }
  if (bodyIndex === undefined) return undefined;
  return { problem, body: bodies[bodyIndex], bodyIndex, allowedNames: verified };
}

export function pickHeldShellFace(
  doc: StudioDoc,
  index: number,
  problems: readonly Problem[],
  bodies: readonly BodyResult[],
  hit: HeldShellFaceHit,
): HeldShellFacePickResult {
  const scope = heldShellFaceProblem(doc, index, problems, bodies);
  if (!scope) {
    return { ok: false, reason: 'Shell opening face replacement is unavailable for this feature.' };
  }
  const wrongFace = 'Select a verified planar candidate opening face on this feature’s body.';
  if (!hit.face || hit.instance !== undefined || hit.face.body !== scope.bodyIndex || hit.faceMesh !== scope.body.mesh) {
    return { ok: false, reason: wrongFace };
  }
  const face = scope.body.mesh.faces[hit.face.face];
  if (!face || face.kind !== 'plane' || face.facet || !scope.allowedNames.has(face.name)) {
    return { ok: false, reason: wrongFace };
  }
  const resolved = heldShellCandidateFace(doc, bodies, scope.problem, face.name);
  if (!resolved || resolved.body !== scope.bodyIndex || resolved.face !== face.index) {
    return { ok: false, reason: wrongFace };
  }
  const signature = signaturesOf(scope.body, 'plane').faces.get(face.name);
  if (signature?.kind !== 'plane') {
    return { ok: false, reason: wrongFace };
  }
  return {
    ok: true,
    target: {
      problem: scope.problem,
      body: scope.body,
      bodyIndex: scope.bodyIndex,
      faceIndex: face.index,
      name: face.name,
      signature: toSig(signature),
    },
  };
}

/**
 * Replace only the held Shell's opening face and plane signature, releasing that Shell
 * while leaving every downstream held feature suppressed for explicit confirmation.
 */
export function replaceHeldShellFace(
  doc: StudioDoc,
  index: number,
  target: HeldShellFaceTarget,
): StudioDoc | null {
  const original = doc.nodes[index];
  if (original?.kind !== 'shell' || !original.held || original.suppressed !== true
    || original.open.length !== 1 || original.open[0] !== target.problem.name
    || target.signature.k !== 'plane') {
    return null;
  }
  const replacement: HeldShellNode = { ...original, open: [target.name], sigs: { [target.name]: target.signature } };
  delete replacement.held;
  delete replacement.suppressed;
  delete replacement.rematched;
  return {
    ...doc,
    nodes: doc.nodes.map((node, i) => i === index ? replacement : node),
  };
}
