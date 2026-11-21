import { CadNumericPolicy } from '@barocss/cad';
import { withNode, type SketchNode } from '../engine/doc';
import type { Vec3 } from '../engine/mesh';
import { refusal } from '../engine/refusal';
import { add, cross, dot, len, scale, sub, unit } from '../engine/vec3';
import type { SketchPlane } from '../sketch/plane';
import { resolveSketchDims } from '../sketch/reopen';
import type { Command, Ctx } from './commands';
import { planeOf } from './profiles';
import { rotateTurnCorners, rotateTurnPoints, triangleTurnCentre } from './smoothLoftTurn';

const maximumAngle = 450;
const selectRectangle = 'Select one standalone rectangular sketch without holes or separate regions.';
const selectSmoothProfile = 'Select one standalone rectangular or straight triangular sketch without holes or separate regions.';
type TurnProfile = Extract<SketchNode, { profile: 'rectangle' | 'polygon' }>;
type Point = [number, number];

function turnSource({ doc, selection }: Ctx, smooth: boolean): { index: number; sketch: TurnProfile; plane: SketchPlane } | undefined {
  const [index, ...others] = selection.sketches ?? [];
  const sketch = doc.nodes[index];
  if (others.length || selection.bodies.length || selection.faces.length || selection.edges.length || selection.profileRegions
    || selection.vertices?.length
    || sketch?.kind !== 'sketch' || sketch.suppressed || sketch.on
    || sketch.association || sketch.pocketFloor || sketch.holes?.length || sketch.regions?.length) return;
  if (sketch.profile !== 'rectangle' && (!smooth || sketch.profile !== 'polygon' || sketch.points.length !== 3
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

function triangleCorners(sketch: Extract<SketchNode, { profile: 'polygon' }>): Point[] {
  const points = sketch.points as Point[];
  if (points.some(point => !point.every(Number.isFinite))
    || (sketch.outline && (sketch.outline.points.length !== 3
      || sketch.outline.points.some((point, i) => point.some((value, j) => value !== points[i][j])))))
    throw refusal('VALUE', 'Use three finite straight corners that match the sketch outline.');
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
      const { plane } = source, yAxis = cross(plane.normal, plane.xAxis);
      const spans = Math.max(smooth ? 6 : 1, Math.ceil(Math.abs(angle) / (smooth ? 30 : 90)));
      const sections = [], controlPoints: Vec3[] = [];
      let doc = ctx.doc;
      for (let station = 0; station <= spans; station++) {
        const fraction = station / spans, z = height * fraction;
        const radians = angle * fraction * (Math.PI / 180);
        const points = station === 0 ? corners : centre ? rotateTurnPoints(corners, centre, radians) : rotateTurnCorners(corners, radians);
        if (!smooth) {
          const [u, v] = points[0];
          const point = add(plane.origin, add(scale(plane.xAxis, u), scale(yAxis, v)));
          controlPoints.push(add(point, scale(plane.normal, z)));
        }
        sections.push({ sketch: doc.nodes.length, z });
        doc = withNode(doc, station === 0 && !smooth
          ? { kind: 'sketch', profile: 'rectangle', min, max, plane }
          : { kind: 'sketch', profile: 'loop', segments: points.map(start => ({ kind: 'line', start })), plane });
      }
      const loft = { kind: 'loft' as const, sections, from: [source.index] };
      if (smooth) return withNode(doc, { ...loft, smooth: true });
      const knots = [0, ...sections.map((_, index) => index), spans];
      return withNode(doc, { ...loft, guide: { kind: 'nurbs', degree: 1, knots, controlPoints } });
    },
  };
}

export const ruledTurnCommand = turnCommand(false);
export const smoothTurnCommand = turnCommand(true);
