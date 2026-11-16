import type { Selection } from '@barocss/cad-model/app/commands';

export const BODY_REVEAL_SCOPE = 'Find one selected base body in Browser. Placed parts, direct geometry and sketches are not supported yet.';
export type BodyRevealTarget = { key: string; reason?: never } | { key?: never; reason: string };
/** Resolve only current base-body identity, never a display name or a row number. */
export function bodyRevealTarget(selection: Selection, bodies: readonly { key: string }[], other: { instances: number; direct: number }, blocked: string | null): BodyRevealTarget {
  if (blocked) return { reason: blocked };
  if (other.instances || other.direct || selection.sketches?.length || selection.profileRegions?.indices.length || selection.vertices?.length)
    return { reason: 'Select only one base body or its faces/edges. Parts, direct geometry, sketches and vertices are not supported.' };
  const indices = new Set([...selection.bodies, ...selection.faces.map(x => x.body), ...selection.edges.map(x => x.body)]);
  if (indices.size !== 1) return { reason: 'Select one base body, or faces/edges belonging to that same body.' };
  const index = [...indices][0];
  if (!Number.isInteger(index) || index < 0 || !bodies[index]) return { reason: 'The selected body is no longer current. Select it again.' };
  const key = bodies[index].key;
  if (bodies.filter(body => body.key === key).length !== 1) return { reason: 'The selected body identity is ambiguous. Wait for the current result.' };
  return { key };
}

export interface BodyRevealRequest { owner: object; key: string; ticket: number }
export function ownsBodyReveal(request: BodyRevealRequest, owner: object, key: string | undefined, ticket: number, open: boolean): boolean {
  return open && request.owner === owner && request.key === key && request.ticket === ticket;
}

export function revealScrollDelta(top: number, bottom: number, visibleTop: number, visibleBottom: number): number {
  if (top >= visibleTop && bottom <= visibleBottom) return 0;
  if (top < visibleTop) return top - visibleTop;
  return bottom - visibleBottom;
}

export function revealInteractionProblem(doc: Document): string | null {
  const focused = doc.activeElement;
  if (focused?.matches('input, textarea, select') || focused?.closest('[contenteditable="true"], [role="textbox"]'))
    return 'Finish or cancel the current input before finding a body. Your input has not been applied.';
  if ([...doc.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].some(el => el.getClientRects().length))
    return 'Close the dialog before finding a body.';
  return null;
}

/** Focus without implicit page scrolling; move only the actual overflowing panel. */
export function revealBodyRow(row: HTMLElement): boolean {
  if (!row.isConnected || !row.getClientRects().length) return false;
  const doc = row.ownerDocument, view = doc.defaultView;
  if (!view) return false;
  let scroller = row.parentElement;
  while (scroller && scroller !== doc.body && scroller !== doc.documentElement) {
    if (/(auto|scroll)/.test(view.getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
    scroller = scroller.parentElement;
  }
  row.focus({ preventScroll: true });
  if (doc.activeElement !== row) return false;
  if (scroller && scroller !== doc.body && scroller !== doc.documentElement) {
    const rect = row.getBoundingClientRect(), panel = scroller.getBoundingClientRect();
    const top = panel.top + scroller.clientTop;
    const delta = revealScrollDelta(rect.top, rect.bottom, top, top + scroller.clientHeight);
    if (delta) scroller.scrollTop += delta;
  }
  return true;
}
