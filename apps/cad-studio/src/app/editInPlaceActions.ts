import type { MouseEvent } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import {
  beginInPlace, editInPlaceRefusal, elsewhereOf, finishInPlace, inPlaceBlock, sessionChanged, stacksAfter,
  type AssemblySaved, type InPlaceSession,
} from './editInPlace';

type SessionEvent = MouseEvent<HTMLButtonElement>;
type Stacks = Pick<AssemblySaved, 'undo' | 'redo'>;

/** Apply the edit-in-place transaction through the App's document and history owners. */
export function editInPlaceActions(options: {
  model: { doc: StudioDoc; bodies: readonly BodyResult[]; instanceBodies: ReadonlyMap<string, { bodies: BodyResult[] }>; fresh: boolean };
  document: { read(): StudioDoc; beginOpen(): void; replace(next: StudioDoc): void };
  session: { current: InPlaceSession | null; read(): InPlaceSession | null; set(next: InPlaceSession | null): void;
    askDiscard: boolean; setAskDiscard(next: boolean): void };
  history: { current: AssemblySaved; setStacks(stacks: Stacks): void; setStatus(marker: number | null, dirty: boolean): void };
  work: { busy: boolean; toolOpen(): boolean; elsewhere(): Parameters<typeof elsewhereOf>[0] };
  ui: { notice(error: FriendlyError): void; entered(): void; returned(owner: string): void;
    workspaceExit: { hasDraft(): boolean; switchWhenReady(action: () => void, options: { event: SessionEvent; title: string }): void } };
}) {
  const { model, document, session, history, work, ui } = options;

  const sessionBlocked = (doing: string) => {
    const why = inPlaceBlock(session.read(), doing);
    if (why) ui.notice({ title: 'A part is being edited', hint: why, detail: '' });
    return !!why;
  };

  const startInPlace = (owner: string) => {
    const why = editInPlaceRefusal(model.doc, owner, {
      session: !!session.current, working: work.busy || work.toolOpen(), fresh: model.fresh, elsewhere: elsewhereOf(work.elsewhere()),
    });
    if (why) { ui.notice({ title: 'Can’t edit this part now', hint: why, detail: '' }); return; }
    const next = beginInPlace(model.doc, owner, model.bodies, model.instanceBodies, history.current);
    if (!next) return;
    document.beginOpen();
    document.replace(next.base);
    if (document.read() !== next.base) return;
    history.setStacks({ undo: [], redo: [] });
    session.set(next);
    session.setAskDiscard(false);
    ui.entered();
  };

  const leave = (current: InPlaceSession, next: StudioDoc, changed: boolean) => {
    document.beginOpen();
    document.replace(next);
    if (document.read() !== next) return false;
    history.setStacks(stacksAfter(current, changed));
    history.setStatus(changed ? null : current.saved.marker, changed || current.saved.dirty);
    session.set(null);
    session.setAskDiscard(false);
    ui.returned(current.owner);
    return true;
  };

  const finishInPlaceSession = () => {
    const current = session.read();
    if (!current) return;
    const why = editInPlaceRefusal(current.assembly, current.owner, { session: false, working: work.toolOpen(), fresh: model.fresh });
    if (why) { ui.notice({ title: 'Can’t finish yet', hint: why, detail: '' }); return; }
    const result = finishInPlace(current, document.read());
    if ('error' in result) {
      ui.notice({ title: 'The part was not taken', hint: result.error, detail: 'You are still editing it.' });
      return;
    }
    if (!leave(current, result.doc, result.changed)) return;
    if (result.held.length) {
      ui.notice({ title: `${result.held.length} look${result.held.length > 1 ? 's' : ''} held`,
        hint: result.held.map(look => look.problem).join(' '), detail: '' });
    } else if (result.changed) {
      ui.notice({ title: `${current.name} updated`,
        hint: current.shared > 1 ? `All ${current.shared} instances share it. Undo restores the assembly as it was.` : 'Undo restores the assembly as it was.',
        detail: '' });
    }
  };

  const cancelInPlaceSession = (event: SessionEvent) => {
    const current = session.read();
    if (!current) return;
    if (!session.askDiscard && ui.workspaceExit.hasDraft()) {
      ui.workspaceExit.switchWhenReady(() => {
        if (session.read() === current) leave(current, current.assembly, false);
      }, { event, title: 'Discard changes to this part?' });
      return;
    }
    if (!session.askDiscard && sessionChanged(current, document.read())) {
      session.setAskDiscard(true);
      return;
    }
    leave(current, current.assembly, false);
  };

  return { sessionBlocked, startInPlace, finishInPlaceSession, cancelInPlaceSession };
}
