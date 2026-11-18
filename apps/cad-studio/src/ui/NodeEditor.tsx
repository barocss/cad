import { heldFinishRadiusText } from '../state/heldFinishReplacement';
import { SewSourceList } from './SewSourceList';
import { splitPlaneProblem } from '@barocss/cad-model/app/splitPlaneInput';
import type { FilletEndpoints, FilletStationDraft } from '../app/filletEndpoints';
import { FilletEndpointNotice } from './FilletEndpointNotice';
import { sharedHoleLayoutPair } from '../app/sharedHoleLayout';
import { extrudeDraftFailure, extrudeDraftDependentFilletFailure } from '../app/extrudeDraftFailure';
import { varyingFilletFailure } from '../app/varyingFilletFailure';
import { historyFilletInteriorProblems, type FilletInteriorKey } from '../app/filletInteriorInput';
import { countersinkHistoryProblem } from '../app/countersinkHistoryInput';
import { nodeFilletType } from '../app/filletFamily';
import { FilletTypeFields } from './FilletTypeFields';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { featureLabel, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { featureId } from '@barocss/cad-model/engine/ids';
import { detachFaceEndExtrude } from '@barocss/cad-model/engine/faceEndExtrude';
import type { FaceEndDistanceReply } from '../engine/client';
import { convertLinearPatternDistance, type LinearPatternDistanceMode } from '@barocss/cad-model/engine/linearSpanPattern';
import type { BearingAssemblyInput } from '@barocss/cad-model/engine/bearingContext';
import { editFields, isSketchAnchoredCut, type BindableField } from '@barocss/cad-model/app/editFields';
import { ToolIconButton } from '@/components/ui/tool-button';
import { Icon } from './atoms';
import { FillPatternHints } from './FillPatternHints';
import { FeatureFailureNotice } from './FeatureFailureNotice';
import { savedCutPatternSource } from '../app/cutPatternSource';
import { AlignHistoryTarget, type AlignTargetOption } from './AlignHistoryTarget';
import type { useAlignHistoryPreview } from '../app/useAlignHistoryPreview';
import { LinearSpanSpacing } from './LinearSpanSpacing';
import { SweepHistoryInputs } from './SweepHistoryInputs';
import { HoleHistoryInputs } from './HoleHistoryInputs';
import { editExtrudeTriangleLength } from '../sketch/fixedTriangleEditor';
import type { FeatureFailure } from '../app/failedFeature';
import { featureNumberBounds, featureNumberInvalid, featureNumberRange, historyNumberRule } from '../app/featureNumberInput';
function invalidInteger(value: number, range: { min: number; max: number }): boolean {
  return !Number.isInteger(value) || value < range.min || value > range.max;
}

export function NodeEditor({ onFilletStations, filletEndpoints, nodes, index, onApply, onClose, onEditSketch, onRelinkInset, insetRelinkProblem, onDetachInset, insetSourceWidth, onDelete, readFaceEndDistance, onPickEndFace, onReplaceAxis, onEditOffset, onEditDraft, onEditSharedHoleLayout, savedFeatureEdit, readAlignTargets, alignPreview, edgeReplacement, parameters, onRefuse, bearingAssembly, doc, onDraft, pending = false, pendingLabel = 'Checking the current bearing and housing…' }: { onFilletStations?(draft: FilletStationDraft): () => void; filletEndpoints?: FilletEndpoints | null; nodes: ModelNode[]; index: number; onApply(nodes: ModelNode[], ownsDraft: () => boolean, sourceWidth?: number): void | Promise<FeatureFailure | undefined>; onClose(): void; onEditSketch?(): void; onRelinkInset?: { start(opener: HTMLButtonElement): void; cancel(): void; reviewing: boolean }; insetRelinkProblem?: string; onDetachInset?(): void; insetSourceWidth?: number; onDelete?(opener: HTMLElement): void; readFaceEndDistance?(): Promise<FaceEndDistanceReply>; onPickEndFace?(): void; onReplaceAxis?(): void; onEditOffset?(): void; onEditDraft?(): void; onEditSharedHoleLayout?(): void; savedFeatureEdit?: { label: string; start(): void }; readAlignTargets?(): Promise<AlignTargetOption[]>; alignPreview?: ReturnType<typeof useAlignHistoryPreview>; edgeReplacement?: { start(): void; cancel(): void; apply(): void; draft: { name: string | null; pending?: boolean; endpoints?: {start: readonly number[]; end: readonly number[]; stations?: {label:string; at:readonly number[]; fraction:number}[]} } | null }; parameters: Record<string, number>; onRefuse(message: string): void; bearingAssembly?: BearingAssemblyInput; doc?: StudioDoc; onDraft?(owner: object | null): void; pending?: boolean; pendingLabel?: string }) {
  // The draft is the whole node list: a sketch dimension changes the sketch the feature is made from.
  const [draft, setDraft] = useState<ModelNode[]>(nodes);
  const [stationDraftOrigin, setStationDraftOrigin] = useState({nodes,index});
  // What is typed in a number box until it reads as a number (so a box can be cleared and retyped).
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [lengthProblem, setLengthProblem] = useState<string | null>(null);
  const recoveredLengths = useRef(new WeakSet<Extract<ModelNode, { kind: 'sketch' }>>());
  const [modeProblem, setModeProblem] = useState<string | null>(null);
  const [loftGuideChoice, setLoftGuideChoice] = useState<string | null>(null);
  const historyErrorId = useId();
  const guideDescriptionId = useId();
  const countersinkErrorId = useId();
  const [readingEnd, setReadingEnd] = useState(false);
  const ordinaryLocked = pending || !!edgeReplacement?.draft;
  const request = useRef<object | null>(null);
  const applyButton = useRef<HTMLButtonElement>(null), resetButton = useRef<HTMLButtonElement>(null);
  const failureArea = useRef<HTMLDivElement>(null);
  const draftScope = useRef({ nodes, index });
  const sameDraftScope = draftScope.current.nodes === nodes && draftScope.current.index === index;
  const [evaluation, setEvaluation] = useState<{ nodes: ModelNode[]; index: number; error?: FeatureFailure; opener?: HTMLElement } | null>(null);
  useLayoutEffect(() => {
    draftScope.current = { nodes, index };
    recoveredLengths.current = new WeakSet();
    return () => { request.current = null; };
  }, [nodes, index]);
  useEffect(() => { setStationDraftOrigin({nodes,index}); setDraft(nodes); setTyped({}); setEvaluation(null); setModeProblem(null); setLengthProblem(null); setReadingEnd(false); setLoftGuideChoice(null); }, [nodes, index]);
  const current = evaluation?.nodes === nodes && evaluation.index === index ? evaluation : null;
  useLayoutEffect(() => {
    const opener = current?.opener, error = current?.error;
    if (!opener?.isConnected || !error?.linkedInsetFeature) return;
    const focused = document.activeElement;
    if (focused !== opener && !(focused === document.body && opener === applyButton.current)) return;
    if (opener === applyButton.current) resetButton.current?.focus({ preventScroll: true });
    failureArea.current?.scrollIntoView({ block: 'end', inline: 'nearest' });
  }, [current]);
  const retireEvaluation = () => {
    onRelinkInset?.cancel();
    request.current = null;
    setReadingEnd(false);
    setEvaluation(null);
    setModeProblem(null);
  };
  const original = nodes[index], originalLoft = original?.kind === 'loft' ? original : undefined;
  const sharedHolePair = onEditSharedHoleLayout ? sharedHoleLayoutPair(nodes, index) : null;
  const fields = editFields(draft, index, parameters, bearingAssembly, { doc, originalLoft }).filter(f => f.kind !== 'number' || !Number.isNaN(f.get(draft)));
  const changeNumber = (field: Extract<(typeof fields)[number], { kind: 'number' }>, text: string) => {
    retireEvaluation();
    setTyped(values => ({ ...values, [field.key]: text }));
    const value = text.trim() ? Number(text) : NaN;
    if (field.key === 'olen2') {
      const edit = editExtrudeTriangleLength(nodes, draft, index, value, parameters, recoveredLengths.current);
      if (edit) {
        if ('reason' in edit) setLengthProblem(edit.reason);
        else { setLengthProblem(null); setDraft(edit.nodes); }
        return;
      }
    }
    const rule = historyNumberRule(draft, index, field.key);
    if (Number.isFinite(value) && (!rule || !featureNumberInvalid(value, rule)) && (!field.integerRange || !invalidInteger(value, field.integerRange))) {
      const anchored = isSketchAnchoredCut(draft, index);
      const clear = anchored && (field.key === 'h' || field.key === 'draft') ? 'from'
        : field.key === 'from' && anchored !== isSketchAnchoredCut(field.set(draft, value), index) ? 'h' : null;
      if (clear) setTyped(values => {
        const next = { ...values };
        delete next[clear];
        return next;
      });
      setDraft(current => field.set(current, value));
    }
  };
  const node = draft[index];
  const loftGuides = originalLoft?.guides;
  const guideGapError = current?.error?.feature === originalLoft?.id
    && current?.error?.detail.includes('loft: two guides require guide 2 to stay to the right');
  const cutSource = node ? savedCutPatternSource(node, draft) : null;
  const linearPattern = node?.kind === 'linear-pattern' || node?.kind === 'linear-span-pattern' ? node : null;
  const changeDistanceMode = (mode: LinearPatternDistanceMode) => {
    if (!linearPattern) return;
    retireEvaluation();
    const conversion = convertLinearPatternDistance(linearPattern, mode, index);
    if ('message' in conversion) { setModeProblem(conversion.message); return; }
    if (conversion.node === linearPattern) return;
    setDraft(draft.map((node, i) => i === index ? conversion.node : node));
    setTyped(values => {
      const next = { ...values };
      delete next.spacing;
      delete next.span;
      return next;
    });
  };
  const detach = async () => {
    if (node?.kind !== 'face-end-extrude' || !readFaceEndDistance || pending || request.current) return;
    retireEvaluation();
    const ticket = {};
    request.current = ticket;
    setReadingEnd(true);
    try {
      const reply = await readFaceEndDistance();
      if (request.current !== ticket) return;
      if ('error' in reply) { setModeProblem(reply.error); return; }
      const replacement = detachFaceEndExtrude(node, reply.distance);
      setDraft(draft.map((item, i) => i === index ? replacement : item));
    } catch (error) {
      if (request.current === ticket) setModeProblem(error instanceof Error ? error.message : String(error));
    } finally {
      if (request.current === ticket) { request.current = null; setReadingEnd(false); }
    }
  };
  const names = Object.keys(parameters), filletType = nodeFilletType(draft[index]);
  const sourceWidth = typed.sourceWidth === undefined ? insetSourceWidth : Number(typed.sourceWidth);
  const changed = draft !== nodes || sourceWidth !== insetSourceWidth;
  const hasInsetDraft = !!onRelinkInset && Object.keys(typed).length > 0;
  const insetSketch = original?.kind === 'extrude' ? nodes[original.sketch] : original;
  const insetBinding = insetSketch?.kind === 'sketch' ? insetSketch.association : undefined;
  const insetField = fields.find(field => field.key === 'linkedInsetMM');
  const typedInset = typed.linkedInsetMM;
  const draftingInsetDistance = typedInset !== undefined && (!typedInset.trim() || Number(typedInset) !== insetBinding?.insetMM);
  const insetTarget = insetSketch?.kind === 'sketch' ? insetSketch.on?.node : undefined;
  const insetTargetNode = insetTarget === undefined ? undefined : nodes[insetTarget];
  const incompleteInset = typed.insetMM === '' || typed.sourceWidth === '';
  const interiorProblems = historyFilletInteriorProblems(node, typed);
  const missingNumbers = fields.flatMap(field => field.kind === 'number' && typed[field.key]?.trim() === '' && historyNumberRule(draft, index, field.key) !== 'open-unit' && !interiorProblems[field.key as FilletInteriorKey] ? [field] : []);
  const hasMissingNumber = missingNumbers.length > 0;
  const invalidCounts = fields.flatMap(field => field.kind === 'number' && field.integerRange && typed[field.key]?.trim()
    && invalidInteger(Number(typed[field.key]), field.integerRange) ? [field] : []);
  const invalidDimensions = fields.flatMap(field => {
    const value = typed[field.key], rule = historyNumberRule(draft, index, field.key);
    if (field.kind !== 'number' || !rule) return [];
    const invalid = rule === 'open-unit' ? featureNumberInvalid(value ?? field.get(draft), rule) : value?.trim() && featureNumberInvalid(value, rule);
    return invalid ? [{ field, rule }] : [];
  });
  const diameterField = fields.find(field => field.kind === 'number' && field.key === 'dia');
  const countersinkField = fields.find(field => field.kind === 'number' && field.key === 'csk');
  const countersinkProblem = node?.kind === 'hole' && diameterField?.kind === 'number' && countersinkField?.kind === 'number'
    ? countersinkHistoryProblem(typed.dia ?? diameterField.get(draft), typed.csk ?? countersinkField.get(draft)) : null;
  const splitProblem = splitPlaneProblem(node);
  const hasInvalidNumber = !!splitProblem || hasMissingNumber || invalidCounts.length > 0 || invalidDimensions.length > 0 || !!countersinkProblem || Object.keys(interiorProblems).length > 0;
  useLayoutEffect(() => {
    if (!onDraft || (!changed && !Object.keys(typed).length)) return;
    onDraft({});
    return () => onDraft(null);
  }, [onDraft, changed, draft, typed, nodes, index]);
  useLayoutEffect(() => {
    if(!onFilletStations || !sameDraftScope || stationDraftOrigin.nodes !== nodes || stationDraftOrigin.index !== index || node?.kind !== 'fillet' || !node.radii)return;
    const fractions=node.radii.slice(1,-1).map((point,i)=>{
      const raw=typed[i===0?'stationAt':'station2At'];
      return raw===undefined ? point.fraction ?? NaN : raw.trim() ? Number(raw)/100 : NaN;
    });
    return onFilletStations({nodes,index,original:nodes[index],fractions});
  }, [onFilletStations, sameDraftScope, stationDraftOrigin, node, typed, nodes, index]);
  const readAlignPreview = alignPreview?.read;
  const previewAlignDraft = sameDraftScope && node?.kind === 'align' && !node.suppressed && nodes !== draft && !ordinaryLocked && !hasInvalidNumber;
  useLayoutEffect(() => {
    if (previewAlignDraft && draft[index]?.kind === 'align' && nodes[index]?.kind === 'align') return readAlignPreview?.(draft);
  }, [readAlignPreview, previewAlignDraft, draft, nodes, index]);
  const alignResult = previewAlignDraft ? alignPreview?.result : null;
  const apply = (opener?: HTMLElement) => {
    if (!changed || pending || edgeReplacement?.draft || incompleteInset || hasInvalidNumber || lengthProblem || request.current
      || node?.kind === 'extrude' && current?.error?.historyField === 'draft') return;
    setModeProblem(null);
    const ticket = {};
    request.current = ticket;
    const ownsDraft = () => request.current === ticket;
    const result = onApply(draft, ownsDraft, sourceWidth);
    if (!result) { retireEvaluation(); return; }
    setEvaluation({ nodes, index });
    void result.then(error => {
      if (!ownsDraft()) return;
      request.current = null;
      setEvaluation(error ? { nodes, index, error: extrudeDraftDependentFilletFailure(error, nodes, draft, index) ?? extrudeDraftFailure(error, draft, index) ?? varyingFilletFailure(error, draft, index), opener } : null);
    });
  };
  const close = () => { retireEvaluation(); onClose(); };
  const remove = (opener: HTMLElement) => { retireEvaluation(); onDelete?.(opener); };
  return (
    <div className="node-editor" onKeyDown={event => {
      if (event.key === 'Enter' && event.target instanceof HTMLElement && !event.target.closest('button')) {
        apply(event.target);
      }
      else if (event.key === 'Escape') close();
      else if (event.key === 'Delete' && onDelete && !ordinaryLocked && event.target instanceof HTMLElement
        && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) {
        event.preventDefault();
        event.stopPropagation();
        remove(event.target);
      }
    }}>
      <div className="card-title" style={{ marginTop: 10 }}>EDIT FEATURE <ToolIconButton size="tiny" aria-label="Close editor" onClick={close}><Icon name="close" small /></ToolIconButton></div>
      {node?.kind === 'revolve' && <div className="field"><span>Axis</span><span>{node.axisRef
        ? `Linked edge ${node.axisRef.edge}` : node.dir ? 'Fixed edge' : `Sketch ${node.axis.toUpperCase()}`}</span></div>}
      {node?.kind === 'loft' && node.sections.length === 2 && !node.guide && <div className="field"><span>Mode</span><span>{node.guides ? 'Two guides' : 'Ruled · 2 sections'}</span></div>}
      {node?.kind === 'sweep-curve' && <SweepHistoryInputs sweep={node} profile={draft[node.sketch]} parameters={parameters} />}
      {sharedHolePair && <div role="group" aria-label="Shared hole layout">
        <div className="small">{sharedHolePair.first.id} · Ø{Number(sharedHolePair.first.radius) * 2} through + {sharedHolePair.second.id} · Ø{Number(sharedHolePair.second.radius) * 2}, depth {String(sharedHolePair.second.depth)} mm.</div>
        <div className="small">Centre [{sharedHolePair.first.center.map(String).join(', ')}] · {sharedHolePair.first.pattern ? <>Copies {sharedHolePair.first.pattern.count} · {'step' in sharedHolePair.first.pattern ? 'Step [' + sharedHolePair.first.pattern.step.join(', ') + ']' : 'Circle centre [' + sharedHolePair.first.pattern.about.join(', ') + ']'}</> : 'One hole'}</div>
        <div className="small">These separate features currently share a centre and copy layout. Creation provenance is unavailable. This is an explicit one-time edit of both, not a persistent link; diameters and depths stay independent.</div>
        <button type="button" className="ghost" disabled={ordinaryLocked || changed || hasInvalidNumber || Object.keys(typed).length > 0 || !sameDraftScope}
          onClick={onEditSharedHoleLayout}>Edit shared layout…</button>
      </div>}
      {node?.kind === 'hole' && <HoleHistoryInputs hole={node} doc={doc} index={index} editableEnds={fields.some(field => field.key === 'end')}
        drillDiameter={typed.dia ?? (diameterField?.kind === 'number' ? diameterField.get(draft) : undefined)} />}
      {node?.kind === 'extrude' && node.cutDepth === 'through' && <div className="field"><span>Depth</span><span>Through all</span></div>}
      {node?.kind === 'fillet' && node.radii && <FilletEndpointNotice locations={filletEndpoints ?? {reason:'Endpoint locations are unavailable in this editing context.'}} />}
      {filletType && <FilletTypeFields type={filletType} mode={draft[index]?.kind === 'fillet' && draft[index].radii ? 'varying' : 'constant'} section={node?.kind === 'fillet' ? node.section : undefined} fixed />}
      {onEditSketch && <button className="ghost" aria-label="Edit sketch" title="Reopen the sketch this feature is made from, with its constraints" onClick={() => { retireEvaluation(); onEditSketch(); }}><Icon name="draw" small /> Edit sketch</button>}
      {insetBinding && insetTarget !== undefined && insetTargetNode && <div role="group" aria-label="Linked inset">
        <div className="field"><span>Inset source face</span><span className="break-all">{insetBinding.face}</span></div>
        <div className="field"><span>Sketch target</span><span>{featureLabel(insetTargetNode, insetTarget, nodes)} ({featureId(nodes, insetTarget)})</span></div>
        {(!insetField || draftingInsetDistance) && <div className="field"><span>Applied inset distance</span><span>{insetBinding.insetMM} mm</span></div>}
        {insetRelinkProblem && !draftingInsetDistance && <p className="small muted">{insetRelinkProblem}</p>}
        {onRelinkInset && <p className="small muted">Replace the source with an earlier planar face. Shape edits in Edit sketch detach the link.</p>}
      </div>}
      {onRelinkInset && <button className="ghost" type="button" disabled={pending || changed || hasInsetDraft || onRelinkInset.reviewing}
        onClick={event => { retireEvaluation(); onRelinkInset.start(event.currentTarget); }}>Replace inset source</button>}
      {onDetachInset && <button className="ghost" type="button" disabled={pending || changed || incompleteInset}
        onClick={() => { retireEvaluation(); onDetachInset(); }}>Detach inset</button>}
      {insetSourceWidth !== undefined && <div className="field"><span>Source width</span><span className="num">
        <input type="number" step="any" aria-label="Source width" value={typed.sourceWidth ?? insetSourceWidth} disabled={pending}
          onChange={event => { retireEvaluation(); setTyped(values => ({ ...values, sourceWidth: event.target.value })); }} /><em>mm</em>
      </span></div>}
      {linearPattern && <div className="field"><span>Distance mode</span>
        <select aria-label="Distance mode" value={linearPattern.kind === 'linear-pattern' ? 'spacing' : 'span'} disabled={pending}
          onChange={event => changeDistanceMode(event.target.value as LinearPatternDistanceMode)}>
          <option value="spacing">Spacing</option>
          <option value="span">Total span</option>
        </select>
      </div>}
      {node?.kind === 'sew' && <SewSourceList names={node.names} />}
      {splitProblem && <p role="status" className="hud-error">{splitProblem}</p>}
      {node?.kind === 'split' && <p className="small muted">
        Negative and Positive follow the plane normal; reversing the normal swaps their physical sides.
        {index !== nodes.length - 1 && ` Output side: ${node.outputSide ?? 'both'}. Change output sides only while Split is the last feature; later features may depend on its sides.`}
      </p>}
      {node?.kind === 'face-end-extrude' && <div className="field">
        <span>End face</span><span>{node.target.face}</span>
      </div>}
      {node?.kind === 'face-end-extrude' && readFaceEndDistance && <button className="ghost" type="button" disabled={pending || readingEnd || !!node.suppressed}
        onClick={() => void detach()}>Detach to Distance</button>}
      {savedFeatureEdit && <button className="ghost" type="button" disabled={pending || changed}
        onClick={() => { retireEvaluation(); savedFeatureEdit.start(); }}>{savedFeatureEdit.label}</button>}
      {onEditDraft && <button className="ghost" type="button" disabled={pending || changed}
        onClick={() => { retireEvaluation(); onEditDraft(); }}>Edit draft</button>}
      {onEditOffset && <button className="ghost" type="button" disabled={pending || changed}
        onClick={() => { retireEvaluation(); onEditOffset(); }}>Edit offset</button>}
      {onReplaceAxis && <button className="ghost" type="button" disabled={pending || changed}
        onClick={() => { retireEvaluation(); onReplaceAxis(); }}>Replace axis</button>}
      {onPickEndFace && <button className="ghost" type="button" disabled={pending || changed}
        onClick={() => { retireEvaluation(); onPickEndFace(); }}>{nodes[index]?.kind === 'face-end-extrude' ? 'Change end face' : 'Set end face'}</button>}
      {edgeReplacement && (edgeReplacement.draft ? <>
        <span className="small break-all" role="status">{edgeReplacement.draft.name ?? 'Select an edge on the feature body.'}</span>
        {edgeReplacement.draft.endpoints && node?.kind === 'fillet' && node.radii && <div className="small" role="status">
          <div>This choice assigns the saved Start/End radii to the new edge in the displayed direction. Interior positions keep their saved fractions.</div>
          <div>Start R{heldFinishRadiusText(node.radii[0].radius,parameters)} → ({edgeReplacement.draft.endpoints.start.join(', ')})</div>
          {edgeReplacement.draft.endpoints.stations?.map((station,i)=><div key={station.label}>{station.label} {station.fraction*100}% R{heldFinishRadiusText(node.radii![i+1].radius,parameters)} → ({station.at.join(', ')})</div>)}
          <div>End R{heldFinishRadiusText(node.radii.at(-1)!.radius,parameters)} → ({edgeReplacement.draft.endpoints.end.join(', ')})</div>
        </div>}
        <div className="row-actions">
          <button className="primary" type="button" aria-label="Apply edge replacement"
            disabled={changed || !edgeReplacement.draft.name || edgeReplacement.draft.pending} onClick={edgeReplacement.apply}>Apply edge</button>
          <button className="ghost" type="button" aria-label="Cancel edge replacement" onClick={edgeReplacement.cancel}>Cancel</button>
        </div>
      </> : <button className="ghost" type="button" disabled={pending || changed || hasInvalidNumber || !sameDraftScope} onClick={() => { retireEvaluation(); edgeReplacement.start(); }}>Replace edge</button>)}
      {readingEnd && <div className="empty" role="status">Reading exact distance…</div>}
      {node?.kind === 'shaft' && node.steps.some(step => (step.grooves?.length ?? 0) > 1) && <p className="empty" role="status">Groove positions are editable only on steps with one groove. Moving multiple grooves past one another can change named references.</p>}
      {hasMissingNumber && <div className="hud-error" role="status">Enter a number for {missingNumbers.map(field => field.label).join(', ')}.</div>}
      {invalidCounts.map(field => <div key={field.key} className="hud-error" role="status">{field.label} must be a whole number from {field.integerRange!.min} to {field.integerRange!.max}.</div>)}
      {invalidDimensions.filter(({ rule }) => rule !== 'open-unit').map(({ field, rule }) => <div key={field.key} id={`history-invalid-${field.key}`} className="hud-error" role="status">{field.label} · {featureNumberRange(rule)}.</div>)}
      {lengthProblem && <div className="hud-error" role="status">{lengthProblem}</div>}
      {modeProblem && <div className="hud-error" role="status">{modeProblem}</div>}
      {node?.kind === 'align' && <>
        <div className="field"><span>Source face</span><span>{node.source.face}</span></div>
        {readAlignTargets ? <AlignHistoryTarget key={index} value={node.target} disabled={ordinaryLocked || !!node.suppressed} read={readAlignTargets}
          onChange={target => {
            retireEvaluation();
            setDraft(current => current.map((item, k) => k === index && item.kind === 'align' ? { ...item, target } : item));
          }} /> : <div className="field"><span>Target face</span><span>{node.target.face}</span></div>}
      </>}
      {cutSource && <div className="field"><span>Cut source</span><span>{cutSource}</span></div>}
      {node?.kind === 'circular-pattern' && fields.some(f => f.key === 'span') && <p className="small" role="note" aria-label="Spread over behavior">360° or more uses one full turn. Negative values reverse direction. Spread over cannot be bound to a parameter.</p>}
      {fields.length ? fields.map(f => {
        const rule = f.kind === 'number' ? historyNumberRule(draft, index, f.key) : undefined;
        const numberBounds = featureNumberBounds(rule);
        const invalidDimension = invalidDimensions.some(item => item.field === f);
        const range = rule === 'open-unit' ? featureNumberRange(rule) : f.kind === 'number' && f.integerRange
          ? `Whole number from ${f.integerRange.min} to ${f.integerRange.max}` : rule && !invalidDimension ? featureNumberRange(rule) : null;
        const rangeId = invalidDimension && rule !== 'open-unit' ? `history-invalid-${f.key}` : range ? `history-range-${f.key}` : undefined;
        const guideField = loftGuides && /^loftGuideControl([01])([01])$/.exec(f.key);
        const guide = guideField && loftGuides?.[guideField[1] === '0' ? 0 : 1];
        const guideId = guideField ? `${guideDescriptionId}-${guideField[1]}` : undefined;
        const guideX = guideField?.[2] === '0';
        const failedGuideX = !!guideGapError && guideX;
        const interiorProblem = interiorProblems[f.key as FilletInteriorKey];
        const interiorId = `history-fillet-interior-${f.key}`;
        const description = [rangeId, guideId, interiorProblem && interiorId, f.key === 'csk' && countersinkProblem && countersinkErrorId, failedGuideX && `${guideDescriptionId}-gap`].filter(Boolean).join(' ') || undefined;
        const selectedGuide = f.kind === 'choice' && f.key === 'loftGuide' && sameDraftScope
          ? f.options.find(option => option.value === loftGuideChoice)?.value : undefined;
        const refusedHistoryField = current?.error?.historyField === f.key;
        const extrudeFailure = node?.kind === 'extrude' && f.key === 'draft' && refusedHistoryField ? current?.error : undefined;
        return (
        <div key={f.key} className="field">
          {f.key === 'csk' && countersinkProblem && <div id={countersinkErrorId} role="status" className="col-span-2 hud-error">{countersinkProblem}</div>}
          {guideX && guide && <div id={guideId} className="col-span-2 small mono break-words">
            Guide {Number(guideField[1]) + 1} · ({guide.controlPoints[0].join(', ')}) → ({guide.controlPoints[2].join(', ')}) mm
          </div>}
          {extrudeFailure && <span className="col-span-2"><FeatureFailureNotice id={historyErrorId} error={extrudeFailure} /></span>}
          <span>{f.label}</span>
          {f.kind === 'number' ? <span className="num"><input ref={element => element?.setCustomValidity(interiorProblem ?? ((rule === 'scale-factor' || rule === 'open-unit' || node?.kind === 'chamfer' && rule === 'positive') && invalidDimension ? featureNumberRange(rule) + '.' : ''))} type="number" step={f.integerRange ? 1 : "any"} min={f.integerRange?.min ?? numberBounds.min} max={f.integerRange?.max ?? numberBounds.max} aria-label={f.label} aria-describedby={extrudeFailure ? historyErrorId : description} aria-invalid={!!extrudeFailure || typed[f.key]?.trim() === '' || invalidCounts.includes(f) || invalidDimension || !!interiorProblem || failedGuideX || (f.key === 'csk' && !!countersinkProblem) || (f.key === 'olen2' && !!lengthProblem) || undefined} data-loft-guide-gap={failedGuideX || undefined} value={typed[f.key] ?? f.get(draft)} disabled={ordinaryLocked || !!(f as BindableField).param?.(draft)} onChange={e => changeNumber(f, e.target.value)} />{f.unit && <em>{f.unit}</em>}
            {names.length > 0 && 'bind' in f && <select className="param-bind" disabled={ordinaryLocked} aria-label={`${f.label} parameter`} data-tip="Parameter" data-tip-desc="Bind this value to a named parameter (Parameters panel)" value={(f as BindableField).param(draft) ?? ''}
              onChange={e => {
                retireEvaluation();
                const b = f as BindableField, name = e.target.value;
                try {
                  const next = name ? b.bind(draft, name) : b.set(draft, b.get(draft));
                  if (next) {
                    setDraft(next);
                    setTyped(m => Object.fromEntries(Object.entries(m).filter(([k]) => k !== f.key)));
                    if (f.key === 'olen2') setLengthProblem(null);
                  }
                  else onRefuse(`${f.label} is not stored as it is shown, so it cannot take a parameter.`);
                } catch (error) { onRefuse(error instanceof Error ? error.message.replace(/^\[\w+\] /, '') : String(error)); }
              }}>
              <option value="">ƒ</option>{names.map(n => <option key={n} value={n}>{n}</option>)}</select>}</span>
            : f.kind === 'choice' ? <select disabled={ordinaryLocked} aria-label={f.label}
                aria-invalid={refusedHistoryField || undefined} aria-describedby={refusedHistoryField ? historyErrorId : undefined}
                value={selectedGuide ?? f.get(draft)} onChange={e => {
                retireEvaluation();
                try {
                  const next = f.set(draft, e.target.value);
                  if (f.key === 'end' && node?.kind === 'hole' && next[index] !== draft[index]) {
                    setTyped(values => Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'depth')));
                  }
                  if (f.key === 'thread') {
                    if (next[index] === draft[index]) return;
                    setTyped(values => Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'dia')));
                  }
                  if (f.key === 'loftGuide') {
                    setLoftGuideChoice(e.target.value);
                    if (next[index] === draft[index]) return;
                  }
                  if (f.key.startsWith('loftSource')) {
                    const section = 'Section ' + (Number(f.key.slice('loftSource'.length)) + 1) + ' · ';
                    const keys = new Set(fields.filter(field => field.label.startsWith(section)).map(field => field.key));
                    setTyped(values => Object.fromEntries(Object.entries(values).filter(([key]) => !keys.has(key))));
                  }
                  setDraft(next);
                } catch (error) {
                  onRefuse(error instanceof Error ? error.message.replace(/^\[\w+\] /, '') : String(error));
                }
              }}>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            : <input type="checkbox" className="check" disabled={ordinaryLocked} aria-label={f.label} checked={f.get(draft)} onChange={e => { retireEvaluation(); setDraft(d => f.set(d, e.target.checked)); }} />}
          {interiorProblem && <div id={interiorId} role="status" className="col-span-2 hud-error">{interiorProblem}</div>}
          {range && <span id={rangeId} role={(rule === 'scale-factor' || rule === 'open-unit' || node?.kind === 'chamfer' && rule === 'positive') && invalidDimension ? 'status' : undefined} className={(rule === 'scale-factor' || rule === 'open-unit' || node?.kind === 'chamfer' && rule === 'positive') && invalidDimension ? 'hud-error small col-span-2' : 'muted small col-span-2'}>{range}</span>}
        </div>
      ); }) : node?.kind !== 'face-end-extrude' && <div className="empty">{node?.kind === 'sweep-curve' && onEditSketch ? 'Edit the profile dimensions with Edit sketch.' : savedFeatureEdit ? `Use ${savedFeatureEdit.label} to edit the saved group.` : 'This feature has no editable dimensions.'}</div>}
      {node?.kind === 'linear-span-pattern' && <LinearSpanSpacing span={node.span} count={node.count} />}
      {draft[index]?.kind === 'fill-feature-pattern' && <FillPatternHints />}
      {onDelete && <button className="ghost danger" disabled={ordinaryLocked} aria-label="Delete feature" title="Delete this feature (and the sketch only it uses) · Undo restores it" onClick={event => remove(event.currentTarget)}><Icon name="delete" small /> Delete feature</button>}
      {pending && <div className="empty" role="status">{pendingLabel}</div>}
      {!current && alignResult?.kind === 'pending' && <div className="empty" role="status">Checking Align preview…</div>}
      {!current && alignResult?.kind === 'ready' && <div className="small" role="status">Align preview</div>}
      {!current && alignResult?.kind === 'error' && <FeatureFailureNotice error={alignResult.error} />}
      <div ref={failureArea} className={current?.error?.linkedInsetFeature ? 'scroll-mb-2' : undefined}>
        {current?.error && !(node?.kind === 'extrude' && current.error.historyField === 'draft') && <FeatureFailureNotice id={guideGapError ? `${guideDescriptionId}-gap` : current.error.historyField ? historyErrorId : undefined} error={current.error} />}
        {fields.length > 0 && <div className="row-actions"><button ref={applyButton} className="primary" disabled={!changed || pending || !!edgeReplacement?.draft || incompleteInset || hasInvalidNumber || !!lengthProblem || (current !== null && (!current.error || node?.kind === 'extrude' && current.error.historyField === 'draft'))} onClick={event => apply(event.currentTarget)}>Apply</button><button ref={resetButton} className="ghost" disabled={(!changed && !hasInsetDraft && !incompleteInset && !hasInvalidNumber && !lengthProblem && !loftGuideChoice) || pending} onClick={() => { retireEvaluation(); setDraft(nodes); setTyped({}); setLengthProblem(null); setLoftGuideChoice(null); }}>Reset</button></div>}
      </div>
    </div>
  );
}
