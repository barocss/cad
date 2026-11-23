import { useLayoutEffect, useRef, type MouseEventHandler, type PointerEventHandler } from 'react';
import { Button } from '@/components/ui/button';
import type { InPlaceSession } from '../app/editInPlace';

interface InPlaceEditStatusProps {
  session: Pick<InPlaceSession, 'name' | 'shared'>;
  askDiscard: boolean;
  onFinish(): void;
  onCancel: MouseEventHandler<HTMLButtonElement>;
  onKeepEditing(): void;
  rememberFocus: PointerEventHandler<HTMLButtonElement>;
}

export function InPlaceEditStatus({ session, askDiscard, onFinish, onCancel, onKeepEditing, rememberFocus }: InPlaceEditStatusProps) {
  const { name, shared } = session;
  const status = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = status.current, stage = bar?.parentElement;
    if (!bar || !stage) return;
    const update = () => stage.style.setProperty('--in-place-status-bottom', `${bar.offsetTop + bar.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      stage.style.removeProperty('--in-place-status-bottom');
    };
  }, []);

  return <div ref={status} className="card in-place-bar" role="status" aria-label="Editing a part in place">
    <span>Editing <b>{name}</b>{shared > 1 ? ` · shared by ${shared}` : ''}</span>
    {askDiscard ? <>
      <span className="muted">Discard your changes?</span>
      <Button size="sm" variant="default" onClick={onCancel}>Discard</Button>
      <Button size="sm" variant="ghost" onClick={onKeepEditing}>Keep editing</Button>
    </> : <>
      <Button size="sm" variant="default" onClick={onFinish}>Finish</Button>
      <Button size="sm" variant="ghost" onPointerDown={rememberFocus} onClick={onCancel}>Cancel</Button>
    </>}
    <details className="in-place-details"><summary>Details</summary>
      <div className="muted small">The other parts are shown see-through where they are relative to this one. Finish updates {shared > 1 ? `all ${shared} instances` : 'the part'} in one step (Undo restores the assembly). Saving and opening are off until then.</div>
    </details>
  </div>;
}
