import { isSheetReliefThicknessChange, admitSheetReliefThicknessChange, proveSheetReliefThicknessChange } from './sheetReliefThicknessHistory';
import { isFlangePositionChange } from '@barocss/cad-model/app/flangePositionEdit';
import { proveFlangePositionChange } from './flangePositionHistory';
import { flangeRadiusEdit } from '@barocss/cad-model/app/flangeRadiusEdit';
import { canonical } from '@barocss/cad-model/util/revision';
import { isFilletRadiusModeChange, proveFilletRadiusModeChange } from './filletRadiusModeHistory';
import { isFilletSectionChange, proveFilletSectionChange } from './filletSectionHistory';
import { isShellOpeningChange, proveShellOpeningChange } from './shellOpeningHistory';
import { holeResultPieces } from '../app/holeResultPieces';
import type { StudioNotice } from '../app/studioNotice';
import type { ComponentProps } from 'react';
import { dropStaleMade, prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { holePatternEditProblem } from '@barocss/cad-model/app/holePatternInput';
import type { NodeEditor } from '../ui/NodeEditor';
import type { EngineClient } from '../engine/client';
import { prepareLinearPatternHoleEdit } from '../app/patternHoleSpacing';
import { rectangularCutEditProblem } from '../app/rectangularCutEdit';
import { preparePatternNodeCandidate } from '../app/directCurveCandidate';
import { linkedInsetHistoryFailure, failedFeatureText, loftHistoryFailure, splitDependentHoleFailure, holeDepthContactFailure } from '../app/failedFeature';
import { isRectangleFinishResize, isRectangleFinishHeightResize, proveRectangleFinishResize } from './rectangleFinishResize';

type Apply = ComponentProps<typeof NodeEditor>['onApply'];
interface Options {
  model: { doc: StudioDoc; evaluated: StudioDoc; editNode: number; fresh: boolean; busy: boolean };
  owner: { document(): StudioDoc; evaluated(): StudioDoc; marker(): number | null; variant(): string | null;
    scope(): object; worker(): number; open(): object };
  worker: { engine: Pick<EngineClient, 'evaluate' | 'part'>; nextRevision(): number };
  changes: { onNotice?(notice: StudioNotice): void; canChangeDocument(): boolean; commit(next: StudioDoc): unknown;
    applyRoundedInsetEdit(nodes?: StudioDoc['nodes'], sourceWidth?: number): void;
    stageFeatureCandidate(candidate: NonNullable<ReturnType<typeof preparePatternNodeCandidate>>): void };
}
/** History edit admission; central commit remains in App and is called only for an owned accepted result. */
export function createHistoryFeatureApply({ model, owner, worker, changes }: Options): Apply {
  const { doc, evaluated, editNode, fresh, busy } = model;
  const { engine, nextRevision } = worker;
  const { canChangeDocument, commit, applyRoundedInsetEdit, stageFeatureCandidate } = changes;
  return (nodes, ownsDraft, sourceWidth) => {
    if (doc.nodes[1]?.kind === 'rounded-rectangle-inset') { applyRoundedInsetEdit(nodes, sourceWidth); return; }
    if (!canChangeDocument()) return;
    if (doc.nodes[editNode]?.kind === 'face-end-extrude' && nodes[editNode]?.kind === 'extrude'
      && (owner.marker() !== null || owner.variant() || owner.evaluated() !== evaluated || !fresh || busy)) {
      return Promise.resolve({ title: 'Distance not applied', hint: 'Show the master at the latest History and wait for the model before detaching.', detail: '' });
    }
    // A later ordinary Length/Angle edit can hide the radius field without undoing
    // its earlier draft change. Recheck the complete candidate at the Apply boundary.
    const oldFlange = doc.nodes[editNode], newFlange = nodes[editNode];
    const flangeRadiusChanged = oldFlange?.kind === 'sheet-flange' && newFlange?.kind === 'sheet-flange'
      && canonical(oldFlange.bendRadius) !== canonical(newFlange.bendRadius);
    if (flangeRadiusChanged && !flangeRadiusEdit(doc, nodes, editNode)) return Promise.resolve({
      title: 'Bend radius not applied', hint: 'Apply only the bend radius change on the unchanged Flange first. Apply Length or Angle changes separately.',
      detail: 'The original document and sheet geometry are unchanged.',
    });
    const flangePositionChanged = oldFlange?.kind === 'sheet-flange' && newFlange?.kind === 'sheet-flange'
      && (oldFlange.position ?? 'material-inside') !== (newFlange.position ?? 'material-inside');
    const flangePositionFailure = { title: 'Flange position not applied', hint: 'Apply only Position on the unchanged full-width rectangular-sheet Flange. Its original top edge must be verified. Apply Length, Angle or Bend radius separately.', detail: 'The original document and sheet geometry are unchanged.' };
    if (flangePositionChanged && !isFlangePositionChange(doc, { ...doc, nodes }, editNode)) return Promise.resolve(flangePositionFailure);
    const flangePositionSource = flangePositionChanged ? canonical(doc) : '', flangePositionDraft = flangePositionChanged ? canonical(nodes) : '';
    const reliefThicknessChanged = isSheetReliefThicknessChange(doc, { ...doc, nodes }, editNode);
    const reliefThicknessFailure = {title: 'Thickness not applied', hint: 'Apply only numeric Thickness on the unchanged plain sheet with one Corner relief. Its original corner must be verified.', detail: 'The original sheet, relief and references are unchanged.'};
    if (reliefThicknessChanged && !admitSheetReliefThicknessChange(doc, { ...doc, nodes }, editNode)) return Promise.resolve(reliefThicknessFailure);
    const reliefThicknessSource = reliefThicknessChanged ? canonical(doc) : '', reliefThicknessDraft = reliefThicknessChanged ? canonical(nodes) : '';
    const scope = owner.scope();
    const patternEdit = prepareLinearPatternHoleEdit(doc, nodes, editNode);
    if ('error' in patternEdit) return Promise.resolve(patternEdit.error);
    const cutProblem = rectangularCutEditProblem(doc, patternEdit.nodes, editNode);
    if (cutProblem) return Promise.resolve(cutProblem);
    const hint = holePatternEditProblem(doc.nodes[editNode], patternEdit.nodes[editNode], doc.parameters);
    if (hint) return Promise.resolve({ title: 'The Hole pattern is invalid', hint, detail: '' });
    const editedNodes = dropStaleMade(doc.nodes, patternEdit.nodes);
    const previousSplit = doc.nodes[editNode], nextSplit = editedNodes[editNode];
    const splitOutputChanged = previousSplit?.kind === 'split' && nextSplit?.kind === 'split'
      && previousSplit.outputSide !== nextSplit.outputSide;
    const rawNext = { ...doc, nodes: editedNodes };
    let next = splitOutputChanged ? prefixDoc(rawNext, rawNext.nodes.length) : rawNext;
    const candidate = preparePatternNodeCandidate(doc, next, editNode);
    if (candidate) { stageFeatureCandidate(candidate); return; }
    const oldShell = doc.nodes[editNode], newShell = next.nodes[editNode];
    const openingChanged = oldShell?.kind === 'shell' && newShell?.kind === 'shell'
      && JSON.stringify(oldShell.open) !== JSON.stringify(newShell.open);
    const openingFailure = {title:'Opening not applied',hint:'Apply only the opening change on an unchanged plain box first. Keep the current opening if its original face cannot be verified.',detail:'The original document and face references are unchanged.'};
    if (openingChanged && !isShellOpeningChange(doc,next,editNode)) return Promise.resolve(openingFailure);
    const oldFillet = doc.nodes[editNode], newFillet = next.nodes[editNode];
    const sectionChanged = oldFillet?.kind === 'fillet' && newFillet?.kind === 'fillet'
      && (oldFillet.section?.kind ?? 'circular') !== (newFillet.section?.kind ?? 'circular');
    const sectionFailure = {title:'Section not applied',hint:'Apply only the section change on an unchanged plain box first. Keep the current section if its original edge cannot be verified.',detail:'The original document, edge and signature are unchanged.'};
    if (sectionChanged && !isFilletSectionChange(doc,next,editNode)) return Promise.resolve(sectionFailure);
    const radiusModeChanged = oldFillet?.kind === 'fillet' && newFillet?.kind === 'fillet'
      && (oldFillet.radii !== undefined) !== (newFillet.radii !== undefined);
    const radiusModeFailure = {title:'Radius mode not applied',hint:'Apply only the mode change on an unchanged single box edge with two equal positive numeric end radii. Apply radius edits separately first.',detail:'The original document, edge, signature and radius controls are unchanged.'};
    if (radiusModeChanged && !isFilletRadiusModeChange(doc,next,editNode)) return Promise.resolve(radiusModeFailure);
    let request = nextRevision();
    const heightResize = isRectangleFinishHeightResize(doc,next,editNode);
    const resize = !heightResize && isRectangleFinishResize(doc,next,editNode), worker = owner.worker(), open = owner.open();
    const current = () => ownsDraft() && owner.document() === doc && owner.scope() === scope
      && owner.worker() === worker && owner.open() === open
      && (!reliefThicknessChanged || canChangeDocument() && canonical(doc) === reliefThicknessSource && canonical(nodes) === reliefThicknessDraft)
      && (!flangePositionChanged || canonical(doc) === flangePositionSource && canonical(nodes) === flangePositionDraft)
      && (!(heightResize || openingChanged || sectionChanged || radiusModeChanged || flangePositionChanged || reliefThicknessChanged) || fresh && !busy && owner.evaluated() === evaluated && owner.marker() === null && !owner.variant());
    return (async () => {
      if (reliefThicknessChanged) {
        if (!current()) return;
        try {
          const oldRevision = nextRevision();
          const oldParent = await engine.part(prefixDoc(doc,2), oldRevision, 'refs');
          if (!current()) return;
          if (!oldParent.ok || oldParent.revision !== oldRevision) return reliefThicknessFailure;
          const newRevision = nextRevision();
          const newParent = await engine.part(prefixDoc(next,2), newRevision, 'refs');
          if (!current()) return;
          if (!newParent.ok || newParent.revision !== newRevision) return reliefThicknessFailure;
          const repaired = proveSheetReliefThicknessChange(doc,next,oldParent.bodies,newParent.bodies);
          if (!repaired) return reliefThicknessFailure;
          next = repaired; request = nextRevision();
        } catch { if (current()) return reliefThicknessFailure; return; }
      }

      if (flangePositionChanged) {
        if (!current()) return;
        try {
          const parentRevision = nextRevision();
          const parent = await engine.part(prefixDoc(doc, editNode), parentRevision, 'refs');
          if (!current()) return;
          if (!parent.ok || parent.revision !== parentRevision || !proveFlangePositionChange(doc, next, parent.bodies)) return flangePositionFailure;
          request = nextRevision();
        } catch { if (current()) return flangePositionFailure; return; }
      }
      if (radiusModeChanged) {
        if (!current()) return;
        try {
          const parentRevision = nextRevision();
          const parent = await engine.part(prefixDoc(doc,editNode),parentRevision,'refs');
          if (!current()) return;
          if (!parent.ok || parent.revision !== parentRevision || !proveFilletRadiusModeChange(doc,next,parent.bodies)) return radiusModeFailure;
          request = nextRevision();
        } catch { if (current()) return radiusModeFailure; return; }
      }
      if (sectionChanged) {
        if (!current()) return;
        try {
          const parentRevision = nextRevision();
          const parent = await engine.part(prefixDoc(doc,editNode),parentRevision,'refs');
          if (!current()) return;
          if (!parent.ok || parent.revision !== parentRevision || !proveFilletSectionChange(doc,next,parent.bodies)) return sectionFailure;
          request = nextRevision();
        } catch { if (current()) return sectionFailure; return; }
      }
      if (openingChanged) {
        if (!current()) return;
        try {
          const parentRevision = nextRevision();
          const parent = await engine.part(prefixDoc(doc,editNode),parentRevision,'refs');
          if (!current()) return;
          if (!parent.ok || parent.revision !== parentRevision) return openingFailure;
          const proved = proveShellOpeningChange(doc,next,parent.bodies);
          if (!proved) return openingFailure;
          next = proved; request = nextRevision();
        } catch { if (current()) return openingFailure; return; }
      }
      // A large height change can fail the generic nearest-edge guard before evaluation.
      // Prove the complete parent topology first; never weaken the native guard itself.
      if (heightResize) {
        if (!current()) return;
        const failure = {title:'Height not applied',hint:'The original finishing edge could not be verified. Keep the current height or explicitly replace its edge first.',detail:'No reference was renamed or refreshed.'};
        try {
          const beforeRevision = nextRevision();
          const before = await engine.part(prefixDoc(doc,2),beforeRevision,'refs');
          if (!current()) return;
          if (!before.ok || before.revision !== beforeRevision) return failure;
          const afterRevision = nextRevision();
          const after = await engine.part(prefixDoc(next,2),afterRevision,'refs');
          if (!current()) return;
          if (!after.ok || after.revision !== afterRevision) return failure;
          const refreshed = before.ok && after.ok ? proveRectangleFinishResize(doc,next,before.bodies,after.bodies) : null;
          if (!refreshed) return failure;
          next = refreshed;
          request = nextRevision();
        } catch { if (current()) return failure; return; }
      }
      const reply = await engine.evaluate(next, request);
      if (!reply || !current() || (heightResize || openingChanged || sectionChanged || radiusModeChanged || flangePositionChanged || reliefThicknessChanged) && reply.revision !== request) return;
      if (reply.ok) {
        if (!resize) {
          const notice = reply.revision === request && fresh && !busy && owner.evaluated() === evaluated
            && owner.marker() === null && !owner.variant() ? holeResultPieces(next, editNode, reply.bodies) : undefined;
          if (commit(next) === true && notice) changes.onNotice?.({ ...notice, documentSource: { doc: owner.document() } });
          return;
        }
        const failure = {title:'Size not applied',hint:`The original ${next.nodes[2].kind === 'chamfer' ? 'Chamfer' : 'Fillet'} edge could not be verified. Keep the current size or explicitly replace its edge first.`,detail:'No reference was renamed or refreshed.'};
        try {
          const before = await engine.part(prefixDoc(doc,2),nextRevision(),'refs');
          if (!current()) return;
          const after = await engine.part(prefixDoc(next,2),nextRevision(),'refs');
          if (!current() || owner.marker() !== null || owner.variant()) return;
          const refreshed = before.ok && after.ok ? proveRectangleFinishResize(doc,next,before.bodies,after.bodies) : null;
          if (!refreshed) return failure;
          commit(refreshed); return;
        } catch { if (current()) return failure; return; }
      }
      const insetFailure = reply.revision === request ? linkedInsetHistoryFailure(reply.error, doc.nodes, next.nodes, editNode) : undefined;
      if (insetFailure) return insetFailure;
      const failedFeature = reply.revision === request ? failedFeatureText(reply.error.feature, next.nodes, doc.nodes) : undefined;
      const failure = { ...reply.error, failedFeature };
      return (reply.revision === request ? holeDepthContactFailure(failure, doc.nodes, next.nodes, editNode) : undefined)
        ?? (reply.revision === request ? splitDependentHoleFailure(failure, doc.nodes, next.nodes, editNode) : undefined)
        ?? loftHistoryFailure(failure, doc.nodes, next.nodes, editNode) ?? failure;
    })();
  };
}
