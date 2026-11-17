import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { insertLibraryPart, libraryEntry, libraryInstance, type LibraryEntry } from '@barocss/cad-model/library/libraries';

/** Insert exactly the displayed entry, without registering the document's older embedded copy. */
export function insertDisplayedLibraryPart(doc: StudioDoc, entry: LibraryEntry, part: string, selectedVariant: string | undefined, asInstance: boolean): { ok: true; doc: StudioDoc } | { ok: false; reason: 'changed' } {
  const id = entry.library.manifest.id;
  if (libraryEntry(id) !== entry) return { ok: false, reason: 'changed' };
  const { libraries: embedded, ...target } = doc;
  const options = selectedVariant ? { variant: selectedVariant } : {};
  const next = asInstance ? libraryInstance(target, id, part, options).doc : insertLibraryPart(target, id, part, options);
  return { ok: true, doc: embedded ? { ...next, libraries: embedded } : next };
}
