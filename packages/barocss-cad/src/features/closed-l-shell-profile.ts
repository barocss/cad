import { CadNumericPolicy, linearToleranceMM } from '../numeric-policy.js';
import type { XY } from './extruded-profile-solid.js';

/** Common wall bound before either arm or the closed height collapses. Exact cardinal L admission, in either loop direction. */
export function closedLShellWallLimit(points: readonly XY[], height: number): number | undefined {
  if (!Array.isArray(points) || points.length !== 6 || !Number.isFinite(height) || height <= 0 || height > CadNumericPolicy.coordinateAbs
    || points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || Math.abs(v) > CadNumericPolicy.coordinateAbs))) return undefined;
  const xs = [...new Set(points.map(p => p[0]))].sort((a, b) => a - b), ys = [...new Set(points.map(p => p[1]))].sort((a, b) => a - b);
  if (xs.length !== 3 || ys.length !== 3) return undefined;
  const size = Math.max(1, height, ...xs.map(Math.abs), ...ys.map(Math.abs)), tolerance = linearToleranceMM(size);
  if (!(Math.min(height, xs[1] - xs[0], xs[2] - xs[1], ys[1] - ys[0], ys[2] - ys[1]) > tolerance)) return undefined;
  // An L is a rectangle with one corner rectangle absent. Match its complete boundary, never a rounded turn test.
  const grid = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
  for (const flipX of [false, true]) for (const flipY of [false, true]) {
    const boundary = grid.map(([x, y]) => [xs[flipX ? 2 - x : x], ys[flipY ? 2 - y : y]]);
    for (let start = 0; start < 6; start++) for (const direction of [1, -1]) {
      if (points.every((p, i) => { const q = boundary[(start + direction * i + 6) % 6]; return p[0] === q[0] && p[1] === q[1]; }))
        return Math.min(height, flipX ? xs[2] - xs[1] : xs[1] - xs[0], flipY ? ys[2] - ys[1] : ys[1] - ys[0]) / 2;
    }
  }
  return undefined;
}
