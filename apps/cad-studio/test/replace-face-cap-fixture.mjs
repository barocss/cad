const unit = vector => vector.map(value => value / Math.hypot(...vector));

/** A box cap and a separate 8 × 8 × 3 mm reference extruded from the exact tilted plane. */
export function capCase(variant) {
  const drafted = variant.startsWith('drafted-'), end = variant.replace(/^drafted-/, '');
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
    drafted, direction,
    name: direction === 1 ? 'Top' : 'Bottom', oppositeName: direction === 1 ? 'Bottom' : 'Top',
    face: direction === 1 ? 'n1.top' : 'n1.bottom', station, opposite, moved,
    // On the drafted underside the fixed upper corner is (1, 1, 10).
    collapse: drafted && direction === -1 ? 8.3 : -8 * direction,
    sketch: { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8], plane: { origin, normal, xAxis } },
    referencePick, otherPick, height,
    movedHeight: (x, y) => height(x, y) + moved,
    retargetedHeight: (x, y) => height(x, y) + moved + direction * 3 * Math.sqrt(105) / 10,
    centroid: [820 / 39, 210 / 13, direction === 1 ? 20 / 3 : 10 / 3],
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
