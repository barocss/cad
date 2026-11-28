import { useCallback, useEffect, useRef, useState } from 'react';
import { selectedBodies, type Selection } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { checkInterferencePairs, type InterferenceReport } from '../app/checkInterference';
import type { StudioNotice } from '../app/studioNotice';
import type { EngineClient } from '../engine/client';

type Source = { input: StudioDoc };
type Run = { source: Source };
type Result = { run: Run; value: InterferenceReport | 'busy' };

interface InterferenceCommand {
  ready: boolean;
  selection: Selection;
  bodies: readonly BodyResult[];
  setEditNode(value: null): void;
  setToast(notice: StudioNotice): void;
}

/** Own the requested body list and its report for one current Studio input. */
export function useInterferenceCheck(source: Source, ownsInput: () => boolean, engine: Pick<EngineClient, 'volumes'>,
  { ready, selection, bodies, setEditNode, setToast }: InterferenceCommand) {
  const active = useRef<Run | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    setResult(previous => previous?.run.source === source ? previous : null);
    return () => {
      if (active.current?.source === source) active.current = null;
    };
  }, [source]);
  const close = useCallback(() => {
    active.current = null;
    setResult(null);
  }, []);
  const start = useCallback(async (bodies: readonly BodyResult[], scope: 'all' | 'selected' = 'selected') => {
    if (!ownsInput()) return;
    const run = { source };
    active.current = run;
    setResult({ run, value: 'busy' });
    const current = () => active.current === run && ownsInput();
    const checked = await checkInterferencePairs(source.input, bodies, probe => engine.volumes(probe), current);
    if (checked && current()) setResult(previous => previous?.run === run && current() ? { run, value: { ...checked, scope } } : previous);
  }, [source, ownsInput, engine]);
  const checkSelection = useCallback(() => {
    if (!ready) {
      setToast({ title: 'Interference check not started', hint: 'Wait for the current part to finish evaluating.', detail: '' });
      return;
    }
    const picked = selectedBodies(selection);
    const selected = picked.length > 1;
    const list = selected ? picked.map(index => bodies[index]).filter(Boolean) : bodies.slice();
    setEditNode(null);
    void start(list, selected ? 'selected' : 'all');
  }, [ready, selection, bodies, setEditNode, setToast, start]);
  return {
    result: result?.run.source === source ? result.value : null, close, checkSelection,
    ownsResult: () => result !== null && active.current === result.run && ownsInput(),
  };
}
