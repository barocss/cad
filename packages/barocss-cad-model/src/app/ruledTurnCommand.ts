import { CadNumericPolicy, ExtrudedProfileLimits } from '@barocss/cad';
import { convexPolygonScrewAxisTolerance } from '@barocss/cad/internal/convex-polygon-screw-axis';
import { triangleClearsScrewAxis } from '@barocss/cad/internal/triangular-screw-axis';
import { withNode, type SketchNode, type StudioDoc } from '../engine/doc';
import type { Vec3 } from '../engine/mesh';
import { refusal } from '../engine/refusal';
import { add, cross, dot, len, scale, sub, unit } from '../engine/vec3';
import type { SketchPlane } from '../sketch/plane';
import { resolveSketchDims } from '../sketch/reopen';
import type { Command, Ctx } from './commands';
import { planeOf } from './profiles';
import { rectangularAxisClearance, rotateTurnCorners, rotateTurnPoints, triangleTurnCentre } from './smoothLoftTurn';

const maximumAngle = 450;
const selectRectangle = 'Select one standalone rectangular sketch without holes or separate regions.';
const selectSmoothProfile = 'Select one standalone rectangular or straight triangular sketch without holes or separate regions.';
type TurnProfile = Extract<SketchNode, { profile: 'rectangle' | 'polygon' }>;
type Point = [number, number];

function turnSource({ doc, selection }: Ctx, smooth: boolean, allowConvexPolygons = false): { index: number; sketch: TurnProfile; plane: SketchPlane } | undefined {
  const [index, ...others] = selection.sketches ?? [];
  const sketch = doc.nodes[index];
  if (others.length || selection.bodies.length || selection.faces.length || selection.edges.length || selection.profileRegions
    || selection.vertices?.length
    || sketch?.kind !== 'sketch' || sketch.suppressed || sketch.on
    || sketch.association || sketch.pocketFloor || sketch.holes?.length || sketch.regions?.length) return;
  if (sketch.profile !== 'rectangle' && (!smooth || sketch.profile !== 'polygon'
    || (sketch.points.length !== 3 && (!allowConvexPolygons || sketch.points.length < 4 || sketch.points.length > ExtrudedProfileLimits.segments))
    || sketch.construction?.length || sketch.outline?.bulges?.some(Boolean) || sketch.outline?.circles?.length
    || sketch.outline?.spline || sketch.outline?.ellipse)) return;
  const stored = planeOf(sketch);
  if (sketch.profile === 'polygon' && !stored.origin.every(Number.isFinite)) return;
  const normalLength = len(stored.normal), xLength = len(stored.xAxis);
  if (!Number.isFinite(normalLength) || !Number.isFinite(xLength) || normalLength <= 1e-12 || xLength <= 1e-12) return;
  // Saved sketch directions can carry scale. The native sketch frame uses unit axes.
  const normal = unit(stored.normal), x = unit(stored.xAxis), projection = dot(normal, x);
  if (Math.abs(projection) > 1e-9) return;
  const plane = { origin: stored.origin, normal, xAxis: unit(sub(x, scale(normal, projection))) };
  return { index, sketch, plane };
}

function straightCorners(sketch: Extract<SketchNode, { profile: 'polygon' }>, reason: string): Point[] {
  const points = sketch.points as Point[];
  if (points.some(point => !point.every(Number.isFinite))
    || (sketch.outline && (sketch.outline.points.length !== points.length
      || sketch.outline.points.some((point, i) => point.some((value, j) => value !== points[i][j])))))
    throw refusal('VALUE', reason);
  return points;
}

function triangleCorners(sketch: Extract<SketchNode, { profile: 'polygon' }>): Point[] {
  const points = straightCorners(sketch, 'Use three finite straight corners that match the sketch outline.');
  const [a, b, c] = points;
  const u: Point = [b[0] - a[0], b[1] - a[1]], v: Point = [c[0] - a[0], c[1] - a[1]];
  const span = Math.max(Math.hypot(...u), Math.hypot(...v), Math.hypot(c[0] - b[0], c[1] - b[1]));
  const tol = Math.max(CadNumericPolicy.linearTolerance, CadNumericPolicy.relativeLinearTolerance * span);
  if (Math.abs(u[0] * v[1] - u[1] * v[0]) <= tol * span)
    throw refusal('VALUE', 'Use a triangle with three distinct corners and positive area.');
  return points;
}

function rectangleCorners(sketch: Extract<SketchNode, { profile: 'rectangle' }>): Point[] {
  const min: Point = [Number(sketch.min[0]), Number(sketch.min[1])];
  const max: Point = [Number(sketch.max[0]), Number(sketch.max[1])];
  if (![...min, ...max].every(Number.isFinite) || max[0] <= min[0] || max[1] <= min[1])
    throw refusal('VALUE', 'Use a rectangle with positive width and depth.');
  return [min, [max[0], min[1]], max, [min[0], max[1]]];
}

function smoothLoft(doc: StudioDoc, index: number, plane: SketchPlane, corners: Point[], centre: Point | undefined,
  height: number, angle: number): StudioDoc {
  const spans = Math.max(6, Math.ceil(Math.abs(angle) / 30)), sections = [];
  for (let station = 0; station <= spans; station++) {
    const fraction = station / spans;
    const radians = angle * fraction * (Math.PI / 180);
    const points = station === 0 ? corners : centre ? rotateTurnPoints(corners, centre, radians) : rotateTurnCorners(corners, radians);
    sections.push({ sketch: doc.nodes.length, z: height * fraction });
    doc = withNode(doc, { kind: 'sketch', profile: 'loop', segments: points.map(start => ({ kind: 'line', start })), plane });
  }
  return withNode(doc, { kind: 'loft', sections, from: [index], smooth: true });
}

function turnCommand(smooth: boolean): Command {
  const chooseSource = smooth ? selectSmoothProfile : selectRectangle;
  return {
    id: smooth ? 'smooth-turn' : 'ruled-turn', label: smooth ? 'Smooth Turn' : 'Ruled Turn',
    icon: 'cad-loft', group: 'create', keywords: 'loft twist rotate sections',
    hint: smooth ? 'Create a smooth Loft from one rectangle or straight triangle.' : 'Create a ruled Loft from rotated copies of one rectangular sketch.',
    available: ctx => turnSource(ctx, smooth) ? { ok: true } : { ok: false, reason: chooseSource },
    fields: () => [
      { key: 'height', label: 'Height', kind: 'mm', min: 0, max: CadNumericPolicy.coordinateAbs },
      { key: 'angle', label: 'Turn angle', kind: 'deg', min: -maximumAngle, max: maximumAngle },
    ],
    defaults: () => ({ height: 40, angle: 360 }),
    build: (ctx, { height, angle }) => {
      const source = turnSource(ctx, smooth);
      if (!source) throw refusal('VALUE', chooseSource);
      if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0 || height > CadNumericPolicy.coordinateAbs)
        throw refusal('VALUE', `Enter a Height above 0 and at most ${CadNumericPolicy.coordinateAbs} mm.`);
      if (typeof angle !== 'number' || !Number.isFinite(angle) || Math.abs(angle) > maximumAngle)
        throw refusal('VALUE', `Enter a Turn angle from −${maximumAngle}° to ${maximumAngle}°.`);

      // Like an ordinary Loft, this snapshots the current sketch dimensions in its own section copies.
      const sketch = resolveSketchDims(source.sketch, ctx.doc.parameters) as TurnProfile;
      const corners = sketch.profile === 'rectangle' ? rectangleCorners(sketch) : triangleCorners(sketch);
      const [min, , max] = corners;
      const centre = sketch.profile === 'polygon' ? triangleTurnCentre(corners) : undefined;
      const { plane } = source;
      if (smooth) return smoothLoft(ctx.doc, source.index, plane, corners, centre, height, angle);
      const yAxis = cross(plane.normal, plane.xAxis);
      const spans = Math.max(1, Math.ceil(Math.abs(angle) / 90));
      const sections = [], controlPoints: Vec3[] = [];
      let doc = ctx.doc;
      for (let station = 0; station <= spans; station++) {
        const fraction = station / spans, z = height * fraction;
        const radians = angle * fraction * (Math.PI / 180);
        const points = station === 0 ? corners : rotateTurnCorners(corners, radians);
        const [u, v] = points[0];
        const point = add(plane.origin, add(scale(plane.xAxis, u), scale(yAxis, v)));
        controlPoints.push(add(point, scale(plane.normal, z)));
        sections.push({ sketch: doc.nodes.length, z });
        doc = withNode(doc, station === 0
          ? { kind: 'sketch', profile: 'rectangle', min, max, plane }
          : { kind: 'sketch', profile: 'loop', segments: points.map(start => ({ kind: 'line', start })), plane });
      }
      const loft = { kind: 'loft' as const, sections, from: [source.index] };
      const knots = [0, ...sections.map((_, index) => index), spans];
      return withNode(doc, { ...loft, guide: { kind: 'nurbs', degree: 1, knots, controlPoints } });
    },
  };
}

export const ruledTurnCommand = turnCommand(false);
export const smoothTurnCommand = turnCommand(true);

const selectScrewProfile = 'Select one standalone rectangle, triangle or convex polygon with straight edges and no holes.';

function screwSource(ctx: Ctx) {
  const source = turnSource(ctx, true, true);
  const sketch = source?.sketch;
  if (!source || !sketch || sketch.construction?.length
    || sketch.outline?.bulges?.some(Boolean) || sketch.outline?.circles?.length
    || sketch.outline?.spline || sketch.outline?.ellipse || !source.plane.origin.every(Number.isFinite)) return;
  return source;
}

export const smoothScrewCommand: Command = {
  id: 'smooth-screw', label: 'Smooth Screw', icon: 'cad-loft', group: 'create', keywords: 'screw helix helical pitch external axis',
  hint: 'Rotate one straight convex outline about an external axis normal to its plane.',
  available: ctx => screwSource(ctx) ? { ok: true } : { ok: false, reason: selectScrewProfile },
  fields: () => [
    { key: 'axisX', label: 'Axis X', kind: 'mm', min: -CadNumericPolicy.coordinateAbs, max: CadNumericPolicy.coordinateAbs },
    { key: 'axisY', label: 'Axis Y', kind: 'mm', min: -CadNumericPolicy.coordinateAbs, max: CadNumericPolicy.coordinateAbs },
    { key: 'pitch', label: 'Pitch per revolution', kind: 'mm', min: 0, max: CadNumericPolicy.coordinateAbs },
    { key: 'angle', label: 'Turn angle', kind: 'deg', min: -maximumAngle, max: maximumAngle },
  ],
  defaults: () => ({ axisX: 0, axisY: 0, pitch: 40, angle: 360 }),
  build: (ctx, { axisX, axisY, pitch, angle }) => {
    const source = screwSource(ctx);
    if (!source) throw refusal('VALUE', selectScrewProfile);
    const limit = CadNumericPolicy.coordinateAbs;
    if (typeof axisX !== 'number' || typeof axisY !== 'number' || !Number.isFinite(axisX) || !Number.isFinite(axisY)
      || Math.abs(axisX) > limit || Math.abs(axisY) > limit)
      throw refusal('VALUE', 'Enter finite Axis X and Axis Y coordinates within the model range.');
    if (typeof pitch !== 'number' || !Number.isFinite(pitch) || pitch <= 0 || pitch > limit)
      throw refusal('VALUE', 'Enter a positive pitch within the model range.');
    if (typeof angle !== 'number' || !Number.isFinite(angle) || angle === 0 || Math.abs(angle) > maximumAngle)
      throw refusal('VALUE', 'Enter a nonzero Turn angle from −450° to +450°.');
    const height = Math.abs(angle) / 360 * pitch;
    if (height <= CadNumericPolicy.linearTolerance || height > limit)
      throw refusal('VALUE', 'Pitch and Turn angle must give an axial height within the model range.');
    const sketch = resolveSketchDims(source.sketch, ctx.doc.parameters) as TurnProfile;
    const triangular = sketch.profile === 'polygon' && sketch.points.length === 3;
    const corners = sketch.profile === 'rectangle' ? rectangleCorners(sketch)
      : triangular ? triangleCorners(sketch) : straightCorners(sketch, 'Use finite straight corners that match the sketch outline.');
    const local = corners.map(([x, y]): Point => [x - axisX, y - axisY]);
    if (sketch.profile === 'rectangle') {
      if (rectangularAxisClearance(corners[0], corners[2], [axisX, axisY]) <= CadNumericPolicy.linearTolerance)
        throw refusal('VALUE', 'Place the Screw axis outside the rectangle.');
    } else if (triangular) {
      if (!triangleClearsScrewAxis(local)) throw refusal('VALUE', 'Place the Screw axis outside the triangle with clearance.');
    } else if (convexPolygonScrewAxisTolerance(local) === undefined) {
      throw refusal('VALUE', 'Use a strictly convex polygon and place the Screw axis outside it with clearance.');
    }
    if (local.some(point => Math.hypot(...point) > limit))
      throw refusal('VALUE', 'Move the Screw axis closer to the profile.');
    const { plane } = source, yAxis = cross(plane.normal, plane.xAxis);
    const origin = add(plane.origin, add(scale(plane.xAxis, axisX), scale(yAxis, axisY)));
    return smoothLoft(ctx.doc, source.index, { ...plane, origin }, local, [0, 0], height, angle);
  },
};
