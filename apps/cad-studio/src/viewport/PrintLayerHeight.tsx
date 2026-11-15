import { useId, useState } from 'react';

/** A Print-only draft: the saved preview stays in force until Enter or blur. */
export function PrintLayerHeight({ value, onCommit, resetKey }: { value?: number; onCommit(value: number): void; resetKey?: unknown }) {
  const saved = value ?? 0.2, enabled = value !== undefined, statusId = useId();
  const [draft, setDraft] = useState({ owner: resetKey, value, text: String(saved) });
  const owned = draft.owner === resetKey && draft.value === value;
  if (!owned) setDraft({ owner: resetKey, value, text: String(saved) });
  const text = owned ? draft.text : String(saved), number = Number(text);
  const invalid = !text.trim() || !Number.isFinite(number) || number <= 0;
  const changed = invalid || number !== saved;
  const message = enabled && changed ? `${invalid ? 'Enter a finite positive layer height.' : 'Not applied.'} Preview uses ${saved} mm.` : undefined;
  const cancel = () => setDraft({ owner: resetKey, value, text: String(saved) });
  const apply = () => {
    if (!enabled || invalid) return;
    if (number !== saved) onCommit(number);
    else cancel();
  };
  return <>
    <input aria-label="Print layer height (mm)" type="number" min={Number.MIN_VALUE} step="any" disabled={!enabled} value={text} style={{ width: 64 }}
      aria-invalid={enabled && invalid || undefined} aria-describedby={message ? statusId : undefined}
      onChange={event => setDraft({ owner: resetKey, value, text: event.target.value })} onBlur={apply} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); apply(); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
      }} /> mm
    {message && <span id={statusId} role="status" className={invalid ? 'warn small block' : 'muted small block'}>{message}</span>}
  </>;
}
