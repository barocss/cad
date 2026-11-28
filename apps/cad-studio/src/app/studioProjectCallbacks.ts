import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { EvalResult } from '@barocss/cad-model/engine/evaluate';
import type { Problem } from '@barocss/cad-model/engine/references';
import type { EngineClient } from '../engine/client';
import { prepareSignedFinishOpen, verifyStoredNativeOpen } from '../files/documentFile';
import type { OpenIntentBridge } from '../state/openOwnership';
import type { ProjectCallbacks } from '../storage/useProject';
import type { useWorkspaceModeExit } from '../ui/useWorkspaceModeExit';
import { scheduleProjectOpenFit } from './projectOpenFit';

interface StudioProjectOptions {
  owner: Required<OpenIntentBridge>;
  evaluation: {
    part(doc: StudioDoc, mode: 'read' | 'refs'): Promise<EvalResult>;
    insets: EngineClient['verifyStoredInsets'];
  };
  document: {
    canReplace(): boolean;
    replace(next: StudioDoc): boolean;
    recordProblems(doc: StudioDoc, problems: Problem[]): void;
    clearReferenceChoices(): void;
    clearComparison(): void;
    setFileName(name: string): void;
    setDirty(dirty: boolean): void;
    commitLinkedParts(next: StudioDoc): boolean;
  };
  switchWhenReady: ReturnType<typeof useWorkspaceModeExit>['switchWhenReady'];
  fit(): void;
  notice(error: FriendlyError): void;
}

/** Apply project reads and named-version admission through the current Studio document owner. */
export function createStudioProjectCallbacks({ owner, evaluation, document, switchWhenReady, fit, notice }: StudioProjectOptions): ProjectCallbacks {
  const validateRestore: NonNullable<ProjectCallbacks['validateRestore']> = (doc, current) =>
    verifyStoredNativeOpen(doc, next => evaluation.part(next, 'read'), evaluation.insets, current);

  return {
    ...owner,
    confirmOpen: focus => new Promise(resolve => switchWhenReady(() => resolve(true), {
      originFocus: focus, onKeep: () => resolve(false),
    })),
    validateRestore,
    async validateOpen(doc, current) {
      await validateRestore(doc, current);
      return prepareSignedFinishOpen(doc, next => evaluation.part(next, 'refs'), current);
    },
    onOpened(doc, path, notes, prepared) {
      const next = prepared?.doc ?? doc;
      if (!document.canReplace() || !document.replace(next)) return false;
      if (prepared?.problems.length) document.recordProblems(next, prepared.problems);
      document.clearReferenceChoices();
      document.clearComparison();
      const scope = owner.currentOpenScope();
      document.setFileName(path.replace(/\.bcad$/i, '').split('/').pop()!);
      document.setDirty(notes.length > 0 || next !== doc);
      return scope;
    },
    onOpenReady: scope => scheduleProjectOpenFit(scope, owner.isOpenCurrent, fit),
    onError: (title, hint) => notice({ title, hint, detail: '' }),
    canOpen() {
      if (document.canReplace()) return true;
      notice({ title: 'A part is being edited', hint: 'Finish or cancel it before opening a project file.', detail: '' });
      return false;
    },
    onLinked({ doc, offered, missing }) {
      if (!document.canReplace()) return;
      const scope = offered.length && document.commitLinkedParts(doc) ? owner.currentOpenScope() : undefined;
      const hint = [
        offered.length ? `${offered.join(', ')}: Revision waiting in the part's panel (Accept or Keep).` : '',
        missing.length ? `Not in the project any more: ${missing.join(', ')}.` : '',
      ].filter(Boolean).join(' ');
      const title = offered.length
        ? `Newer files for ${offered.length} placed part${offered.length > 1 ? 's' : ''}`
        : 'Placed parts without their files';
      notice({ title, hint, detail: '' });
      return scope;
    },
  };
}
