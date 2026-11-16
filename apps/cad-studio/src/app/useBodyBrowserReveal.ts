import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { revealBodyRow, revealInteractionProblem, ownsBodyReveal, type BodyRevealRequest, type BodyRevealTarget } from './bodyBrowserReveal';

/** A one-shot request. No timer, automatic selection tracking or model write. */
export function useBodyBrowserReveal(owner: object, target: BodyRevealTarget, open: boolean, setOpen: (value: boolean) => void, current: () => boolean) {
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const [request, setRequest] = useState<BodyRevealRequest | null>(null);
  const [feedback, setFeedback] = useState<{ owner: object; text: string } | null>(null);
  const ticket = useRef(0);
  const register = useCallback((key: string, row: HTMLButtonElement | null) => {
    if (row) rows.current.set(key, row); else rows.current.delete(key);
  }, []);
  useLayoutEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') { ticket.current++; setRequest(null); setFeedback(null); } };
    window.addEventListener('keydown', cancel, true);
    return () => { window.removeEventListener('keydown', cancel, true); ticket.current++; };
  }, []);
  useLayoutEffect(() => {
    if (!request) return;
    setRequest(null);
    if (!ownsBodyReveal(request, owner, target.key, ticket.current, open) || !current()) return;
    const problem = revealInteractionProblem(document);
    if (problem) { setFeedback({ owner, text: problem }); return; }
    const row = rows.current.get(request.key);
    if (!row || !revealBodyRow(row)) setFeedback({ owner, text: 'The body row is not available. Select the current body and try again.' });
  }, [request, owner, target.key, open, current]);
  return {
    register,
    feedback: feedback?.owner === owner ? feedback.text : null,
    // Prevent an input's blur handler from committing before the refusal is read.
    pointerDown(event: PointerEvent<HTMLButtonElement>) { event.preventDefault(); },
    reveal() {
      const reason = revealInteractionProblem(document) ?? target.reason ?? (!current() ? 'The document or selection changed. Select the current body again.' : null);
      setFeedback(reason ? { owner, text: reason } : null);
      if (reason || target.key === undefined) { setRequest(null); return; }
      setRequest({ owner, key: target.key, ticket: ++ticket.current });
      setOpen(true);
    },
  };
}
