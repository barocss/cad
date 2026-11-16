import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { revealBodyRow, revealInteractionProblem, ownsBodyReveal, withRevealAncestors, registerBrowserRow, type BodyRevealRequest, type BodyRevealTarget } from './bodyBrowserReveal';

const EMPTY_PATHS: ReadonlySet<string> = new Set();

/** A one-shot request. No timer, automatic selection tracking or model write. */
export function useBodyBrowserReveal(owner: object, target: BodyRevealTarget, open: boolean, setOpen: (value: boolean) => void, current: () => boolean, treeGeneration: number) {
  const [tree, setTree] = useState<{ generation: number; open: ReadonlySet<string> }>(() => ({ generation: treeGeneration, open: new Set() }));
  const openPaths = tree.generation === treeGeneration ? tree.open : EMPTY_PATHS;
  const togglePath = useCallback((path: string) => setTree(previous => {
    const next = new Set(previous.generation === treeGeneration ? previous.open : EMPTY_PATHS);
    if (!next.delete(path)) next.add(path);
    return { generation: treeGeneration, open: next };
  }), [treeGeneration]);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const [request, setRequest] = useState<BodyRevealRequest | null>(null);
  const [feedback, setFeedback] = useState<{ owner: object; text: string } | null>(null);
  const ticket = useRef(0);
  // React 19 cleanup retains the exact mounted node, not just its reusable path.
  const register = useCallback((key: string, row: HTMLButtonElement | null) => registerBrowserRow(rows.current, key, row), []);
  const registerBody = useCallback((key: string, row: HTMLButtonElement | null) => register(`body:${key}`, row), [register]);
  const registerInstance = useCallback((path: string, row: HTMLButtonElement | null) => register(`instance:${path}`, row), [register]);
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
    if (!row || !revealBodyRow(row)) setFeedback({ owner, text: 'The selected row is not available. Select the current body or part and try again.' });
  }, [request, owner, target.key, open, current]);
  return {
    register: registerBody, registerInstance, openPaths, togglePath,
    feedback: feedback?.owner === owner ? feedback.text : null,
    // Prevent an input's blur handler from committing before the refusal is read.
    pointerDown(event: PointerEvent<HTMLButtonElement>) { event.preventDefault(); },
    reveal() {
      const reason = revealInteractionProblem(document) ?? target.reason ?? (!current() ? 'The document or selection changed. Select the current body or part again.' : null);
      setFeedback(reason ? { owner, text: reason } : null);
      if (reason || target.key === undefined) { setRequest(null); return; }
      setTree(previous => ({ generation: treeGeneration, open: withRevealAncestors(previous.generation === treeGeneration ? previous.open : EMPTY_PATHS, target.ancestors ?? []) }));
      setRequest({ owner, key: target.key, ticket: ++ticket.current });
      setOpen(true);
    },
  };
}
