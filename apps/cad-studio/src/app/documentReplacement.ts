import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { validateRoundedInsetDocument } from '@barocss/cad-model/sketch/internal/roundedInsetRecipe';
import type { WorkHistory } from '../state/workOwnership';
import type { useProject } from '../storage/useProject';

type ReplacementMode = 'detached' | 'project-open' | 'project' | 'in-place' | 'new-part';
type DocumentIdentity = NonNullable<WorkHistory<StudioDoc>['documentIdentity']>;
export type ReplacementIntent = { scope: object; identity?: DocumentIdentity };

interface DocumentReplacementOptions {
  intent: { current: ReplacementIntent | null };
  currentScope(): object;
  documentIdentity(): DocumentIdentity;
  project: Pick<ReturnType<typeof useProject>, 'documentBinding' | 'detach'>;
  invalidateDocumentWork(): void;
  commit(next: StudioDoc): boolean;
  cancelStepExport(): void;
  clearAcceptedDrafts(): void;
  clearCheckpointReview(): void;
  clearCompareBase(): void;
  setFileName(name: string): void;
  resetAcceptedView(): void;
  onNotice(notice: FriendlyError): void;
}

export function createDocumentReplacement(options: DocumentReplacementOptions) {
  return function replaceDoc(next: StudioDoc, mode: ReplacementMode = 'detached'): boolean {
    try {
      if (next.nodes.some(node => node.kind === 'rounded-rectangle-inset')) {
        if (!next.outputs || !next.parameters || (next.schema !== 3 && next.schema !== 4) || next.units !== 'mm') {
          throw new Error('The rounded inset must have a complete model document.');
        }
        validateRoundedInsetDocument(next, true);
      }
    } catch (error) {
      options.onNotice({
        title: 'Could not open rounded inset',
        hint: 'The document is unchanged.',
        detail: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    options.cancelStepExport();
    options.invalidateDocumentWork();
    const fileBoundary = mode === 'detached' || mode === 'project-open';
    const identity = mode === 'new-part' || fileBoundary ? {
      ...options.documentIdentity(), ...(fileBoundary ? { binding: options.project.documentBinding() } : {}),
    } : undefined;
    // Commit reads this intent to record whole-document ownership in History.
    options.intent.current = { scope: options.currentScope(), identity };
    try {
      if (!options.commit(next)) return false;
      options.clearAcceptedDrafts();
      if (mode !== 'in-place') options.clearCheckpointReview();
      if (mode === 'detached' || mode === 'new-part') {
        options.project.detach();
        options.clearCompareBase();
      }
      if (mode === 'new-part') options.setFileName('Untitled');
      options.resetAcceptedView();
      return true;
    } finally {
      options.intent.current = null;
    }
  };
}
