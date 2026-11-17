import { sectionHatchVisibilitySupported, type DrawingSection } from '@barocss/cad-model/drawing/types';

/** Display-only state never participates in native projection identity or input. */
export function sectionGeometryInputs(sections: readonly DrawingSection[]): DrawingSection[] {
  return sections.map(section => { const next = { ...section }; delete next.hideHatch; return next; });
}
export function sectionHatchSupported(section: DrawingSection): boolean {
  return sectionHatchVisibilitySupported(section);
}
export function withSectionHatch(section: DrawingSection, shown: boolean, partScope: boolean): DrawingSection {
  if (!partScope || !sectionHatchSupported(section) || shown === !section.hideHatch) return section;
  const next = { ...section }; delete next.hideHatch;
  return shown ? next : { ...next, hideHatch: true };
}
