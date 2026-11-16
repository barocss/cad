import type { Command } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';

/** Notice ownership stays with App; controllers may only publish or retire their own notice. */
export type StudioNotice = FriendlyError & {
  action?: { label: string; run(): void };
  bodyCopy?: true;
  inputPick?: Command;
  documentSource?: { doc: StudioDoc; name?: string; evaluated?: StudioDoc; placed?: { view: StudioDoc; workerSession: number } };
};
