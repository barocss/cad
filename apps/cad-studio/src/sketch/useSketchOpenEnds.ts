import { useEffect, useMemo, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import { EMPTY_OPEN_ENDS_REPORT, findSketchOpenEnds, type SketchOpenEnd, type SketchOpenEndsReport } from './openEnds';

interface OpenEndsSession {
  doc: StudioDoc;
  editNode: SketchState['editNode'];
  plane: SketchState['plane'];
}

export interface SketchOpenEndsController {
  enabled: boolean;
  active: boolean;
  report: SketchOpenEndsReport;
  ends: readonly SketchOpenEnd[];
  toggle(): void;
  show(): void;
  hide(): boolean;
}

/**
 * Session-only diagnostic state for displaying open material contour endpoints on the sketch canvas.
 * Stays live across geometry edits and Undo/Redo within the same sketch session without mutating
 * the document, constraints, or undo history, and clears automatically on sketch exit/switch or doc change.
 */
export function useSketchOpenEnds(
  doc: StudioDoc,
  sketch: SketchState | null,
  finishOpenChainToken: number | null,
): SketchOpenEndsController {
  const [session, setSession] = useState<OpenEndsSession | null>(null);
  const [lastAutoToken, setLastAutoToken] = useState<number | null>(null);
  const enabled = !!sketch && !sketch.band;

  const sameSession = enabled && session !== null
    && session.doc === doc
    && session.editNode === sketch.editNode
    && session.plane === sketch.plane;
  const autoTriggered = enabled && finishOpenChainToken !== null && finishOpenChainToken !== lastAutoToken;
  const active = enabled && (autoTriggered || sameSession);

  useEffect(() => {
    if (autoTriggered && finishOpenChainToken !== null && sketch) {
      setSession({ doc, editNode: sketch.editNode, plane: sketch.plane });
      setLastAutoToken(finishOpenChainToken);
    } else if (session && !sameSession) {
      setSession(null);
    }
  }, [autoTriggered, finishOpenChainToken, session, sameSession, doc, sketch]);

  const report = useMemo<SketchOpenEndsReport>(
    () => (active && sketch ? findSketchOpenEnds(sketch) : EMPTY_OPEN_ENDS_REPORT),
    [active, sketch],
  );

  const show = () => {
    if (!enabled || !sketch) return;
    setSession({ doc, editNode: sketch.editNode, plane: sketch.plane });
  };

  const hide = (): boolean => {
    if (!active) return false;
    setSession(null);
    if (finishOpenChainToken !== null) setLastAutoToken(finishOpenChainToken);
    return true;
  };

  const toggle = () => {
    if (active) hide();
    else show();
  };

  return {
    enabled,
    active,
    report,
    ends: active ? report.ends : EMPTY_OPEN_ENDS_REPORT.ends,
    toggle,
    show,
    hide,
  };
}
