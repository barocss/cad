/** The persisted copy order, not the current Direct geometry selection. */
export function SewSourceList({ names }: { names: readonly string[] }) {
  return <details className="panel-details">
    <summary>Copied sources · {names.length}</summary>
    <ol aria-label="Copied Sew sources" style={{ paddingLeft: 24 }}>
      {names.map((name, index) => <li key={index}>{name}</li>)}
    </ol>
    <p className="small muted">Stored copies in source order. Later source edits do not update this Sew.</p>
  </details>;
}
