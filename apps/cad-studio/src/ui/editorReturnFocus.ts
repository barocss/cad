/** Restore only focus lost through teardown, never a user's newer focus or document. */
export function returnEditorFocus<S>(scope: S, currentScope: S, inactive: boolean, opener: HTMLElement | null,
  fallback: HTMLElement | null, page: Pick<Document, 'activeElement' | 'body'>): boolean {
  if (scope !== currentScope || !inactive || page.activeElement !== page.body) return false;
  const available = (target: HTMLElement | null) => !!target?.isConnected && !target.matches(':disabled')
    && !target.closest('[hidden], [inert], [aria-hidden="true"]') && target.getClientRects().length > 0;
  const target = available(opener) ? opener : available(fallback) ? fallback : null;
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}
