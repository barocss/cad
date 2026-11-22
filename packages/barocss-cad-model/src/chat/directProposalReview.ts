import type { Proposal } from '../engine/schema/proposals';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { isDirectRuledOperation } from './directRuledProposal';
import { isDirectThickenOperation } from './directThickenProposal';

export function directReviewKind(proposal: Proposal): 'sheet' | 'solid' | undefined {
  if (proposal.status !== 'open' || !proposal.ops.length) return;
  if (proposal.ops.every(isDirectRuledOperation)) return 'sheet';
  if (proposal.ops.every(op => {
    if (isDirectRuledOperation(op)) return true;
    const values = op.args?.values;
    return isDirectThickenOperation(op) && isObj(values) && (values.mode === 'exact-planar' || values.mode === 'exact-cylinder');
  })) return 'solid';
}

export function directReviewRevision(proposal: Proposal): string | undefined {
  if (directReviewKind(proposal)) return digestOf(proposal);
}
