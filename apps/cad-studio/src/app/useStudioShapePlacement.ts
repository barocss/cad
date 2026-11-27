import { useCallback, useRef, type DragEvent } from 'react';
import { commands, patchValues, type Command, type Ctx } from '@barocss/cad-model/app/commands';
import type { ValueStore } from '../state/valueStore';
import type { Spot } from '../viewport/Viewport';
import { DRAG_TYPE } from '../viewport/viewportPointerInput';
import type { Active } from './commandState';

export function useStudioShapePlacement(ctx: Ctx, setActive: ValueStore<Active | null>['set'],
  setPreviewBodies: (bodies: null) => void) {
  const dragCmd = useRef<string | null>(null);

  const toolDragStart = useCallback((command: Command, event: DragEvent) => {
    event.dataTransfer.setData(DRAG_TYPE, command.id);
    event.dataTransfer.effectAllowed = 'copy';
    dragCmd.current = command.id;
  }, []);

  const toolDragEnd = useCallback((command: Command, event: DragEvent) => {
    if (!dragCmd.current || event.dataTransfer.dropEffect !== 'none') return;
    dragCmd.current = null;
    setActive(current => current?.placing && current.cmd.id === command.id ? null : current);
    setPreviewBodies(null);
  }, [setActive, setPreviewBodies]);

  // A toolbar drag starts the command as it enters the viewport. A click or a drop fixes its position.
  const onSpot = useCallback((spot: Spot | null, done: boolean) => {
    const dragged = dragCmd.current ? commands.find(command => command.id === dragCmd.current) : undefined;
    if (done) dragCmd.current = null;
    setActive(active => {
      let current = active;
      if (!current?.placing) {
        if (current || !dragged?.place || !dragged.available(ctx).ok) return active;
        current = { cmd: dragged, values: dragged.defaults?.(ctx) ?? {}, preview: 'busy', ctx: { ...ctx }, placing: true };
      }
      if (spot && current.cmd.place) {
        const previous = current.values;
        const placed = current.cmd.place(previous, spot.point, spot.normal, spot.hole);
        if (Object.keys(placed).some(key => placed[key] !== previous[key])) {
          const values = patchValues(current.cmd, current.ctx, previous, placed);
          current = { ...current, values, preview: 'busy' };
        }
      }
      return done ? { ...current, placing: false } : current;
    });
  }, [ctx, setActive]);

  return { dragCmd, toolDragStart, toolDragEnd, onSpot };
}
