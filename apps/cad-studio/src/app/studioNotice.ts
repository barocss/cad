import type { Command } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';

/** Notice ownership stays with App; controllers may only publish or retire their own notice. */
export type StudioNotice = FriendlyError & {
  action?: { label: string; run(): void };
  bodyCopy?: true;
  inputPick?: Command;
  /** A refusal about the exact draft that attempted Finish. */
  sketchGeneration?: number;
  documentSource?: { doc: StudioDoc; name?: string; evaluated?: StudioDoc; placed?: { view: StudioDoc; workerSession: number } };
};

/** Retire one controller's exact notice without dismissing a newer or unrelated alert. */
export function retireStudioNotice(current: StudioNotice | null, owned: FriendlyError): StudioNotice | null {
  return current === owned ? null : current;
}
