import { useEffect, useId, useState } from 'react';
import type { InstancePattern, PartInstance } from '@barocss/cad-model/engine/doc';
import type { AddPatternOptions, EditPatternOptions } from '@barocss/cad-model/assembly/patterns';
import { Button } from '@/components/ui/button';
import { FIELD } from './panelStyles';

// Roadmap 10 ③ (#2180, RS7.4): a part instance repeated along a line or about an axis. The seed's panel makes, edits and
// deletes its pattern; an occurrence's panel names its pattern and offers Skip (its placement is the seed's to drive).

const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as const;
type Axis = keyof typeof AXES | 'Custom';
/** The axis a direction is exactly (+X, +Y, +Z), else 'Custom': a direction a chat or a file made is shown as it is and kept unless the choice changes. */
export const axisOf = (v: readonly number[]): Axis => (Object.keys(AXES) as (keyof typeof AXES)[]).find(a => AXES[a].every((x, k) => x === v[k])) ?? 'Custom';

export interface Draft { kind: 'linear' | 'circular'; count: string; spacing: string; angle: string; axis: Axis; originX: string; originY: string; originZ: string }
export function draftOf(p: InstancePattern | undefined): Draft {
  const origin = p?.kind === 'circular' ? p.origin : [0, 0, 0];
  const coordinates = { originX: String(origin[0]), originY: String(origin[1]), originZ: String(origin[2]) };
  if (!p) return { kind: 'linear', count: '3', spacing: '20', angle: '120', axis: 'X', ...coordinates };
  return p.kind === 'linear' ? { kind: 'linear', count: String(p.count), spacing: String(p.spacing), angle: '120', axis: axisOf(p.dir), ...coordinates }
    : { kind: 'circular', count: String(p.count), spacing: '20', angle: String(p.angle), axis: axisOf(p.axis), ...coordinates };
}

// An unfinished coordinate is invalid, never an implicit move to world zero.
export function patternOrigin(draft: Draft): [number, number, number] {
  return [draft.originX, draft.originY, draft.originZ].map(x => x.trim() === '' ? NaN : Number(x)) as [number, number, number];
}

/** What Apply sends for an existing pattern: its numbers, and the direction/axis/origin only when changed (a custom one stays as it is). */
export function patternEdit(pattern: InstancePattern, draft: Draft): EditPatternOptions {
  const origin = patternOrigin(draft);
  const moved = pattern.kind === 'circular' && origin.some((v, i) => v !== pattern.origin[i]);
  const count = Number(draft.count), turned = draft.axis !== draftOf(pattern).axis && draft.axis !== 'Custom' ? [...AXES[draft.axis]] as [number, number, number] : undefined;
  return pattern.kind === 'linear' ? { id: pattern.id, count, spacing: Number(draft.spacing), ...(turned ? { dir: turned } : {}) } : { id: pattern.id, count, angle: Number(draft.angle), ...(turned ? { axis: turned } : {}), ...(moved ? { origin } : {}) };
}

/** Restore only the chosen occurrence; the Model transaction validates identity and all remaining exclusions. */
export const restorePatternOccurrence = (pattern: InstancePattern, k: number): EditPatternOptions => ({ id: pattern.id, skip: (pattern.skip ?? []).filter(skipped => skipped !== k) });

/** The seed's pattern (to make, edit or delete) or an occurrence's pattern (to skip it). */
export function InstancePatternControls({ inst, pattern, occurrenceOf, onAdd, onEdit, onDelete, onSkip }: {
  inst: PartInstance;
  /** The pattern this instance seeds, if any. */
  pattern?: InstancePattern;
  /** The pattern this instance is an occurrence of, if any. */
  occurrenceOf?: InstancePattern;
  onAdd(o: AddPatternOptions): string | undefined; onEdit(o: EditPatternOptions): string | undefined; onDelete(id: string): void; onSkip(): void;
}) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<Draft>(() => draftOf(pattern));
  const [error, setError] = useState<string>();
  const errorId = useId();
  useEffect(() => { setDraft(draftOf(pattern)); setError(undefined); }, [pattern]);
  if (occurrenceOf && inst.pattern) return (
    <div className="kv" role="status" aria-label="Pattern occurrence">
      <span>Pattern <b>{occurrenceOf.id}</b> · {inst.pattern.k + 1} of {occurrenceOf.count}</span>
      <Button variant="ghost" title="Leave this occurrence out of the pattern (editing the pattern's skip list brings it back)" onClick={onSkip}>Skip</Button>
    </div>);
  const set = (k: keyof Draft, v: string) => { setDraft(d => ({ ...d, [k]: v })); setError(undefined); };
  const apply = () => {
    let why: string | undefined;
    if (pattern) why = onEdit(patternEdit(pattern, draft));
    else {
      const count = Number(draft.count), dir = [...AXES[draft.axis === 'Custom' ? 'X' : draft.axis]] as [number, number, number];
      why = onAdd(draft.kind === 'linear' ? { seed: inst.id, kind: 'linear', count, spacing: Number(draft.spacing), dir } : { seed: inst.id, kind: 'circular', count, angle: Number(draft.angle), axis: dir, origin: patternOrigin(draft) });
    }
    setError(why);
    if (!why) setOpen(false);
  };
  if (!open && !pattern) return <Button variant="ghost" onClick={() => setOpen(true)} title="Repeat this part along a line or about an axis">Pattern…</Button>;
  const kind = pattern?.kind ?? draft.kind;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2" role="group" aria-label="Instance pattern" aria-describedby={error ? errorId : undefined}>
      <div className="card-title">PATTERN{pattern ? ` · ${pattern.id}` : ''}</div>
      {!pattern && <label className={FIELD}><span>Kind</span>
        <select aria-label="Pattern kind" value={draft.kind} onChange={e => set('kind', e.target.value)}><option value="linear">Linear</option><option value="circular">Circular</option></select></label>}
      <label className={FIELD}><span>Count</span><input aria-label="Pattern count" type="number" step="1" value={draft.count} onChange={e => set('count', e.target.value)} /></label>
      {kind === 'linear'
        ? <label className={FIELD}><span>Spacing mm</span><input aria-label="Pattern spacing" type="number" step="any" value={draft.spacing} onChange={e => set('spacing', e.target.value)} /></label>
        : <label className={FIELD}><span>Angle °</span><input aria-label="Pattern angle" type="number" step="any" value={draft.angle} onChange={e => set('angle', e.target.value)} /></label>}
      <label className={FIELD}><span>{kind === 'linear' ? 'Along' : 'About'}</span>
        <select aria-label="Pattern axis" value={draft.axis} onChange={e => set('axis', e.target.value)}>{(pattern && draftOf(pattern).axis === 'Custom' ? ['Custom', ...Object.keys(AXES)] as Axis[] : Object.keys(AXES) as Axis[]).map(a => <option key={a} value={a}>{a === 'Custom' ? 'Custom (as made)' : a}</option>)}</select></label>
      {kind === 'circular' && <fieldset className="flex flex-col gap-1"><legend>Axis origin · mm</legend>
        {(['X', 'Y', 'Z'] as const).map(a => {
          const key = `origin${a}` as 'originX' | 'originY' | 'originZ';
          return <label key={a} className={FIELD}><span>{a}</span><input aria-label={`Pattern origin ${a}`} type="number" step="any" value={draft[key]} onChange={e => set(key, e.target.value)} /></label>;
        })}
      </fieldset>}
      {!!pattern?.skip?.length && <div className="flex flex-col gap-1" role="group" aria-label="Skipped pattern occurrences">
        <span>Skipped <b>{pattern.skip.map(k => k + 1).join(', ')}</b></span>
        <div className="flex flex-wrap gap-1">
          {pattern.skip.map(k => <Button key={k} variant="ghost" size="xs" aria-label={`Restore occurrence ${k + 1}`} onClick={() => setError(onEdit(restorePatternOccurrence(pattern, k)))}>Restore {k + 1}</Button>)}
          <Button variant="ghost" size="xs" onClick={() => setError(onEdit({ id: pattern.id, skip: [] }))}>Restore all</Button>
        </div>
      </div>}
      {error && <div id={errorId} className="hud-error" role="status" aria-label="Pattern refused">{error}</div>}
      <div className="row-actions" style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        <Button variant="default" onClick={apply}>{pattern ? 'Apply' : 'Make pattern'}</Button>
        {pattern ? <Button variant="ghost" onClick={() => onDelete(pattern.id)}>Delete pattern</Button> : <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>}
      </div>
    </div>);
}
