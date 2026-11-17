import { useLayoutEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { translateOutline } from '../sketch/translateOutline';

type Draft = { owner: SketchState; doc: StudioDoc; x: string; y: string };

/** Translation replaces the active outline; this is deliberately not a copy/pattern. */
export function SketchOutlineTranslation({ sketch, doc, onApply }: {
  sketch: SketchState; doc: StudioDoc; onApply(owner: SketchState, doc: StudioDoc, shape: SketchShape): boolean;
}) {
  const [stored, setStored] = useState<Draft | null>(null);
  useLayoutEffect(() => { setStored(previous => previous && (previous.owner !== sketch || previous.doc !== doc) ? null : previous); }, [sketch, doc]);
  const shape = sketch.shape;
  if (shape?.kind !== 'polygon' || !shape.closed || shape.pending || (sketch.tool !== 'select' && sketch.tool !== 'dimension')) return null;
  const draft = stored?.owner === sketch && stored.doc === doc ? stored : null;
  if (!draft) return <button type="button" className="ghost" data-sketch-action
    onClick={() => setStored({ owner: sketch, doc, x: '0', y: '0' })}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}>Move outline…</button>;
  const update = (patch: Partial<Draft>) => setStored({ ...draft, ...patch });
  const result = draft.x.trim() === '' || !Number.isFinite(Number(draft.x)) || draft.y.trim() === '' || !Number.isFinite(Number(draft.y))
    ? { error: 'Enter finite X and Y offsets.' }
    : translateOutline(sketch, Number(draft.x), Number(draft.y));
  return <fieldset className="sk-outline-rotation" aria-label="Move outline" data-sketch-dimension-focus
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setStored(null); }
      if (event.key === 'Enter') {
        if ((event.target as HTMLElement).matches('input, select')) event.preventDefault();
        event.stopPropagation();
      }
    }}>
    <legend>Move outline</legend>
    <p className="muted small">Replaces one independent straight outline, preserving horizontal/vertical and edge-length constraints. Other constraints are not supported. No copy is kept. Offsets are in sketch X/Y, not world space. Geometry changes only on Apply.</p>
    {(['x', 'y'] as const).map(axis => <label key={axis}>Δ{axis.toUpperCase()}
      <Input type="number" step="any" aria-label={`Outline move ${axis.toUpperCase()} offset`} value={draft[axis]}
        onChange={event => update({ [axis]: event.target.value })} /> mm</label>)}
    {'error' in result && <p role="alert">{result.error}</p>}
    <button type="button" data-sketch-action disabled={'error' in result} onClick={() => {
      if ('error' in result) return;
      setStored(null);
      onApply(sketch, doc, result.shape);
    }}>Apply move</button>
    <button type="button" data-sketch-action onClick={() => setStored(null)}>Cancel move</button>
  </fieldset>;
}
