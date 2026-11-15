import { friendlyCause, type FriendlyError } from '@barocss/cad-model/engine/errors';
import { isRefusal } from '@barocss/cad-model/engine/refusal';
import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';

/** Preserve legacy build errors except the owned Draft angle recovery shared with native evaluation. */
export function commandBuildFailure(command: string, cause: unknown): FriendlyError {
  if ((command === 'draft' || command === DRAFT_EDIT) && isRefusal(cause, 'DRAFT_ANGLE')) return friendlyCause(cause);
  return { title: 'Invalid input', hint: String(cause), detail: '' };
}
