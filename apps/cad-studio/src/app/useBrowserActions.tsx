import { useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { InstanceEvaluationSource } from '../viewport/instanceEvaluation';
import { addToIsolation } from './addToIsolation';
import { browserRevealTarget } from './bodyBrowserReveal';
import { browserActionAvailability, type BrowserActionConditions } from './browserActionAvailability';
import { NO_INSTANCES } from './studioConstants';
import { useBodyBrowserReveal } from './useBodyBrowserReveal';

interface BrowserActionsOptions {
  model: { doc: StudioDoc; evaluated: StudioDoc; bodies: readonly BodyResult[]; generation: number; workerSession: number; openIntent: object };
  instances: { entries: ReadonlyMap<string, { inst: PartInstance; sourceKey: string; bodies: readonly BodyResult[] }>; sources: ReadonlyMap<string, InstanceEvaluationSource> };
  selection: { model: Selection; instances: readonly string[]; direct: readonly string[]; selectBodies(indices: number[]): void };
  browser: { open: boolean; setOpen(open: boolean): void };
  conditions: BrowserActionConditions;
  isolation: {
    ids: readonly string[] | undefined;
    setIds: Dispatch<SetStateAction<readonly string[] | undefined>>;
    hasActiveMode(): boolean;
    onInputBlocked(): void;
  };
  isCurrent(): boolean;
}

const hasFocusedInput = () => document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');

/** Keep each Browser action bound to the model state that displayed it. */
export function useBrowserActions({ model, instances, selection, browser, conditions, isolation, isCurrent }: BrowserActionsOptions) {
  const { doc, evaluated, bodies, generation, workerSession, openIntent } = model;
  const { entries, sources } = instances;
  const { model: picked, instances: pickedInstances, direct, selectBodies } = selection;
  const { open, setOpen } = browser;
  const { ids, setIds, hasActiveMode, onInputBlocked } = isolation;
  const { reveal: revealBlocked, isolation: isolationBlocked } = browserActionAvailability(conditions);

  // A property query remains reviewed when the user only changes selection.
  const queryOwner = useMemo(() => ({}), [doc, evaluated, bodies, generation, workerSession, openIntent, revealBlocked]);
  const queryOwnerNow = useRef(queryOwner);
  queryOwnerNow.current = queryOwner;
  const revealOwner = useMemo(() => ({}),
    [doc, evaluated, bodies, picked, pickedInstances, direct, generation, workerSession, openIntent, revealBlocked, entries, sources]);
  const reveal = useBodyBrowserReveal(revealOwner, browserRevealTarget(picked, bodies, pickedInstances, direct.length, doc, entries, sources, revealBlocked),
    open, setOpen, () => isCurrent() && !revealBlocked, generation);

  const isolationOwner = useMemo(() => ({}), [doc, evaluated, generation, workerSession, openIntent, ids, entries, sources, isolationBlocked]);
  const isolationOwnerNow = useRef(isolationOwner);
  isolationOwnerNow.current = isolationOwner;
  const isolationAction = ids ? (inst: PartInstance) => {
    const result = addToIsolation(ids, inst.id, doc.instances ?? NO_INSTANCES, entries, sources, isolationBlocked);
    const included = ids.includes(inst.id);
    const reason = 'reason' in result ? result.reason : undefined;
    return <button data-add-isolation={inst.id} aria-label={`Add ${inst.name} to isolation`} disabled={!!reason || included}
      title={reason ?? (included ? 'This part is already isolated.' : 'Keep the isolated parts and add this part. Selection is unchanged. Leave any input field with Tab before adding.')}
      onPointerDown={event => {
        if (hasFocusedInput()) {
          event.preventDefault();
          onInputBlocked();
        }
      }} onClick={() => {
        if (hasFocusedInput() || isolationOwnerNow.current !== isolationOwner || !isCurrent() || hasActiveMode() || isolationBlocked) return;
        setIds(current => {
          if (current !== ids || isolationOwnerNow.current !== isolationOwner) return current;
          const next = addToIsolation(current, inst.id, doc.instances ?? NO_INSTANCES, entries, sources, isolationBlocked);
          return 'ids' in next ? next.ids : current;
        });
      }}>{included ? 'In isolation' : 'Add to isolation'}</button>;
  } : undefined;

  return {
    reveal, revealBlocked, isolationAction, queryOwner,
    selectQueryMatches(indices: number[], owner: object) {
      if (owner !== queryOwnerNow.current || revealBlocked || !isCurrent() || !indices.length) return false;
      selectBodies(indices);
      return true;
    },
  };
}
