/** Sample XY and integrate occupied Z intervals. The documented plate trials share this fixed frame. */
export interface PlateMesh { positions: ArrayLike<number>; indices: ArrayLike<number> }

const origin = -1;
const step = 0.25;
const columns = 248;
const rows = 168;
const xOffset = 0.37;
const yOffset = 0.61;
const epsilon = 1e-9;
type Interval = [number, number];
type Samples = Map<number, Interval[]>;

export function samplePlateColumns({ positions, indices }: PlateMesh): Samples {
  const crossings = new Map<number, number[]>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = 3 * indices[i], b = 3 * indices[i + 1], c = 3 * indices[i + 2];
    const ax = positions[a], ay = positions[a + 1];
    const bx = positions[b] - ax, by = positions[b + 1] - ay, cx = positions[c] - ax, cy = positions[c + 1] - ay;
    const det = bx * cy - by * cx;
    if (Math.abs(det) < epsilon) continue;
    const minX = Math.ceil((Math.min(ax, positions[b], positions[c]) - origin) / step - xOffset);
    const maxX = Math.floor((Math.max(ax, positions[b], positions[c]) - origin) / step - xOffset);
    const minY = Math.ceil((Math.min(ay, positions[b + 1], positions[c + 1]) - origin) / step - yOffset);
    const maxY = Math.floor((Math.max(ay, positions[b + 1], positions[c + 1]) - origin) / step - yOffset);
    if (minX < 0 || maxX >= columns || minY < 0 || maxY >= rows) throw new Error('The solid exceeds the fixed plate sampling frame.');
    for (let row = minY; row <= maxY; row++) {
      const y = origin + step * (row + yOffset) - ay;
      for (let col = minX; col <= maxX; col++) {
        const x = origin + step * (col + xOffset) - ax;
        const u = (x * cy - y * cx) / det, v = (bx * y - by * x) / det;
        if (u < -epsilon || v < -epsilon || u + v > 1 + epsilon) continue;
        const z = positions[a + 2] + u * (positions[b + 2] - positions[a + 2]) + v * (positions[c + 2] - positions[a + 2]);
        const id = row * columns + col;
        const hits = crossings.get(id);
        if (hits) hits.push(z);
        else crossings.set(id, [z]);
      }
    }
  }
  const samples: Samples = new Map();
  for (const [id, hits] of crossings) {
    const levels = hits.sort((a, b) => a - b).filter((z, index) => !index || z - hits[index - 1] > epsilon);
    if (levels.length % 2) throw new Error('A sampled plate column has an unresolved boundary.');
    const intervals: Interval[] = [];
    for (let i = 0; i < levels.length; i += 2) intervals.push([levels[i], levels[i + 1]]);
    samples.set(id, intervals);
  }
  return samples;
}

export function plateOverlap(a: Samples, b: Samples) {
  const length = (intervals: readonly Interval[]) => intervals.reduce((sum, [start, end]) => sum + end - start, 0);
  let volumeA = 0, volumeB = 0, common = 0;
  for (const [id, source] of a) {
    volumeA += length(source);
    for (const [lowA, highA] of source)
      for (const [lowB, highB] of b.get(id) ?? [])
        common += Math.max(0, Math.min(highA, highB) - Math.max(lowA, lowB));
  }
  for (const intervals of b.values()) volumeB += length(intervals);
  return common / (volumeA + volumeB - common);
}
