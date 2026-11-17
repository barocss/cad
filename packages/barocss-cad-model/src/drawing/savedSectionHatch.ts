// Admission for the new saved field only; the general Drawing reader remains permissive.
import { problem, type Problem } from '../engine/refusal';
import { checkDrawingScope } from './scope';
import { readDrawing, sectionsOf } from './types';

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const marked = (x: unknown): x is Record<string, unknown> & { hideHatch: unknown } => record(x) && Object.hasOwn(x, 'hideHatch');
export function checkSavedSectionHatch(raw: unknown): Problem[] {
  if (!record(raw)) return [];
  const fail = (why: string) => [problem('DRAWING_OPTIONS', `Saved section hatch: ${why}. Keep the original file; omit hideHatch to show hatching.`)];
  if (marked(raw) || marked(raw.section)) return fail('hideHatch belongs to an explicit sections entry, not the drawing or legacy section');
  if (!Array.isArray(raw.sections)) return marked(raw.sections) ? fail('sections must be an array') : [];
  const flagged = raw.sections.filter(marked);
  if (!flagged.length) return [];
  if (raw.scope !== undefined) {
    if (checkDrawingScope(raw.scope).length || !record(raw.scope) || raw.scope.kind !== 'part') return fail('only part drawing scope is supported');
  } else if (raw.balloons || (Array.isArray(raw.tables) && raw.tables.some(t => record(t) && t.from === 'bom'))) return fail('implicit assembly drawing scope is not supported');
  const kept = sectionsOf(readDrawing({ sections: raw.sections }));
  for (const section of flagged) {
    if (section.hideHatch !== true) return fail('hideHatch must be true when present');
    if (['dir', 'half', 'steps', 'along', 'removed'].some(key => section[key] !== undefined)
      || (section.revolved !== undefined && section.revolved !== false)) return fail('only full principal sections are supported');
    if (raw.sections.filter(s => record(s) && s.id === section.id).length !== 1
      || !kept.some(s => s.id === section.id && s.view === section.view && s.at === section.at && s.hideHatch === true))
      return fail('the flagged section must have a unique valid letter, principal view and finite position that the reader preserves');
  }
  return [];
}
