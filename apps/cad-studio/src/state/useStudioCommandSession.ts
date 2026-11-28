import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Values } from '@barocss/cad-model/app/commands';
import { activeKey, type Active } from '../app/commandState';
import { filletStationInputKey } from '../app/filletEndpoints';
import type { FilletPickedEdgeRequest } from '../app/filletPickedEdgeHighlight';
import { FontUpload } from '../app/fontUpload';
import { createCommandApplyQueue } from './commandApply';
import { createValueStore } from './valueStore';

/** The active store keeps HUD edits local while App follows command and Fillet station changes. */
export function useStudioCommandSession() {
  const activeStore = useMemo(() => createValueStore<Active | null>(null), []);
  const commandApply = useMemo(createCommandApplyQueue, []);
  const fontUpload = useMemo(() => new FontUpload(), []);
  useEffect(() => {
    const sync = () => fontUpload.sync(activeStore.get()?.ctx ?? null);
    sync();
    const unsubscribe = activeStore.subscribe(sync);
    return () => { unsubscribe(); fontUpload.sync(null); };
  }, [activeStore, fontUpload]);
  const hudValues = useRef<Values | null>(null);
  useSyncExternalStore(activeStore.subscribe, () => activeKey(activeStore.get(), hudValues.current));
  useSyncExternalStore(activeStore.subscribe, () => filletStationInputKey(activeStore.get()));
  const active = activeStore.get();
  const [filletPickedEdgeRequest, setFilletPickedEdgeRequest] = useState<FilletPickedEdgeRequest | null>(null);
  useEffect(() => activeStore.subscribe(() => {
    const current = activeStore.get();
    setFilletPickedEdgeRequest(request => {
      if (request && (!current || request.owner.cmd !== current.cmd || request.owner.ctx !== current.ctx)) return null;
      return request;
    });
  }), [activeStore]);
  return { active, activeStore, setActive: activeStore.set, commandApply, fontUpload, hudValues,
    filletPickedEdgeRequest, setFilletPickedEdgeRequest };
}
