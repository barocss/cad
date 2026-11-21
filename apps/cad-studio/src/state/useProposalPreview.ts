import { useMemo, useState, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { placedDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { placementOf } from '@barocss/cad-model/engine/placement';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { directDisplay } from '@barocss/cad-model/engine/direct';
import type { Proposal } from '@barocss/cad-model/engine/schema/proposals';
import type { ProposalPart } from '@barocss/cad-model/chat/tools';
import type { PersonRowFiles } from '@barocss/cad-model/engine/rowFiles';
import { proposalIsStale, rejectProposal } from '@barocss/cad-model/chat/proposals';
import { modelHash } from '@barocss/cad-model/chat/spec';
import { requirementEvidenceRevision } from '@barocss/cad-model/util/digest';
import type { StudioNotice } from '../app/studioNotice';
import type { EngineClient, ProposalOverlay } from '../engine/client';
import type { Lanes } from '../engine/lanes';
import { placedProposalPreview, type PlacedProposalPreview } from '../viewport/instanceEvaluation';
interface ProposalPreviewOptions {
  model: { doc: StudioDoc; bodies: BodyResult[]; instances: Parameters<typeof placedProposalPreview>[2]; marker: number | null; active: boolean; sketch: boolean };
  worker: { engine: EngineClient; lanes: Lanes; nextRevision(): number };
  changes: { commit(next: StudioDoc): boolean; currentDoc(): StudioDoc; setPreviewBodies: Dispatch<SetStateAction<BodyResult[] | null>> };
  chatRowFiles: RefObject<PersonRowFiles | undefined>;
  displayDirect?: typeof directDisplay;
  onNotice(notice: StudioNotice): void;
}
/** Proposal previews and acceptance use the existing tool path and App's central commit. */
export function useProposalPreview({ model, worker, changes, chatRowFiles, displayDirect, onNotice: setToast }: ProposalPreviewOptions) {
  const { doc, bodies, instances, marker, active, sketch } = model;
  const reviewBlocked = active || sketch || marker !== null;
  const { engine, lanes, nextRevision } = worker;
  const { commit, currentDoc, setPreviewBodies } = changes;
  // Proposals (A4.2): one shown as a ghost — the part it would leave, its changed bodies tinted — with a
  // before/after toggle and the volume it adds or takes off; accepted (its ops replayed) or rejected (kept).
  // (`full`: the part the whole proposal leaves; `parts`: its features, `leaveOut` those unticked, A4.3.)
  // (`shown`: the part as previewed — the whole proposal's, or without what is left out; G12 diffs it with the part.)
  const [ghost, setGhost] = useState<{ id: string; bodies: BodyResult[]; placed: PlacedProposalPreview | null; after: boolean; changesShown?: boolean; full: StudioDoc; shown: StudioDoc; parts: ProposalPart[]; leaveOut: string[] } | null>(null);
  /** G12: what the shown proposal adds and takes away (worked out in the engine worker), for the viewport's overlay. */
  const [proposalOverlay, setProposalOverlay] = useState<ProposalOverlay | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const detail = ghost?.bodies.length === 1 ? ghost.bodies[0].mesh.loftDetail : undefined;
  const screwShape = !!detail && 'kind' in detail && !!detail.screwGrid;
  const toggleScrewChanges = () => setGhost(g => g && { ...g, changesShown: !g.changesShown });
  const partEval = (d: StudioDoc, screwWinding?: number) => engine.part(d, nextRevision(), 'agent', screwWinding);
  const previewEval = (d: StudioDoc, screwWinding?: number) => engine.part(d, nextRevision(), 'proposal-display', screwWinding);
  const previewPlaced = async (before: StudioDoc, after: StudioDoc): Promise<PlacedProposalPreview | null> => {
    try {
      return await placedProposalPreview(before, after, instances, (inst, base, parent) => engine.placed(placedDoc(inst, parent), base, placementOf(inst), nextRevision()));
    } catch {
      return { kind: 'unavailable', reason: 'Could not evaluate the placed proposal.' };
    }
  };
  const resetForModelChange = () => { setGhost(g => { if (g) setPreviewBodies(null); return null; }); };
  // (Only wanted to show an open proposal stale.)
  const evidenceRevision = useMemo(() => doc.proposals?.some(p => p.status === 'open') ? requirementEvidenceRevision(doc) : '', [doc]);
  const isStale = (p: Proposal) => proposalIsStale(p, evidenceRevision);
  const currentProposal = doc.proposals?.find(p => p.id === ghost?.id && p.status === 'open');
  const shownDirect = ghost?.after && !reviewBlocked && currentProposal && !isStale(currentProposal) ? ghost.shown.direct : undefined;
  const directSheets = useMemo(() => {
    if (!displayDirect || !shownDirect || shownDirect === doc.direct) return [];
    const existing = new Set(doc.direct?.objects.map(object => object.id));
    const objects = shownDirect.objects.filter(object => !existing.has(object.id));
    if (!objects.length) return [];
    return displayDirect({ sources: shownDirect.sources, objects }).flatMap(({ kind, positions, normals, indices }) =>
      kind === 'surface' && normals && indices ? [{ positions, normals, indices }] : []);
  }, [displayDirect, doc.direct, shownDirect]);
  const showProposal = async (p: Proposal, from: StudioDoc = doc) => {
    if (ghost?.id === p.id && from === doc) { setGhost(null); setPreviewBodies(null); return; }
    if (active || sketch || marker !== null) return;
    setProposalBusy(true);
    const tools = await import('@barocss/cad-model/chat/tools'), r = await tools.previewProposal({ doc: from, bodies, rowFiles: chatRowFiles.current }, p.id, previewEval);
    const placed = 'doc' in r && from === currentDoc() ? await previewPlaced(from, r.doc) : null;
    setProposalBusy(false);
    if (from !== currentDoc()) return;
    if ('error' in r) { setToast({ title: `${p.id} does not apply to the part as it is`, hint: r.error, detail: '' }); return; }
    setGhost({ id: p.id, bodies: r.bodies, placed, after: true, changesShown: false, full: r.doc, shown: r.doc, parts: tools.proposalParts(from, r.doc), leaveOut: [] }); setPreviewBodies(r.bodies);
  };
  /** A stale proposal made again on the part as it is, then shown (D41): only the rebased one can be accepted. */
  const rebaseIt = async (p: Proposal) => {
    if (active || sketch || marker !== null) return;
    setProposalBusy(true);
    const r = await (await import('@barocss/cad-model/chat/tools')).rebaseProposal({ doc, bodies, rowFiles: chatRowFiles.current }, p.id, partEval);
    setProposalBusy(false);
    if (doc !== currentDoc()) return;
    if ('error' in r) {
      setToast({ title: `${p.id} could not be rebased`, hint: r.error, detail: 'Nothing changed; the proposal stays open.', documentSource: { doc } });
      return;
    }
    if (!commit(r.state.doc)) return;
    await showProposal(r.state.doc.proposals!.find(q => q.id === p.id)!, r.state.doc);
  };
  /** A feature of the shown proposal ticked or unticked: the ghost rebuilt without what is left out. */
  const tickPart = async (id: string, on: boolean) => {
    if (!ghost) return;
    const tools = await import('@barocss/cad-model/chat/tools'), leaveOut = tools.toggledLeaveOut(ghost.parts, ghost.leaveOut, id, on);
    const partial = tools.partialDoc(doc, ghost.full, ghost.parts, leaveOut, doc.proposals?.find(p => p.id === ghost.id));
    if ('error' in partial) { setToast({ title: 'Cannot leave that out', hint: partial.error, detail: '' }); return; }
    setProposalBusy(true);
    const r = await previewEval(partial.doc);
    const placed = r.ok && doc === currentDoc() ? await previewPlaced(doc, partial.doc) : null;
    setProposalBusy(false);
    if (doc !== currentDoc()) return;
    if (!r.ok) { setToast({ title: `Without ${leaveOut.join(', ')} the part does not build`, hint: `${r.error.title}. ${r.error.hint}`, detail: '' }); return; }
    setGhost(g => g && { ...g, leaveOut, bodies: r.bodies, placed, shown: partial.doc, after: true }); setPreviewBodies(r.bodies);
  };
  // (G12: the diff of the part as it is and the proposal as shown, again when what is shown changes; none without one.)
  const updateDiff = () => {
    if (!ghost) { setProposalOverlay(null); return; }
    // (R4b: on the O9 'proposal-diff' lane — a reply for a proposal no longer shown comes back stale.)
    const at = nextRevision(), key = `${ghost.id}|${ghost.leaveOut.join(',')}`;
    void lanes.run('proposal-diff', { revision: at, source: key }, () => engine.proposalDiff(doc, ghost.shown, at, { revision: modelHash(doc), proposal: key })).then(reply => { if (!reply.stale) setProposalOverlay('error' in reply.result ? null : reply.result); });
    return () => lanes.cancel('proposal-diff');
  };
  const flipGhost = () => setGhost(g => { if (!g) return g; setPreviewBodies(g.after ? null : g.bodies); return { ...g, after: !g.after }; });
  const acceptIt = async (p: Proposal) => {
    if (active || sketch) return;
    if (marker !== null) { setToast({ title: 'Roll forward to accept', hint: 'A proposal applies to the whole part: drag the rollback bar to the end first.', detail: '' }); return; }
    setProposalBusy(true);
    const leaveOut = ghost?.id === p.id ? ghost.leaveOut : [];
    const r = await (await import('@barocss/cad-model/chat/tools')).acceptProposal({ doc, bodies, rowFiles: chatRowFiles.current }, p.id, partEval, { leaveOut });
    setProposalBusy(false);
    if (doc !== currentDoc()) return;
    if ('error' in r) { setToast({ title: `${p.id} could not be applied`, hint: r.error, detail: 'Nothing changed; the proposal stays open.' }); return; }
    if (!commit(r.state.doc)) return;
    setGhost(null); setPreviewBodies(null);
  };
  const rejectIt = (p: Proposal) => { const next = rejectProposal(doc, p.id); if ('error' in next || !commit(next)) return; if (ghost?.id === p.id) { setGhost(null); setPreviewBodies(null); } };
  const overlay = useMemo<ProposalOverlay | null>(() => {
    const diff = screwShape && !ghost?.changesShown ? null : proposalOverlay;
    return directSheets.length ? { ...(diff ?? { added: null, removed: null, changedFaces: [], method: 'faces', why: null }), directSheets } : diff;
  }, [directSheets, ghost?.changesShown, proposalOverlay, screwShape]);
  return { ghost, proposalOverlay: overlay,
    screwChangesAvailable: screwShape && !!proposalOverlay, toggleScrewChanges, proposalBusy, reviewBlocked, evidenceRevision,
    isStale, partEval, resetForModelChange, updateDiff, showProposal, rebaseIt, tickPart, flipGhost, acceptIt, rejectIt };
}
