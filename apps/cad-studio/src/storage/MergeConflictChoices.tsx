import type { Conflict, Side } from '@barocss/cad-model/versions/merge';

/** Preserve the existing compact scalar display for non-body conflicts. */
const shown = (value: unknown) => value === undefined ? ' (deleted)' : typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && value.length <= 24) ? ` (${String(value)})` : '';
function bodyName(value: unknown): string {
  if (value === undefined) return 'Body metadata deleted';
  const name = value && typeof value === 'object' && 'name' in value ? value.name : undefined;
  return typeof name === 'string' ? name === '' ? 'Name: "" (empty)' : `Name: ${JSON.stringify(name)}` : 'Name: (not set)';
}

/** The radios choose the entire conflict value; details never edit a property. */
export function MergeConflictChoices({ conflict, ours, theirs, answer, onAnswer }: {
  conflict: Conflict; ours: string; theirs: string; answer?: Side; onAnswer(side: Side): void;
}) {
  const body = conflict.where.startsWith('bodies:');
  return <div className="py-0.5" aria-label={`Conflict ${conflict.where}`}>
    <div title={conflict.message}>{conflict.message.replace(/^\[[A-Z_]+\] /, '')}</div>
    {body && <div className="text-muted-foreground">Choose all body settings, not only the name.</div>}
    {(['ours', 'theirs'] as const).map(side => <div key={side} className={body ? 'my-1' : 'mr-2 inline-block'}>
      <label className="inline-flex items-start gap-1" style={{ maxWidth: '100%' }}>
        <input type="radio" name={conflict.where} aria-label={`${conflict.where} ${side}`} checked={answer === side} onChange={() => onAnswer(side)} />
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{side === 'ours' ? ours : theirs}{body ? <> · <span style={{ whiteSpace: 'pre-wrap' }}>{bodyName(conflict[side])}</span></> : shown(conflict[side])}</span>
      </label>
      {body && conflict[side] !== undefined && <details aria-label={`${conflict.where} ${side} body settings`}>
        <summary>Body settings</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 160, overflowY: 'auto', margin: '2px 0' }}>{JSON.stringify(conflict[side], null, 2)}</pre>
      </details>}
    </div>)}
  </div>;
}
