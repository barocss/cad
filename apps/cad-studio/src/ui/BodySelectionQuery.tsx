import { useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { materialIdOf } from '@barocss/cad-model/app/bodies';
import { BODY_SELECTION_QUERY_MAX, bodySelectionQuery, type BodySelectionMaterial } from '../app/bodySelectionQuery';

/** Transient property review. Selection is an explicit capability, never a live filter. */
export function BodySelectionQuery({ doc, bodies, owner, blocked, onSelect }: {
  doc: StudioDoc; bodies: readonly BodyResult[]; owner: object; blocked: string | null;
  onSelect(indices: number[], owner: object): boolean;
}) {
  const [name, setName] = useState('');
  const [material, setMaterial] = useState<BodySelectionMaterial>({ kind: 'any' });
  const [reviewed, setReviewed] = useState(owner);
  const [feedback, setFeedback] = useState('');
  const stale = reviewed !== owner;
  const result = bodySelectionQuery(doc, bodies, { name, material });
  const ids = [...new Set(bodies.map(b => materialIdOf(doc, b)).filter((id): id is string => typeof id === 'string'))].sort();
  if (material.kind === 'id' && !ids.includes(material.id)) ids.push(material.id);
  const value = material.kind === 'id' ? `id:${material.id}` : material.kind;
  const changed = () => { setReviewed(owner); setFeedback(''); };
  return <details className="small" onPointerDown={event => { if (blocked) event.preventDefault(); }} onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <summary>Select bodies by properties</summary>
    <label className="field"><span>Body name contains</span><input aria-label="Body name contains" disabled={!!blocked} maxLength={BODY_SELECTION_QUERY_MAX} value={name}
      onChange={event => { setName(event.target.value); changed(); }} /></label>
    <label className="field"><span>Body material</span><select disabled={!!blocked} aria-label="Body material" value={value} onChange={event => {
      const v = event.target.value;
      setMaterial(v === 'any' ? { kind: 'any' } : v === 'unspecified' ? { kind: 'unspecified' } : { kind: 'id', id: v.slice(3) }); changed();
    }}><option value="any">Any</option><option value="unspecified">Unspecified</option>
      {ids.map(id => <option key={id} value={`id:${id}`}>{id}</option>)}
    </select></label>
    <p className="muted">Current visible base bodies only. Names use literal text; material IDs match exactly.</p>
    <div role="status" aria-label="Body query results">{blocked ? 'Selection unavailable. ' + blocked : stale ? 'The model or context changed. Refresh matches before selecting.' : result.reason ?? `${result.matches.length} matching bodies`}</div>
    {!blocked && !stale && result.matches.length > 0 && <ul>{result.matches.map(match => <li key={`${match.index}:${match.key}`}>{match.name} · {match.materialId ?? 'Unspecified'}</li>)}</ul>}
    {stale && <button type="button" disabled={!!blocked} onClick={changed}>Refresh matches</button>}
    <button type="button" disabled={!!blocked || stale || result.reason !== null} onClick={() => {
      if (blocked || stale || result.reason !== null) return;
      setFeedback(onSelect(result.matches.map(match => match.index), owner) ? `Selected ${result.matches.length} bodies.` : 'The model or context changed. Refresh matches before selecting.');
    }}>Select matches</button>
    <button type="button" disabled={!!blocked} onClick={() => { setName(''); setMaterial({ kind: 'any' }); changed(); }}>Clear query</button>
    {feedback && !stale && !blocked && <p role="status">{feedback}</p>}
  </details>;
}
