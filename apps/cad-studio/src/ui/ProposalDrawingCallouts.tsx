import type { ProposalCalloutReply } from '../engine/proposalDrawingCallouts';

export function ProposalDrawingCallouts({ result }: { result: ProposalCalloutReply }) {
  if ('error' in result) return <div className="muted proposal-dv">Drawing callouts unavailable · {result.error}</div>;
  if (!result.changes.length) return null;
  return <div className="proposal-callouts" role="group" aria-label="Drawing callout changes">
    {result.changes.map(({ key, before, after }) => {
      const callout = (before ?? after)!;
      const view = callout.view[0].toUpperCase() + callout.view.slice(1);
      return <div className="proposal-callout" key={key}>
        <div className="muted">{callout.sheetName}
          {before && after && (before.sheet !== after.sheet || before.sheetName !== after.sheetName) && <> → {after.sheetName}</>}
          {' · '}{view}{' · '}{callout.id}
        </div>
        <dl>
          <dt className="muted">Before</dt><dd className="mono">{before?.lines.join('\n') ?? '—'}</dd>
          <dt className="muted">After</dt><dd className="mono">{after?.lines.join('\n') ?? '—'}</dd>
        </dl>
      </div>;
    })}
  </div>;
}
