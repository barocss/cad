import { useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DrawingSettings } from '@barocss/cad-model/drawing/types';
import { changeDrawingScope, checkDrawingBodyOwner } from '@barocss/cad-model/drawing/scope';
import type { DrawingBodyChoices } from './bodyScopeChoices';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

export function DrawingBodyScopeControls({ state, sourceDoc, settings, onChange, onRefused, onChanged }: {
  state: DrawingBodyChoices; sourceDoc: StudioDoc; settings: DrawingSettings;
  onChange(next: DrawingSettings): boolean; onRefused(why: string): void; onChanged(): void;
}) {
  const [choice, setChoice] = useState<{ owner: object; doc: StudioDoc; settings: DrawingSettings; key: string } | null>(null);
  const live = useRef({ state, sourceDoc, settings }); live.current = { state, sourceDoc, settings };
  const current = choice?.owner === state.owner && choice.doc === sourceDoc && choice.settings === settings ? choice : null;
  const selected = settings.scope?.kind === 'part' ? settings.scope.body : undefined;
  const ready = state.ready && state.doc === sourceDoc;
  return <details aria-label="Drawing body scope">
    <summary>Drawing body scope</summary>
    <p>One current base-part native solid from an Extrude or Revolve output. Single sheet, ordinary views only. Other bodies and instances are excluded; viewport hide and selection are not adopted.</p>
    <div role="status">{selected ? `Drawing only ${selected.key} (${selected.feature}, ${selected.kind}).` : 'Drawing the existing whole-part scope.'}{!ready && ' Waiting for current native outputs.'}</div>
    {selected && <Button variant="ghost" onClick={() => {
      const now = live.current;
      if (now.sourceDoc !== sourceDoc || now.settings !== settings) { onRefused('The drawing source changed. Try again.'); return; }
      try { if (onChange(changeDrawingScope(now.settings, { kind: 'part' }))) { setChoice(null); onChanged(); } }
      catch (cause) { onRefused(cause instanceof Error ? cause.message : String(cause)); }
    }}>Use whole base part</Button>}
    <label>Native body<NativeSelect aria-label="Drawing native body" disabled={!ready} value={current?.key ?? ''} onChange={e => setChoice({ owner: state.owner, doc: sourceDoc, settings, key: e.target.value })}>
      <option value="">Choose a current output…</option>
      {state.choices.map(body => <option key={body.key} value={body.key}>{body.key} — {body.feature} ({body.kind})</option>)}
    </NativeSelect></label>
    <Button variant="ghost" disabled={!ready || !current?.key} onClick={() => {
      const now = live.current;
      if (!current || !now.state.ready || now.state.owner !== current.owner || now.sourceDoc !== current.doc || now.settings !== current.settings || now.state.doc !== now.sourceDoc) { onRefused('The drawing source changed. Choose a body from the current outputs.'); return; }
      const candidates = now.state.choices.filter(x => x.key === current.key);
      if (candidates.length !== 1) { onRefused('This native output is no longer uniquely available. Choose a current body.'); return; }
      try {
        const body = candidates[0], problem = checkDrawingBodyOwner(now.sourceDoc, body)[0];
        if (problem) { onRefused(problem.message); return; }
        const next = changeDrawingScope(now.settings, { kind: 'part', body });
        if (onChange(next)) { setChoice(null); onChanged(); }
      } catch (cause) { onRefused(cause instanceof Error ? cause.message : String(cause)); }
    }}>Use body for drawing</Button>
  </details>;
}
