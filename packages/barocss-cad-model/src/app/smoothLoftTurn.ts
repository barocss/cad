import { CadNumericPolicy } from '@barocss/cad';
import { usesOf, type ModelNode } from '../engine/doc';
import { canonical } from '../util/revision';
import type { EditField } from './editFields';
import { smoothLoftHeightField } from './smoothLoftHeight';

type Point = [number, number];
export const smoothTurnAngleKey = 'smoothTurnAngle';
export const smoothTurnWidthKey = 'smoothTurnWidth';
export const smoothScrewPitchKey = 'smoothScrewPitch';
export const smoothTurnWidthBounds = { min: CadNumericPolicy.linearTolerance, max: CadNumericPolicy.coordinateAbs };
export const smoothTurnWidthInvalid = (value: number) =>
  !Number.isFinite(value) || value <= smoothTurnWidthBounds.min || value > smoothTurnWidthBounds.max;
export const smoothTurnAngleLimit = (sectionCount: number) => 30 * (sectionCount - 1);

export function rotateTurnCorners(corners: readonly Point[], radians: number): Point[] {
  const cx = (corners[0][0] + corners[2][0]) / 2, cy = (corners[0][1] + corners[2][1]) / 2;
  return rotateTurnPoints(corners, [cx, cy], radians);
}

export function rotateTurnPoints(corners: readonly Point[], [cx, cy]: Point, radians: number): Point[] {
  const c = Math.cos(radians), s = Math.sin(radians);
  return corners.map(([px, py]) => {
    const x = px - cx, y = py - cy;
    return [cx + c * x - s * y, cy + s * x + c * y];
  });
}

export function triangleTurnCentre([a, b, c]: readonly Point[]): Point {
  return [a[0] + ((b[0] - a[0]) + (c[0] - a[0])) / 3, a[1] + ((b[1] - a[1]) + (c[1] - a[1])) / 3];
}

export function rectangularAxisClearance(min: Point, max: Point, axis: Point): number {
  return Math.hypot(Math.max(min[0] - axis[0], 0, axis[0] - max[0]),
    Math.max(min[1] - axis[1], 0, axis[1] - max[1]));
}

function copyGeometry(copy: ModelNode | undefined, corners: number): { points: Point[]; plane: string } | undefined {
  if (copy?.kind !== 'sketch' || copy.profile !== 'loop' || copy.suppressed || !copy.plane
    || copy.on || copy.association || copy.pocketFloor || copy.outline || copy.regions?.length || copy.holes?.length
    || copy.construction?.length || copy.segments.length !== corners) return;
  const points: Point[] = [];
  for (const segment of copy.segments) {
    const [x, y] = segment.start;
    if (segment.kind !== 'line' || typeof x !== 'number' || typeof y !== 'number'
      || !Number.isFinite(x) || !Number.isFinite(y)) return;
    points.push([x, y]);
  }
  return { points, plane: canonical(copy.plane) };
}

const diagonal = (points: Point[]): Point => [points[2][0] - points[0][0], points[2][1] - points[0][1]];
const phase = ([x, y]: Point, [u, v]: Point) => Math.atan2(x * v - y * u, x * u + y * v);

/** Recognize a generated turn from its section copies and their whole ordered geometry. */
function turnSections(nodes: readonly ModelNode[], index: number) {
  const loft = nodes[index];
  if (loft?.kind !== 'loft' || !loft.smooth || loft.suppressed
    || loft.guide || loft.guides || loft.from?.length !== 1 || loft.sections.length < 7 || loft.sections.length > 16) return;
  const start = index - loft.sections.length, source = nodes[loft.from[0]], last = loft.sections.length - 1;
  const height = loft.sections[last].z;
  if (loft.from[0] >= start || source?.kind !== 'sketch'
    || (source.profile !== 'rectangle' && (source.profile !== 'polygon' || source.points.length !== 3))
    || typeof height !== 'number' || !Number.isFinite(height) || height <= 0 || loft.sections[0].z !== 0
    || loft.sections.some((section, i) => section.sketch !== start + i || Object.hasOwn(section, 'frame')
      || typeof section.z !== 'number' || !Number.isFinite(section.z) || Math.abs(section.z / height - i / last) > 1e-9)) return;
  if (nodes.slice(0, index).some(node => usesOf(node, nodes).some(ref => ref >= start && ref < index))) return;
  const triangular = source.profile === 'polygon';
  const corners = triangular ? 3 : 4;
  const base = copyGeometry(nodes[start], corners);
  if (!base) return;
  const { points: first, plane } = base;
  if (!triangular && (first[1][0] <= first[0][0] || first[2][1] <= first[0][1]
    || first[1][1] !== first[0][1] || first[3][0] !== first[0][0]
    || first[1][0] !== first[2][0] || first[3][1] !== first[2][1])) return;
  const centre = triangular ? triangleTurnCentre(first) : undefined;

  const rows: Point[][] = [];
  for (const section of loft.sections) {
    const copy = copyGeometry(nodes[section.sketch], corners);
    if (!copy || copy.plane !== plane) return;
    rows.push(copy.points);
  }
  const axes = rows.map(diagonal);
  const accumulated = axes.slice(1).reduce((sum, axis, i) => sum + phase(axes[i], axis), 0);
  const principal = phase(axes[0], axes[last]);
  const radians = principal + 2 * Math.PI * Math.round((accumulated - principal) / (2 * Math.PI));
  const angle = Number((radians * 180 / Math.PI).toPrecision(12));
  const limit = smoothTurnAngleLimit(rows.length);
  if (Math.abs(angle) > limit) return;
  const scale = Math.max(1, ...first.flat().map(Math.abs));
  const tolerance = 64 * Number.EPSILON * scale;
  const matches = (pivot: Point | undefined) => rows.every((points, i) => {
    const rotation = radians * (i / last);
    const expected = pivot ? rotateTurnPoints(first, pivot, rotation) : rotateTurnCorners(first, rotation);
    return points.every(([x, y], j) => Math.hypot(x - expected[j][0], y - expected[j][1]) <= tolerance);
  });
  const externalAxis: Point = [0, 0];
  const external = !matches(centre);
  if (external && (triangular || rectangularAxisClearance(first[0], first[2], externalAxis) <= CadNumericPolicy.linearTolerance
    || !matches(externalAxis))) return;
  return { start, last, first, angle, radians, limit, triangular, external };
}

export function hasSmoothTurnSections(nodes: readonly ModelNode[], index: number): boolean {
  return !!turnSections(nodes, index);
}

export function hasTriangularTurnSections(nodes: readonly ModelNode[], index: number): boolean {
  return turnSections(nodes, index)?.triangular === true;
}

export function hasExternalScrewSections(nodes: readonly ModelNode[], index: number): boolean {
  return turnSections(nodes, index)?.external === true;
}

/** Pitch is editable only on an intact terminal Screw with measurable winding. */
export function smoothScrewTurns(nodes: readonly ModelNode[], index: number): number | undefined {
  if (index !== nodes.length - 1) return;
  const turn = turnSections(nodes, index);
  if (turn?.external && turn.angle !== 0) return Math.abs(turn.angle) / 360;
}

export function smoothScrewPitchAdvance(pitch: number, turns: number): number | undefined {
  const height = pitch * turns;
  if (Number.isFinite(pitch) && pitch > 0 && pitch <= CadNumericPolicy.coordinateAbs
    && height > CadNumericPolicy.linearTolerance && height <= CadNumericPolicy.coordinateAbs) return height;
}

export function smoothScrewPitchField(nodes: readonly ModelNode[], index: number): EditField | undefined {
  const node = nodes[index];
  if (node?.kind !== 'loft' || !smoothScrewTurns(nodes, index)) return;
  const heightField = smoothLoftHeightField(node, index);
  if (heightField?.kind !== 'number') return;
  return {
    kind: 'number', key: smoothScrewPitchKey, label: 'Pitch per revolution', unit: 'mm',
    get: current => {
      const turns = smoothScrewTurns(current, index);
      return turns ? heightField.get(current) / turns : NaN;
    },
    set: (current, pitch) => {
      const turns = smoothScrewTurns(current, index);
      const height = turns && smoothScrewPitchAdvance(pitch, turns);
      return height ? heightField.set(current, height) : [...current];
    },
  };
}

function savedTurn(nodes: readonly ModelNode[], index: number) {
  if (index !== nodes.length - 1) return;
  const turn = turnSections(nodes, index);
  if (turn && !turn.external) return turn;
}

function updateTurnCopies(nodes: readonly ModelNode[], turn: NonNullable<ReturnType<typeof savedTurn>>, first: Point[], rotation: (fraction: number) => number) {
  const centre = turn.triangular ? triangleTurnCentre(first) : undefined;
  return nodes.map((node, i) => {
    const station = i - turn.start;
    if (station < 0 || station > turn.last || (station === 0 && first === turn.first)
      || node.kind !== 'sketch' || node.profile !== 'loop') return node;
    const radians = rotation(station / turn.last);
    const points = station === 0 ? first : centre ? rotateTurnPoints(first, centre, radians) : rotateTurnCorners(first, radians);
    return { ...node, segments: points.map(start => ({ kind: 'line' as const, start })) };
  });
}

export function smoothLoftTurnAngleField(nodes: readonly ModelNode[], index: number): EditField | undefined {
  if (!savedTurn(nodes, index)) return;
  return {
    kind: 'number', key: smoothTurnAngleKey, label: 'Turn angle', unit: '°',
    get: current => savedTurn(current, index)?.angle ?? NaN,
    set: (current, angle) => {
      const turn = savedTurn(current, index);
      if (!turn || !Number.isFinite(angle) || Math.abs(angle) > turn.limit || angle === turn.angle) return [...current];
      return updateTurnCopies(current, turn, turn.first, fraction => angle * fraction * (Math.PI / 180));
    },
  };
}

function turnWidth(corners: readonly Point[]): number {
  return corners[1][0] - corners[0][0];
}

export function smoothLoftTurnWidthField(nodes: readonly ModelNode[], index: number): EditField | undefined {
  const turn = savedTurn(nodes, index);
  if (!turn || turn.triangular) return;
  return {
    kind: 'number', key: smoothTurnWidthKey, label: 'Turn width', unit: 'mm',
    get: current => {
      const turn = savedTurn(current, index);
      return turn && !turn.triangular ? turnWidth(turn.first) : NaN;
    },
    set: (current, width) => {
      const turn = savedTurn(current, index);
      if (!turn || turn.triangular || smoothTurnWidthInvalid(width) || width === turnWidth(turn.first)) return [...current];
      const [[minX, minY], , [maxX, maxY]] = turn.first;
      const centre = (minX + maxX) / 2;
      const left = centre - width / 2, right = centre + width / 2;
      const first: Point[] = [[left, minY], [right, minY], [right, maxY], [left, maxY]];
      return updateTurnCopies(current, turn, first, fraction => turn.radians * fraction);
    },
  };
}
