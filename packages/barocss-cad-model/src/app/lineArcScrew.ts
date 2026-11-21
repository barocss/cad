import { buildProfileLoop, CadNumericPolicy, checkBrep, loftSolid } from '@barocss/cad';
import { usesOf, type ModelNode, type SketchNode } from '../engine/doc';
import { canonical } from '../util/revision';

type Point = [number, number];
export type LineArcSegment = { kind: 'line'; start: Point } | { kind: 'arc'; start: Point; center: Point; direction: 'cw' | 'ccw' };

/** A standalone circular-segment source, without geometry that overrides its two segments. */
export function isLineArcSource(node: ModelNode | undefined): node is Extract<SketchNode, { profile: 'loop' }> {
  return node?.kind === 'sketch' && node.profile === 'loop' && !node.suppressed && !node.on
    && !node.association && !node.pocketFloor && !node.outline && !node.slot
    && !node.construction?.length && !node.holes?.length && !node.regions?.length
    && Array.isArray(node.segments) && node.segments.length === 2 && node.segments.filter(segment => segment.kind === 'line').length === 1
    && node.segments.filter(segment => segment.kind === 'arc').length === 1;
}

/** Resolve dimensions before calling; section snapshots themselves contain finite numbers only. */
export function lineArcGeometry(node: ModelNode | undefined): LineArcSegment[] | undefined {
  if (!isLineArcSource(node)) return;
  const finite = (point: unknown): point is Point => Array.isArray(point) && point.length === 2
    && point.every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs);
  const segments: LineArcSegment[] = [];
  for (const segment of node.segments) {
    if (!finite(segment.start)) return;
    const start: Point = [...segment.start];
    if (segment.kind === 'line') segments.push({ kind: 'line', start });
    else {
      if (!finite(segment.center) || (segment.direction !== 'cw' && segment.direction !== 'ccw')) return;
      segments.push({ kind: 'arc', start, center: [...segment.center], direction: segment.direction });
    }
  }
  try { buildProfileLoop(segments); } catch { return; }
  return segments;
}

export function rotateLineArcSegments(segments: readonly LineArcSegment[], radians: number, pivot?: Point): LineArcSegment[] {
  const c = Math.cos(radians), s = Math.sin(radians);
  const rotate = ([x, y]: Point): Point => pivot
    ? [pivot[0] + c * (x - pivot[0]) - s * (y - pivot[1]), pivot[1] + s * (x - pivot[0]) + c * (y - pivot[1])]
    : [c * x - s * y, s * x + c * y];
  return segments.map(segment => segment.kind === 'line'
    ? { kind: 'line', start: rotate(segment.start) }
    : { kind: 'arc', start: rotate(segment.start), center: rotate(segment.center), direction: segment.direction });
}

export function lineArcPoints(segments: readonly LineArcSegment[]): Point[] {
  const arc = segments.find(segment => segment.kind === 'arc');
  return arc?.kind === 'arc' ? [...segments.map(segment => segment.start), arc.center] : [];
}

/** Reuse native circular-segment clearance, signed fit and seam validation without another policy. */
export function nativeLineArcScrew(rows: readonly (readonly LineArcSegment[])[], heights: readonly number[]): boolean {
  return nativeLineArcFamily(rows, heights, false);
}

/** The Kernel independently proves the analytic area centroid for the centered family. */
export function nativeLineArcTurn(rows: readonly (readonly LineArcSegment[])[], heights: readonly number[]): boolean {
  return nativeLineArcFamily(rows, heights, true);
}

function nativeLineArcFamily(rows: readonly (readonly LineArcSegment[])[], heights: readonly number[], centered: boolean): boolean {
  if (rows.length < 7 || rows.length > 16 || heights.length !== rows.length) return false;
  try {
    const loop = buildProfileLoop(rows[0]), arc = loop.segments.find(segment => segment.kind === 'arc');
    if (loop.segments.length !== 2 || arc?.kind !== 'arc') return false;
    // The shared Loft also supports centroid Twists. This consumer requires an exterior Screw.
    const clearance = Math.max(CadNumericPolicy.linearTolerance, CadNumericPolicy.relativeLinearTolerance * 2 * arc.radius);
    if (centered) {
      if (!rows.every(row => {
        const current = buildProfileLoop(row);
        return Math.hypot(current.centroid[0] - loop.centroid[0], current.centroid[1] - loop.centroid[1]) <= clearance;
      })) return false;
    } else if (Math.hypot(...arc.center) <= arc.radius + clearance) return false;
    const sides = 1 + Math.max(1, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 2) - 1e-9));
    const { brep } = loftSolid({ id: 'line-arc-screw', name: 'line-arc-screw', smooth: true,
      sections: rows.map((profile, i) => ({ profile, z: heights[i] })) });
    const walls = brep.faces.filter(face => face.surface.kind === 'surface' && face.surface.degreeV === 3);
    const rails = brep.edges.filter(edge => edge.curve.degree === 3);
    return brep.faces.length === sides + 2 && brep.edges.length === 3 * sides && brep.vertices.length === 2 * sides
      && walls.length === sides && rails.length === sides
      && walls.filter(face => face.surface.kind === 'surface' && face.surface.degreeU === 1).length === 1
      && walls.every(face => face.surface.kind === 'surface'
        && face.surface.controlPoints.every(column => column.length === rows.length))
      && rails.every(edge => edge.curve.controlPoints.length === rows.length && edge.curve.weights.every(weight => weight === 1))
      && checkBrep(brep, { strict: true }).valid;
  } catch { return false; }
}

/** Recognize only intact generated snapshots; the current source dimensions do not drive them. */
function recognizeLineArcSections(nodes: readonly ModelNode[], index: number, centered: boolean) {
  const loft = nodes[index];
  if (loft?.kind !== 'loft' || !loft.smooth || loft.suppressed || loft.guide || loft.guides
    || loft.from?.length !== 1 || loft.sections.length < 7 || loft.sections.length > 16) return;
  const start = index - loft.sections.length, last = loft.sections.length - 1;
  const heights = loft.sections.map(({ z }) => typeof z === 'number' ? z : NaN);
  const height = heights[last];
  if (loft.from[0] >= start || !isLineArcSource(nodes[loft.from[0]])
    || !Number.isFinite(height) || height <= 0 || heights[0] !== 0
    || loft.sections.some((section, i) => section.sketch !== start + i || Object.hasOwn(section, 'frame')
      || !Number.isFinite(heights[i]) || Math.abs(heights[i] / height - i / last) > 1e-9)
    || nodes.slice(0, index).some(node => usesOf(node, nodes).some(ref => ref >= start && ref < index))) return;
  const profiles: LineArcSegment[][] = [], rows: Point[][] = [];
  let plane: string | undefined;
  for (const section of loft.sections) {
    const copy = nodes[section.sketch], segments = lineArcGeometry(copy);
    if (!segments || copy.kind !== 'sketch' || !copy.plane) return;
    const { origin, normal, xAxis } = copy.plane;
    if ([origin, normal, xAxis].some(vector => !Array.isArray(vector) || vector.length !== 3
      || vector.some(value => typeof value !== 'number' || !Number.isFinite(value)))
      || origin.some(value => Math.abs(value) > CadNumericPolicy.coordinateAbs)) return;
    const normalLength = Math.hypot(...normal), xLength = Math.hypot(...xAxis);
    if (normalLength <= 1e-12 || xLength <= 1e-12
      || Math.abs(normal.reduce((sum, value, i) => sum + value * xAxis[i], 0) / (normalLength * xLength)) > 1e-9) return;
    const current = canonical(copy.plane);
    if (plane !== undefined && current !== plane) return;
    plane = current;
    profiles.push(segments);
    rows.push(lineArcPoints(segments));
  }
  const first = rows[0], pivot: Point = centered ? [...buildProfileLoop(profiles[0]).centroid] : [0, 0];
  const initial = centered ? first.map(([x, y]): Point => [x - pivot[0], y - pivot[1]]) : first;
  const reference = initial.reduce((best, point, i) => Math.hypot(...point) > Math.hypot(...initial[best]) ? i : best, 0);
  const phase = ([x, y]: Point, [u, v]: Point) => Math.atan2(x * v - y * u, x * u + y * v);
  const axes = rows.map(row => centered ? [row[reference][0] - pivot[0], row[reference][1] - pivot[1]] as Point : row[reference]);
  const accumulated = axes.slice(1).reduce((sum, axis, i) => sum + phase(axes[i], axis), 0);
  const principal = phase(axes[0], axes[last]);
  const radians = principal + 2 * Math.PI * Math.round((accumulated - principal) / (2 * Math.PI));
  const angle = Number((radians * 180 / Math.PI).toPrecision(12)), limit = 30 * last;
  const tolerance = 64 * Number.EPSILON * Math.max(1, ...first.flat().map(Math.abs));
  if (angle === 0 || Math.abs(angle) > limit || !rows.every((points, i) => {
    const expected = lineArcPoints(rotateLineArcSegments(profiles[0], radians * (i / last), centered ? pivot : undefined));
    return profiles[i].every((segment, j) => {
      const original = profiles[0][j];
      return segment.kind === original.kind
        && (segment.kind !== 'arc' || (original.kind === 'arc' && segment.direction === original.direction));
    })
      && points.every(([x, y], j) => Math.hypot(x - expected[j][0], y - expected[j][1]) <= tolerance);
  }) || !(centered ? nativeLineArcTurn(profiles, heights) : nativeLineArcScrew(profiles, heights))) return;
  return { start, last, first, rows, height, angle, radians, limit, segments: profiles[0],
    pivot, circularSegment: true as const, triangular: false as const, convexPolygon: false as const, external: !centered };
}

// History drafts are immutable. Field discovery and getters share one native proof per scope.
type LineArcSections = ReturnType<typeof recognizeLineArcSections>;
const sectionCache = new WeakMap<readonly ModelNode[], Map<number, LineArcSections>>();
const centeredCache = new WeakMap<readonly ModelNode[], Map<number, LineArcSections>>();

function cachedLineArcSections(nodes: readonly ModelNode[], index: number, centered: boolean) {
  const cache = centered ? centeredCache : sectionCache;
  let entries = cache.get(nodes);
  if (!entries) { entries = new Map(); cache.set(nodes, entries); }
  if (!entries.has(index)) entries.set(index, recognizeLineArcSections(nodes, index, centered));
  return entries.get(index);
}

export function lineArcScrewSections(nodes: readonly ModelNode[], index: number) {
  return cachedLineArcSections(nodes, index, false);
}

export function lineArcTurnSections(nodes: readonly ModelNode[], index: number) {
  return cachedLineArcSections(nodes, index, true);
}

export function hasLineArcScrewSections(nodes: readonly ModelNode[], index: number): boolean {
  return !!lineArcScrewSections(nodes, index);
}

export function hasLineArcTurnSections(nodes: readonly ModelNode[], index: number): boolean {
  return !!lineArcTurnSections(nodes, index);
}
