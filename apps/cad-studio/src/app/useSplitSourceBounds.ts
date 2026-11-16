import { useEffect, useRef, useState } from 'react';
import { prefixDoc } from '@barocss/cad-model/engine/doc';
import type { Ctx } from '@barocss/cad-model/app/commands';
import type { EngineClient } from '../engine/client';
import { splitParentBounds, splitSourceCurrent, type SplitSourceOwner } from '../state/splitSourceReceipt';

export function useSplitSourceBounds(options: {
  source: SplitSourceOwner; index: number | null; enabled: boolean; engine: EngineClient;
  nextRevision(): number; liveSourceCurrent(): boolean; editorCurrent(): boolean;
}) {
  const live = useRef(options); live.current = options;
  const [receipt, setReceipt] = useState<NonNullable<Ctx['splitSourceBounds']> | null>(null);
  const { source, index, enabled, engine } = options;
  useEffect(() => {
    const node = index === null ? null : source.commandDoc.nodes[index];
    if (!enabled || index === null || node?.kind !== 'split' || !node.normal || node.suppressed || node.held
      || !splitSourceCurrent(source, source) || !options.liveSourceCurrent()) return;
    let cancelled = false;
    // This lifetime intentionally does not depend on the editor remaining open: a drag
    // captures this evidence before closing the editor. Installation does depend on it.
    const isCurrent = () => splitSourceCurrent(source, live.current.source) && options.liveSourceCurrent();
    void engine.part(prefixDoc(source.commandDoc, index), options.nextRevision(), 'refs').then(result => {
      if (cancelled || !isCurrent() || !live.current.enabled || live.current.index !== index || !options.editorCurrent()) return;
      const bounds = result.ok ? splitParentBounds(source.commandDoc, index, result.bodies) : null;
      if (bounds) setReceipt({ doc: source.commandDoc, index, bounds, isCurrent });
    }).catch(() => { /* Missing source means no handle, never guessed bounds. */ });
    return () => { cancelled = true; };
  }, [source.doc, source.commandDoc, source.evaluated, source.worker, source.open, source.engine, source.marker,
    source.variant, source.fresh, source.busy, source.instances, source.inPlace, index, enabled, engine]);
  return enabled && receipt?.index === index && receipt.isCurrent() ? receipt : undefined;
}
