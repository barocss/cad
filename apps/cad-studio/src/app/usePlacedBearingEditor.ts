import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ModelNode, PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { EngineClient } from '../engine/client';
import type { Lanes } from '../engine/lanes';
import { bearingEditCurrent, captureBearingEditSession, prepareBearingEdit, type BearingEditAddress, type BearingEditSession } from './bearingEdit';
import type { StudioNotice } from './studioNotice';

interface Options {
  doc: StudioDoc;
  instanceSel: readonly string[];
  editNode: number | null;
  engine: Pick<EngineClient, 'part'>;
  lanes: Lanes;
  revision: RefObject<number>;
  onNotice(notice: StudioNotice): void;
}

/** The selected occurrence owns validation. App commits the accepted graph as one undoable change. */
export function usePlacedBearingEditor({ doc, instanceSel, editNode, engine, lanes, revision, onNotice }: Options) {
  const [instanceEdit, setInstanceEdit] = useState<BearingEditAddress | null>(null);
  const [pending, setPending] = useState(false);
  const scope = useRef({ doc, instanceSel, instanceEdit, editNode });
  const prior = scope.current;
  if (prior.doc !== doc || prior.instanceSel !== instanceSel || prior.instanceEdit !== instanceEdit || prior.editNode !== editNode)
    scope.current = { doc, instanceSel, instanceEdit, editNode };

  useEffect(() => {
    lanes.cancel('bearing-edit');
    setPending(false);
  }, [doc, instanceSel, instanceEdit, lanes]);
  const selected = useMemo(() => {
    if (!instanceEdit || instanceSel.length !== 1 || instanceSel[0] !== instanceEdit.owner) return null;
    try { return { session: captureBearingEditSession(doc, instanceEdit.owner, instanceEdit.index), error: null }; }
    catch (error) { return { session: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [doc, instanceSel, instanceEdit]);

  const apply = async (session: BearingEditSession, nodes: ModelNode[],
    commit: (next: PartInstance[], selection: string[]) => boolean) => {
    const source = scope.current;
    if (!bearingEditCurrent(session, source.doc, source.instanceSel, source.instanceEdit)) return;
    setPending(true);
    const at = revision.current++;
    const reply = await lanes.run('bearing-edit', { revision: at, source: session.owner }, async () => {
      try {
        const prepared = prepareBearingEdit(session, nodes);
        return { prepared, result: await engine.part(prepared.view, at) };
      } catch (error) { return { error }; }
    });
    if (reply.stale) return;
    setPending(false);
    const out = reply.result, current = scope.current;
    if ('error' in out) {
      if (current === source) onNotice({ title: 'Bearing not changed', hint: out.error instanceof Error ? out.error.message : String(out.error), detail: '' });
      return;
    }
    if (current !== source || !bearingEditCurrent(session, current.doc, current.instanceSel, current.instanceEdit)) return;
    if (!out.result.ok) {
      onNotice(out.result.error);
      return;
    }
    if (commit(out.prepared.root.instances!, [session.owner])) setInstanceEdit(null);
  };

  return { instanceEdit, setInstanceEdit, pending, selected, scope, apply };
}
