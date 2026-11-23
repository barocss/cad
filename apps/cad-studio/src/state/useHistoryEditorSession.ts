import { useCallback, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { editCommand } from '@barocss/cad-model/app/editCommand';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Active } from '../app/commandState';
import { returnEditorFocus } from '../ui/editorReturnFocus';
import type { useWorkspaceModeExit } from '../ui/useWorkspaceModeExit';
import type { OpenScope } from './openOwnership';

interface HistoryOpener {
  index: number;
  doc: StudioDoc;
  button: HTMLButtonElement;
}

export function useHistoryEditorSession(doc: StudioDoc, openIntent: RefObject<OpenScope>, readActive: () => Active | null) {
  const [editNode, setIndex] = useState<number | null>(null);
  const opener = useRef<HistoryOpener | null>(null);
  const editNodeNow = useRef(editNode);
  editNodeNow.current = editNode;
  const nodeEditorDraft = useRef<object | null>(null);
  const reportNodeEditorDraft = useCallback((draft: object | null) => { nodeEditorDraft.current = draft; }, []);

  const setEditNode = useCallback((index: number | null) => {
    opener.current = null;
    setIndex(index);
  }, []);
  const openFromHistory = (index: number, button: HTMLButtonElement) => {
    opener.current = { index, doc, button };
    setIndex(index);
  };
  const restoreEditorFocusAfterClose = useCallback((button: HTMLElement | null) => {
    const scope = openIntent.current;
    requestAnimationFrame(() => {
      const page = document;
      const fallback = page.querySelector<HTMLElement>('[data-reference-return]')
        ?? page.querySelector<HTMLElement>('[data-workspace-mode] button:first-child');
      returnEditorFocus(scope, openIntent.current, !readActive() && editNodeNow.current === null, button, fallback, page);
    });
  }, [openIntent, readActive]);
  const closeHistoryEditor = (discardDrafts: () => void) => {
    const target = opener.current;
    if (target?.index === editNode && target.doc === doc) restoreEditorFocusAfterClose(target.button);
    opener.current = null;
    discardDrafts();
    setIndex(null);
  };

  return { editNode, editNodeNow, setEditNode, nodeEditorDraft, reportNodeEditorDraft, openFromHistory,
    closeHistoryEditor, restoreEditorFocusAfterClose };
}

interface HistoryFeatureNavigationOptions {
  doc: StudioDoc;
  editNode: number | null;
  hasEditorDraft(): boolean;
  readFeatureTransitionDraft(): object | null;
  switchWhenReady: ReturnType<typeof useWorkspaceModeExit>['switchWhenReady'];
  changes: {
    prepare(index: number, node: ModelNode): void;
    openCommand(command: NonNullable<ReturnType<typeof editCommand>>): void;
    openFromHistory(index: number, opener: HTMLButtonElement): void;
    setEditNode(index: number): void;
  };
}

export function createHistoryFeatureNavigation({ doc, editNode, hasEditorDraft, readFeatureTransitionDraft,
  switchWhenReady, changes }: HistoryFeatureNavigationOptions) {
  const openHistoryFeatureAt = (index: number, event?: MouseEvent<HTMLButtonElement>, owns?: () => boolean, onOpened?: () => void) => {
    const node = doc.nodes[index];
    if (!node || (owns && !owns()) || (index === editNode && hasEditorDraft())) return;
    const opener = event?.currentTarget;
    switchWhenReady(() => {
      if (owns && !owns()) return;
      onOpened?.();
      changes.prepare(index, node);
      if (node.kind === 'text' || node.kind === 'text-relief' || node.kind === 'cylindrical-wrap' || node.kind === 'band-surface') {
        const command = editCommand(index, doc.nodes, doc);
        if (command) {
          changes.openCommand(command);
          return;
        }
      }
      if (opener) changes.openFromHistory(index, opener);
      else changes.setEditNode(index);
    }, { event, readFeature: readFeatureTransitionDraft });
  };
  const openHistoryFeature = (event: MouseEvent<HTMLButtonElement>) => {
    const raw = event.currentTarget.dataset.nodeIndex;
    if (raw === undefined) return;
    const index = Number(raw);
    if (Number.isInteger(index) && index >= 0) openHistoryFeatureAt(index, event);
  };
  return { openHistoryFeature, openHistoryFeatureAt };
}
