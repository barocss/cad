import type { Active } from './commandState';

/** Presentation only: suppress only the exact build error for an incomplete face pick. */
export function filletFaceSelectionFeedback(active: Active): { text: string; hideError: boolean } | undefined {
  const type = active.fillet?.type;
  if (!type || type === 'edge' || active.cmd.id !== (type === 'face' ? 'face-fillet' : 'full-round')) return;
  const picks = active.ctx.selection.faces;
  if (picks.some(p => !active.ctx.bodies[p.body]?.mesh.faces[p.face])) return;
  const waiting = type === 'face' ? picks.length < 2 : picks.length === 0;
  const available = active.cmd.available(active.ctx);
  if (waiting) {
    const text = type === 'full-round' ? 'Select a flat top face of the rib or wall.'
      : picks.length === 0 ? 'Select the first face.' : 'Shift-click the second face on the same body.';
    const error = active.error;
    const hideError = !available.ok && active.preview === 'error' && error?.title === 'Invalid input'
      && error.hint === `Error: ${available.reason}` && error.detail === '';
    return { text, hideError };
  }
  if (!available.ok) return;
  return { text: picks.map(p => active.ctx.bodies[p.body].mesh.faces[p.face].name).join(' · '), hideError: false };
}
