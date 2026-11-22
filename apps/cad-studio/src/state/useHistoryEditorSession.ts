import { useCallback, useRef, useState, type RefObject } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Active } from '../app/commandState';
import { returnEditorFocus } from '../ui/editorReturnFocus';
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
