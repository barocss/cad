import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { bodyName, lookOf } from '@barocss/cad-model/app/bodies';
import { commands, refOf, selectedBodies, type Command, type Selection } from '@barocss/cad-model/app/commands';
import { duplicateBody } from '@barocss/cad-model/chat/features';
import type { NameSelection } from '@barocss/cad-model/chat/names';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import { withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor, featureId } from '@barocss/cad-model/engine/ids';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import type { Active } from './commandState';
import { TOOLS, switchTool } from './sketchControls';
import type { StudioNotice } from './studioNotice';
import type { ViewportHandle } from '../viewport/Viewport';

interface KeyboardModel {
  doc: StudioDoc;
  evaluated: StudioDoc;
  bodiesFor: StudioDoc | null;
  bodies: readonly BodyResult[];
  marker: number | null;
  clipboard: RefObject<{ key: string; featureId: string; pastes: number } | null>;
  chatSelection: RefObject<NameSelection | null>;
  selection: Selection;
  directSelection: string[];
  canChange: () => boolean;
  commit: (next: StudioDoc) => boolean;
  commitDirect: (next: DirectGeometry, selection: string[]) => void;
  deleteSelection: () => void;
  clearSelection: () => void;
  fit: ViewportHandle['fit'];
  notice: (notice: StudioNotice) => void;
}

interface KeyboardBindings {
  dialog: {
    blocked: boolean;
    paletteOpen: boolean;
    openPalette: () => void;
    closePalette: () => void;
    openHelp: () => void;
    dismissInspection: () => boolean;
    heldDraftFace?: () => void;
    heldShellFace?: () => void;
    finishEdge?: () => void;
    stepExport?: () => void;
  };
  model: KeyboardModel;
  drawing: boolean;
  save: () => void;
  replayHistory: (forward: boolean) => void;
  command: { active: Active | null; start: (cmd: Command) => void; apply: () => void; cancel: () => void; repeat: (cmd: Command) => void };
  sketch: {
    current: SketchState | null;
    update: Dispatch<SetStateAction<SketchState | null>>;
    finish: () => void;
    cancelAction: (repeat: boolean) => boolean;
    applyAction: () => boolean;
  };
  cageKey?: (event: KeyboardEvent) => boolean;
  skeletonKey?: (event: KeyboardEvent) => boolean;
  measurement: { active: boolean; canFocus: boolean; focus: () => void; clear: () => void };
  escape: {
    hasDirectCandidate: () => boolean;
    discardDirectCandidate: () => void;
    discardRoute?: () => void;
    invalidateProjection: () => void;
    cancelAssembly?: () => void;
    cancelSectionFacePick: (repeat: boolean) => boolean;
  };
}

/** A run of arrow keys grows the selected body's latest move in the same history step. */
function nudge(model: KeyboardModel, index: number, key: string, step: number): void {
  const { doc, evaluated, bodies, marker, chatSelection, commit } = model;
  const body = bodies[index], ref = refOf(body), top = evaluated.nodes[ref.node];
  const offset: Vec3 = [key === 'ArrowRight' ? step : key === 'ArrowLeft' ? -step : 0,
    key === 'ArrowUp' ? step : key === 'ArrowDown' ? -step : 0,
    key === 'PageUp' ? step : key === 'PageDown' ? -step : 0];
  const grow = top?.kind === 'translate' && ref.node === evaluated.nodes.length - 1 && marker === null;
  const next: StudioDoc = grow
    ? { ...doc, nodes: doc.nodes.map((node, i) => i === ref.node && node.kind === 'translate'
      ? { ...node, offset: node.offset.map((v, k) => Math.round((Number(v) + offset[k]) * 1000) / 1000) as Vec3 } : node) }
    : withNode(evaluated, { kind: 'translate', parent: ref, offset });
  chatSelection.current = { faces: [], edges: [], bodies: [grow ? body.key : bodyKeyFor(next.nodes, next.nodes.length - 1)] };
  commit(next);
}

function dispatchKey(event: KeyboardEvent, bindings: KeyboardBindings): void {
  const { dialog, model, drawing, command, sketch, measurement, escape } = bindings;
  if (event.defaultPrevented || event.isComposing || dialog.blocked) return;
  const { active } = command;
  const { current: draft } = sketch;
  const { doc, evaluated, bodies, selection, clipboard, chatSelection } = model;
  const { target, key } = event;
  const lower = key.toLowerCase(), modifier = event.metaKey || event.ctrlKey;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable);
  const undoKey = modifier && lower === 'z';
  // Leave text history and focused control activation to the browser.
  if (undoKey && typing) return;
  if (!typing && event.altKey && !modifier && !event.shiftKey && (event.code === 'KeyM' || lower === 'm') && measurement.canFocus) {
    event.preventDefault(); measurement.focus(); return;
  }
  const control = target instanceof Element && target.closest('button, summary, select, [role="button"], [role="menuitem"]');
  if ((key === 'Enter' || key === ' ') && control) return;
  if (key === 'Tab' && (control || typing || (target instanceof HTMLElement && target.tabIndex >= 0))) return;
  if (key === 'Escape') {
    const dismiss = dialog.heldDraftFace ?? dialog.heldShellFace ?? dialog.finishEdge ?? dialog.stepExport;
    if (dismiss) { event.preventDefault(); dismiss(); return; }
  }
  if (bindings.cageKey?.(event)) return;
  if (bindings.skeletonKey?.(event)) return;
  if (undoKey) { event.preventDefault(); bindings.replayHistory(event.shiftKey); return; }
  if (modifier && lower === 's') { event.preventDefault(); bindings.save(); return; }
  if (modifier && lower === 'd' && !active && !draft) { event.preventDefault(); command.start(commands.find(cmd => cmd.id === 'duplicate')!); return; }
  if (modifier && lower === 'c' && !active && !draft && !typing) {
    const picked = selectedBodies(selection);
    const body = picked.length === 1 ? bodies[picked[0]] : undefined;
    if (body) {
      const sourceNodes = model.bodiesFor?.nodes ?? evaluated.nodes;
      clipboard.current = { key: body.key, featureId: featureId(sourceNodes, refOf(body).node), pastes: 0 };
      model.notice({ bodyCopy: true, title: 'Copied', hint: bodyName(doc, body) + ' — ⌘V pastes a copy beside it.', detail: '' });
    }
    return;
  }
  if (modifier && lower === 'v' && !active && !draft && !typing && clipboard.current) {
    const copied = clipboard.current;
    const src = bodies.find(body => body.key === copied.key);
    if (!src) return;
    event.preventDefault();
    if (!model.canChange()) return;
    const count = copied.pastes + 1, width = src.mesh.bounds.max[0] - src.mesh.bounds.min[0] + 10;
    const result = duplicateBody(evaluated, refOf(src), [Math.round(width * count), 0, 0]);
    if (!model.commit(result.doc)) return;
    copied.pastes = count;
    chatSelection.current = { faces: [], edges: [], bodies: [bodyKeyFor(result.doc.nodes, result.top)] };
    return;
  }
  if (drawing) return; // Drawing handles its own workspace shortcuts.
  if (key === 'Escape') {
    if (sketch.cancelAction(event.repeat)) { event.preventDefault(); return; }
    if (escape.hasDirectCandidate()) { event.preventDefault(); escape.discardDirectCandidate(); return; }
    if (escape.discardRoute) { event.preventDefault(); escape.discardRoute(); return; }
    escape.invalidateProjection();
    if (dialog.paletteOpen) dialog.closePalette();
    else if (draft && !active && (draft.picked?.length || draft.editDim)) sketch.update(s => s && { ...s, picked: [], editDim: null });
    else if (active || draft) command.cancel();
    else if (escape.cancelAssembly) escape.cancelAssembly();
    else if (measurement.active) measurement.clear();
    else if (escape.cancelSectionFacePick(event.repeat)) event.preventDefault();
    else model.clearSelection();
    return;
  }
  if (key === 'Enter' && sketch.applyAction()) { event.preventDefault(); return; }
  if (key === 'Enter' && target instanceof HTMLButtonElement && target.closest('[data-workspace-mode]')) return;
  if (key === 'Enter' && !dialog.paletteOpen && !(target instanceof HTMLInputElement && target.type === 'file')) {
    if (draft) { event.preventDefault(); sketch.finish(); }
    else if (active) { event.preventDefault(); if (event.shiftKey) command.repeat(active.cmd); command.apply(); }
    return;
  }
  // A sketch tool letter can leave a number box. Other text input stays with the focused field.
  const numberBox = target instanceof HTMLInputElement && target.type === 'number' && !target.classList.contains('dim-edit');
  if (dialog.paletteOpen || (typing && !(draft && numberBox && !modifier && !event.altKey && /^[a-z]$/i.test(key)))) return;
  if (key === ' ') { event.preventDefault(); dialog.openPalette(); return; }
  if (/^(Arrow(Left|Right|Up|Down)|PageUp|PageDown)$/.test(key) && !active && !draft && !measurement.active) {
    const picked = selectedBodies(selection);
    if (picked.length === 1 && bodies[picked[0]]) { event.preventDefault(); nudge(model, picked[0], key, event.shiftKey ? 10 : 1); return; }
  }
  if (key === '?') { event.preventDefault(); dialog.openHelp(); return; }
  if ((key === 'Delete' || key === 'Backspace') && !draft && !active && !measurement.active) {
    event.preventDefault();
    if (model.directSelection.length && doc.direct) {
      model.commitDirect({ ...doc.direct, objects: doc.direct.objects.filter(object => !model.directSelection.includes(object.id)) }, []);
    } else model.deleteSelection();
    return;
  }
  if (draft) {
    if (lower === 'x' && !modifier) {
      if (typing) { event.preventDefault(); (target as HTMLElement).blur(); }
      sketch.update(s => s && { ...s, construct: !s.construct });
      return;
    }
    const tool = (TOOLS.find(x => x.key.toLowerCase() === lower) ?? TOOLS.find(x => x.tool === 'polygon' && lower === 'p'))?.tool;
    if (tool) {
      if (typing) { event.preventDefault(); (target as HTMLElement).blur(); }
      sketch.update(s => s && switchTool(s, tool));
    }
    return;
  }
  if (lower === 'f' && !event.shiftKey) {
    const picked = selectedBodies(selection).map(i => bodies[i]).filter(body => body && !lookOf(doc, body).hidden);
    model.fit(picked.length ? {
      min: [0, 1, 2].map(k => Math.min(...picked.map(body => body.mesh.bounds.min[k]))) as Vec3,
      max: [0, 1, 2].map(k => Math.max(...picked.map(body => body.mesh.bounds.max[k]))) as Vec3,
    } : undefined);
    return;
  }
  const cmd = commands.find(candidate => candidate.shortcut && candidate.shortcut.toLowerCase() === (event.shiftKey ? 'shift ' : '') + lower);
  if (cmd && !active) { event.preventDefault(); command.start(cmd); }
}

export function useStudioKeyboard(bindings: KeyboardBindings): void {
  // Keep one pair of listeners and use the current render's selection and document at dispatch.
  const current = useRef(bindings);
  current.current = bindings;
  useEffect(() => {
    const listen = (event: KeyboardEvent) => dispatchKey(event, current.current);
    let dismissed = false;
    let sketchAction = false;
    const capture = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape') {
        if (!event.repeat) dismissed = current.current.dialog.dismissInspection();
        if (!dismissed) return;
      } else if (event.key === 'Enter') {
        if (!event.repeat) {
          sketchAction = event.target instanceof Element && event.target.hasAttribute('data-sketch-action');
          return;
        }
        // An action can disable or unmount its button. Its repeats must not finish the sketch.
        if (!sketchAction) return;
      } else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keydown', listen);
    return () => {
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('keydown', listen);
    };
  }, []);
}
