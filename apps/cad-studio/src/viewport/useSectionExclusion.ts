import { useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { Section } from './sectionView';

export interface SectionExclusionControls {
  ids: readonly string[];
  labels: readonly { id: string; name: string }[];
  selectionReason: string | null;
  excludeSelected(): void;
  restore(id: string): void;
  clear(): void;
}

type ExclusionOptions = {
  selected: readonly string[];
  ready: boolean;
  isCurrent(): boolean;
  onNotice(error: FriendlyError): void;
};

const EMPTY: readonly string[] = [];

/** Display ownership is a document session, never a saved CAD property or an Undo entry. */
export function useSectionExclusion(doc: StudioDoc, section: Section | null, {
  selected, ready, isCurrent, onNotice,
}: ExclusionOptions): SectionExclusionControls {
  const [state, setState] = useState<{ doc: StudioDoc; open: boolean; ids: readonly string[] }>({ doc, open: section?.mode === 'plane' && section.planes.length === 1, ids: EMPTY });
  const open = section?.mode === 'plane' && section.planes.length === 1;
  // Retire synchronously on a document/Close boundary: Undo must not revive an old ID list.
  if (state.doc !== doc || state.open !== open) setState({ doc, open, ids: EMPTY });
  const ids = state.doc === doc && state.open === open && section?.mode === 'plane' ? state.ids : EMPTY;
  const set = (next: readonly string[]) => setState({ doc, open, ids: [...new Set(next)] });

  return {
    ids,
    labels: ids.map(id => ({ id, name: doc.instances?.find(i => i.id === id)?.name ?? id })),
    selectionReason: ready ? sectionExclusionReason(doc, selected) : 'Wait for a current model before excluding instances.',
    excludeSelected: () => {
      if (!isCurrent() || section?.mode !== 'plane' || !ready) return;
      const reason = sectionExclusionReason(doc, selected);
      if (reason) {
        onNotice({ title: 'Cannot exclude this selection', hint: reason, detail: '' });
        return;
      }
      set([...ids, ...selected]);
    },
    restore: id => {
      if (isCurrent()) set(ids.filter(excluded => excluded !== id));
    },
    clear: () => {
      if (isCurrent()) set(EMPTY);
    },
  };
}

export function sectionExclusionReason(doc: StudioDoc, selected: readonly string[]): string | null {
  if (!selected.length) return 'Select one or more top-level instances to leave uncut.';
  if (selected.some(id => id.includes('/') || (doc.instances ?? []).filter(i => i.id === id).length !== 1)) {
    return 'Select unambiguous top-level instances; nested paths cannot be excluded individually.';
  }
  return null;
}
