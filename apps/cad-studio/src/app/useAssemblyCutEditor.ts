import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { addAssemblyCut, editAssemblyCut } from '@barocss/cad-model/assembly/cuts';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { cutOfDraft, cuttableOf, defaultCutAt, draftOfCut, draftProblem,
  draftTrialProblem, newCutDraft, withAddedTargets, type CutDraft } from './assemblyCutDraft';
import type { StudioNotice } from './studioNotice';
import type { PlacedBodyMap } from './usePlacedBodyEvaluation';

/** Author an Assembly Cut draft against the accepted assembly. */
export function useAssemblyCutEditor({
  doc, draft, setDraft, instanceSelection, instanceBodies, setInstanceEdit, commit, onNotice,
}: {
  doc: StudioDoc;
  draft: CutDraft | null;
  setDraft: Dispatch<SetStateAction<CutDraft | null>>;
  instanceSelection: readonly string[];
  instanceBodies: PlacedBodyMap;
  setInstanceEdit(value: null): void;
  commit(next: StudioDoc): boolean;
  onNotice(notice: StudioNotice): void;
}) {
  const key = draft ? JSON.stringify(draft) : '';
  const [trial, setTrial] = useState<{ key: string; problem: string | undefined } | null>(null);
  useEffect(() => {
    if (!draft || draftProblem(doc, draft)) { setTrial(null); return; }
    const timer = setTimeout(() => setTrial({ key, problem: draftTrialProblem(doc, draft) }), 250);
    return () => clearTimeout(timer);
  }, [doc, key]);
  useEffect(() => {
    if (draft?.editing && !doc.assemblyCuts?.some(cut => cut.id === draft.editing)) setDraft(null);
  }, [doc.assemblyCuts, draft?.editing, setDraft]);

  const open = useCallback((id: string | null) => {
    const cut = id ? doc.assemblyCuts?.find(item => item.id === id) : undefined;
    if (id && !cut) return;
    const targets = cuttableOf(doc, instanceSelection);
    const boxes = targets.flatMap(target => (instanceBodies.get(target)?.bodies ?? []).map(body => body.mesh.bounds));
    setInstanceEdit(null);
    setDraft(cut ? draftOfCut(cut) : newCutDraft(targets, defaultCutAt(boxes)));
  }, [doc, instanceSelection, instanceBodies, setInstanceEdit, setDraft]);

  const apply = () => {
    if (!draft) return;
    const options = cutOfDraft(draft), why = draftProblem(doc, draft);
    if (typeof options === 'string' || why) {
      onNotice({ title: 'Cut not made', hint: why ?? String(options), detail: '' });
      return;
    }
    let next: StudioDoc;
    try {
      next = (draft.editing
        ? editAssemblyCut(doc, { id: draft.editing, ...options, name: options.name ?? null })
        : addAssemblyCut(doc, options)).doc;
    } catch (error) {
      onNotice({ title: 'Cut not made', hint: error instanceof Error ? error.message : String(error), detail: '' });
      return;
    }
    if (commit(next)) setDraft(null);
  };

  return {
    open, apply,
    problem: () => draft ? draftProblem(doc, draft) ?? (trial?.key === key ? trial.problem : undefined) : undefined,
    change: (patch: Partial<CutDraft>) => setDraft(current => current && { ...current, ...patch }),
    addSelected: () => setDraft(current => current && {
      ...current, targets: withAddedTargets(current.targets, cuttableOf(doc, instanceSelection)),
    }),
    cancel: () => setDraft(null),
  };
}
