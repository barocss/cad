import { useMemo } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { noteBaselineStatus } from '../state/noteBaselineStatus';

export function NoteBaselineStatus({ doc }: { doc: StudioDoc }) {
  const rows = useMemo(() => noteBaselineStatus(doc), [doc]);
  if (!rows.length) return null;
  return <section aria-label="Saved approval record status" className="muted small">
    <p>Saved approval records: pinned part inputs and interfaces only, not manufacturing approval or verification of cited analyses. Digest consistency is not signer authentication. Editing notes does not rewrite these records.</p>
    {rows.map(row => <p key={row.id} role="status">
      {row.id}: {row.state === 'matching' ? 'Record intact; pinned part inputs and interfaces match.'
        : row.state === 'changed' ? 'Record intact; pinned part inputs or interfaces changed. Explicit review is needed.'
          : 'Record cannot be verified; do not treat it as current.'}
      {row.details.length > 0 && <> {row.details.join('; ')}.</>}
    </p>)}
  </section>;
}
