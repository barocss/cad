/** Called only after a successful write/receipt. A superseded save must not overwrite a later notice. */
export function unappliedSaveNotice(input: {
  hint: string | null;
  currentHint: string | null;
  order: number;
  latest: number;
  current: boolean;
}): string | null {
  return input.current && input.order === input.latest && input.hint && input.hint === input.currentHint ? input.hint : null;
}
