import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import { nestedInstance, singleNested, singleTop } from '../assembly/nestedSelection';
import { instanceEvaluationCurrent, type InstanceEvaluationSource } from '../viewport/instanceEvaluation';
import type { Selection } from '@barocss/cad-model/app/commands';

export const BODY_REVEAL_SCOPE = 'Find one selected base body or placed part in Browser. Nested parts use their exact occurrence path; direct geometry and sketches are not supported.';
export type BodyRevealTarget = { key: string; ancestors?: readonly string[]; reason?: never } | { key?: never; reason: string };
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

/** Shared by the base-body and exact placed-occurrence consumers; namespaces never alias. */
export function browserRevealTarget(selection: Selection, bodies: readonly { key: string }[], instances: readonly string[], direct: number,
  doc: StudioDoc, entries: ReadonlyMap<string, { inst: PartInstance; sourceKey: string }>, sources: ReadonlyMap<string, InstanceEvaluationSource>, blocked: string | null): BodyRevealTarget {
  if (blocked) return { reason: blocked };
  if (!instances.length) {
    const target = bodyRevealTarget(selection, bodies, { instances: 0, direct }, null);
    return target.key === undefined ? target : { key: `body:${target.key}` };
  }
  if (direct || selection.bodies.length || selection.faces.length || selection.edges.length || selection.sketches?.length || selection.profileRegions?.indices.length || selection.vertices?.length)
    return { reason: 'Select one placed part without a mixed body, sketch or direct-geometry selection.' };
  const path = singleTop(instances) ?? singleNested(instances);
  if (!path) return { reason: 'Select one placed part or one nested occurrence.' };
  const segments = path.split('/');
  if (segments.some(id => !id || id.includes('#'))) return { reason: 'Select a complete placed-part occurrence, not a display body.' };
  let list = doc.instances;
  let host: PartInstance | undefined;
  for (const id of segments) {
    const matches = list?.filter(inst => inst.id === id) ?? [];
    if (matches.length !== 1) return { reason: matches.length ? 'The selected occurrence path is ambiguous.' : 'The selected occurrence path is no longer available.' };
    const inst = matches[0];
    if (inst.hidden) return { reason: 'The selected occurrence or one of its parents is hidden. Visibility has not been changed.' };
    host ??= inst;
    list = inst.doc.instances;
  }
  if (segments.length > 1 && !nestedInstance(doc, path)) return { reason: 'The nested occurrence is no longer available.' };
  if (!host || !instanceEvaluationCurrent(entries.get(host.id), host, sources.get(host.id)))
    return { reason: 'Wait for the selected placed part’s current revision to finish evaluating.' };
  const ancestors = segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
  return { key: `instance:${path}`, ancestors };
}

/** Expand only the necessary ancestors without closing unrelated branches. */
export function withRevealAncestors(open: ReadonlySet<string>, ancestors: readonly string[]): ReadonlySet<string> {
  if (ancestors.every(path => open.has(path))) return open;
  return new Set([...open, ...ancestors]);
}

/** Ref teardown belongs to one mounted row, not merely to its reusable path. */
export function registerBrowserRow<T>(rows: Map<string, T>, key: string, row: T | null): (() => void) | undefined {
  if (row === null) return;
  rows.set(key, row);
  return () => { if (rows.get(key) === row) rows.delete(key); };
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
    return 'Finish or cancel the current input before finding a selection. Your input has not been applied.';
  if ([...doc.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].some(el => el.getClientRects().length))
    return 'Close the dialog before finding a selection.';
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
