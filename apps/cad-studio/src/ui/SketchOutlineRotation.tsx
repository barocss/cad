import { useLayoutEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { rotateOutline } from '../sketch/rotateOutline';

type Draft = { owner: SketchState; doc: StudioDoc; angle: string; pivot: 'first' | 'custom'; x: string; y: string };

/** Explicit one-step coordinate edit. Draft numbers never enter document or solver state. */
export function SketchOutlineRotation({ sketch, doc, onApply }: {
  sketch: SketchState; doc: StudioDoc; onApply(owner: SketchState, doc: StudioDoc, shape: SketchShape): boolean;
}) {
  const [stored, setStored] = useState<Draft | null>(null);
  useLayoutEffect(() => { setStored(previous => previous && (previous.owner !== sketch || previous.doc !== doc) ? null : previous); }, [sketch, doc]);
  const shape = sketch.shape;
  if (shape?.kind !== 'polygon' || !shape.closed || shape.pending || (sketch.tool !== 'select' && sketch.tool !== 'dimension')) return null;
  const draft = stored?.owner === sketch && stored.doc === doc ? stored : null;
  const begin = () => setStored({ owner: sketch, doc, angle: '90', pivot: 'first', x: String(shape.points[0]?.[0] ?? 0), y: String(shape.points[0]?.[1] ?? 0) });
  if (!draft) return <button type="button" className="ghost" data-sketch-action onClick={begin}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}>Rotate outline…</button>;
  const update = (patch: Partial<Draft>) => setStored({ ...draft, ...patch });
  const finite = (text: string) => text.trim() !== '' && Number.isFinite(Number(text));
  const pivot = draft.pivot === 'first' ? shape.points[0] : [Number(draft.x), Number(draft.y)] as [number, number];
  const result = !finite(draft.angle) || draft.pivot === 'custom' && (!finite(draft.x) || !finite(draft.y))
    ? { error: 'Enter a finite angle and pivot coordinates.' }
    : rotateOutline(sketch, Number(draft.angle), pivot);
  return <fieldset className="sk-outline-rotation" aria-label="Rotate outline" data-sketch-dimension-focus
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setStored(null); }
      if (event.key === 'Enter') {
        if ((event.target as HTMLElement).matches('input, select')) event.preventDefault();
        event.stopPropagation();
      }
    }}>
    <legend>Rotate outline</legend>
    <p className="muted small">One independent, unconstrained straight outline. Rotation is in sketch X/Y, not world axes. Geometry changes only on Apply.</p>
    <label>Angle <Input type="number" step="any" aria-label="Outline rotation angle" value={draft.angle}
      onChange={event => update({ angle: event.target.value })} /> °</label>
    <label>Pivot <NativeSelect aria-label="Outline rotation pivot" value={draft.pivot}
      onChange={event => update({ pivot: event.target.value as Draft['pivot'] })}>
      <option value="first">First outline point</option><option value="custom">Custom sketch X/Y</option>
    </NativeSelect></label>
    {draft.pivot === 'custom' && <>{(['x', 'y'] as const).map(axis => <label key={axis}>Pivot {axis.toUpperCase()}
      <Input type="number" step="any" aria-label={`Outline rotation pivot ${axis.toUpperCase()}`} value={draft[axis]}
        onChange={event => update({ [axis]: event.target.value })} /> mm</label>)}</>}
    {'error' in result && <p role="alert">{result.error}</p>}
    <button type="button" data-sketch-action disabled={'error' in result} onClick={() => {
      if ('error' in result) return;
      setStored(null);
      onApply(sketch, doc, result.shape);
    }}>Apply rotation</button>
    <button type="button" data-sketch-action onClick={() => setStored(null)}>Cancel rotation</button>
  </fieldset>;
}
