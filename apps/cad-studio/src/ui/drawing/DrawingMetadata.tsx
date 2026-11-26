// DR-5 + D2022: title-block fields, explicit person-entered revision records, and live sheet/zone summary overrides.
import { useState } from 'react';
import { TITLE_FIELDS, checkDrawingMetadata, type DrawingRevision, type DrawingTitleBlock } from '@barocss/cad-model/drawing/metadata';
import { revisionLocationSummaryMap } from '@barocss/cad-model/drawing/revisionMarkers';
import type { DrawingSettings } from '@barocss/cad-model/drawing/types';
import { today } from '../useDrawingSheet';
import { CONTROL, FIELD, TICK, withTable } from './sheetShared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

interface MetadataFieldProps {
  label: string;
  value: string;
  set(value: string): void;
}

function MetadataField({ label, value, set }: MetadataFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className={FIELD}><span>{label}</span><Input className={CONTROL} aria-label={label} maxLength={120} value={draft ?? value}
    onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== null) set(draft.trim()); setDraft(null); }}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>;
}

interface OverrideFieldProps {
  label: string;
  ariaLabel: string;
  resetAriaLabel: string;
  value: string;
  placeholder: string;
  canReset: boolean;
  onCommit(value: string): void;
  onReset(): void;
}

function OverrideField({ label, ariaLabel, resetAriaLabel, value, placeholder, canReset, onCommit, onReset }: OverrideFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return <div className={FIELD}>
    <span>{label}</span>
    <Input className={CONTROL} aria-label={ariaLabel} maxLength={60} placeholder={placeholder} value={draft ?? value}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== null) { onCommit(draft.trim()); setDraft(null); } }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { e.preventDefault(); setDraft(null); } }} />
    <Button variant="ghost" size="xs" aria-label={resetAriaLabel} disabled={!canReset} onClick={() => { setDraft(null); onReset(); }}>Reset</Button>
  </div>;
}

export interface DrawingMetadataProps {
  settings: DrawingSettings;
  wholeSettings?: DrawingSettings;
  onChange(next: DrawingSettings): void;
  onRefused(message: string): void;
}

export function DrawingMetadata({ settings, wholeSettings = settings, onChange, onRefused }: DrawingMetadataProps) {
  const block = settings.titleBlock ?? { template: 'basic' }, rows = settings.revisions ?? [];
  const summaries = revisionLocationSummaryMap(wholeSettings);
  const [date, setDate] = useState(today), [description, setDescription] = useState(''), [by, setBy] = useState(''), [eco, setEco] = useState('');
  const setBlock = (titleBlock: DrawingTitleBlock) => {
    const why = checkDrawingMetadata({ titleBlock })[0];
    if (why) onRefused(why.message); else onChange({ ...settings, titleBlock });
  };
  const updateRevision = (revision: string, updater: (row: DrawingRevision) => DrawingRevision) => {
    const revisions = rows.map(row => row.revision === revision ? updater(row) : row);
    const why = checkDrawingMetadata({ revisions })[0];
    if (why) { onRefused(why.message); return; }
    onChange({ ...settings, revisions });
  };
  const record = () => {
    const revisions = [...rows, { revision: settings.revision ?? '', date, description: description.trim(), ...(by.trim() ? { by: by.trim() } : {}), ...(eco.trim() ? { eco: eco.trim() } : {}) }];
    const why = checkDrawingMetadata({ revisions })[0];
    if (why) { onRefused(why.message); return; }
    const next = { ...settings, revisions };
    onChange(settings.tables?.some(t => t.from === 'revisions') ? next : withTable(next, 'revisions', true)); setDescription(''); setEco('');
  };
  return <>
    <label className={FIELD}><span>Title block</span><NativeSelect className={CONTROL} aria-label="Title block template" value={block.template} onChange={e => setBlock({ ...block, template: e.target.value as DrawingTitleBlock['template'] })}>
      <option value="basic">Basic</option><option value="extended">Extended</option>
    </NativeSelect></label>
    {block.template === 'extended' && <details aria-label="Title block fields"><summary>Title block fields</summary>
      {TITLE_FIELDS.map(([key, label]) => <MetadataField key={key} label={label} value={block[key] ?? ''} set={value => { const next = { ...block }; delete next[key]; setBlock(value ? { ...next, [key]: value } : next); }} />)}
    </details>}
    <details aria-label="Revision history"><summary>Revision history ({rows.length})</summary>
      <label className={FIELD}><span>Revision table</span><input className={TICK} type="checkbox" aria-label="Revision table" checked={!!settings.tables?.some(t => t.from === 'revisions')} onChange={e => onChange(withTable(settings, 'revisions', e.target.checked))} /></label>
      {rows.map(r => {
        const loc = summaries.get(r.revision);
        return <div key={r.revision} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 4, borderBottom: '1px solid var(--border)' }} aria-label={`Revision record ${r.revision}`}>
          <div className={FIELD}>
            <span className="min-w-0 break-words" style={{ flex: '1 1 0%' }}>{r.revision}{r.eco ? ` · ECO ${r.eco}` : ''} · {r.date} · {r.description}{r.by ? ` · ${r.by}` : ''}</span>
            <Button variant="ghost" size="xs" aria-label={`Remove revision record ${r.revision}`} onClick={() => { const { revisions: _r, ...rest } = settings; void _r; const keep = rows.filter(x => x !== r); onChange(keep.length ? { ...rest, revisions: keep } : rest); }}>Remove</Button>
          </div>
          <div className="empty" aria-label={`Revision ${r.revision} location summary`}>
            Sheets: {loc?.sheets ?? '—'} · Zones: {loc?.zones ?? '—'} ({loc?.markerCount ?? 0} marker{(loc?.markerCount ?? 0) === 1 ? '' : 's'})
          </div>
          <label className={FIELD}><span>Auto sheets</span><input className={TICK} type="checkbox" aria-label={`Auto sheets ${r.revision}`} checked={r.autoSheets !== false}
            onChange={e => updateRevision(r.revision, row => {
              const { autoSheets: _a, ...rest } = row; void _a;
              return e.target.checked ? rest : { ...rest, autoSheets: false };
            })} /></label>
          <label className={FIELD}><span>Auto zones</span><input className={TICK} type="checkbox" aria-label={`Auto zones ${r.revision}`} checked={r.autoZones !== false}
            onChange={e => updateRevision(r.revision, row => {
              const { autoZones: _a, ...rest } = row; void _a;
              return e.target.checked ? rest : { ...rest, autoZones: false };
            })} /></label>
          <OverrideField
            label="Manual sheets"
            ariaLabel={`Manual sheets ${r.revision}`}
            resetAriaLabel={`Reset sheets ${r.revision}`}
            value={r.manualSheets ?? ''}
            placeholder={loc?.autoSheetsText ?? 'Auto'}
            canReset={r.manualSheets !== undefined || r.autoSheets === false}
            onCommit={value => updateRevision(r.revision, row => {
              const { manualSheets: _m, ...rest } = row; void _m;
              return value ? { ...rest, manualSheets: value } : rest;
            })}
            onReset={() => updateRevision(r.revision, row => {
              const { manualSheets: _m, autoSheets: _a, ...rest } = row; void _m; void _a;
              return rest;
            })}
          />
          <OverrideField
            label="Manual zones"
            ariaLabel={`Manual zones ${r.revision}`}
            resetAriaLabel={`Reset zones ${r.revision}`}
            value={r.manualZones ?? ''}
            placeholder={loc?.autoZonesText ?? 'Auto'}
            canReset={r.manualZones !== undefined || r.autoZones === false}
            onCommit={value => updateRevision(r.revision, row => {
              const { manualZones: _m, ...rest } = row; void _m;
              return value ? { ...rest, manualZones: value } : rest;
            })}
            onReset={() => updateRevision(r.revision, row => {
              const { manualZones: _m, autoZones: _a, ...rest } = row; void _m; void _a;
              return rest;
            })}
          />
        </div>;
      })}
      <div className="empty">Record the current revision: {settings.revision || 'set Revision first'}.</div>
      <label className={FIELD}><span>Date</span><Input className={CONTROL} type="date" aria-label="Revision date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className={FIELD}><span>Change</span><Input className={CONTROL} aria-label="Revision description" maxLength={120} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label className={FIELD}><span>By</span><Input className={CONTROL} aria-label="Revision by" maxLength={60} value={by} onChange={e => setBy(e.target.value)} /></label>
      <label className={FIELD}><span>ECO</span><Input className={CONTROL} aria-label="Revision ECO" title="Optional engineering change order identifier, up to 20 characters. This records a reference, not approval." maxLength={20} value={eco} onChange={e => setEco(e.target.value)} /></label>
      <Button variant="ghost" aria-label="Record revision" disabled={!settings.revision || !description.trim() || !date || rows.some(r => r.revision === settings.revision) || rows.length >= 50} onClick={record}>Record revision</Button>
    </details>
  </>;
}
