import { loadDirect } from '../../engine/directModule';
import { isObj } from '../../util/guards';
import { guidedFillSources } from '../directGuidedFillProposal';
import { directInspectionRevision } from '../sweepSource';
import { fail, json, type PartHandler } from '../toolKit';
import { isDirectPin, pinnedDirectCandidate, type DirectCandidatePin } from './directCandidate';

export const inspectGuidedFill: PartHandler = async (state, args, evaluate, _options, dispatch) => {
  const { guidedFill, expectedDirectRevision, proposal, expectedProposalRevision } = args;
  const pending = proposal !== undefined || expectedProposalRevision !== undefined;
  const refuse = (suffix: string, reason: string) => fail(state, reason, { code: `DIRECT_GUIDED_FILL_INSPECT_${suffix}` });
  const allowed = ['guidedFill', 'expectedDirectRevision', 'proposal', 'expectedProposalRevision'];
  if (!isObj(guidedFill) || !isDirectPin(expectedDirectRevision)
    || Object.entries(args).some(([key, value]) => value !== undefined && !allowed.includes(key)))
    return refuse('INPUT', 'Supply guidedFill and the Direct revision from query.summary.');
  const { surface, ...values } = guidedFill, picks = guidedFillSources(values);
  if (!picks || (pending ? surface !== undefined : typeof surface !== 'string' || !surface))
    return refuse('INPUT', 'Supply five distinct Guided Fill source IDs. For a saved surface include its exact Direct ID from query.render.');
  if (state.partOf || state.doc.instances?.length)
    return refuse('SCOPE', 'Inspect a Guided Fill in the base part without placed parts.');
  const baseDirectRevision = directInspectionRevision(state.doc);
  if (expectedDirectRevision !== baseDirectRevision)
    return fail(state, 'The Direct inputs changed. Read query.summary again.',
      { code: 'DIRECT_GUIDED_FILL_INSPECT_STALE', revision: baseDirectRevision });

  let doc = state.doc, surfaceId = typeof surface === 'string' ? surface : '';
  let candidate: (DirectCandidatePin & { directRevision: string }) | undefined;
  if (pending) {
    const replay = await pinnedDirectCandidate(state, args, baseDirectRevision, evaluate, dispatch, 'GUIDED_FILL_INSPECT');
    if ('refusal' in replay) return replay.refusal;
    const sources = guidedFillSources(replay.pending.ops[0].args?.values);
    if (!sources || Object.entries(picks).some(([key, value]) => sources[key as keyof typeof sources] !== value))
      return refuse('SOURCE', 'Use the exact original source IDs of this Guided Fill proposal.');
    const existing = new Set(doc.direct?.objects.map(object => object.id));
    doc = replay.preview.doc;
    const added = doc.direct?.objects.filter(object => !existing.has(object.id));
    if (added?.length !== 1) return refuse('RESULT', 'The pinned proposal must add one Direct surface.');
    surfaceId = added[0].id;
    candidate = { ...replay.candidate, directRevision: directInspectionRevision(doc) };
  }
  if (!doc.direct) return refuse('RESULT', 'The requested Direct result is unavailable.');
  const { measureDirectGuidedFill } = await loadDirect();
  try {
    const evidence = measureDirectGuidedFill(doc.direct, picks, surfaceId);
    const revision = candidate?.directRevision ?? baseDirectRevision;
    return { state, content: json({ guidedFill: { surfaceId, sources: picks, ...evidence, revision }, ...(candidate ? { candidate } : {}) }),
      isError: false, changed: false, summary: 'Native Guided Fill evidence' };
  } catch (error) {
    return refuse('GEOMETRY', error instanceof Error ? error.message : 'The stored Guided Fill could not be verified.');
  }
};
