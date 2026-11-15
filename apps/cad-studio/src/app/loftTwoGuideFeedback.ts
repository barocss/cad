import type { Active } from './commandState';

/** Translate only identified native two-guide refusals; unrelated errors keep their detail. */
export function loftTwoGuideFeedback(active: Active): { field: 'guide' | 'guideB'; text: string } | undefined {
  if (active.cmd.id !== 'loft' || active.preview !== 'error' || !active.values.guideB) return;
  const detail = active.error?.detail ?? '';
  if ((detail || active.error?.hint || '').includes('[DIRECT_PICK] Choose two different quadratic Bézier guides.')
    || detail === 'Choose two different quadratic Bézier guides.') {
    if (!active.values.guide) return { field: 'guide', text: 'Choose Guide 1 before using a second guide.' };
    if (active.values.guide === active.values.guideB) return { field: 'guideB', text: 'Choose a different curve for Guide 2. Both guide selections currently use the same curve.' };
  }
  const endpoint = detail.match(/loft: two guides require guide ([12]) endpoints to exactly match the (min X|max X), min Y corners of both sections/);
  if (endpoint) return { field: endpoint[1] === '1' ? 'guide' : 'guideB', text: `Guide ${endpoint[1]} endpoints must exactly match the ${endpoint[2]}, min Y corners of the lower and upper sections.` };
  const middle = detail.match(/loft: two guides require the middle control of guide ([12]) to lie on the section midplane/);
  if (middle) return { field: middle[1] === '1' ? 'guide' : 'guideB', text: `Guide ${middle[1]}'s middle control point must lie halfway between the two section heights.` };
}
