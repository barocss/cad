import { useState } from 'react';
import type { useNamedInspection } from '../state/useNamedInspection';

export function NamedInspectionViews({ inspection, selectedKeys }: {
  inspection: ReturnType<typeof useNamedInspection>; selectedKeys: readonly string[];
}) {
  const [name, setName] = useState(''), [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string; scope: object; reason: string | undefined } | null>(null);
  // IDs restart on Open/reset. Keep draft authority separate from the row's label/ID.
  const edit = editing && editing.scope === inspection.renameScope && editing.reason === inspection.reason
    && !inspection.reason && inspection.rows.some(row => row.id === editing.id) ? editing : null;
  if (editing && !edit) setEditing(null);
  const cancelRename = () => { setEditing(null); setProblem(null); };
  const saveRename = () => {
    if (!edit || edit.scope !== inspection.renameScope || edit.reason !== inspection.reason) return;
    // Use this render's guarded callback only within the captured session scope.
    // A delayed old-render handler still fails the hook's live current() check.
    if (inspection.rename(edit.id, edit.draft)) { setEditing(null); setProblem(null); }
    else setProblem('View not renamed. Its source is no longer available; cancel and try again.');
  };
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
      {edit?.id === row.id ? <>
        <input aria-label={`Rename inspection view ${row.name}`} value={edit.draft} maxLength={80} autoFocus
          onChange={e => { setEditing({ ...edit, draft: e.target.value }); setProblem(null); }}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelRename(); } }} />
        <button className="ghost" aria-label={`Save inspection view name ${row.name}`} disabled={!edit.draft.trim() || !!inspection.reason} onClick={saveRename}>Save</button>
        <button className="ghost" aria-label={`Cancel renaming inspection view ${row.name}`} onClick={cancelRename}>Cancel</button>
      </> : <>
        <span>{row.name}{row.active ? ' · active' : ''}</span>
        <button className="ghost" aria-label={`Rename inspection view ${row.name}`} disabled={!!inspection.reason}
          onClick={() => { setEditing({ id: row.id, draft: row.name, scope: inspection.renameScope, reason: inspection.reason }); setProblem(null); }}>Rename</button>
      </>}
      <button className="ghost" aria-label={`Apply inspection view ${row.name}`} disabled={!!inspection.reason} onClick={() => { if (!inspection.apply(row.id)) setProblem('View not applied. Its source or camera is no longer available.'); else setProblem(null); }}>Apply</button>
      <button className="ghost" aria-label={`Update inspection view ${row.name}`} title="Replace this snapshot with the current camera and visible bodies; Apply is separate" disabled={!!inspection.reason} onClick={() => { if (!inspection.update(row.id)) setProblem('View not updated. Its source or current camera is no longer available.'); else setProblem(null); }}>Update</button>
      <button className="ghost" aria-label={`Delete inspection view ${row.name}`} onClick={() => inspection.remove(row.id)}>Delete</button>
    </div>)}
    <button className="ghost" disabled={!inspection.canRestore} onClick={() => { if (!inspection.restore()) setProblem('The previous inspection view is no longer available.'); else setProblem(null); }}>Restore inspection view</button>
    {inspection.reason && <p role="status" className="muted small">{inspection.reason}</p>}
    {problem && <p role="status" className="warn small">{problem}</p>}
  </aside>;
}
