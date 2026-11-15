import type { BodyResult } from '@barocss/cad-model/engine/evaluate';

export type MapSourceScope = 'Body mesh' | 'Section display mesh';

/** Label the actual map input, not the visible clip, matching IDs, or retained volume. */
export function mapSourceScope({ shownBodies, sectionBodies, sectionExactShown, gpuSection }: {
  shownBodies: readonly BodyResult[]; sectionBodies: readonly BodyResult[] | null; sectionExactShown: boolean; gpuSection: boolean;
}): MapSourceScope {
  return sectionBodies !== null && shownBodies === sectionBodies && (sectionExactShown || !gpuSection)
    ? 'Section display mesh' : 'Body mesh';
}
