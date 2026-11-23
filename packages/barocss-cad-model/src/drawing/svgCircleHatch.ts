import type { Mark } from './sheet';
import type { SectionCircleHatch } from './sectionCircleHatch';
import type { XY } from './types';

/** Intersect each sheet hatch line with a verified circle or annulus, in sheet millimetres. */
export function hatchSectionCircles({ center, radii }: SectionCircleHatch, spacing: number, angle: number): Extract<Mark, { kind: 'line' }>[] {
  const [outer, inner] = radii, tilt = angle * Math.PI / 180;
  const cos = angle === 45 ? Math.SQRT1_2 : Math.cos(tilt), sin = angle === 45 ? Math.SQRT1_2 : Math.sin(tilt);
  const centerOffset = cos * center[1] - sin * center[0];
  const first = Math.ceil((centerOffset - outer) / spacing), last = Math.floor((centerOffset + outer) / spacing);
  const marks: Extract<Mark, { kind: 'line' }>[] = [];
  for (let row = first; row <= last; row++) {
    const offset = row * spacing - centerOffset, distance = Math.abs(offset);
    if (distance >= outer) continue;
    const reach = Math.sqrt((outer - distance) * (outer + distance));
    const point = (along: number): XY => [center[0] - sin * offset + cos * along, center[1] + cos * offset + sin * along];
    if (inner !== undefined && distance < inner) {
      const gap = Math.sqrt((inner - distance) * (inner + distance));
      if (reach - gap > 1e-9) marks.push({ kind: 'line', a: point(-reach), b: point(-gap), pen: 'thin' },
        { kind: 'line', a: point(gap), b: point(reach), pen: 'thin' });
    } else if (2 * reach > 1e-9) {
      marks.push({ kind: 'line', a: point(-reach), b: point(reach), pen: 'thin' });
    }
  }
  return marks;
}
