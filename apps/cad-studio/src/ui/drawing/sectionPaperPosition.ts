import type { DrawingSection } from '@barocss/cad-model/drawing/types';

/** Release only the paper-space override; keep the exact cut, scale and section identity. */
export function resetRemovedSectionPaperPosition(section: DrawingSection): DrawingSection {
  if (!section.removed?.at) return section;
  const { at: _at, ...removed } = section.removed;
  void _at;
  return { ...section, removed };
}
