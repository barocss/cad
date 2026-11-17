import { useLayoutEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { mirrorOutline } from '../sketch/mirrorOutline';

type Draft = { owner: SketchState; doc: StudioDoc; axis: 'x' | 'y'; offset: string };

/** Reflection replaces the active outline; this is deliberately not a copy/pattern. */
export function SketchOutlineMirror({ sketch, doc, onApply }: {
  sketch: SketchState; doc: StudioDoc; onApply(owner: SketchState, doc: StudioDoc, shape: SketchShape): boolean;
}) {
  const [stored, setStored] = useState<Draft | null>(null);
  useLayoutEffect(() => { setStored(previous => previous && (previous.owner !== sketch || previous.doc !== doc) ? null : previous); }, [sketch, doc]);
  const shape = sketch.shape;
  if (shape?.kind !== 'polygon' || !shape.closed || shape.pending || (sketch.tool !== 'select' && sketch.tool !== 'dimension')) return null;
  const draft = stored?.owner === sketch && stored.doc === doc ? stored : null;
  if (!draft) return <button type="button" className="ghost" data-sketch-action
    onClick={() => setStored({ owner: sketch, doc, axis: 'x', offset: '0' })}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}>Mirror outline in place…</button>;
  const update = (patch: Partial<Draft>) => setStored({ ...draft, ...patch });
  const result = draft.offset.trim() === '' || !Number.isFinite(Number(draft.offset))
    ? { error: 'Enter a finite mirror line coordinate.' }
    : mirrorOutline(sketch, draft.axis, Number(draft.offset));
  return <fieldset className="sk-outline-rotation" aria-label="Mirror outline in place" data-sketch-dimension-focus
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setStored(null); }
      if (event.key === 'Enter') {
        if ((event.target as HTMLElement).matches('input, select')) event.preventDefault();
        event.stopPropagation();
      }
    }}>
    <legend>Mirror outline in place</legend>
    <p className="muted small">Replaces one independent, unconstrained straight outline. No copy is kept. The mirror line is in sketch X/Y, not world space. Geometry changes only on Apply.</p>
    <label>Mirror line <NativeSelect aria-label="Outline mirror line" value={draft.axis}
      onChange={event => update({ axis: event.target.value as Draft['axis'] })}>
      <option value="x">X = coordinate (vertical)</option><option value="y">Y = coordinate (horizontal)</option>
    </NativeSelect></label>
    <label>{draft.axis.toUpperCase()} = <Input type="number" step="any" aria-label="Outline mirror coordinate" value={draft.offset}
      onChange={event => update({ offset: event.target.value })} /> mm</label>
    {'error' in result && <p role="alert">{result.error}</p>}
    <button type="button" data-sketch-action disabled={'error' in result} onClick={() => {
      if ('error' in result) return;
      setStored(null);
      onApply(sketch, doc, result.shape);
    }}>Apply mirror</button>
    <button type="button" data-sketch-action onClick={() => setStored(null)}>Cancel mirror</button>
  </fieldset>;
}
