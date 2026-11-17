import type { PinnedMassResult } from '../app/pinnedMass';
export function PinnedMassControls({ pinned, result, canPin, onPin, onClear }: { pinned: boolean; result: PinnedMassResult | null; canPin: boolean; onPin(): void; onClear(): void }) {
  return <aside className="card props" aria-label="Pinned centre of mass">
    <div className="card-title">CENTRE OF MASS · SESSION</div>
    <button className="ghost" disabled={!canPin} onClick={onPin}>Pin selected bodies’ COM</button>
    {!pinned && <p className="muted small">Select one or two ordinary base-part bodies with current qualified mass.</p>}
    {pinned && <><button className="ghost" onClick={onClear}>Clear COM marker</button>
      <p className="muted small">Accepted model only. Selection and visibility do not change this set. Not a balance or safety approval.</p>
      {result?.ok ? <><div className="kv">Mass <b>{result.mass} g</b></div><div className="kv">X Y Z <b>{result.centroid.join(', ')} mm</b></div>
        {result.members.map(m => <p key={m.key} className="muted small">{m.name} ({m.key}){m.hidden ? ' · hidden, still included' : ''}<br/>{m.basis}</p>)}</>
        : <p role="status" className="warn small">COM unavailable: {result && !result.ok ? result.reason : 'No current result.'}</p>}
    </>}
  </aside>;
}
