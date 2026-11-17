import { useState } from 'react';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { bezierError, wellFormedBezier } from '@barocss/cad-model/sketch/bezier';
import { canActivateDraftOutline, draftShapeOrder, sketchCutInputs } from '../app/sketchControls';
import { Button } from '@/components/ui/button';

/** Explicit reference editing, separate from closed-outline constraint selection and viewport picking. */
export function SavedBezierPicker({ sketch, onActivate }: { sketch: SketchState; onActivate(source: SketchShape): void }) {
  const [notice, setNotice] = useState<string | null>(null);
  if (sketch.editNode === undefined || (sketch.tool !== 'select' && sketch.tool !== 'dimension') || sketch.band) return null;
  const shapes = draftShapeOrder(sketch);
  const curves = shapes.filter(s => !s.construction && wellFormedBezier(s) && !bezierError(s.poles) && shapes.indexOf(s) === shapes.lastIndexOf(s));
  if (!curves.length) return null;
  const main = sketchCutInputs(sketch).shapes[0];
  const fieldFocused = () => document.activeElement instanceof HTMLElement
    && !!document.activeElement.closest('.sk-panel input, .sk-panel textarea, .sk-panel select, .sk-panel [contenteditable="true"]');
  return <section aria-label="Saved Bézier curves">
    <div className="card-title">EDIT SAVED BÉZIER</div>
    <p className="muted small">Select a reference curve to edit its control points. This does not change the profile.</p>
    <div className="flex flex-wrap gap-1" onPointerDown={event => {
      if (fieldFocused()) { event.preventDefault(); setNotice('Press Tab or click outside the current field before selecting a curve. Its draft has been kept.'); }
    }}>
      {curves.map((source, i) => <Button key={i} variant="ghost" size="xs" aria-label={`Edit Bézier ${i + 1}`} aria-pressed={source === sketch.shape}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
        onClick={() => { if (fieldFocused()) return; setNotice(null); onActivate(source); }}>Bézier {i + 1}</Button>)}
      {sketch.shape?.kind === 'bezier' && canActivateDraftOutline(main) && <Button variant="ghost" size="xs" aria-label="Return to main profile"
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
        onClick={() => { if (fieldFocused()) return; setNotice(null); onActivate(main); }}>Main profile</Button>}
    </div>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
