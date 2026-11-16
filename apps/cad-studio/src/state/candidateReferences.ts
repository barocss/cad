import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { evaluationKey } from '@barocss/cad-model/engine/evalMemo';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { referencesOf, refreshSignatures } from '@barocss/cad-model/engine/references';
import { signaturesOf, type Signature } from '@barocss/cad-model/engine/rematch';

type AcceptedResult = Extract<EvalResult, { ok: true }>;
/** Missing final-body names require an explicit choice, never a suffix or inferred alias. */
export function candidateReferenceProblem(candidate: StudioDoc, beforeBodies: readonly BodyResult[], afterBodies: readonly BodyResult[]): string | undefined {
  const oldNames = { faces: new Map<string, Signature>(), edges: new Map<string, Signature>() }, nextNames = { faces: new Map<string, Signature>(), edges: new Map<string, Signature>() };
  for (const [list, names] of [[beforeBodies, oldNames], [afterBodies, nextNames]] as const) for (const body of list) {
    const found = signaturesOf(body);
    for (const kind of ['faces', 'edges'] as const) for (const [name, signature] of found[kind]) names[kind].set(name, signature);
  }
  // Missing names are held for an explicit choice; never choose a suffix or alias here.
  for (const ref of referencesOf(candidate, true).refs) {
    if (ref.rematched || ref.node !== null || ref.part !== undefined) continue;
    const kind = ref.edge ? 'edges' : 'faces', before = oldNames[kind].get(ref.name), after = nextNames[kind].get(ref.name);
    if (!before || !after || before.kind !== after.kind) { return `The reference at ${ref.where} needs an explicit choice.`; }
  }
}
interface RefreshOptions {
  candidate: StudioDoc;
  key: string;
  result: AcceptedResult;
  accepted(): { key: string; result: AcceptedResult } | null;
  evaluateParent(doc: StudioDoc): Promise<EvalResult>;
  isCurrent(): boolean;
}
/** Reference evidence only: no document installation, mass handoff or commit ownership lives here.
 * The caller must check isCurrent again after awaiting, including cache-only/no-reference paths.
 */
export function refreshCandidateReferences({ candidate, key, result, accepted, evaluateParent, isCurrent }: RefreshOptions): Promise<StudioDoc> {
  return refreshSignatures(candidate, result.bodies, async part => {
    const partKey = evaluationKey(part);
    if (partKey === key) return result;
    const cached = accepted();
    if (cached?.key === partKey) return cached.result;
    const parent = await evaluateParent(part);
    if (!isCurrent() || !parent?.ok) throw new Error('A reference parent could not be evaluated for this parameter change.');
    for (const ref of referencesOf(candidate, true).refs) {
      if (ref.rematched || ref.node !== part.nodes.length || !ref.parent) continue;
      const body = parent.bodies.find(b => b.key === bodyKeyFor(candidate.nodes, ref.parent!.node, ref.parent!.side));
      if (!body || !signaturesOf(body)[ref.edge ? 'edges' : 'faces'].has(ref.name)) throw new Error(`The reference at ${ref.where} needs an explicit choice.`);
    }
    return parent;
  });
}
