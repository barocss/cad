import { useEffect, useId, useRef, useState } from 'react';
import type { SketchState } from '../viewport/Viewport';
import { applyOffsetMagnitude, parseOffsetMagnitude, OFFSET_MAGNITUDE_ERROR } from '../app/sketchOffsetDistance';
import { sketchOffsetReadiness } from '../app/sketchOffsetTarget';
import { MAKE_CURVES_HELP } from './sketchPresentation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  sketch: SketchState;
  /** Offsets the newest closed shape by signed millimetres. Refusals stay local to this draft. */
  onOffset?(distance: number): string | undefined;
  onUseOutline?(asReferences: boolean): void;
  onLinkedInset?(insetMM: number): string | undefined;
  onToCurves?(): void;
}

function revealOffsetField(input: HTMLInputElement | null) {
  if (!input) return;
  requestAnimationFrame(() => {
    if (document.activeElement === input) input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

/** Owns outline-tool inputs, focus and draft-scoped refusals, not accepted-document changes.
 * Keep mounted for the sketch panel's whole lifetime, including temporarily unavailable tools. */
export function SketchOutlineTools({ sketch, onOffset, onUseOutline, onLinkedInset, onToCurves }: Props) {
  const [offsetBy, setOffsetBy] = useState('2');
  const [offsetRefusal, setOffsetRefusal] = useState<{ draft: SketchState; raw: string; message: string } | null>(null);
  const offsetErrorId = useId();
  const [insetRefusal, setInsetRefusal] = useState<{ draft: SketchState; message: string } | null>(null);
  const offsetInput = useRef<HTMLInputElement>(null), insetErrorId = useId();
  // Linking adds rows above the field while it still has focus.
  useEffect(() => revealOffsetField(offsetInput.current), [sketch.association]);
  const insetError = onLinkedInset && insetRefusal?.draft === sketch ? insetRefusal : null;
  const { target: offsetTarget, canLinkInset, showDistance } = sketchOffsetReadiness(sketch, !!onLinkedInset);
  const invalidMagnitude = !!offsetTarget && parseOffsetMagnitude(offsetBy) === null;
  const offsetError = invalidMagnitude ? OFFSET_MAGNITUDE_ERROR
    : offsetRefusal?.draft === sketch && offsetRefusal.raw === offsetBy ? offsetRefusal.message : null;
  useEffect(() => {
    offsetInput.current?.setCustomValidity(offsetTarget ? offsetError ?? '' : '');
  }, [offsetTarget, offsetError]);
  const applyOffset = (direction: 'in' | 'out') => {
    if (!onOffset) return;
    const message = applyOffsetMagnitude(offsetBy, direction, onOffset);
    setOffsetRefusal(message ? { draft: sketch, raw: offsetBy, message } : null);
    if (message) offsetInput.current?.focus();
  };
  const linkInset = () => {
    const message = onLinkedInset?.(Number(offsetBy));
    setInsetRefusal(message ? { draft: sketch, message } : null);
    if (message) offsetInput.current?.focus();
  };
  return <>
      {onUseOutline && <>
        <div className="card-title" style={{ marginTop: 10 }}>FACE</div>
        {sketch.anchor?.face?.linkSourceHint && <p>{sketch.anchor.face.linkSourceHint}</p>}
        <div className="sk-offset">
          <Button variant="ghost" aria-label="Use the face outline" data-tip="Use its outline" data-tip-desc="The face's edges (outline and holes) as shapes of this sketch" onClick={() => onUseOutline(false)}>Use its outline</Button>
          <Button variant="ghost" aria-label="Face outline as references" data-tip="As references" data-tip-desc="The face's edges as construction shapes: snapped to, not part of the profile" onClick={() => onUseOutline(true)}>As references</Button>
        </div>
      </>}
      {canLinkInset && <><Button type="button" variant="ghost" data-sketch-action onClick={linkInset}>Link face outline + inset</Button><p>Uses Offset distance below as the inward inset (mm).</p></>}
      {onOffset && (showDistance || sketch.association) && <>
        <div className="card-title" style={{ marginTop: 10 }}>OFFSET</div>
        {sketch.association && <>
          <p role="status">Linked face outline and inset · {sketch.association.insetMM} mm</p>
          <p>{sketch.editNode === undefined
            ? 'To change the linked distance, finish the sketch and edit it in History.'
            : 'To change the linked distance, return to its History editor.'}</p>
          <p>Geometry or plane edits detach this link.</p>
        </>}
        {showDistance && <div className="sk-offset">
          <span className="num"><Input ref={offsetInput} aria-label="Offset distance" type="number" step="any" value={offsetBy}
            data-sketch-action
            className="scroll-my-1"
            onFocus={event => revealOffsetField(event.currentTarget)}
            aria-invalid={insetError || offsetError ? true : undefined} aria-describedby={insetError ? insetErrorId : offsetError ? offsetErrorId : undefined}
            onKeyDown={event => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.stopPropagation();
              if (canLinkInset && !event.repeat) linkInset();
            }}
            onChange={e => { setOffsetBy(e.target.value); setInsetRefusal(null); setOffsetRefusal(null); }} /><em>mm</em></span>
          {offsetTarget && <Button variant="ghost" aria-label="Offset outward" data-tip="Offset out" data-tip-focus data-tip-desc={`A copy of Outline ${offsetTarget.index + 1} this far outside it (the ring between them is the profile)`} disabled={invalidMagnitude} onClick={() => applyOffset('out')}>Out</Button>}
          {offsetTarget && <Button variant="ghost" aria-label="Offset inward" data-tip="Offset in" data-tip-focus data-tip-desc={`A copy of Outline ${offsetTarget.index + 1} this far inside it (a wall)`} disabled={invalidMagnitude} onClick={() => applyOffset('in')}>In</Button>}
        </div>}
        {insetError && <p id={insetErrorId} className="sk-band-err" role="alert">{insetError.message}</p>}
        {offsetError && <p id={offsetErrorId} className="sk-band-err" role="alert">{offsetError}</p>}
      </>}
      {onToCurves && <>
        <div className="card-title" style={{ marginTop: 10 }}>CURVES</div>
        <Button variant="ghost" aria-label="Make curves" data-tip="Make curves" data-tip-focus data-tip-desc={MAKE_CURVES_HELP} onClick={onToCurves}>Make curves of the sketch</Button>
      </>}
  </>;
}
