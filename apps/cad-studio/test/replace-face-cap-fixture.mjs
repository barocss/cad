const unit = vector => vector.map(value => value / Math.hypot(...vector));
const hexagon = { points: [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]], area: 384, center: [9, 8] };
const pentagon = { points: hexagon.points.slice(0, 5), area: 336, center: [74 / 7, 8] };
const heptagon = { points: [...hexagon.points.slice(0, 5), [-5, 12], hexagon.points[5]], area: 392 };
const trapezoid = { points: [[0, 0], [18, 0], [24, 16], [0, 16]], area: 336, center: [74 / 7, 176 / 21] };
export const REPLACE_FACE_VARIANTS = [
  'height', 'diagonal', 'upper', 'lower', 'drafted-upper', 'drafted-lower', 'drafted-wall',
  'hex-upper', 'hex-lower', 'hex-wall', 'hex-wall-turn', 'hex-wall-turn-tilt', 'pentagon-upper', 'heptagon-wall',
  'trapezoid-upper', 'trapezoid-wall', 'bored-upper', 'bored-lower', 'cylinder-upper', 'cylinder-lower', 'tube-upper', 'tube-lower',
];

export function replaceFaceLayout(cap) {
  const stock = cap?.bore ? 2 : 1, donorSketch = stock + 1, donorExtrude = stock + 2, donorMove = stock + 3, edit = stock + 4;
  return { donorSketch, donorExtrude, donorMove, edit, stockBody: `b${stock}`, donorBody: `b${donorMove}`, editedBody: `b${edit}` };
}

export function polygonWallCase(variant) {
  const trapezoidal = variant === 'trapezoid-wall';
  if (!variant.startsWith('hex-wall') && variant !== 'heptagon-wall' && !trapezoidal) return;
  const stock = trapezoidal ? trapezoid : variant === 'heptagon-wall' ? heptagon : hexagon;
  const xCoefficient = trapezoidal ? 8 : 4;
  const side = variant === 'hex-wall' ? 3 : 2;
  const slope = variant === 'hex-wall-turn' ? 0 : 4 / 5;
  const donorNormal = [-xCoefficient, side, slope];
  const origin = [18 + 60 * side / xCoefficient, 60, 0], normal = unit(donorNormal), xAxis = unit([side, xCoefficient, 0]);
  const yAxis = unit([-xCoefficient * slope, side * slope, -(xCoefficient ** 2) - side ** 2]);
  const referencePick = origin.map((value, i) => value + 4 * (xAxis[i] + yAxis[i]));
  const otherPick = referencePick.map((value, i) => value + 3 * normal[i] + (i === 0 ? 2 : 0));
  return {
    stock, referencePick, otherPick, wallPick: trapezoidal ? [21, 8, 5] : [21, 4, 5],
    sketch: { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8], plane: { origin, normal, xAxis } },
    distance: (_y, z) => slope * z / xCoefficient,
    movedDistance: (_y, z) => slope * z / xCoefficient + 2,
    retargetedDistance: (_y, z) => slope * z / xCoefficient + 2 - 3 * Math.hypot(...donorNormal) / xCoefficient,
    section: shift => trapezoidal ? [[0, 0], [18 + shift, 0], [22 + shift, 16], [0, 16]] :
      polygonWallSection(shift, side, stock.points),
    collapse: trapezoidal ? -18 : 12 - 5 * slope / 2,
  };
}

// Intersect 4x - side*y = 72 + 4*shift with y = 0 and 4x + 3y = 120.
function polygonWallSection(shift, side, points) {
  const y = (48 - 4 * shift) / (side + 3);
  return [points[0], [18 + shift, 0], [30 - 3 * y / 4, y], ...points.slice(3)];
}

export function polygonWallOracle(distance, section) {
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
  const drafted = variant.startsWith('drafted-');
  const tube = variant.startsWith('tube-');
  const bore = tube ? { center: [14, 12], radius: 4 } : variant.startsWith('bored-') ? { center: [11, 9], radius: 3 } : undefined;
  const cylinder = tube ? { center: [14, 12], radius: 12 } : variant.startsWith('cylinder-') ? { center: [14, 12], radius: 8 } : undefined;
  const stock = variant.startsWith('hex-') ? hexagon : variant.startsWith('pentagon-') ? pentagon :
    variant.startsWith('trapezoid-') ? trapezoid : undefined;
  const end = variant.replace(/^(?:drafted|hex|pentagon|trapezoid|bored|cylinder|tube)-/, '');
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
    drafted, bore, cylinder, stock, direction,
    name: direction === 1 ? 'Top' : 'Bottom', oppositeName: direction === 1 ? 'Bottom' : 'Top',
    face: direction === 1 ? 'n1.top' : 'n1.bottom', station, opposite, moved,
    // On the drafted underside the fixed upper corner is (1, 1, 10).
    collapse: cylinder ? -(height(...cylinder.center) - opposite) + direction * cylinder.radius * Math.hypot(0.1, 0.2) :
      drafted && direction === -1 ? 8.3 : -8 * direction,
    sketch: { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8], plane: { origin, normal, xAxis } },
    referencePick, otherPick, height,
    movedHeight: (x, y) => height(x, y) + moved,
    retargetedHeight: (x, y) => height(x, y) + moved + direction * 3 * Math.sqrt(105) / 10,
    centroid: stock === hexagon ? [332 / 35, 376 / 45, direction === 1 ? 8363 / 1575 : 7387 / 1575] :
      stock === pentagon ? [4077 / 373, 9368 / 1119, 120487 / 22380] :
      stock === trapezoid ? [12399 / 1127, 9932 / 1127, 17489 / 3220] : [820 / 39, 210 / 13, direction === 1 ? 20 / 3 : 10 / 3],
  };
}

// Integrate affine thickness and its first moments over 40 × 30 mm stock minus the circular bore.
export function boredCapOracle(cap, support) {
  const { direction, opposite, bore: { center: [cx, cy], radius } } = cap;
  const hole = Math.PI * radius ** 2, area = 1200 - hole;
  const x = 24000 - hole * cx, y = 18000 - hole * cy;
  const xx = 640000 - hole * (cx ** 2 + radius ** 2 / 4);
  const yy = 360000 - hole * (cy ** 2 + radius ** 2 / 4);
  const xy = 360000 - hole * cx * cy;
  const h = (support(0, 0) - opposite) * direction;
  const dx = (support(1, 0) - support(0, 0)) * direction, dy = (support(0, 1) - support(0, 0)) * direction;
  const volume = h * area + dx * x + dy * y;
  const square = h ** 2 * area + 2 * h * (dx * x + dy * y) + dx ** 2 * xx + 2 * dx * dy * xy + dy ** 2 * yy;
  return { volume, centroid: [(h * x + dx * xx + dy * xy) / volume, (h * y + dx * xy + dy * yy) / volume,
    opposite + direction * square / (2 * volume)] };
}

export function cylinderCapOracle(cap, support) {
  const { direction, opposite, cylinder: { center: [x, y], radius } } = cap;
  const innerSquared = (cap.bore?.radius ?? 0) ** 2;
  const h = (support(x, y) - opposite) * direction, variance = (radius ** 2 + innerSquared) / 4;
  const dx = (support(x + 1, y) - support(x, y)) * direction;
  const dy = (support(x, y + 1) - support(x, y)) * direction;
  return { volume: Math.PI * (radius ** 2 - innerSquared) * h, centroid: [x + variance * dx / h, y + variance * dy / h,
    opposite + direction * (h ** 2 + variance * (dx ** 2 + dy ** 2)) / (2 * h)] };
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
