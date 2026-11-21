import type { Dispatch, SetStateAction } from 'react';
import { fmt } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { ToolIconButton } from '@/components/ui/tool-button';
import type { useProposalPreview } from '../state/useProposalPreview';
import { Icon } from './atoms';
interface ProposalBrowserProps {
  controller: ReturnType<typeof useProposalPreview>;
  reviewRecovery?: string;
  doc: import('@barocss/cad-model/engine/doc').StudioDoc;
  bodies: BodyResult[];
  fresh: boolean;
  massReady: boolean;
  placedPreviewEnabled: boolean;
  decidedShown: boolean;
  setDecidedShown: Dispatch<SetStateAction<boolean>>;
}
const volumeOf = (list: readonly BodyResult[]) => list.reduce((s, b) => s + (b.volume ?? 0), 0);
export function ProposalBrowser({ controller, reviewRecovery = 'Finish or cancel the current edit to review the proposal.', doc, bodies, fresh, massReady, placedPreviewEnabled, decidedShown, setDecidedShown }: ProposalBrowserProps) {
  const { ghost, proposalBusy, reviewBlocked, isStale, showProposal, rebaseIt, tickPart, flipGhost, acceptIt, rejectIt, screwChangesAvailable, toggleScrewChanges } = controller;
  return <>{!!doc.proposals?.length && <div className="chat-proposals" role="list" aria-label="Proposals"><div className="ol-head req-head">Proposals <span className="muted">{doc.proposals.filter(p => p.status === 'open').length} open</span>
          <ToolIconButton size="tiny" state={decidedShown ? 'on' : 'idle'} data-proposal-history-toggle aria-label={decidedShown ? 'Hide decided proposals' : 'Show decided proposals'} aria-pressed={decidedShown} data-tip={decidedShown ? 'Hide decided proposals' : 'Show accepted and rejected'} onClick={() => setDecidedShown(f => !f)}><Icon name="history" small /></ToolIconButton></div>
        {doc.proposals.filter(p => decidedShown || p.status === 'open').map(p => {
          const shown = ghost?.id === p.id, stale = isStale(p), base = volumeOf(bodies);
          // Historical scope comes from the saved decision, never from replaying
          // its operations against today's model or guessing missing labels.
          const leftOut = p.status === 'accepted' ? [...new Set(p.decided?.left_out ?? [])] : [];
          const partial = leftOut.length > 0;
          const decisionNote = p.rebased && !stale && p.decided?.note === 'rebased before it was accepted' ? undefined : p.decided?.note;
          const blockedDescription = reviewBlocked ? `proposal-review-blocked-${p.id}` : undefined;
          const placed = shown ? ghost.placed : null;
          const problem = placed?.kind === 'unavailable' ? placed.reason : placed && !placedPreviewEnabled ? 'Placed preview is unavailable in the current view.' : null;
          const delta = placed?.kind === 'ready' ? placed.volumeChange : 0;
          const dv = shown && delta !== null ? volumeOf(ghost.bodies) - base + delta : null;
          return <div key={p.id} className={'proposal ' + p.status + ' risk-' + p.risk.level} role="listitem" aria-label={`Proposal ${p.id}`}>
            <div className="proposal-title"><b>{p.id}</b> {p.title} <span className={'risk-badge ' + p.risk.level} title={`${p.risk.features_touched} features touched · ${p.risk.references_broken} references broken${p.risk.hard_requirements_changed.length ? ` · hard requirements ${p.risk.hard_requirements_changed.join(', ')}` : ''}${p.risk.approval.length ? ` · always needs approval: ${p.risk.approval.join(', ')}` : ''}`}>{p.risk.level} risk</span></div>
            <div className="muted">{stale ? <b className="stale">stale · </b> : p.rebased ? 'rebased · ' : ''}{partial ? 'Original proposal: ' : ''}{p.summary}{p.risk.references_broken ? ` · ${p.risk.references_broken} reference${p.risk.references_broken > 1 ? 's' : ''} broken` : ''}{p.risk.hard_requirements_changed.length ? ` · hard ${p.risk.hard_requirements_changed.join(', ')}` : ''}{p.risk.approval.length ? ` · needs you (${p.risk.approval.join(', ')})` : ''} · {p.by.agent}{p.by.model ? ` (${p.by.model})` : ''}</div>
            {p.plan && <div className="proposal-plan">{p.plan}</div>}
            {shown && fresh && (problem ? <div className="muted proposal-dv">{problem}</div>
              : <div className="mono proposal-dv">{ghost.after ? 'after' : 'before'} · Volume change <span aria-label="Volume change">{!massReady ? '…' : dv === null ? 'unavailable'
                : `${dv >= 0 ? '+' : '−'}${fmt(Math.abs(dv))} mm³${!placed && base ? ` (${dv >= 0 ? '+' : '−'}${fmt(Math.abs(dv) / base * 100)}%)` : ''}`}</span></div>)}
            {shown && ghost.parts.length > 1 && <div className="proposal-parts" role="group" aria-label={`${p.id} features`}>{ghost.parts.map(q => <label key={q.id} className={'proposal-part ' + q.kind}>
              <input type="checkbox" aria-label={`Keep ${q.id}`} disabled={q.kind === 'deleted' || proposalBusy} checked={!ghost.leaveOut.includes(q.id)} onChange={e => void tickPart(q.id, e.currentTarget.checked)} />
              <span className="mono">{q.id}</span> {q.kind === 'added' ? '+' : q.kind === 'changed' ? '~' : '−'} {q.label}</label>)}</div>}
            {p.status === 'open' ? <div className="proposal-actions">
              <button className={'ghost small' + (shown ? ' on' : '')} disabled={proposalBusy || stale || (!shown && reviewBlocked)} aria-describedby={!shown ? blockedDescription : undefined} onClick={() => void showProposal(p)}>{shown ? 'Hide' : 'Preview'}</button>
              {shown && <button className="ghost small" aria-label={screwChangesAvailable ? (ghost.after ? 'Show before' : 'Show after') : undefined} onClick={flipGhost}>
                {screwChangesAvailable ? (ghost.after ? 'Before' : 'After') : (ghost.after ? 'Show before' : 'Show after')}
              </button>}
              {shown && screwChangesAvailable && <button className="ghost small" aria-label={ghost.changesShown ? 'Show shape' : 'Show changes'} onClick={toggleScrewChanges}>
                {ghost.changesShown ? 'Shape' : 'Changes'}
              </button>}
              <span className="grow" />
              <button className="ghost small" disabled={proposalBusy} onClick={() => rejectIt(p)}>Reject</button>
              {stale && p.follow_up_repair ? <span className="muted">Attach the saved follow-up again to recheck.</span>
                : stale ? <button className="primary small" disabled={proposalBusy || reviewBlocked} aria-describedby={blockedDescription} title="Recheck the proposal against the current document and review it before accepting" onClick={() => void rebaseIt(p)}>Rebase &amp; preview</button>
                : <button className="primary small" disabled={proposalBusy || reviewBlocked} aria-describedby={blockedDescription} onClick={() => void acceptIt(p)}>{shown && ghost.leaveOut.length ? `Accept ${ghost.parts.length - ghost.leaveOut.length} of ${ghost.parts.length}` : 'Accept'}</button>}
              {reviewBlocked && <span id={blockedDescription} className="muted" role="status">{reviewRecovery}</span>}
            </div> : <div className="muted">{partial ? 'partially accepted' : p.status} by {p.decided?.by}{partial && <span role="group" aria-label={`${p.id} accepted scope`}> · accepted the proposal except {leftOut.join(', ')}</span>}{decisionNote ? ` · ${decisionNote}` : ''}</div>}
          </div>;
        })}</div>}</>;
}
