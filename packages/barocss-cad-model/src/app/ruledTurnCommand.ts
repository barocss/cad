import { CadNumericPolicy } from '@barocss/cad';
import { withNode, type SketchNode } from '../engine/doc';
import type { Vec3 } from '../engine/mesh';
import { refusal } from '../engine/refusal';
import { add, cross, dot, len, scale, sub, unit } from '../engine/vec3';
import type { SketchPlane } from '../sketch/plane';
import { resolveSketchDims } from '../sketch/reopen';
import type { Command, Ctx } from './commands';
import { planeOf } from './profiles';

const maximumAngle = 450;
const maximumSpan = 90;
const selectRectangle = 'Select one standalone rectangular sketch without holes or separate regions.';
type Rectangle = Extract<SketchNode, { profile: 'rectangle' }>;
type Point = [number, number];

function turnSource({ doc, selection }: Ctx): { index: number; sketch: Rectangle; plane: SketchPlane } | undefined {
  const [index, ...others] = selection.sketches ?? [];
  const sketch = doc.nodes[index];
  if (others.length || selection.bodies.length || selection.faces.length || selection.edges.length || selection.profileRegions
    || selection.vertices?.length
    || sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' || sketch.suppressed || sketch.on
    || sketch.association || sketch.pocketFloor || sketch.holes?.length || sketch.regions?.length) return;
  const stored = planeOf(sketch);
  const normalLength = len(stored.normal), xLength = len(stored.xAxis);
  if (!Number.isFinite(normalLength) || !Number.isFinite(xLength) || normalLength <= 1e-12 || xLength <= 1e-12) return;
  // Saved sketch directions can carry scale. The native sketch frame uses unit axes.
  const normal = unit(stored.normal), x = unit(stored.xAxis), projection = dot(normal, x);
  if (Math.abs(projection) > 1e-9) return;
  const plane = { origin: stored.origin, normal, xAxis: unit(sub(x, scale(normal, projection))) };
  return { index, sketch, plane };
}

export const ruledTurnCommand: Command = {
  id: 'ruled-turn', label: 'Ruled Turn', icon: 'cad-loft', group: 'create', keywords: 'loft twist rotate sections',
  hint: 'Create a ruled Loft from rotated copies of one rectangular sketch.',
  available: ctx => turnSource(ctx) ? { ok: true } : { ok: false, reason: selectRectangle },
  fields: () => [
    { key: 'height', label: 'Height', kind: 'mm', min: 0, max: CadNumericPolicy.coordinateAbs },
    { key: 'angle', label: 'Turn angle', kind: 'deg', min: -maximumAngle, max: maximumAngle },
  ],
  defaults: () => ({ height: 40, angle: 360 }),
  build: (ctx, { height, angle }) => {
    const source = turnSource(ctx);
    if (!source) throw refusal('VALUE', selectRectangle);
    if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0 || height > CadNumericPolicy.coordinateAbs)
      throw refusal('VALUE', `Enter a Height above 0 and at most ${CadNumericPolicy.coordinateAbs} mm.`);
    if (typeof angle !== 'number' || !Number.isFinite(angle) || Math.abs(angle) > maximumAngle)
      throw refusal('VALUE', `Enter a Turn angle from −${maximumAngle}° to ${maximumAngle}°.`);

    // Like an ordinary Loft, this snapshots the current sketch dimensions in its own section copies.
    const rectangle = resolveSketchDims(source.sketch, ctx.doc.parameters) as Rectangle;
    const min: Point = [Number(rectangle.min[0]), Number(rectangle.min[1])];
    const max: Point = [Number(rectangle.max[0]), Number(rectangle.max[1])];
    if (![...min, ...max].every(Number.isFinite) || max[0] <= min[0] || max[1] <= min[1])
      throw refusal('VALUE', 'Use a rectangle with positive width and depth.');
    const centre: Point = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
    const corners: Point[] = [min, [max[0], min[1]], max, [min[0], max[1]]];
    const { plane } = source, yAxis = cross(plane.normal, plane.xAxis);
    const spans = Math.max(1, Math.ceil(Math.abs(angle) / maximumSpan));
    const sections = [], controlPoints: Vec3[] = [];
    let doc = ctx.doc;
    for (let station = 0; station <= spans; station++) {
      const fraction = station / spans, z = height * fraction;
      const radians = angle * fraction * (Math.PI / 180), c = Math.cos(radians), s = Math.sin(radians);
      const points = station === 0 ? corners : corners.map(([x, y]): Point => {
        const u = x - centre[0], v = y - centre[1];
        return [centre[0] + c * u - s * v, centre[1] + s * u + c * v];
      });
      const [u, v] = points[0];
      const point = add(plane.origin, add(scale(plane.xAxis, u), scale(yAxis, v)));
      controlPoints.push(add(point, scale(plane.normal, z)));
      sections.push({ sketch: doc.nodes.length, z });
      doc = withNode(doc, station === 0
        ? { kind: 'sketch', profile: 'rectangle', min, max, plane }
        : { kind: 'sketch', profile: 'loop', segments: points.map(start => ({ kind: 'line', start })), plane });
    }
    const knots = [0, ...sections.map((_, index) => index), spans];
    return withNode(doc, { kind: 'loft', sections, from: [source.index], guide: { kind: 'nurbs', degree: 1, knots, controlPoints } });
  },
};
