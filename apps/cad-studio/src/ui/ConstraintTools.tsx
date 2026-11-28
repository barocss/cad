// The sketch panel's constraint section for a closed outline: what is picked, the constraints that can
// apply to it, and every constraint with a remove button. Refusals are shown with their reason.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import {
  addLinearPattern, addReferenceDimension, applyConstraint, axisDiameterGeometry, axisDiameterKey, circleDimensionKeys,
  circlePairKeys, constraintOptions, convertReferenceToDriving, dimensionKey, edgeCircleGapKey, findDerivedPatternCircle,
  isSettled, patternCopyDimensionKeys, pointDimensionKeys, removeLinearPattern, removeReferenceDimension,
  resolveReferenceDimension, updateLinearPattern, type ConstraintKind, type Polygon, type ReferenceDimensionKind,
  type SketchLinearPattern, type SketchPatternAxis, type SketchPick,
} from '@barocss/cad-model/sketch/rules';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { clearConstraintInspection, inspectConstraint, keepsDimensionDraft, type ConstraintComparison, type ConstraintInspection, type ConstraintInspectionStore } from '../sketch/constraintInspection';
import { fixedEdgeAxisConflict, fixedEdgePairConflict } from '../sketch/constraintList';
import { useStoreValue } from '../state/valueStore';
import { duplicatePointDistance } from './sketchPresentation';
import { ConstraintList } from './ConstraintList';
import { SketchCornerTools } from './SketchCornerTools';
import { selectedSavedCorners, sketchCornerTargets } from '../sketch/cornerDraft';
import './constraints.css';

const TOOLS: { kind: ConstraintKind; sym: string; label: string; short: string }[] = [
  { kind: 'horizontal', sym: 'H', label: 'Horizontal', short: 'Horiz' }, { kind: 'vertical', sym: 'V', label: 'Vertical', short: 'Vert' },
  { kind: 'parallel', sym: '∥', label: 'Parallel', short: 'Parallel' }, { kind: 'perpendicular', sym: '⊥', label: 'Perpendicular', short: 'Perp' },
  { kind: 'equal', sym: '=', label: 'Equal', short: 'Equal' }, { kind: 'coincident', sym: '◎', label: 'Coincident', short: 'Centre' }, { kind: 'tangent', sym: '⌒', label: 'Tangent', short: 'Tangent' }, { kind: 'symmetric', sym: '⟷', label: 'Symmetric', short: 'Sym' }, { kind: 'fix', sym: '⚓', label: 'Fix', short: 'Fix' },
];

const pickName = (s: Polygon, p: SketchPick) => p.kind === 'point'
  ? `point ${p.i + 1}`
  : p.kind === 'pattern-circle'
    ? `copy #${p.i} (${p.pattern ?? ''})`
    : p.kind === 'circle'
      ? `circle ${p.i + 1}`
      : `${s.bulges?.[p.i] ? 'arc' : 'edge'} ${p.i + 1}`;

interface PendingPatternRemoval {
  action: 'update' | 'remove';
  patternId: string;
  count?: number;
  spacing?: number;
  reason: string;
}

interface PatternDraft {
  axis: SketchPatternAxis;
  sign: -1 | 1;
  spacing: string;
  count: string;
}

export function ConstraintTools({ shape: s, owner, conflictIds, documentScope, inspection, picked, onShape, onPicked, onEditDim }: {
  shape: Polygon; owner: SketchState; conflictIds?: readonly string[]; documentScope: StudioDoc; inspection: ConstraintInspectionStore; picked: readonly SketchPick[];
  onShape(shape: Polygon): void; onPicked(picks: SketchPick[]): void; onEditDim(key: string | null): void;
}) {
  const [refusal, setRefused] = useState<string | { source: Polygon; picked: readonly SketchPick[]; reason: string; ids: readonly string[] } | null>(null);
  const fixedConflict = typeof refusal === 'object' && refusal?.source === s && refusal.picked === picked ? refusal : null;
  const refused = typeof refusal === 'string' ? refusal : fixedConflict?.reason;
  const [patternDraft, setPatternDraft] = useState<PatternDraft>({ axis: 'x', sign: 1, spacing: '10', count: '3' });
  const [patternEdits, setPatternEdits] = useState<Record<string, { count: string; spacing: string }>>({});
  const [pendingPatternConfirm, setPendingPatternConfirm] = useState<PendingPatternRemoval | null>(null);
  const current = useStoreValue(inspection);
  const active = current?.owner === owner ? current : null;
  const inspectedId = active?.target === 'row' ? active.entry.id : null;
  const comparison = active?.target === 'comparison' ? active : null;
  const comparisonReason = comparison && !comparison.result.ok ? comparison.result.reason : null;
  const cached = useRef<{ owner: SketchState; results: Map<ConstraintKind, ConstraintComparison> } | null>(null);
  useLayoutEffect(() => () => { clearConstraintInspection(inspection, owner); }, [inspection, owner, documentScope]);
  useEffect(() => { setRefused(null); setPendingPatternConfirm(null); }, [s, picked, documentScope]);
  const options = constraintOptions(s, picked), dim = dimensionKey(s, picked);
  const canCompare = !owner.association && !owner.done?.length && !s.construction && !s.circles?.length &&
    !s.bulges?.some(Boolean) && picked.length === 2 && picked.every(p => p.kind === 'edge');
  const compare = (kind: ConstraintKind, input: ConstraintInspection['input']) => {
    if (!canCompare || options[kind] || (kind !== 'parallel' && kind !== 'perpendicular' && kind !== 'equal')) return;
    const cache = cached.current?.owner === owner ? cached.current : { owner, results: new Map<ConstraintKind, ConstraintComparison>() };
    cached.current = cache;
    let result = cache.results.get(kind);
    if (!result) {
      const applied = applyConstraint(s, picked, kind);
      if (!applied.ok) result = applied;
      else {
        const settled = settleShape(applied.shape, s);
        result = settled.error || !isSettled(settled.shape)
          ? { ok: false, reason: settled.error ?? 'Could not settle the outline' }
          : { ok: true, shape: applied.shape, display: settled.shape };
      }
      cache.results.set(kind, result);
    }
    inspectConstraint(inspection, { owner, target: 'comparison', kind, input, result });
  };
  const stopComparing = (kind: ConstraintKind, input: ConstraintInspection['input']) => {
    const current = inspection.get();
    if (current?.owner === owner && current.target === 'comparison' && current.kind === kind && current.input === input) inspection.set(null);
  };
  const point = picked.find(p => p.kind === 'point'), edge = picked.find(p => p.kind === 'edge'), circle = picked.find(p => p.kind === 'circle');
  const patternCopy = picked.find(p => p.kind === 'pattern-circle' && p.pattern);
  const patternCopyDims = picked.length === 2 && point && patternCopy?.pattern && findDerivedPatternCircle(s, patternCopy.pattern, patternCopy.i)
    ? patternCopyDimensionKeys(point.i, patternCopy.pattern, patternCopy.i) : null;
  const singleAttachedCircle = picked.length === 1 && picked[0].kind === 'circle' && !picked[0].done ? picked[0].i : null;
  const canAddPatternForCircle = singleAttachedCircle !== null && !(s.patterns ?? []).some(p => p.seedCircle === singleAttachedCircle);
  const corners = sketchCornerTargets(s, picked);
  const savedCorners = selectedSavedCorners(owner, s, documentScope, picked);
  const twoOutlinePoints = picked.length === 2 && picked.every(p => p.kind === 'point');
  const twoPoints = twoOutlinePoints ? pointDimensionKeys(picked[0].i, picked[1].i)
    : picked.length === 2 && point && circle ? circleDimensionKeys(point.i, circle.i)
      : picked.length === 2 && picked.every(p => p.kind === 'circle') ? circlePairKeys(picked[0].i, picked[1].i) : null;
  const edgeCircleGap = picked.length === 2 && edge && circle && !circle.done ? edgeCircleGapKey(s, edge.i, circle.i) : null;
  const singlePoint = picked.length === 1 && picked[0].kind === 'point' ? picked[0].i : null;
  const axisDiaY = singlePoint !== null && axisDiameterGeometry(s, singlePoint, 'y') ? axisDiameterKey(singlePoint, 'y') : null;
  const axisDiaX = singlePoint !== null && axisDiameterGeometry(s, singlePoint, 'x') ? axisDiameterKey(singlePoint, 'x') : null;
  const addRef = (kind: ReferenceDimensionKind) => {
    if (!twoOutlinePoints) return;
    const r = addReferenceDimension(s, picked[0].i, picked[1].i, kind);
    if (!r.ok) { setRefused(r.reason); return; }
    onShape(r.shape);
    onPicked([]);
  };
  const makeRefDriving = (refId: string) => {
    const r = convertReferenceToDriving(s, refId);
    if (!r.ok) { setRefused(r.reason); return; }
    onShape(r.shape);
  };
  const addPattern = () => {
    if (singleAttachedCircle === null) return;
    const spacing = Number(patternDraft.spacing), count = Number(patternDraft.count);
    const r = addLinearPattern(s, {
      seedCircle: singleAttachedCircle,
      axis: patternDraft.axis,
      sign: patternDraft.sign,
      spacing,
      count,
    });
    if (!r.ok) { setRefused(r.reason); return; }
    setPendingPatternConfirm(null);
    onShape(r.shape);
    onPicked([]);
  };
  const applyPatternUpdate = (p: SketchLinearPattern, dropReferencedConstraints = false) => {
    const draft = patternEdits[p.id];
    const count = draft ? Number(draft.count) : p.count;
    const spacing = draft ? Number(draft.spacing) : p.spacing;
    const r = updateLinearPattern(s, p.id, { count, spacing }, { dropReferencedConstraints });
    if (!r.ok) {
      setRefused(r.reason);
      if (r.blockingRuleIndices?.length) {
        setPendingPatternConfirm({ action: 'update', patternId: p.id, count, spacing, reason: r.reason });
      }
      return;
    }
    setPendingPatternConfirm(null);
    onShape(r.shape);
    onPicked(picked.filter(item => item.kind !== 'pattern-circle' || item.pattern !== p.id || item.i < count));
    onEditDim(null);
  };
  const applyPatternRemove = (patternId: string, dropReferencedConstraints = false) => {
    const r = removeLinearPattern(s, patternId, { dropReferencedConstraints });
    if (!r.ok) {
      setRefused(r.reason);
      if (r.blockingRuleIndices?.length) {
        setPendingPatternConfirm({ action: 'remove', patternId, reason: r.reason });
      }
      return;
    }
    setPendingPatternConfirm(null);
    onShape(r.shape);
    onPicked(picked.filter(item => item.kind !== 'pattern-circle' || item.pattern !== patternId));
    onEditDim(null);
  };
  const resolvedRefs = (s.references ?? []).map(ref => resolveReferenceDimension(s, ref));
  const apply = (kind: ConstraintKind) => {
    const current = inspection.get();
    const r = current?.owner === owner && current.target === 'comparison' && current.kind === kind
      ? current.result : applyConstraint(s, picked, kind);
    clearConstraintInspection(inspection, owner);
    if (!r.ok) {
      const fixed = fixedEdgeAxisConflict(s, picked, kind) ?? fixedEdgePairConflict(s, picked, kind);
      setRefused(fixed ? { ...fixed, source: s, picked } : r.reason);
      return;
    }
    onShape(r.shape); onPicked([]);
  };
  // A matching ellipse lists its arc-direction rows (one per arc) as one summary row.
  return <>
    <div className="card-title" style={{ marginTop: 10 }}>ADD CONSTRAINT</div>
    <div className="cons-sel" aria-live="polite">{picked.length
      ? <>Picked <b>{picked.map(p => pickName(s, p)).join(', ')}</b></>
      : 'Pick points and edges with Select (S) · Shift adds'}</div>
    <div className="cons-tools" role="group" aria-label="Constraints for the selection" data-sketch-dimension-focus
      onBlur={e => { if (owner.editDim && !keepsDimensionDraft(e.relatedTarget)) onEditDim(null); }}>
      {TOOLS.map(t => <button key={t.kind} type="button" aria-label={t.label} disabled={!!options[t.kind]}
        data-sketch-action className={comparison?.kind === t.kind ? 'comparing' : undefined}
        onPointerEnter={() => compare(t.kind, 'pointer')} onPointerLeave={() => stopComparing(t.kind, 'pointer')}
        onFocus={() => compare(t.kind, 'focus')} onBlur={() => stopComparing(t.kind, 'focus')}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
        title={options[t.kind] ?? `${t.label}: apply to the picked ${picked.length > 1 ? 'entities' : 'entity'}`} onClick={() => apply(t.kind)}><b>{t.sym}</b><span>{t.short}</span></button>)}
      <button type="button" aria-label="Dimension the selection" disabled={!dim} title={dim ? 'Add or edit this dimension in the viewport' : 'Select an edge or arc, two straight edges (angle), two points, or a circle with a point, a horizontal or vertical edge or another circle'}
        onClick={() => dim && onEditDim(dim)}><b>↔</b><span>Dimension</span></button>
    </div>
    {comparisonReason && comparisonReason !== refused && <div className="sk-status open" role="status" aria-label="Constraint preview"><i />{comparisonReason}</div>}
    {twoPoints && <div className="cons-tools cons-dims" role="group" aria-label="Dimensions between the points">
      {!duplicatePointDistance(picked, dim) && <button type="button" aria-label="Distance between the points" title="Straight distance" onClick={() => onEditDim(circle ? twoPoints.dist : dim ?? twoPoints.dist)}><b>⤢</b><span>Distance</span></button>}
      <button type="button" aria-label="Horizontal distance" title="Distance along the sketch X axis" onClick={() => onEditDim(twoPoints.dx)}><b>↔</b><span>Horizontal</span></button>
      <button type="button" aria-label="Vertical distance" title="Distance along the sketch Y axis" onClick={() => onEditDim(twoPoints.dy)}><b>↕</b><span>Vertical</span></button>
    </div>}
    {twoOutlinePoints && <div className="cons-tools cons-dims" role="group" aria-label="Reference dimensions between the points">
      <button type="button" aria-label="Add reference distance" title="Read-only aligned measurement (adds no constraint)" onClick={() => addRef('distance')}><b>(⤢)</b><span>Ref dist</span></button>
      <button type="button" aria-label="Add horizontal reference distance" title="Read-only X measurement (adds no constraint)" onClick={() => addRef('dx')}><b>(↔)</b><span>Ref horiz</span></button>
      <button type="button" aria-label="Add vertical reference distance" title="Read-only Y measurement (adds no constraint)" onClick={() => addRef('dy')}><b>(↕)</b><span>Ref vert</span></button>
    </div>}
    {edgeCircleGap && <div className="cons-tools cons-dims" role="group" aria-label="Edge to circle dimensions">
      {dim && <button type="button" aria-label="Centre distance from edge" title="Distance from the edge to the circle centre" onClick={() => onEditDim(dim)}><b>↔</b><span>Centre</span></button>}
      <button type="button" aria-label="Edge to circle gap" title="Clearance gap from the edge to the circle circumference" onClick={() => onEditDim(edgeCircleGap)}><b>⇤</b><span>Gap</span></button>
    </div>}
    {patternCopyDims && <div className="cons-tools cons-dims" role="group" aria-label="Dimensions to pattern copy">
      <button type="button" aria-label="Horizontal distance to pattern copy" title="Horizontal X distance from outline point to derived pattern copy (drives seed)" onClick={() => onEditDim(patternCopyDims.dx)}><b>↔</b><span>Copy X</span></button>
      <button type="button" aria-label="Vertical distance to pattern copy" title="Vertical Y distance from outline point to derived pattern copy (drives seed)" onClick={() => onEditDim(patternCopyDims.dy)}><b>↕</b><span>Copy Y</span></button>
    </div>}
    {(axisDiaY || axisDiaX) && <div className="cons-tools cons-dims" role="group" aria-label="Axis diameter dimensions">
      {axisDiaY && <button type="button" aria-label="Diameter about Y axis" title="Revolve diameter about the sketch Y axis (radius = Ø/2)" onClick={() => onEditDim(axisDiaY)}><b>Ø</b><span>About Y</span></button>}
      {axisDiaX && <button type="button" aria-label="Diameter about X axis" title="Revolve diameter about the sketch X axis (radius = Ø/2)" onClick={() => onEditDim(axisDiaX)}><b>Ø</b><span>About X</span></button>}
    </div>}
    {(!!corners.length || savedCorners) && <SketchCornerTools owner={owner} source={s} doc={documentScope}
      corners={corners} resize={savedCorners}
      inspection={inspection} onApply={shape => { onShape(shape); if (!savedCorners) onPicked([]); }} />}
    {refused && <div className="sk-status open" role="alert"><i />{refused}</div>}
    {pendingPatternConfirm && (
      <div className="cons-tools" role="group" aria-label="Confirm pattern constraint removal">
        <button
          type="button"
          data-sketch-action
          aria-label="Remove affected constraints and apply pattern change"
          onClick={() => {
            if (pendingPatternConfirm.action === 'remove') applyPatternRemove(pendingPatternConfirm.patternId, true);
            else {
              const p = (s.patterns ?? []).find(item => item.id === pendingPatternConfirm.patternId);
              if (p) applyPatternUpdate(p, true);
            }
          }}
        >Remove constraints &amp; apply</button>
        <button type="button" data-sketch-action aria-label="Cancel pattern constraint removal" onClick={() => { setPendingPatternConfirm(null); setRefused(null); }}>Cancel</button>
      </div>
    )}
    {(canAddPatternForCircle || (s.patterns?.length ?? 0) > 0) && <>
      <div className="card-title" style={{ marginTop: 10 }}>LINEAR PATTERNS · {s.patterns?.length ?? 0}</div>
      {canAddPatternForCircle && (
        <div className="cons-tools" role="group" aria-label="Add linear circle pattern" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <select
            aria-label="Linear pattern direction"
            value={`${patternDraft.sign > 0 ? '+' : '-'}${patternDraft.axis}`}
            onChange={e => {
              const v = e.target.value;
              setPatternDraft(d => ({ ...d, sign: v.startsWith('-') ? -1 : 1, axis: v.endsWith('y') ? 'y' : 'x' }));
            }}
          >
            <option value="+x">+X</option>
            <option value="-x">−X</option>
            <option value="+y">+Y</option>
            <option value="-y">−Y</option>
          </select>
          <input
            aria-label="Linear pattern spacing mm"
            type="number"
            step="any"
            style={{ width: 56 }}
            value={patternDraft.spacing}
            onChange={e => setPatternDraft(d => ({ ...d, spacing: e.target.value }))}
          />
          <input
            aria-label="Linear pattern count"
            type="number"
            step="1"
            min="2"
            max="16"
            style={{ width: 44 }}
            value={patternDraft.count}
            onChange={e => setPatternDraft(d => ({ ...d, count: e.target.value }))}
          />
          <button type="button" data-sketch-action aria-label="Add linear pattern" onClick={addPattern}>Add pattern</button>
        </div>
      )}
      {(s.patterns ?? []).length > 0 && (
        <div role="list" aria-label="Linear patterns">
          {(s.patterns ?? []).map(p => {
            const draft = patternEdits[p.id] ?? { count: String(p.count), spacing: String(p.spacing) };
            return (
              <div key={p.id} className="cons-row" role="listitem" data-pattern-id={p.id} style={{ flexWrap: 'wrap', gap: 4 }}>
                <div className="kv">
                  <span>{p.id} · circle {p.seedCircle + 1} · {p.sign > 0 ? '+' : '−'}{p.axis.toUpperCase()}</span>
                  <b>{p.spacing} mm × {p.count}</b>
                </div>
                <input
                  aria-label={`Pattern ${p.id} count`}
                  type="number"
                  step="1"
                  style={{ width: 44 }}
                  value={draft.count}
                  onChange={e => setPatternEdits(prev => ({ ...prev, [p.id]: { ...draft, count: e.target.value } }))}
                />
                <input
                  aria-label={`Pattern ${p.id} spacing`}
                  type="number"
                  step="any"
                  style={{ width: 54 }}
                  value={draft.spacing}
                  onChange={e => setPatternEdits(prev => ({ ...prev, [p.id]: { ...draft, spacing: e.target.value } }))}
                />
                <button type="button" data-sketch-action aria-label={`Update pattern ${p.id}`} onClick={() => applyPatternUpdate(p, false)}>Apply</button>
                <button type="button" data-sketch-action className="x" aria-label={`Remove pattern ${p.id}`} onClick={() => applyPatternRemove(p.id, false)}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </>}
    <ConstraintList shape={s} owner={owner} conflictIds={fixedConflict?.ids ?? conflictIds} documentScope={documentScope} inspection={inspection}
      inspectedId={inspectedId} picked={picked} onShape={onShape} onEditDim={onEditDim} onRefuse={setRefused} />
    {resolvedRefs.length > 0 && <>
      <div className="card-title" style={{ marginTop: 10 }}>REFERENCE DIMENSIONS · {resolvedRefs.length}</div>
      <div role="list" aria-label="Reference dimensions">
        {resolvedRefs.map(item => (
          <div key={item.ref.id} className="cons-row" role="listitem" data-reference-id={item.ref.id}>
            <div className="kv">
              <span>{item.label}</span>
              <b>{item.ok ? `(${Math.round(item.value * 1e4) / 1e4}) REF` : 'Unresolved'}</b>
            </div>
            {item.ok && (
              <button
                type="button"
                data-sketch-action
                className="ref-btn"
                aria-label={`Make ${item.label} driving`}
                title="Convert this reference measurement into a driving constraint"
                onClick={() => makeRefDriving(item.ref.id)}
              >Drive</button>
            )}
            <button
              type="button"
              data-sketch-action
              className="x"
              aria-label={`Remove ${item.label}`}
              title="Remove this reference dimension"
              onClick={() => onShape(removeReferenceDimension(s, item.ref.id))}
            >×</button>
          </div>
        ))}
      </div>
    </>}
  </>;
}
