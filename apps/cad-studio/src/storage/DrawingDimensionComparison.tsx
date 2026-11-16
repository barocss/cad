import { useMemo } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { drawingDimensionChanges } from './drawingDimensionChanges';
type Snapshot = NonNullable<ReturnType<typeof drawingDimensionChanges>['changes'][number]['before']>;
const raw = (value: unknown) => value === undefined ? 'not set' : JSON.stringify(value);
function value(snapshot: Snapshot | undefined, field: string): string {
  if (!snapshot) return 'absent';
  const definition = snapshot.definition as Record<string, unknown>;
  if (field === 'definition') return 'present';
  if (field === 'sheet') return snapshot.sheet ? `${snapshot.sheet.number}: ${snapshot.sheet.name} (${snapshot.sheet.id ?? 'first sheet'})` : 'unresolved';
  if (field === 'view') return snapshot.view;
  if (field === 'tolerance') {
    const tol = definition.tol as { kind: string; value?: number; upper?: number; lower?: number; code?: string } | undefined;
    const unit = snapshot.toleranceUnit === 'degrees' ? '°' : 'mm';
    if (!tol) return 'not set';
    if (tol.kind === 'symmetric') return `± ${tol.value} ${unit}`;
    if (tol.kind === 'deviation') return `upper ${tol.upper} ${unit}; lower ${tol.lower} ${unit}`;
    return `fit ${tol.code}`;
  }
  if (field === 'reference' || field === 'signature') return 'see exact stored definitions below';
  return raw(definition[field]);
}
/** Read-only presentation of the exact two documents already admitted by VersionsPanel. */
export function DrawingDimensionComparison({ before, after }: { before: StudioDoc; after: StudioDoc }) {
  const result = useMemo(() => drawingDimensionChanges(before, after), [before, after]);
  if (!before.drawing && !after.drawing) return null;
  return <details className="mt-2" aria-label="Drawing dimension definitions">
    <summary>Drawing dimension definitions</summary>
    <p className="text-muted-foreground">Stored definitions only. Nominal measurements, other drawing annotations and manufacturing approval are not compared here. IDs match saved definitions, not historical identity after deletion and reuse. Sheet membership does not certify that geometric references resolve.</p>
    {!!result.incomplete.length && <div role="alert">Incomplete comparison<ul>{result.incomplete.map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>}
    {!result.changes.length && <p>{result.incomplete.length ? 'No comparable dimension changes found; some data could not be compared.' : 'No authored dimension definition changes. This does not mean the whole drawing or measured values are unchanged.'}</p>}
    <ul className="m-0 list-none p-0">{result.changes.map(change => <li key={change.id} className="mt-2" data-dimension-change={change.id}>
      <strong>{change.id} · {change.change}</strong>
      <div>Location: {value(change.before, 'view')} / {value(change.before, 'sheet')} → {value(change.after, 'view')} / {value(change.after, 'sheet')}</div>
      {change.fields.map(field => <div key={field} className="[overflow-wrap:anywhere]">{field === 'reference' || field === 'signature' ? `${field} changed; inspect exact stored definitions below.` : `${field}: ${value(change.before, field)} → ${value(change.after, field)}`}</div>)}
      <details><summary>Exact stored definitions · {change.id}</summary>
        <div>Before<pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{raw(change.before)}</pre></div>
        <div>After<pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{raw(change.after)}</pre></div>
      </details>
    </li>)}</ul>
  </details>;
}
