import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { Active } from './commandState';

/** Call after the live active/source guard. This describes an existing list action,
 * not an association between the refused preview hit and any selected edge. */
export function filletPickFailure(active: Active): FriendlyError {
  const removable = active.cmd.id === 'fillet' && active.fillet?.type === 'edge'
    && active.ctx.selection.edges.some(pick => Number.isInteger(pick.body) && Number.isInteger(pick.edge)
      && !!active.ctx.bodies[pick.body]?.mesh.edges[pick.edge]?.names.join(', '));
  return { title: 'Selection not changed',
    hint: 'Choose an unchanged face or edge of the source body. Generated or ambiguous preview references cannot be selected.'
      + (removable ? ' To remove an already picked edge, open Edit picked edges and choose Remove.' : ''),
    detail: 'The accepted selection is unchanged. Apply was not queued.' };
}
