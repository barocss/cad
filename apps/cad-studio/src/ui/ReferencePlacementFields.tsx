import { useState } from 'react';
import type { Placement } from '@barocss/cad-model/engine/schema/references';
import { Input } from '@/components/ui/input';

/** Placement drafts belong to the current document, not a reference ID reused by history or Open. */
export function ReferencePlacementFields({ id, at, resetKey, onPlace }: {
  id: string; at: Placement; resetKey?: unknown; onPlace(id: string, at: Placement): void;
}) {
  const values = [...at.position, ...at.rotation];
  const [draft, setDraft] = useState({ owner: resetKey, values, text: values.map(String) });
  const owned = draft.owner === resetKey && draft.values.every((value, i) => Object.is(value, values[i]));
  // Any document commit cancels all unapplied placement axes, including drafts in other references.
  // Equivalent reference objects on a hover/worker render do not change ownership.
  if (!owned) setDraft({ owner: resetKey, values, text: values.map(String) });
  const text = owned ? draft.text : values.map(String);
  return <>{(['position', 'rotation'] as const).map((kind, group) =>
    <span key={kind} className="req-edit ref-at"><span className="muted ref-at-label">{kind === 'position' ? 'at mm' : 'turn °'}</span>
      {[0, 1, 2].map(axis => {
        const index = group * 3 + axis;
        return <Input key={axis} aria-label={`${id} ${kind} ${'xyz'[axis]}`} type="number" step="any" value={text[index]}
          onChange={event => setDraft({ owner: resetKey, values, text: text.map((value, i) => i === index ? event.target.value : value) })}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key !== 'Enter') return;
            const number = Number(event.currentTarget.value);
            const next: Placement = { position: [...at.position], rotation: [...at.rotation] };
            next[kind][axis] = Number.isFinite(number) ? number : at[kind][axis];
            onPlace(id, next);
          }} />;
      })}
    </span>)}</>;
}
