import { useRef, useState, type ComponentProps, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from 'react';
import { Button } from '@/components/ui/button';
import { ToolIconButton } from '@/components/ui/tool-button';
import { Icon, Kbd } from './atoms';
import { TemplatePicker } from './TemplatePicker';
import { ToolsTray } from './ToolsTray';

type ButtonClick = (event: MouseEvent<HTMLButtonElement>) => void;
type PanelToggle = { open: boolean; toggle(): void };
type TemplateActions = Pick<ComponentProps<typeof TemplatePicker>, 'doc' | 'onTemplate' | 'onNotice'>;

interface StudioTopBarProps {
  file: {
    name: string;
    dirty: boolean;
    rename(name: string): void;
    newPart: ButtonClick;
    open(file: File, focus?: HTMLElement | null): Promise<void>;
    save(): void;
    saveHint?: string;
    insertPart(file: File): Promise<void>;
  };
  workspace: {
    sketchPlane?: string;
    rendering: boolean;
    drawing: boolean;
    sketchButton: Ref<HTMLButtonElement>;
    requestMode(mode: 'Model' | 'Render' | 'Drawing', event: MouseEvent<HTMLButtonElement>): void;
    requestSketch: ButtonClick;
    finishSketch(): void;
    finishBlocked: boolean;
    focus: {
      remember(event: PointerEvent<HTMLButtonElement>): void;
      take(event: MouseEvent<HTMLButtonElement>): HTMLElement | null;
      dialog: ReactNode;
    };
  };
  history: {
    undo: { text: string; disabled: boolean };
    redo: { text: string; disabled: boolean };
    replay(forward: boolean, event: MouseEvent<HTMLButtonElement>): void;
  };
  panels: {
    chat: PanelToggle;
    library: PanelToggle;
    parameters: PanelToggle;
    versions: PanelToggle;
    route?: { open: boolean; disabled: boolean; show(): void };
  };
  template: TemplateActions;
  exchange: {
    stl(): void;
    threeMf(): Promise<void>;
    step(): Promise<void>;
    iges?: () => Promise<void>;
  };
}

export function StudioTopBar({ file, workspace, history, panels, template, exchange }: StudioTopBarProps) {
  const partInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileOpenFocus = useRef<HTMLElement | null>(null);
  // The template picker can remount when ToolsTray moves it into or out of the overflow menu.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const { sketchPlane, rendering, drawing, sketchButton, focus } = workspace;
  const sketching = sketchPlane !== undefined;
  const modeling = !sketching && !rendering && !drawing;
  const hideModelTools = rendering || drawing;
  const { chat, library, parameters, versions, route } = panels;

  return <header className="topbar">
    <span className="brand"><Icon name="deployed_code" className="accent" />barocss</span>
    <label className="doc-tab"><span className="sr">File name</span>
      <input value={file.name} onChange={event => file.rename(event.target.value)} size={Math.max(8, file.name.length)} />
      {file.dirty && <span className="dot" aria-label="Unsaved changes" />}
    </label>
    <div className="grow" />
    <div className="mode" role="group" aria-label="Mode" data-workspace-mode>
      <Button size="sm" variant={modeling ? 'default' : 'ghost'} className={modeling ? 'on' : ''}
        onPointerDown={focus.remember} onClick={event => workspace.requestMode('Model', event)}>Model</Button>
      <Button ref={sketchButton} size="sm" variant={sketching ? 'default' : 'ghost'} className={sketching ? 'on sketching' : ''}
        onPointerDown={focus.remember} onClick={workspace.requestSketch}>{sketching ? `Sketch · ${sketchPlane}` : 'Sketch'}</Button>
      <Button size="sm" variant={rendering ? 'default' : 'ghost'} className={rendering ? 'on' : ''}
        onPointerDown={focus.remember} onClick={event => workspace.requestMode('Render', event)}>Render</Button>
      <Button size="sm" variant={drawing ? 'default' : 'ghost'} className={drawing ? 'on' : ''}
        onPointerDown={focus.remember} onClick={event => workspace.requestMode('Drawing', event)}>Drawing</Button>
    </div>
    {focus.dialog}
    <div className="grow" />
    {sketching && <Button variant="default" size="default" className="finish" disabled={workspace.finishBlocked}
      onClick={workspace.finishSketch}><Icon name="check" />Finish sketch <Kbd>⏎</Kbd></Button>}
    <ToolsTray items={[
      <ToolIconButton key="tool0" state={chat.open ? 'on' : 'idle'} aria-label="Chat" data-tip="Chat" data-tip-desc="Model by chat"
        onClick={chat.toggle}><Icon name="chat" /></ToolIconButton>,
      <ToolIconButton key="tool1" aria-label="Undo" data-tip={history.undo.text} data-tip-key="⌘Z" disabled={history.undo.disabled}
        onPointerDown={focus.remember} onClick={event => history.replay(false, event)}><Icon name="undo" /></ToolIconButton>,
      <ToolIconButton key="tool2" aria-label="Redo" data-tip={history.redo.text} data-tip-key="⇧⌘Z" disabled={history.redo.disabled}
        onPointerDown={focus.remember} onClick={event => history.replay(true, event)}><Icon name="redo" /></ToolIconButton>,
      <ToolIconButton key="tool3" aria-label="New part" data-tip="New part" onPointerDown={focus.remember}
        onClick={file.newPart}><Icon name="add_box" /></ToolIconButton>,
      <TemplatePicker key="tool4" {...template} state={{ templatesOpen, setTemplatesOpen, templateName, setTemplateName }} open={file.open} />,
      <ToolIconButton key="tool5" state={library.open ? 'on' : 'idle'} aria-label="Library" data-tip="Library"
        data-tip-desc="Catalogue parts from libraries (built-in, team, yours): insert them, snap them by their interfaces"
        onClick={library.toggle} hidden={hideModelTools}><Icon name="menu_book" /></ToolIconButton>,
      <ToolIconButton key="tool6" state={parameters.open ? 'on' : 'idle'} aria-label="Parameters" data-tip="Parameters"
        data-tip-desc="Named sizes the part depends on, and saved sets of them (configurations)"
        onClick={parameters.toggle} hidden={hideModelTools}><Icon name="function" /></ToolIconButton>,
      <ToolIconButton key="tool7" aria-label="Open" data-tip="Open" data-tip-desc="A model, worker file or supported exchange file"
        onPointerDown={focus.remember} onClick={event => { fileOpenFocus.current = focus.take(event); fileInput.current?.click(); }}>
        <Icon name="folder_open" />
      </ToolIconButton>,
      <ToolIconButton key="tool8" aria-label="Save" data-tip="Save" data-tip-key="⌘S" data-tip-desc={file.saveHint}
        onClick={file.save}><Icon name="save" /></ToolIconButton>,
      <ToolIconButton key="tool8b" state={versions.open ? 'on' : 'idle'} aria-label="Project and versions" data-tip="Project & versions"
        data-tip-desc="Open a folder (or keep a project in this browser) to save into it, keep versions, branch and compare"
        onClick={versions.toggle} hidden={hideModelTools}><Icon name="history" /></ToolIconButton>,
      <ToolIconButton key="tool9" aria-label="Export STL" data-tip="Export STL" data-tip-desc="A mesh for printing"
        onClick={exchange.stl}><Icon name="download" /></ToolIconButton>,
      <ToolIconButton key="tool10" aria-label="Export 3MF" data-tip="Export 3MF" data-tip-desc="For a slicer: bodies, materials, colours, the print orientation"
        onClick={() => void exchange.threeMf()}><Icon name="print" /></ToolIconButton>,
      <ToolIconButton key="tool11" aria-label="Export STEP" data-tip="Export STEP" data-tip-desc="The exact solids, for other CAD"
        onClick={() => void exchange.step()}><Icon name="deployed_code_update" /></ToolIconButton>,
      exchange.iges && <ToolIconButton key="tool12" aria-label="Export IGES" data-tip="Export IGES" data-tip-desc="The visible curves and surfaces"
        onClick={exchange.iges}><Icon name="polyline" /></ToolIconButton>,
      route && <ToolIconButton key="route-bundle" state={route.open ? 'on' : 'idle'} aria-label="Route bundle" data-tip="Route bundle"
        data-tip-desc="Link two curve control points and their copied sweeps" disabled={route.disabled} onClick={route.show}>
        <Icon name="conversion_path" />
      </ToolIconButton>,
      <ToolIconButton key="tool13" aria-label="Insert part" data-tip="Insert part" data-tip-desc="Another part (.bcad) as an instance"
        onClick={() => partInput.current?.click()}><Icon name="add_to_photos" /></ToolIconButton>,
    ]} />
    <input ref={partInput} type="file" accept=".bcad,.json" hidden aria-label="Part file" onChange={event => {
      const selected = event.target.files?.[0];
      if (selected) void file.insertPart(selected);
      event.target.value = '';
    }} />
    <input ref={fileInput} aria-label="Model file" type="file" accept=".bcad,.bcad-task,.bcad-run,.bcad-candidate,.json,.step,.stp,.stl,.obj,.igs,.iges,.barocad,.dwg"
      hidden onChange={event => {
        const selected = event.target.files?.[0], origin = fileOpenFocus.current;
        fileOpenFocus.current = null;
        if (selected) void file.open(selected, origin);
        event.target.value = '';
      }} />
  </header>;
}
