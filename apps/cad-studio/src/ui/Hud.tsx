import type { FilletEndpoints } from '../app/filletEndpoints';
import { FilletEndpointNotice } from './FilletEndpointNotice';
import { extrudeDraftFeedback } from '../app/extrudeDraftFailure';
import { draftDependentHoleFeedback } from '../app/draftDependentHoleFeedback';
import { hasInlineFilletRadiusError } from '../app/filletRadiusNotice';
import { draftNeutralFeedback } from '../app/draftNeutralFeedback';
import { filletFaceSelectionFeedback } from '../app/filletFaceSelectionFeedback';
import { filletInteriorProblems, type FilletInteriorKey } from '../app/filletInteriorInput';
import { offsetCollapseFeedback } from '../app/offsetCollapseFeedback';
import { offsetPlanePickFeedback } from '../app/offsetPlanePickFeedback';
import { FilletTypeFields } from './FilletTypeFields';
import { FilletPickedEdges } from './FilletPickedEdges';
import type { FilletType, RadiusMode } from '../app/filletFamily';
import { commandIconName } from './commandIcons';
import { shownFields } from '@barocss/cad-model/app/commands';
import { bodyName } from '@barocss/cad-model/app/bodies';
import { isOffsetToPlane } from '@barocss/cad-model/app/offsetPlanePick';
import { isExtrudeToFace } from '@barocss/cad-model/app/extrudeEndFacePick';
import { REVOLVE_AXIS_EDIT } from '@barocss/cad-model/app/revolveAxisEdit';
import { useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';
import { useStoreValue, type ValueStore } from '../state/valueStore';
import type { Field, Values } from '@barocss/cad-model/app/commands';
import { activeKey, awaitingMirrorPlane, type Active } from '../app/commandState';
import { commandNumberRule, featureNumberBounds, featureNumberInvalid, featureNumberRange, filletSectionNumberProblem } from '../app/featureNumberInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Icon } from './atoms';
import { FillPatternHints } from './FillPatternHints';
import { FeatureFailureNotice } from './FeatureFailureNotice';
import { HolePresets } from './HolePresets';
import { stepNativeSelect } from './stepNativeSelect';
import { cutPatternSourceLabel, isCutPattern, selectedCutPatternSource } from '../app/cutPatternSource';
import { LinearSpanSpacing } from './LinearSpanSpacing';
import { sweepPathFeedback } from '../app/sweepPathFeedback';
import { loftTwoGuideFeedback } from '../app/loftTwoGuideFeedback';
import { loftGuideFeedback } from '../app/loftGuideFeedback';

/** The HUD's field box: 26 px, the studio's mono type, the accent ring when focused. */
const FIELD = 'h-[26px]! w-full px-1.5! text-xs! font-medium [font-family:var(--mono)] bg-[var(--bg)] focus-visible:ring-1 focus-visible:ring-primary';

interface Props {
  filletEndpoints?: FilletEndpoints | null;
  /** The running command (R1d): the HUD subscribes to it — its values, preview state and error — not the App. */
  store: ValueStore<Active | null>;
  onChange(key: string, value: number | string): void; onApply(owner: Active): void; onCancel(): void;
  onFilletType?(type: FilletType): void; onRadiusMode?(mode: RadiusMode): void;
  onRemoveFilletEdge?(owner: Active, edge: Active['ctx']['selection']['edges'][number]): void;
  onFramePreview?(owner: Active): void;
  onFile?(key: string, file: File): void;
  onHoleOptions(owner: Active, patch: Values): boolean;
}

/** The floating command HUD: few fields, keyboard-first, with the kernel’s answer inline. (G12f: its fields, choices and
 * actions shadcn's Input, NativeSelect and Button, at the HUD's 26 px in the studio's mono type.) */
export function Hud({ filletEndpoints, store, onChange, onApply, onCancel, onFile, onFilletType, onRadiusMode, onRemoveFilletEdge, onHoleOptions, onFramePreview }: Props) {
  const active = useStoreValue(store);
  const first = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  useEffect(() => { first.current?.focus(); if (first.current instanceof HTMLInputElement && first.current.type !== 'file') first.current.select(); }, [active?.cmd.id]);
  // (Ended before the App unmounts it.)
  if (!active) return null;
  const faceSelectionFeedback = filletFaceSelectionFeedback(active);
  const interiorProblems = filletInteriorProblems(active);
  const interiorInvalid = Object.keys(interiorProblems).length > 0;
  const sectionProblem = filletSectionNumberProblem(active);
  const draftAngleInvalid = commandNumberRule(active.cmd.id, 'deg') === 'draft-angle' && featureNumberInvalid(active.values.deg, 'draft-angle');
  const sectionRecovery = active.cmd.id === 'fillet' && active.preview === 'error' && active.error?.historyField === 'shape'
    && (active.values.shape === 'conic' || active.values.shape === 'g2') ? active.error : undefined;
  const guideFeedback = loftGuideFeedback(active);
  const twoGuideFeedback = loftTwoGuideFeedback(active);
  const pathFeedback = sweepPathFeedback(active);
  const planePickFeedback = offsetPlanePickFeedback(active);
  const collapseFeedback = offsetCollapseFeedback(active);
  const neutralFeedback = draftNeutralFeedback(active);
  const extrudeFeedback = extrudeDraftFeedback(active);
  const dependentHoleFeedback = draftDependentHoleFeedback(active);
  const edgeScope = active.preview === 'ok' ? active.filletScope ?? active.chamferScope : undefined;
  const shapedSourceScope = active.cmd.id === 'fillet' && active.fillet?.type === 'edge'
    && active.preview === 'ok' && !edgeScope && (active.values.shape === 'conic' || active.values.shape === 'g2');
  const replacingAxis = active.cmd.id === REVOLVE_AXIS_EDIT;
  const pickingMirrorPlane = awaitingMirrorPlane(active.cmd.id, active.values);
  const alignTargetBody = active.cmd.id === 'align' ? active.ctx.bodies[Number(active.values.targetBody)] : undefined;
  const alignTargetFace = active.cmd.id === 'align' ? active.values.tname : undefined;
  const alignTargetName = typeof alignTargetFace === 'string' && alignTargetFace
    ? alignTargetBody ? `${bodyName(active.ctx.doc, alignTargetBody)} · ${alignTargetFace}` : alignTargetFace
    : null;
  const cutSource = isCutPattern(active.cmd.id) ? cutPatternSourceLabel(active.ctx.doc.nodes, selectedCutPatternSource(active.ctx)) : null;
  const fields = shownFields(active.cmd.fields?.(active.ctx, active.values) ?? [], active.values).filter(f =>
    !(active.fillet?.type === 'edge' && active.fillet.radiusMode === 'constant' && (f.key === 'endRadius' || f.key.startsWith('station'))));
  const captureFirst = (element: HTMLInputElement | HTMLSelectElement | null) => { first.current = element; };
  const changeValue = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const input = event.currentTarget, key = input.dataset.key;
    if (!key) return;
    onChange(key, input.dataset.kind === 'text' || input.dataset.kind === 'choice' ? input.value : input.value === '' ? '' : Number(input.value));
  };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget, key = input.dataset.key, file = input.files?.[0];
    input.value = '';
    if (file && key) onFile?.(key, file);
  };
  const renderField = (input: Field, index: number) => {
    const field = active.fillet?.radiusMode === 'varying' && input.key === 'radius' ? {...input,label:'Start radius'} : input;
    const value = active.values[field.key], ref = index === 0 ? captureFirst : undefined;
    const showCountRange = field.kind === 'count' && ((active.cmd.id === 'circular-pattern' && field.key === 'count') || (active.cmd.id === 'hole' && field.key === 'pn'));
    const invalidCount = showCountRange && (!Number.isInteger(Number(value)) || Number(value) < (field.min ?? -Infinity) || Number(value) > (field.max ?? Infinity));
    const numberRule = commandNumberRule(active.cmd.id, field.key, active.values.op);
    const bounds = featureNumberBounds(numberRule);
    const radiusField = active.cmd.id === 'fillet' && field.key === 'radius';
    const range = showCountRange ? `Whole number from ${field.min} to ${field.max}` : numberRule && (!radiusField || featureNumberInvalid(value, numberRule)) ? featureNumberRange(numberRule) : null;
    const rangeId = range ? `hud-number-range-${field.key}` : undefined;
    const collapseError = field.key === 'd' ? collapseFeedback : field.key === 'neutral' ? neutralFeedback : field.key === 'draft' ? extrudeFeedback : undefined;
    const collapseId = field.key === 'neutral' ? 'hud-draft-neutral' : 'hud-offset-collapse';
    const invalidNumber = numberRule && featureNumberInvalid(value, numberRule);
    const interiorProblem = interiorProblems[field.key as FilletInteriorKey];
    const interiorId = `hud-fillet-interior-${field.key}`;
    const loftGuide = active.cmd.id === 'loft' && (field.key === 'guide' || field.key === 'guideB');
    const guideError = twoGuideFeedback?.field === field.key ? twoGuideFeedback.text : field.key === 'guide' ? guideFeedback : undefined;
    const guideErrorId = `hud-loft-guide-error-${field.key}`;
    const shapeError = field.key === 'shape' ? sectionRecovery : undefined;
    const shapeErrorId = 'hud-fillet-section-recovery';
    let control: ReactNode;
    if (field.kind === 'choice') control = <NativeSelect className={FIELD} ref={ref} aria-label={field.label} data-key={field.key} data-kind="choice" value={String(value)} onChange={changeValue}
      title={loftGuide ? 'Loft copies the curve. Later edits to the source curve do not update the Loft.' : undefined}
      aria-invalid={guideError || shapeError ? true : undefined} aria-describedby={guideError ? guideErrorId : shapeError ? shapeErrorId : undefined}
      onKeyDown={active.cmd.id === 'hole' && field.key === 'type' ? event => stepNativeSelect(event, next => onChange(field.key, next)) : undefined}>
      {field.options.map(option => <option key={option.value} value={option.value}>
        {alignTargetName && field.key === 'target' && option.value === 'face' ? alignTargetName : option.label}
      </option>)}
    </NativeSelect>;
    else if (field.kind === 'text') control = <Input className={FIELD} ref={ref} type="text" aria-label={field.label} data-key={field.key} data-kind="text" maxLength={field.maxLength} value={String(value ?? '')} onChange={changeValue} />;
    else if (field.kind === 'file') control = <span className="min-w-0"><Input className={FIELD} ref={ref} type="file" aria-label={field.label} data-key={field.key} accept={field.accept} disabled={!onFile} onChange={chooseFile} /><span className="muted small">{field.filename(value ?? '') ?? 'No file prepared'}</span></span>;
    else control = <span className="num"><Input className={FIELD + ' pr-7!'} ref={element => { if (ref) ref(element); element?.setCustomValidity(interiorProblem ?? ((radiusField || numberRule === 'scale-factor' || numberRule === 'open-unit' || numberRule === 'draft-angle' || active.cmd.id === 'chamfer' && numberRule === 'positive') && invalidNumber ? featureNumberRange(numberRule) + '.' : '')); }} type="number" aria-label={field.label} aria-invalid={invalidCount || invalidNumber || !!collapseError || !!interiorProblem || undefined} aria-describedby={[rangeId, interiorProblem ? interiorId : undefined, collapseError ? collapseId : undefined].filter(Boolean).join(' ') || undefined} data-key={field.key} data-kind={field.kind} step={field.kind === 'count' ? 1 : 'any'} min={numberRule === 'nonzero' ? undefined : bounds.min ?? field.min} max={bounds.max ?? field.max} value={String(value ?? '')} onChange={changeValue} />
      {field.kind === 'mm' && <em>mm</em>}{field.kind === 'deg' && <em>°</em>}{field.kind === 'ratio' && numberRule !== 'open-unit' && <em>×</em>}</span>;
    return <label key={field.key} className="field"><span>{field.label}</span>
      {range ? <span className="min-w-0">{control}<span id={rangeId} role={(radiusField || numberRule === 'scale-factor' || numberRule === 'open-unit' || numberRule === 'draft-angle' || active.cmd.id === 'chamfer' && numberRule === 'positive') && invalidNumber ? 'status' : undefined} className={(radiusField || numberRule === 'scale-factor' || numberRule === 'open-unit' || numberRule === 'draft-angle' || active.cmd.id === 'chamfer' && numberRule === 'positive') && invalidNumber ? 'hud-error small block' : 'muted small block'}>{range}</span></span> : control}
      {interiorProblem && <span className="hud-error col-span-2" id={interiorId} role="status">{interiorProblem}</span>}
      {shapeError && <span className="col-span-2"><FeatureFailureNotice error={shapeError} id={shapeErrorId} /></span>}
      {collapseError && <span className="col-span-2"><FeatureFailureNotice error={collapseError} id={collapseId} /></span>}
      {guideError && <span className="hud-error col-span-2" id={guideErrorId} role="status">{guideError}</span>}</label>;
  };
  return (
    <div className="card hud" role="dialog" aria-label={active.fillet ? 'Fillet' : active.cmd.label}>
      <div className="hud-title"><Icon name={commandIconName(active.cmd.id, active.cmd.icon)} small className="accent" />{active.fillet ? 'Fillet' : active.cmd.label}
        <span className="grow" /><span className={'status ' + active.preview}>{active.preview === 'busy' ? 'evaluating…' : active.preview === 'ok' ? 'preview' : active.preview === 'input' ? (replacingAxis ? 'pick edge' : 'pick face') : 'refused'}</span></div>
      {active.cmd.place && <div className="hud-steps"><div className={'hud-step' + (active.placing ? '' : ' done')}>
        <Icon name={active.placing ? 'radio_button_unchecked' : 'check_circle'} small /><b>Place</b><span>{active.placing ? 'click where it goes (on the ground or a top face)' : 'placed — drag its arrows to size it'}</span></div></div>}
      {active.cmd.steps && <div className="hud-steps">
        {active.cmd.steps(active.ctx, active.values).filter(step => {
          if (edgeScope && step.label === 'Edges') return false;
          if (active.cmd.id !== 'loft') return true;
          if (step.label === 'Guide' && step.done && active.values.guide) return false;
          if (step.label === 'Guides' && (twoGuideFeedback || (step.done && active.preview === 'ok'))) return false;
          return true;
        }).map(step => {
          const endFace = step.label === 'End face' && isExtrudeToFace(active.cmd.id, active.values);
          const guideStep = active.cmd.id === 'loft' && step.label === 'Guides';
          const requiresPreview = guideStep || endFace || (step.label === 'Move' && (active.cmd.id === 'offset-face' || active.cmd.id === 'offset-face-edit')) || (step.label === 'Reference plane' && isOffsetToPlane(active.cmd.id, active.values))
            || (step.label === 'Axis' && replacingAxis);
          const pathError = step.label === 'Faces' ? faceSelectionFeedback?.text : step.label === 'Path' ? pathFeedback : step.label === 'Reference plane' ? planePickFeedback : undefined;
          const done = step.done && !(pathError && step.label !== 'Faces') && (!requiresPreview || active.preview === 'ok');
          return <div key={step.label} className={'hud-step' + (done ? ' done' : '')}>
            <Icon name={done ? 'check_circle' : 'radio_button_unchecked'} small /><b>{shapedSourceScope && step.label === 'Edges' ? 'Selected source edges' : step.label}</b><span role={pathError ? 'status' : undefined}>{pathError ?? (guideStep && step.done && active.preview !== 'ok' ? active.preview === 'error' ? 'Guide geometry was not accepted. Review the error below.' : 'Validating guide geometry…' : step.text)}</span>
          </div>;
        })}
      </div>}
      {shapedSourceScope && <p className="small muted">This count describes the source selection, not the complete fillet scope. Exact tangent scope unavailable.</p>}
      {active.fillet?.radiusMode === 'varying' && <FilletEndpointNotice locations={filletEndpoints ?? {reason:'Original endpoint locations are unavailable for the current source.'}} />}
      {edgeScope && <div className="hud-steps" role="group" aria-label={active.filletScope ? 'Fillet scope' : 'Chamfer scope'}>
        <div className="field"><span>Picked native edges</span><span title={edgeScope.picked.join('\n')}>{edgeScope.picked.length}</span></div>
        {edgeScope.added
          ? <div className="field"><span>Tangent edges added</span><span title={edgeScope.added.join('\n')}>{edgeScope.added.length}</span></div>
          : <p className="small muted">Exact tangent scope unavailable</p>}

      </div>}
      {active.fillet?.type === 'edge' && onRemoveFilletEdge && active.ctx.selection.edges.length > 0
        && <FilletPickedEdges active={active} onRemove={onRemoveFilletEdge} />}
      {active.preview === 'ok' && active.extrudeResult && <div className="hud-steps" aria-label="Extrude result">
        <div className="field"><span>Target</span><span>{active.extrudeResult.target}</span></div>
        <div className="field"><span>Result</span><span>{active.extrudeResult.pieces}{active.extrudeResult.solid ? ' solid' : ''} piece{active.extrudeResult.pieces === 1 ? '' : 's'}</span></div>
      </div>}
      <div className="hud-fields">
        {cutSource && <div className="field"><span>Cut source</span><span>{cutSource}</span></div>}
        {active.fillet && <FilletTypeFields type={active.fillet.type} mode={active.fillet.radiusMode} onType={onFilletType} onMode={onRadiusMode} />}
        {fields.map(renderField)}
        {((active.cmd.id === 'linear-pattern' && active.values.result !== 'separate' && active.values.distanceMode === 'span')
          || (active.cmd.id === 'edit' && fields.some(field => field.key === 'span')))
          && <LinearSpanSpacing span={Number(active.values.span)} count={Number(active.values.count)} />}
      </div>
      {active.cmd.id === 'hole' ? <HolePresets key={activeKey(active, active.values)} values={active.values}
        onUse={options => onHoleOptions(active, options)} onReset={() => {
          const defaults = active.cmd.defaults?.(active.ctx);
          if (!defaults) return false;
          const { type, d, depth, cd, ch, csd } = defaults;
          return onHoleOptions(active, { type, d, depth, cd, ch, csd });
        }} /> : null}
      {active.cmd.id === 'fill-feature-pattern' && <FillPatternHints />}
      {active.preview === 'error' && active.error && !faceSelectionFeedback?.hideError && !guideFeedback && !twoGuideFeedback && !pathFeedback && !collapseFeedback && !neutralFeedback && !extrudeFeedback && !sectionRecovery && !hasInlineFilletRadiusError(active) && !(active.cmd.id === 'scale' && featureNumberInvalid(active.values.factor, 'scale-factor') && active.error.title === 'Enter a valid Factor') && !(draftAngleInvalid && active.error.code === 'DRAFT_ANGLE') && !(active.error.historyField && (interiorProblems[active.error.historyField as FilletInteriorKey] || active.error.historyField === sectionProblem?.key)) && <FeatureFailureNotice error={dependentHoleFeedback ?? active.error} />}
      <div className="hud-actions">
        {active.cmd.id === 'mirror' && <Button variant="ghost" aria-pressed={pickingMirrorPlane}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
          onClick={() => onChange('pickPlane', pickingMirrorPlane ? '' : 'yes')}>{pickingMirrorPlane ? 'Cancel plane pick' : 'Pick plane'}</Button>}
        <span className="grow" />
        {/* Keep native button activation from also reaching the window's Apply shortcut. */}
        {active.cmd.id === 'retaining-ring' && onFramePreview && <Button variant="ghost" disabled={active.preview !== 'ok'} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} onClick={() => onFramePreview(active)}>View preview</Button>}
        <Button variant="ghost" onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }} onClick={onCancel}>Cancel</Button>
        <Button variant="default" disabled={active.preview !== 'ok' || interiorInvalid || !!sectionProblem || draftAngleInvalid} onClick={() => { if (!interiorInvalid && !sectionProblem && !draftAngleInvalid) onApply(active); }}>Apply</Button>
      </div>
    </div>
  );
}
