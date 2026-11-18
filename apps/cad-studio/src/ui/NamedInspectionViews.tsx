import { useState } from 'react';
import type { useNamedInspection } from '../state/useNamedInspection';

export function NamedInspectionViews({ inspection, selectedKeys }: {
  inspection: ReturnType<typeof useNamedInspection>; selectedKeys: readonly string[];
}) {
  const [name, setName] = useState(''), [problem, setProblem] = useState<string | null>(null);
  const capture = (keys?: readonly string[]) => {
    if (inspection.capture(name, keys)) { setName(''); setProblem(null); }
    else setProblem('View not captured. Enter a name and use current, design-visible bodies in ordinary Model view.');
  };
  return <aside className="card props" aria-label="Named inspection views">
    <div className="card-title">INSPECTION VIEWS · SESSION</div>
    <p className="muted small">Up to two camera and visibility snapshots. Not saved; reset on document changes. Design visibility and Render settings are unchanged.</p>
    <p className="muted small">Update saves the current camera and visible bodies in that session snapshot only. Use Apply separately to display it.</p>
    <label>View name <input aria-label="Inspection view name" value={name} maxLength={80} onChange={e => { setName(e.target.value); setProblem(null); }} /></label>
    <div className="row-actions">
      <button className="ghost" disabled={!inspection.canCapture || !name.trim()} onClick={() => capture()}>Capture all visible bodies</button>
      <button className="ghost" disabled={!inspection.canCapture || !name.trim() || !selectedKeys.length} onClick={() => capture(selectedKeys)}>Capture selected bodies</button>
    </div>
    {inspection.rows.map(row => <div key={row.id} className="kv" style={{ flexWrap: 'wrap' }}>
      <span>{row.name}{row.active ? ' · active' : ''}</span>
      <button className="ghost" aria-label={`Apply inspection view ${row.name}`} disabled={!!inspection.reason} onClick={() => { if (!inspection.apply(row.id)) setProblem('View not applied. Its source or camera is no longer available.'); else setProblem(null); }}>Apply</button>
      <button className="ghost" aria-label={`Update inspection view ${row.name}`} title="Replace this snapshot with the current camera and visible bodies; Apply is separate" disabled={!!inspection.reason} onClick={() => { if (!inspection.update(row.id)) setProblem('View not updated. Its source or current camera is no longer available.'); else setProblem(null); }}>Update</button>
      <button className="ghost" aria-label={`Delete inspection view ${row.name}`} onClick={() => inspection.remove(row.id)}>Delete</button>
    </div>)}
    <button className="ghost" disabled={!inspection.canRestore} onClick={() => { if (!inspection.restore()) setProblem('The previous inspection view is no longer available.'); else setProblem(null); }}>Restore inspection view</button>
    {inspection.reason && <p role="status" className="muted small">{inspection.reason}</p>}
    {problem && <p role="status" className="warn small">{problem}</p>}
  </aside>;
}
