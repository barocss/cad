import type { CurveSegment2, XY } from '../brep/curved-arrangement.js';

type Line = Extract<CurveSegment2, { kind: 'line' }>;
const samePoint = (a: XY, b: XY) => a[0] === b[0] && a[1] === b[1];
const axis = ({ a, b }: Line) => a[1] === b[1] && a[0] !== b[0] ? 0 : a[0] === b[0] && a[1] !== b[1] ? 1 : undefined;

/** Six cardinal walls, with one reflex vertex at the middle of the three-by-three coordinate grid. */
export function isSharpL(lines: readonly Line[], corner: XY, tolerance: number): boolean {
  const vertices = lines.map(line => line.a);
  const xs = [...new Set(vertices.map(([x]) => x))].sort((a, b) => a - b);
  const ys = [...new Set(vertices.map(([, y]) => y))].sort((a, b) => a - b);
  if (xs.length !== 3 || ys.length !== 3 || corner[0] !== xs[1] || corner[1] !== ys[1]
    || xs[1] - xs[0] <= tolerance || xs[2] - xs[1] <= tolerance
    || ys[1] - ys[0] <= tolerance || ys[2] - ys[1] <= tolerance
    || new Set(vertices.map(point => point.join(','))).size !== 6) return false;
  return lines.every((line, index) => {
    const next = lines[(index + 1) % lines.length], firstAxis = axis(line), nextAxis = axis(next);
    if (!samePoint(line.b, next.a) || firstAxis === undefined || nextAxis === undefined || firstAxis === nextAxis) return false;
    const first = line.b[firstAxis] - line.a[firstAxis], second = next.b[nextAxis] - next.a[nextAxis];
    const turn = Math.sign(first) * Math.sign(second) * (firstAxis === 0 ? 1 : -1);
    return turn === (samePoint(line.b, corner) ? -1 : 1);
  });
}

/** Prove the same L while requiring the restored corner to be one of its five outside corners. */
export function isSharpLAtConvexCorner(lines: readonly Line[], corner: XY, tolerance: number): boolean {
  const reflex = lines.find((line, i) => {
    const next = lines[(i + 1) % lines.length];
    return (line.b[0] - line.a[0]) * (next.b[1] - next.a[1]) - (line.b[1] - line.a[1]) * (next.b[0] - next.a[0]) < 0;
  })?.b;
  return !!reflex && !samePoint(reflex, corner) && isSharpL(lines, reflex, tolerance);
}
