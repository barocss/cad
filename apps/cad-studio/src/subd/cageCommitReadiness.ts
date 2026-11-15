/** Exact evaluation evidence belongs to one immutable session and document pair. */
export type CageBuildReceipt<S extends object, D extends object> = {
  readonly session: S;
  readonly doc: D;
  readonly status: 'pending' | 'success' | 'error';
  readonly reason?: string;
};

/** Commit gate only: native topology/evaluation checks remain with their existing owners. */
export function cageDoneReadiness<S extends object, D extends object>(
  session: S | null, doc: D, dragging: boolean, receipt: CageBuildReceipt<S, D> | null,
): { ok: boolean; reason: string } {
  if (!session) return { ok: false, reason: 'Start editing a cage before applying.' };
  if (dragging) return { ok: false, reason: 'Finish moving the gizmo before applying.' };
  if (!receipt || receipt.session !== session || receipt.doc !== doc || receipt.status === 'pending') {
    return { ok: false, reason: 'Checking this cage before applying. Wait for evaluation to finish.' };
  }
  if (receipt.status === 'error') return {
    ok: false, reason: receipt.reason || 'This cage could not be evaluated. Adjust it or undo the last step before applying.',
  };
  return { ok: true, reason: 'This cage has finished evaluation and can be applied.' };
}
