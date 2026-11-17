import type { Active } from './commandState';

/** Presentation only: the command field and its handle keep the same key and value. */
export function commandFieldLabel(commandId: string, fillet: Active['fillet'] | undefined, key: string, label: string): string {
  return commandId === 'fillet' && fillet?.type === 'edge' && fillet.radiusMode === 'varying' && key === 'radius'
    ? 'Start radius' : label;
}
