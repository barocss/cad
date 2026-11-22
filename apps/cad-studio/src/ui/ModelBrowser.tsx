import { Profiler, type Dispatch, type ReactNode, type Ref, type SetStateAction } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { ToolIconButton } from '@/components/ui/tool-button';
import { BODY_REVEAL_SCOPE } from '../app/bodyBrowserReveal';
import type { useBrowserActions } from '../app/useBrowserActions';
import { onBlockRender } from '../devRenders';
import { BodySelectionQuery } from './BodySelectionQuery';
import { Icon } from './atoms';

interface ModelBrowserProps {
  ref: Ref<HTMLElement>;
  model: { doc: StudioDoc; bodies: readonly BodyResult[]; generation: number; fresh: boolean; busy: boolean };
  state: { open: boolean; setOpen: Dispatch<SetStateAction<boolean>>; blocked: string | null; onCollapse(): void };
  actions: Pick<ReturnType<typeof useBrowserActions>, 'reveal' | 'queryOwner' | 'selectQueryMatches'>;
  children: ReactNode;
}

export function ModelBrowser({ ref, model, state, actions, children }: ModelBrowserProps) {
  const { doc, bodies, generation, fresh, busy } = model;
  const { open, setOpen, blocked, onCollapse } = state;
  const { reveal, queryOwner, selectQueryMatches } = actions;
  const count = bodies.length;
  return <Profiler id="outliner" onRender={onBlockRender}>
    <aside ref={ref} className={'card outliner' + (open ? '' : ' closed')} aria-label="Browser">
      <div className="card-title">BROWSER <span className="muted" aria-busy={!fresh}>Base part · {fresh ? `${count} bod${count === 1 ? 'y' : 'ies'}` : busy ? 'evaluating…' : 'not up to date'}</span>
        <ToolIconButton size="tiny" aria-label="Show selection in Browser" title={blocked ?? BODY_REVEAL_SCOPE}
          onPointerDown={reveal.pointerDown} onClick={reveal.reveal}><Icon name="search" small /></ToolIconButton>
        <ToolIconButton data-reference-return size="tiny" aria-label={open ? 'Collapse the browser' : 'Expand the browser'} onClick={() => {
          if (open) onCollapse();
          setOpen(current => {
            try { localStorage.setItem('cad-studio.browser', current ? 'closed' : 'open'); } catch { /* private mode */ }
            return !current;
          });
        }}><Icon name={open ? 'left_panel_close' : 'left_panel_open'} small /></ToolIconButton>
      </div>
      {reveal.feedback && <div role="status" className="small muted" aria-label="Find selection in Browser">{reveal.feedback}</div>}
      {open && <>
        <BodySelectionQuery key={generation} doc={doc} bodies={bodies} owner={queryOwner} blocked={blocked} onSelect={selectQueryMatches} />
        {children}
      </>}
    </aside>
  </Profiler>;
}
