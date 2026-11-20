const unit = vector => vector.map(value => value / Math.hypot(...vector));
export const HEX_CAP_FOOTPRINT = [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]];
export const REPLACE_FACE_VARIANTS = [
  'height', 'diagonal', 'upper', 'lower', 'drafted-upper', 'drafted-lower', 'drafted-wall',
  'hex-upper', 'hex-lower', 'hex-wall', 'hex-wall-turn', 'hex-wall-turn-tilt',
];

export function hexWallCase(variant) {
  if (!variant.startsWith('hex-wall')) return;
  const side = variant === 'hex-wall' ? 3 : 2;
  const slope = variant === 'hex-wall-turn' ? 0 : 4 / 5;
  const donorNormal = [-4, side, slope];
  const origin = [18 + 15 * side, 60, 0], normal = unit(donorNormal), xAxis = unit([side, 4, 0]);
  const yAxis = unit([-4 * slope, side * slope, -16 - side ** 2]);
  const referencePick = origin.map((value, i) => value + 4 * (xAxis[i] + yAxis[i]));
  const otherPick = referencePick.map((value, i) => value + 3 * normal[i] + (i === 0 ? 2 : 0));
  return {
    referencePick, otherPick,
    sketch: { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8], plane: { origin, normal, xAxis } },
    distance: (_y, z) => slope * z / 5,
    movedDistance: (_y, z) => slope * z / 5 + 8 / 5,
    retargetedDistance: (_y, z) => slope * z / 5 + 8 / 5 - 3 * Math.hypot(...donorNormal) / 5,
    section: distance => hexWallSection(distance, side),
    collapse: 12 - 5 * slope / 2,
  };
}

// The new wall is 4x - side*y = 72 + 5d. Intersect it with y = 0 and 4x + 3y = 120.
function hexWallSection(d, side) {
  const y = (48 - 5 * d) / (side + 3);
  return [HEX_CAP_FOOTPRINT[0], [18 + 5 * d / 4, 0], [30 - 3 * y / 4, y], ...HEX_CAP_FOOTPRINT.slice(3)];
}

export function hexWallOracle(distance, section) {
  const stations = [0, 5, 10].map(z => {
    const points = section(distance(0, z));
    const sums = points.reduce(([area, x, y], p, i) => {
      const q = points[(i + 1) % points.length], cross = p[0] * q[1] - p[1] * q[0];
      return [area + cross / 2, x + (p[0] + q[0]) * cross / 6, y + (p[1] + q[1]) * cross / 6];
    }, [0, 0, 0]);
    return [...sums, z * sums[0]];
  });
  // Each sectional moment is at most cubic in Z, so Simpson integration is exact.
  const [volume, ...moment] = stations[0].map((v, i) => 10 * (v + 4 * stations[1][i] + stations[2][i]) / 6);
  return { volume, centroid: moment.map(value => value / volume) };
}

/** A stock cap and a separate 8 × 8 × 3 mm reference extruded from the exact tilted plane. */
export function capCase(variant) {
  const drafted = variant.startsWith('drafted-'), hex = variant.startsWith('hex-');
  const end = variant.replace(/^(?:drafted|hex)-/, '');
  if (end !== 'upper' && end !== 'lower') return;
  const direction = end === 'upper' ? 1 : -1;
  const station = direction === 1 ? 10 : 0, opposite = 10 - station;
  const origin = [0, 60, opposite + direction * 20];
  const normal = unit([-1, -2, direction * 10]), xAxis = unit([10, 0, direction]);
  const yAxis = unit([-2 * direction, 101 * direction, 20]);
  const referencePick = origin.map((value, i) => value + 4 * (xAxis[i] + yAxis[i]));
  const moved = 2 * direction;
  const otherPick = referencePick.map((value, i) => value + 3 * normal[i] + (i === 2 ? moved : 0));
  const height = (x, y) => opposite + direction * (8 + x / 10 + y / 5);
  return {
    drafted, hex, direction,
    name: direction === 1 ? 'Top' : 'Bottom', oppositeName: direction === 1 ? 'Bottom' : 'Top',
    face: direction === 1 ? 'n1.top' : 'n1.bottom', station, opposite, moved,
    // On the drafted underside the fixed upper corner is (1, 1, 10).
    collapse: drafted && direction === -1 ? 8.3 : -8 * direction,
    sketch: { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8], plane: { origin, normal, xAxis } },
    referencePick, otherPick, height,
    movedHeight: (x, y) => height(x, y) + moved,
    retargetedHeight: (x, y) => height(x, y) + moved + direction * 3 * Math.sqrt(105) / 10,
    centroid: hex ? [332 / 35, 376 / 45, direction === 1 ? 8363 / 1575 : 7387 / 1575] :
      [820 / 39, 210 / 13, direction === 1 ? 20 / 3 : 10 / 3],
  };
}

// Independent physical oracle for this fixed fixture. Each corner follows its measured
// 1:10 wall slopes. Integrate the signed tetrahedra of the resulting six planar faces.
export function draftedCapOracle(cap, support) {
  const footprint = [[0, 0], [40, 0], [40, 30], [0, 30]];
  const corner = (x, y, z) => [x + (x === 0 ? z : -z) / 10, y + (y === 0 ? z : -z) / 10, z];
  const fixed = footprint.map(([x, y]) => corner(x, y, cap.opposite));
  const moving = footprint.map(([x, y]) => {
    const slope = (x === 0 ? 1 : -1) / 100 + (y === 0 ? 1 : -1) / 50;
    return corner(x, y, support(x, y) / (1 - cap.direction * slope));
  });
  const vertices = cap.direction === 1 ? [...fixed, ...moving] : [...moving, ...fixed];
  const faces = [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  let volume = 0;
  const moment = [0, 0, 0];
  for (const face of faces) {
    const [a, b, c, d] = face.map(index => vertices[index]);
    for (const [q, r] of [[b, c], [c, d]]) {
      const v = (a[0] * (q[1] * r[2] - q[2] * r[1]) + a[1] * (q[2] * r[0] - q[0] * r[2]) + a[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
      volume += v;
      for (let axis = 0; axis < 3; axis++) moment[axis] += v * (a[axis] + q[axis] + r[axis]) / 4;
    }
  }
  return { moving, volume, centroid: moment.map(value => value / volume) };
}

/** Integrate the drafted wall witness by three horizontal sections. The area is quadratic in Z. */
export function draftedWallVolume(support) {
  const area = z => (30 - z / 5) * (support(15, z) - z / 10);
  return 10 * (area(0) + 4 * area(5) + area(10)) / 6;
}
