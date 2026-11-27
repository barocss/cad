import { describeChange } from '@barocss/cad-model/app/bodies';
import { resolveNames, type NameSelection } from '@barocss/cad-model/chat/names';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { ChatPanelProps } from '../ui/ChatPanel';
import type { StudioNotice } from './studioNotice';

interface StudioChatTurnOptions {
  doc: StudioDoc;
  bodies: BodyResult[];
  commit(next: StudioDoc, capture?: boolean, whole?: boolean): boolean;
  rememberSelection(selection: NameSelection | null): void;
  select(selection: Selection): void;
  undo(): void;
  notice(notice: StudioNotice | null): void;
}

export function createStudioChatTurnActions({ doc, bodies, commit, rememberSelection, select, undo, notice }: StudioChatTurnOptions):
  Pick<ChatPanelProps, 'onCommit' | 'onSelect'> {
  const undoAction = { label: 'Undo', run: () => { undo(); notice(null); } };
  return {
    onCommit(next, selected, merged) {
      if (merged) {
        const why = merged.deferred[0]?.reason;
        if (!merged.applied.length && !merged.proposal) {
          if (why) notice({ title: 'Chat turn left the document unchanged', hint: why, detail: '' });
          return;
        }
        if (!commit(next, true, true)) return;
        rememberSelection(selected ?? null);
        const count = merged.applied.length + merged.deferred.length;
        notice({
          title: 'Chat turn merged with your edits',
          hint: `${merged.applied.length} of ${count} change${count > 1 ? 's' : ''} applied${merged.proposal ? `. Review ${merged.proposal}` : ''}.${why ? ` ${why}` : ''}`,
          detail: '', action: undoAction,
        });
        return;
      }

      const direct = JSON.stringify(next.nodes) !== JSON.stringify(doc.nodes) || JSON.stringify(next.parameters) !== JSON.stringify(doc.parameters);
      const what = direct ? describeChange(doc, next) : '';
      if (!commit(next)) return;
      rememberSelection(selected ?? null);
      if (direct) notice({ title: 'Applied by the agent', hint: `${what[0]?.toUpperCase() ?? ''}${what.slice(1)}.`, detail: '', action: undoAction });
    },
    onSelect(selection) {
      select(resolveNames(bodies, selection).selection);
    },
  };
}
