import { faceGeometry, type FaceGeometry } from '../brep/analytic-boolean.js';
import { checkBrep, type Brep, type BrepFace } from '../brep/brep-core.js';
import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point } from '../types.js';

type Cylinder = Extract<FaceGeometry, { kind: 'cylinder' }>;
type Plane = Extract<FaceGeometry, { kind: 'plane' }>;
const angularTolerance = CadNumericPolicy.relativeComparison;

function closedSolid(brep: Brep, genus: number): boolean {
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed) return false;
  const report = checkBrep(brep, { strict: true });
  return report.valid && report.topology.length === 1 && report.topology[0].genus === genus;
}

function sameCylinder(a: Cylinder, b: Cylinder, tolerance: number, angleTolerance: number = angularTolerance): boolean {
  return Math.abs(a.r - b.r) <= tolerance && len(cross(a.a, b.a)) <= angleTolerance
    && len(cross(sub(a.c, b.c), a.a)) <= tolerance;
}

function sameSupport(a: FaceGeometry, b: FaceGeometry, tolerance: number, angleTolerance: number = angularTolerance): boolean {
  if (a.kind === 'cylinder' && b.kind === 'cylinder') return a.out === b.out && sameCylinder(a, b, tolerance, angleTolerance);
  return a.kind === 'plane' && b.kind === 'plane' && len(sub(a.n, b.n)) <= angleTolerance
    && Math.abs(dot(sub(a.o, b.o), a.n)) <= tolerance;
}

/** Index the directed boundary and its neighbors after strict native validation. */
function boundary(brep: Brep) {
  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  return (face: BrepFace) => face.loops.map(id => {
    const loop = loops.get(id)!;
    const boundary = loop.coedges.map(id => {
      const use = uses.get(id)!, twin = uses.get(use.twin!)!;
      return { use, edge: edges.get(use.edge)!, mate: faces.get(loops.get(twin.loop)!.face)! };
    });
    return { kind: loop.kind, boundary };
  });
}

type Boundary = ReturnType<ReturnType<typeof boundary>>[number]['boundary'];

function sameBoundaryCurves(original: Boundary, current: Boundary): boolean {
  if (original.length !== current.length || !original.length) return false;
  const start = current.findIndex(({ edge }) => edge.name === original[0].edge.name);
  if (start < 0) return false;
  // The Boolean gives each retained curve a new ID. Compare its full rational definition and directed incidence.
  return original.every(({ edge, use, mate }, index) => {
    const next = current[(start + index) % current.length];
    const a = edge.curve, b = next.edge.curve;
    return edge.name === next.edge.name && use.sense === next.use.sense && mate.name === next.mate.name
      && a.degree === b.degree && JSON.stringify(a.knots) === JSON.stringify(b.knots)
      && JSON.stringify(a.weights) === JSON.stringify(b.weights) && JSON.stringify(a.controlPoints) === JSON.stringify(b.controlPoints);
  });
}

function centralThroughTool(outer: BrepFace, wall: Cylinder, inner: Cylinder, caps: readonly Plane[],
  tool: Cylinder, toolCaps: readonly Plane[], tolerance: number) {
  if (outer.surface.kind !== 'surface' || outer.surface.controlPoints.length !== 5) return;
  const radial = sub(outer.surface.controlPoints[2][0], wall.c);
  const crown = unit(sub(radial, scale(wall.a, dot(radial, wall.a))));
  const tangent = cross(wall.a, crown);
  const center = add(wall.c, scale(wall.a, dot(sub(tool.c, wall.c), wall.a)));
  const angleError = len(cross(crown, tool.a)), centerError = len(cross(sub(center, tool.c), tool.a));
  if (angleError > angularTolerance || centerError > tolerance) return;

  // Bound the occupied radial branch of the bore between the two cylindrical walls.
  const last = wall.r;
  const diskRadius = (tool.r + centerError + last * angleError) / Math.sqrt(1 - angleError ** 2);
  if (!(diskRadius + tolerance < inner.r)) return;
  const first = Math.sqrt((inner.r - diskRadius) * (inner.r + diskRadius));
  // The entire branch stays inside both the stock's axial caps and the tool's end planes.
  const clears = [...caps, ...toolCaps].every(cap => {
    const radialSlope = dot(cap.n, crown);
    const diskReach = diskRadius * Math.hypot(dot(cap.n, tangent), dot(cap.n, wall.a));
    return dot(sub(center, cap.o), cap.n) + Math.max(first * radialSlope, last * radialSlope) + diskReach < -tolerance;
  });
  if (clears) return { center, crown, diskRadius };
}

/** Certify one complete bore in the current, directly evaluated Exact semicylinder Difference. */
export function certifyExactCylinderBore(bored: Brep, stock: Brep, tool: Brep, outerName: string, upperName: string) {
  if (stock.faces.length !== 6 || tool.faces.length !== 4 || bored.faces.length !== 8) return;
  const extent = geometryScaleMM(stock.vertices.map(vertex => vertex.point), tool.vertices.map(vertex => vertex.point));
  const tolerance = linearToleranceMM(extent);
  const geometry = (face: BrepFace) => faceGeometry(face, extent);
  const outer = stock.faces.find(face => face.name === outerName);
  const inner = stock.faces.find(face => face.name === `${stock.source.id}.${outerName.endsWith('.normal') ? 'reverse' : 'normal'}`);
  const upper = stock.faces.find(face => face.name === upperName);
  const lower = stock.faces.find(face => face.name === `${stock.source.id}.${upperName.endsWith('.v-max') ? 'v-min' : 'v-max'}`);
  if (!outer || !inner || !upper || !lower) return;
  const outside = geometry(outer), inside = geometry(inner), top = geometry(upper), bottom = geometry(lower);
  if (outside.kind !== 'cylinder' || outside.out !== 1 || inside.kind !== 'cylinder' || inside.out !== -1
    || top.kind !== 'plane' || bottom.kind !== 'plane') return;
  const toolFaces = tool.faces.map(face => ({ name: face.name, geometry: geometry(face) }));
  const toolCaps = toolFaces.map(face => face.geometry).filter(value => value.kind === 'plane');
  const first = toolFaces.find(face => face.name?.endsWith('#1'));
  const second = toolFaces.find(face => face.name === first?.name?.replace(/#1$/, '#2'));
  const cutter = first?.geometry, peer = second?.geometry;
  if (cutter?.kind !== 'cylinder' || cutter.out !== 1 || peer?.kind !== 'cylinder' || peer.out !== 1
    || !sameCylinder(cutter, peer, tolerance) || toolCaps.length !== 2) return;
  const clearance = centralThroughTool(outer, outside, inside, [top, bottom], cutter, toolCaps, tolerance);
  if (!clearance) return;
  const group = bored.faces.filter(face => face.name === first?.name || face.name === second?.name);
  if (group.length !== 2 || group[0].name === group[1].name
    || !group.every(face => { const wall = geometry(face); return wall.kind === 'cylinder' && wall.out === -1 && sameCylinder(wall, cutter, tolerance); })) return;
  if (!closedSolid(stock, 0) || !closedSolid(tool, 0) || !closedSolid(bored, 1)) return;

  const beforeBoundary = boundary(stock), afterBoundary = boundary(bored);
  const openings = new Set<string>();
  let innerLoops: ReturnType<typeof afterBoundary> | undefined;
  for (const original of stock.faces) {
    const matches = bored.faces.filter(face => face.name === original.name);
    if (matches.length !== 1 || !sameSupport(geometry(original), geometry(matches[0]), tolerance)) return;
    const before = beforeBoundary(original), after = afterBoundary(matches[0]);
    const skin = original === inner || original === outer;
    const outerLoop = after.find(loop => loop.kind === 'outer');
    if (before.length !== 1 || before[0].kind !== 'outer' || after.length !== (skin ? 2 : 1) || !outerLoop
      || !sameBoundaryCurves(before[0].boundary, outerLoop.boundary)) return;
    if (!skin) continue;
    const opening = after.find(loop => loop.kind === 'inner');
    if (!opening || !opening.boundary.every(({ mate }) => group.includes(mate))
      || !group.every(member => opening.boundary.some(({ mate }) => mate === member))) return;
    for (const { edge } of opening.boundary) openings.add(edge.id);
    if (original === inner) innerLoops = [outerLoop, opening];
  }
  for (const face of group) {
    const loops = afterBoundary(face);
    if (loops.length !== 1 || loops[0].kind !== 'outer') return;
    const seams = loops[0].boundary.filter(({ edge }) => !openings.has(edge.id));
    if (seams.length !== 2 || seams[0].edge === seams[1].edge || !seams.every(({ mate }) => mate !== face && group.includes(mate))) return;
  }
  if (!innerLoops) return;
  return { group, outside, bottom, clearance, extent, tolerance, innerLoops };
}

export function healExactCylinderBoreIfAdmitted(bored: Brep, faceName: string, stock: Brep, tool: Brep,
  outerName: string, upperName: string): Brep | undefined {
  if (certifyExactCylinderBore(bored, stock, tool, outerName, upperName)?.group.some(face => face.name === faceName)) return stock;
}

/** Anchor a signed Offset to stock material below the opening on the original outer crown. */
export function exactSemicylinderBoredOuterWallOffsetFrame(bored: Brep, stock: Brep, tool: Brep, outerName: string,
  upperName: string): { anchor: Point; normal: Point } | undefined {
  const proof = certifyExactCylinderBore(bored, stock, tool, outerName, upperName);
  if (!proof) return;
  const { outside, bottom, clearance, tolerance } = proof;
  const { center, crown, diskRadius } = clearance;
  const atCrown = add(center, scale(crown, outside.r));
  const alignment = dot(bottom.n, outside.a);
  if (!(alignment < 0)) return;
  const lower = dot(sub(bottom.o, atCrown), bottom.n) / alignment;
  if (!(-diskRadius - lower > tolerance)) return;
  return { anchor: add(atCrown, scale(outside.a, lower + (-diskRadius - lower) / 2)), normal: crown };
}

type BoreProof = NonNullable<ReturnType<typeof certifyExactCylinderBore>>;

function topology(brep: Brep) {
  return [brep.bodies, brep.shells, brep.faces.map(face => [face.id, face.name, face.sense, face.surface.id, face.loops]), brep.loops,
    brep.coedges.map(use => [use.id, use.edge, use.sense, use.loop, use.next, use.prev, use.twin]),
    brep.edges.map(edge => [edge.id, edge.name, edge.curve.id, edge.vertices]), brep.vertices.map(vertex => vertex.id)];
}

/** Keep the persistent incidence, fixed supports and actual inner opening, permitting the outer trims to move. */
export function preservesExactCylinderBoreOnOffset(current: Brep, next: Brep, before: BoreProof, after: BoreProof,
  outerName: string, distance: number): boolean {
  const tolerance = Math.max(before.tolerance, after.tolerance);
  const extent = Math.max(before.extent, after.extent);
  const angleRoundoff = 256 * Number.EPSILON, supportRoundoff = angleRoundoff * Math.max(1, extent);
  const moved = after.outside.r - before.outside.r;
  return Math.sign(moved) === Math.sign(distance) && Math.abs(moved - distance) <= tolerance
    && JSON.stringify(topology(current)) === JSON.stringify(topology(next))
    && before.innerLoops.every((loop, index) => sameBoundaryCurves(loop.boundary, after.innerLoops[index].boundary))
    && current.faces.every((face, index) => face.name === outerName
      || sameSupport(faceGeometry(face, extent), faceGeometry(next.faces[index], extent), supportRoundoff, angleRoundoff));
}
