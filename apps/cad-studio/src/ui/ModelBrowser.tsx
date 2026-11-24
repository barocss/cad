import { Profiler, type ComponentProps, type Dispatch, type ReactNode, type Ref, type SetStateAction } from 'react';
import { ToolIconButton } from '@/components/ui/tool-button';
import { BODY_REVEAL_SCOPE } from '../app/bodyBrowserReveal';
import { NO_CUTS, NO_INSTANCES } from '../app/studioConstants';
import type { useBrowserActions } from '../app/useBrowserActions';
import { onBlockRender } from '../devRenders';
import { BodyBrowserRows } from './BodyBrowserRows';
import { BodySelectionQuery } from './BodySelectionQuery';
import { DirectBrowserRows, SketchBrowserRows } from './BrowserGeometryRows';
import { OutlinerCuts } from './OutlinerCuts';
import { OutlinerInstances } from './OutlinerInstances';
import { iconFor } from './featureIcon';
import { Icon } from './atoms';

interface ModelBrowserProps {
  ref: Ref<HTMLElement>;
  model: ComponentProps<typeof BodyBrowserRows>['model'] & { generation: number };
  state: { open: boolean; setOpen: Dispatch<SetStateAction<boolean>>; blocked: string | null; onCollapse(): void };
  actions: Pick<ReturnType<typeof useBrowserActions>, 'reveal' | 'queryOwner' | 'selectQueryMatches' | 'isolationAction'>;
  geometry: {
    bodies: Pick<ComponentProps<typeof BodyBrowserRows>, 'selection' | 'rows' | 'changes'>;
    sketches: ComponentProps<typeof SketchBrowserRows>;
    instances: Pick<ComponentProps<typeof OutlinerInstances>, 'selection' | 'edit' | 'onPick' | 'onEdit'>;
    cuts: Pick<ComponentProps<typeof OutlinerCuts>, 'editing' | 'onEdit' | 'onDelete'>;
    direct: Omit<ComponentProps<typeof DirectBrowserRows>, 'doc'>;
    locked: boolean;
  };
  children: ReactNode;
}

export function ModelBrowser({ ref, model, state, actions, geometry, children }: ModelBrowserProps) {
  const { doc, bodies, generation, fresh, busy } = model;
  const { open, setOpen, blocked, onCollapse } = state;
  const { reveal, queryOwner, selectQueryMatches, isolationAction } = actions;
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
        <BodyBrowserRows model={model} registerBodyRow={reveal.register} {...geometry.bodies} />
        <SketchBrowserRows {...geometry.sketches} />
        {!!doc.instances?.length && <div className="ol-head">Parts placed <span className="muted">{doc.instances.length}</span></div>}
        <OutlinerInstances instances={doc.instances ?? NO_INSTANCES} locked={geometry.locked} iconFor={iconFor}
          open={reveal.openPaths} onToggle={reveal.togglePath} registerRow={reveal.registerInstance} isolationAction={isolationAction} {...geometry.instances} />
        {!!doc.assemblyCuts?.length && <div className="ol-head">Cuts <span className="muted">{doc.assemblyCuts.length}</span></div>}
        <OutlinerCuts cuts={doc.assemblyCuts ?? NO_CUTS} instances={doc.instances ?? NO_INSTANCES} locked={geometry.locked} {...geometry.cuts} />
        <DirectBrowserRows doc={doc} {...geometry.direct} />
        {children}
      </>}
    </aside>
  </Profiler>;
}
