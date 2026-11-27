import type { Active } from '../app/commandState';
import type { ScalarHandleDraft } from './gizmo';

interface Options {
  before: Active | null;
  read(): Active | null;
  owns(active: Active): boolean;
  readWall(): object | null;
  retire(): void;
  restore(current: Active, next: Active | null): void;
}

/** Roll back this pointer's transient values, including any limit refinement from its preview. */
export function captureScalarDraft({ before, read, owns, readWall, retire, restore }: Options): ScalarHandleDraft {
  let last: { values: object; wall?: object } | undefined;
  return {
    remember(values, wall) { last = { values, wall }; },
    cancel() {
      const captured = last;
      last = undefined;
      const current = read();
      if (!captured || !current || !owns(current) ||
        (current.values !== captured.values && (!captured.wall || readWall() !== captured.wall))) return;
      retire();
      restore(current, before ? { ...before, preview: 'busy', error: undefined } : null);
    },
  };
}
