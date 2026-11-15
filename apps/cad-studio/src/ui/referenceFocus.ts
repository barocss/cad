/** The accepted document owns this handoff, even when its last References row unmounts. */
export interface ReferenceFocusReceipt<D, S> { doc: D; scope: S; button: HTMLButtonElement }
export function handoffReferenceFocus<D, S>(receipt: ReferenceFocusReceipt<D, S>, doc: D, scope: S,
  browser: HTMLElement | null, page: Pick<Document, 'activeElement' | 'body'>): boolean {
  if (receipt.doc !== doc || receipt.scope !== scope || receipt.button.isConnected || page.activeElement !== page.body) return false;
  const target = browser?.querySelector<HTMLElement>('[data-reference-next]')
    ?? browser?.querySelector<HTMLElement>('[data-reference-return]');
  if (!target?.isConnected) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}
