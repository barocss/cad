const unit = vector => vector.map(value => value / Math.hypot(...vector));

/** A box cap and a separate 8 × 8 × 3 mm reference extruded from the exact tilted plane. */
export function capCase(variant) {
  if (variant !== 'upper' && variant !== 'lower') return;
  const direction = variant === 'upper' ? 1 : -1;
  const station = direction === 1 ? 10 : 0, opposite = 10 - station;
  const origin = [0, 60, opposite + direction * 20];
  const normal = unit([-1, -2, direction * 10]), xAxis = unit([10, 0, direction]);
  const yAxis = unit([-2 * direction, 101 * direction, 20]);
  const referencePick = origin.map((value, i) => value + 4 * (xAxis[i] + yAxis[i]));
  const moved = 2 * direction;
  const otherPick = referencePick.map((value, i) => value + 3 * normal[i] + (i === 2 ? moved : 0));
  const height = (x, y) => opposite + direction * (8 + x / 10 + y / 5);
  return {
    name: direction === 1 ? 'Top' : 'Bottom', oppositeName: direction === 1 ? 'Bottom' : 'Top',
    face: direction === 1 ? 'n1.top' : 'n1.bottom', station, opposite, moved, collapse: -8 * direction,
    sketch: { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [8, 8], plane: { origin, normal, xAxis } },
    referencePick, otherPick, height,
    movedHeight: (x, y) => height(x, y) + moved,
    retargetedHeight: (x, y) => height(x, y) + moved + direction * 3 * Math.sqrt(105) / 10,
    centroid: [820 / 39, 210 / 13, direction === 1 ? 20 / 3 : 10 / 3],
  };
}
