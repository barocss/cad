import { deleteAssemblyCut } from '@barocss/cad-model/assembly/cuts';
import type { Mate } from '@barocss/cad-model/assembly/mates';
import { expandPatterns } from '@barocss/cad-model/assembly/patterns';
import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { StudioNotice } from './studioNotice';

type AssemblyFields = Pick<StudioDoc, 'instances' | 'mates' | 'pendingParts'>;

interface AssemblyCommitOptions {
  canChangeDocument(): boolean;
  pushUndo(): void;
  setDoc(doc: StudioDoc): boolean;
  markDirty(): void;
  selectInstances(ids: string[]): void;
}

export function createStudioAssemblyCommits(doc: StudioDoc, edits: AssemblyCommitOptions) {
  // Regenerate pattern occurrences from the updated seeds in the same History change.
  function apply(fields: AssemblyFields, selected?: string[]) {
    if (!edits.canChangeDocument()) return false;
    edits.pushUndo();
    const next = { ...doc, ...fields };
    if (!edits.setDoc(next.instancePatterns?.length ? expandPatterns(next) : next)) return false;
    edits.markDirty();
    if (selected) edits.selectInstances(selected);
    return true;
  }

  return {
    commitInstances(instances: PartInstance[], selected?: string[]) {
      return apply({ instances }, selected);
    },
    commitParts({ instances, pendingParts }: Pick<StudioDoc, 'instances' | 'pendingParts'>) {
      return apply({ instances, pendingParts });
    },
    commitAssembly(instances: PartInstance[], mates: Mate[]) {
      return apply({ instances, mates });
    },
  };
}

export function createStudioAssemblyFeatureActions(doc: StudioDoc, commit: (next: StudioDoc) => boolean,
  onNotice: (notice: StudioNotice) => void) {
  function patternEdit(run: () => { doc: StudioDoc }, refused = 'Pattern not changed', inline = false): string | undefined {
    let next: StudioDoc;
    try { next = run().doc; } catch (error) {
      const hint = error instanceof Error ? error.message : String(error);
      if (!inline) onNotice({ title: refused, hint, detail: '' });
      return hint;
    }
    return commit(next) ? undefined : 'The change was not accepted. Review the document notice before trying again.';
  }

  return {
    patternEdit,
    deleteCut: (id: string) => patternEdit(() => deleteAssemblyCut(doc, id), 'Cut not deleted'),
  };
}
