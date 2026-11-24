import type { MouseEvent } from 'react';
import { emptyDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { useWorkspaceModeExit } from '../ui/useWorkspaceModeExit';
import type { createDocumentReplacement } from './documentReplacement';

interface DocumentEntryOptions {
  sessionBlocked(operation: string): boolean;
  switchWhenReady: ReturnType<typeof useWorkspaceModeExit>['switchWhenReady'];
  replace: ReturnType<typeof createDocumentReplacement>;
  drafts: { cage(): object | null; feature(): object | null };
  template: { setFileName(name: string): void; fit(): void };
  versions: { open: boolean; toggle(): void; cancelCandidateReview(): void };
}

export function createStudioDocumentEntryActions({ sessionBlocked, switchWhenReady, replace, drafts, template, versions }: DocumentEntryOptions) {
  return {
    newPart(event: MouseEvent<HTMLButtonElement>) {
      if (sessionBlocked('starting a new part')) return;
      switchWhenReady(() => replace(emptyDoc(), 'new-part'), {
        event,
        readFeature: () => drafts.cage() ?? drafts.feature(),
        title: drafts.cage() ? 'Discard cage draft and start a new part?' : undefined,
      });
    },
    chooseTemplate(next: StudioDoc, focus: HTMLElement | null) {
      if (sessionBlocked('starting from a template')) return;
      switchWhenReady(() => {
        if (!replace(next)) return;
        template.setFileName('Untitled');
        setTimeout(template.fit, 300);
      }, { originFocus: focus });
    },
    toggleVersions() {
      if (sessionBlocked('opening the project')) return;
      if (versions.open) versions.cancelCandidateReview();
      versions.toggle();
    },
  };
}
