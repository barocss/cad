import { filletPaletteRows, filletType, FILLET_TYPES } from '../app/filletFamily';
import { commandIconName } from './commandIcons';
import { useId, useMemo, useRef, useState } from 'react';
import { paletteCommandBlocked, paletteExecutionReason, runPaletteSelection, type PaletteExecutionContext } from './paletteExecution';
import { commands, type Command as StudioCommand, type Ctx } from '@barocss/cad-model/app/commands';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { paletteList } from './paletteList';
import { Icon, Kbd } from './atoms';

/** `extra`: the studio's own commands, after the model's (G17's 3D sketch). (G12f: shadcn's Command — cmdk's keyboard
 *  selection — in its Dialog; the list ranked by paletteList, not cmdk's filter. Typing changes only the palette's state.) */
export function Palette({ ctx, onRun, onClose, extra, execution }: { ctx: Ctx; execution: PaletteExecutionContext; onRun(c: StudioCommand): void; onClose(): void; extra?: readonly StudioCommand[] }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null), reasonId = useId();
  const reason = paletteExecutionReason(execution);
  const all = useMemo(() => extra?.length ? [...commands, ...extra] : commands, [extra]);
  const list = useMemo(() => filletPaletteRows(paletteList(q, ctx, all), q, ctx), [q, ctx, all]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="card palette top-[18vh] translate-y-0" overlayClassName="palette-backdrop bg-black/25"
      aria-label="Command palette" aria-describedby={undefined} onEscapeKeyDown={event => event.stopPropagation()}>
      <DialogTitle className="sr">Command palette</DialogTitle>
      {/* (Enter is the palette's here: the window's — finish a sketch, apply — must not see it once the command starts.) */}
      <Command shouldFilter={false} loop onKeyDown={e => { if (e.key === 'Enter') e.stopPropagation(); }}>
        <label className="palette-input"><Icon name="search" small /><span className="sr">Search commands</span>
          <CommandInput ref={input} aria-describedby={reason ? reasonId : undefined} autoFocus value={q} onValueChange={setQ} placeholder="Type a command…  hole, chamfer, pattern" /><Kbd>Esc</Kbd></label>
        <CommandList className="palette-list">
          {reason && <div id={reasonId} className="px-2 py-2 text-xs text-muted-foreground" role="status">{reason}</div>}
          {list.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground" role="status">No matching commands.</div>}
          {list.map(({ c, a }) => {
            const blocked = paletteCommandBlocked(c, execution);
            return (
            <CommandItem key={c.id} value={c.id} className={'pl-item' + (a.ok && !blocked ? '' : ' off')} aria-describedby={blocked ? reasonId : undefined}
              onMouseDown={event => { if (blocked || !a.ok) event.preventDefault(); }}
              onSelect={() => runPaletteSelection(blocked, a.ok, () => onRun(c), () => input.current?.focus())}>
              <Icon name={commandIconName(c.id, c.icon)} small /><span className="pl-label">{filletType(c.id) ? 'Fillet' : c.label}</span>{filletType(c.id) && <span className="muted">{FILLET_TYPES.find(t => t.value === filletType(c.id))!.label}</span>}
              {!blocked && !a.ok && <span className="pl-reason">{a.reason}</span>}
              <span className="grow" />{c.shortcut && <Kbd>{c.shortcut}</Kbd>}
            </CommandItem>); })}
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>;
}
