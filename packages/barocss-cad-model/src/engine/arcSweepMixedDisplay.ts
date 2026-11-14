import { curveDomain, evaluateCurve, revolutionOf, triangulatePolygonWithHoles, type Brep, type BrepEdge, type BrepFace } from '@barocss/cad';
import { readMixedSweepBore } from './arcSweepMixedBore';
import type { BoundedDisplayMesh, DisplayFace, DisplayMesh } from './mesh';
import { nativeCircleOf } from './nativeCircle';
import { add, cross, dot, len, scale, sub, unit, type Vec3 } from './vec3';

const packetBudget = 192 * 1024;
const byMesh = new WeakMap<DisplayMesh, DisplayMesh>();

type FilletExterior = { readonly sweepId: string; readonly capSamples: ReadonlyMap<string, Float64Array>; readonly patchCount: number };

function buildDetail(base: DisplayMesh, brep: Brep, exterior?: FilletExterior): BoundedDisplayMesh | undefined {
  const id = exterior?.sweepId ?? brep.source.id;
  const hollow = !exterior && brep.faces.length === 8, trimmedCaps = hollow || !!exterior;
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed) return;
  if (exterior) {
    const patches = exterior.patchCount;
    if (brep.source.family !== 'analytic-boolean' || brep.faces.length !== 8 + patches || brep.edges.length !== 16 + 3 * patches
      || base.faces.length !== 8 || base.edges.length !== 11) return;
  } else if (brep.source.family !== 'sweep-curve' || brep.faces.length !== (hollow ? 8 : 6)
    || brep.edges.length !== (hollow ? 18 : 12)
    || base.faces.length !== (hollow ? 7 : 6) || base.edges.length !== (hollow ? 12 : 10)) return;
  const railDivisions = trimmedCaps ? 52 : 56, roundDivisions = trimmedCaps ? 24 : 42;
  const nativeFace = new Map(brep.faces.map(face => [face.id, face]));
  const faceOf = new Map(base.faces.map(face => [face.id, face]));
  const start = base.faces.find(face => face.name === `${id}.start`);
  const end = base.faces.find(face => face.name === `${id}.end`);
  const back = base.faces.find(face => face.exact?.kind === 'cylinder');
  if (!start || start.exact?.kind !== 'plane' || !end || end.exact?.kind !== 'plane' || back?.exact?.kind !== 'cylinder'
    || faceOf.size !== base.faces.length || base.faces.some(face => !nativeFace.has(face.id))) return;
  const annuli = base.faces.filter(face => face !== start && face !== end && face.exact?.kind === 'plane');
  if (annuli.length !== 2) return;
  const round = base.faces.find(face => face.kind === 'curved' && !face.exact &&
    base.edges.some(edge => edge.nativeCircle && edge.nativeJoint && edge.faces.includes(start.index) && edge.faces.includes(face.index)));
  if (!round) return;
  const support = nativeFace.get(round.id)?.surface, backSupport = nativeFace.get(back.id)?.surface;
  if (support?.kind !== 'surface' || support.degreeU !== 2 || support.degreeV !== 2
    || backSupport?.kind !== 'surface' || backSupport.degreeU !== 2 || backSupport.degreeV !== 1) return;
  const revolution = revolutionOf(support, 100);
  if (revolution?.profile.kind !== 'arc') return;
  const [major, axial] = revolution.profile.c, minor = revolution.profile.r, inner = back.exact.r;
  if (!(major > inner && inner > 0 && minor > 0)) return;
  const centre = add(revolution.c, scale(revolution.a, axial));
  const tolerance = 2e-10 * Math.max(1, ...centre.map(Math.abs), major);
  const near = (a: Vec3, b: Vec3) => len(sub(a, b)) <= tolerance;
  const scalarNear = (a: number, b: number) => Math.abs(a - b) <= tolerance;

  const nativeEdge = new Map(brep.edges.map(edge => [edge.id, edge]));
  const loopOf = new Map(brep.loops.map(loop => [loop.id, loop]));
  const useOf = new Map(brep.coedges.map(use => [use.id, use]));
  const vertex = new Map(brep.vertices.map(v => [v.id, v.point]));
  const edgeOf = new Map(base.edges.flatMap(edge => edge.nativeJoint ? [[edge.nativeJoint.edgeId, edge] as const] : []));
  if (edgeOf.size !== 10) return;
  const reads = (face: BrepFace, kind: 'outer' | 'inner') => {
    const matching = face.loops.map(id => loopOf.get(id)).filter(loop => loop?.kind === kind);
    return matching.length === 1 ? matching[0]!.coedges.map(id => useOf.get(id)!) : [];
  };
  const startFace = nativeFace.get(start.id)!, endFace = nativeFace.get(end.id)!;
  if ([startFace, endFace].some(face => face.loops.length !== (trimmedCaps ? 2 : 1))) return;
  const startUses = reads(startFace, 'outer'), endUses = reads(endFace, 'outer');
  if (startUses.length !== 4 || endUses.length !== 4) return;
  const capEdges = (uses: typeof startUses) => uses.map(use => nativeEdge.get(use.edge)!);
  const startEdges = capEdges(startUses), endEdges = capEdges(endUses);
  if (startEdges.some(edge => !edgeOf.has(edge.id)) || endEdges.some(edge => !edgeOf.has(edge.id))) return;
  const startArc = startEdges.find(edge => edge.curve.degree === 2), endArc = endEdges.find(edge => edge.curve.degree === 2);
  if (!startArc || !endArc || [startEdges, endEdges].some(edges => edges.filter(edge => edge.curve.degree === 1).length !== 3)) return;
  const circle1 = nativeCircleOf(startArc.curve), circle2 = nativeCircleOf(endArc.curve);
  if (!circle1 || !circle2 || !scalarNear(circle1.radius, minor) || !scalarNear(circle2.radius, minor)) return;
  const firstOffset = sub(circle1.centre, centre), lastOffset = sub(circle2.centre, centre);
  if (!scalarNear(len(firstOffset), major) || !scalarNear(len(lastOffset), major)) return;
  const first = unit(firstOffset), last = unit(lastOffset), axis = unit(cross(first, last)), tangent = cross(axis, first);
  const sweep = Math.atan2(dot(last, tangent), dot(last, first));
  if (sweep < Math.PI / 6 - 1e-8 || sweep > Math.PI / 2 + 1e-8 || len(cross(axis, revolution.a)) > 1e-9
    || !near(start.exact.n, scale(tangent, -1)) || !near(end.exact.n, cross(axis, last))
    || len(cross(circle1.normal, tangent)) > 1e-9 || len(cross(circle2.normal, cross(axis, last))) > 1e-9
    || len(cross(axis, back.exact.a)) > 1e-9 || len(cross(sub(back.exact.c, centre), axis)) > tolerance) return;
  const startInner = reads(startFace, 'inner'), endInner = reads(endFace, 'inner');
  const bore = hollow ? readMixedSweepBore(brep, base, [start, end], { centre, first, last, axis, tangent, sweep, tolerance }, startInner, endInner) : undefined;
  if (hollow && (!bore || bore.wall === round.index)) return;
  if (exterior) {
    const blend = base.faces.find(face => face.name === `${brep.source.id}.face`);
    const retained = new Set([round.id, back.id, start.id, end.id, ...annuli.map(face => face.id)]);
    const otherFace = (use: (typeof startInner)[number]) => {
      const twin = use.twin === null ? undefined : useOf.get(use.twin);
      return twin && nativeFace.get(loopOf.get(twin.loop)!.face);
    };
    const facesOf = (uses: typeof startInner) => uses.map(otherFace);
    if (startInner.length !== exterior.patchCount || endInner.length !== 2 || blend?.freeform?.length !== exterior.patchCount
      || !facesOf(startInner).every(face => face && blend.freeform!.includes(face.id))
      || !facesOf(endInner).every(face => face && !retained.has(face.id) && !blend.freeform!.includes(face.id)
        && face.surface.kind === 'surface' && face.surface.degreeU === 2 && face.surface.degreeV === 2)
      || startInner.some(use => nativeEdge.get(use.edge)?.curve.degree !== 3)
      || endInner.some(use => nativeEdge.get(use.edge)?.curve.degree !== 2)) return;
    const rimNames = endInner.map(use => nativeEdge.get(use.edge)?.name);
    if (!base.edges.some(edge => edge.faces.includes(end.index) && edge.nativeCircle && edge.names.length === 2
      && rimNames.every(name => name && edge.names.includes(name)))) return;
    const hidden = new Set(startInner.map(use => nativeEdge.get(use.edge)?.name));
    if (base.edges.some(edge => edge.names.some(name => hidden.has(name)))) return;
  }

  const startIds = new Set(startEdges.flatMap(edge => [...edge.vertices]));
  const endIds = new Set(endEdges.flatMap(edge => [...edge.vertices]));
  if (startIds.size !== 4 || endIds.size !== 4 || [...startIds].some(id => endIds.has(id))) return;
  const rails = brep.edges.filter(edge => edge.vertices.some(id => startIds.has(id)) && edge.vertices.some(id => endIds.has(id)));
  const connections = new Map<string, { edge: BrepEdge; end: string }>();
  for (const edge of rails) {
    const [a, b] = edge.vertices;
    const [from, to] = startIds.has(a) ? [a, b] : [b, a];
    if (!startIds.has(from) || !endIds.has(to) || connections.has(from)) return;
    connections.set(from, { edge, end: to });
  }
  if (connections.size !== 4 || new Set([...connections.values()].map(value => value.end)).size !== 4) return;

  const middle = (edge: BrepEdge): Vec3 => {
    const [lo, hi] = curveDomain(edge.curve);
    return evaluateCurve(edge.curve, (lo + hi) / 2);
  };
  if (!near(middle(startArc), add(centre, scale(first, major + minor)))
    || !near(middle(endArc), add(centre, scale(last, major + minor)))) return;
  const radial = Array.from({ length: railDivisions + 1 }, (_, j) =>
    add(scale(first, Math.cos(j * sweep / railDivisions)), scale(tangent, Math.sin(j * sweep / railDivisions))));
  const railPoints = new Map<string, Vec3[]>();
  const nativeRailId = new Map<string, string>();
  const radialMiddle = radial[railDivisions / 2];
  for (const [from, connection] of connections) {
    const { edge, end: to } = connection;
    const a = vertex.get(from)!, b = vertex.get(to)!;
    const q = sub(a, centre), h = dot(q, axis), r = startArc.vertices.includes(from) ? major : inner;
    const origin = add(centre, scale(axis, h)), circle = nativeCircleOf(edge.curve);
    if (!scalarNear(Math.abs(h), minor) || !near(a, add(origin, scale(first, r))) || !near(b, add(origin, scale(last, r)))
      || !circle || len(cross(circle.normal, axis)) > 1e-9 || !near(circle.centre, origin) || !scalarNear(circle.radius, r)
      || !near(middle(edge), add(origin, scale(radialMiddle, r)))) return;
    const points = radial.map(e => add(origin, scale(e, r)));
    points[0] = a;
    points[railDivisions] = b;
    railPoints.set(from, points);
    nativeRailId.set(from, edge.id);
    if (edgeOf.has(edge.id) !== (r === inner)) return;
  }

  const sideFor = (edge: BrepEdge, cap: DisplayFace) => {
    const owner = edgeOf.get(edge.id);
    if (!owner?.faces.includes(cap.index)) return;
    return base.faces[owner.faces.find(face => face !== cap.index)!];
  };
  // Cross-check the native cap edge pairing before reusing its owner on both rows of each wall.
  const endOf = new Map<string, BrepEdge>();
  for (const edge of startEdges) {
    const side = sideFor(edge, start);
    const [a, b] = edge.vertices.map(id => connections.get(id)!.end);
    const mate = endEdges.find(candidate => candidate.vertices.includes(a) && candidate.vertices.includes(b));
    if (!side || !mate || sideFor(mate, end) !== side || (edge === startArc) !== (side === round)) return;
    if (edge !== startArc && side !== back && !annuli.includes(side)) return;
    endOf.set(edge.id, mate);
  }
  if (new Set(startEdges.map(edge => sideFor(edge, start))).size !== 4) return;
  const [roundA, roundB] = startArc.vertices;
  const phase = dot(sub(vertex.get(roundA)!, centre), axis) > 0 ? 1 : -1;
  if (!scalarNear(dot(sub(vertex.get(roundB)!, centre), axis), -phase * minor)) return;
  for (const edge of startEdges.filter(edge => edge !== startArc)) {
    const [a, b] = edge.vertices, side = sideFor(edge, start)!;
    const ar = startArc.vertices.includes(a), br = startArc.vertices.includes(b);
    if (side === back ? ar || br : ar === br) return;
    if (side !== back) {
      const h = dot(sub(vertex.get(a)!, centre), axis);
      if (side.exact?.kind !== 'plane' || !near(side.exact.n, scale(axis, Math.sign(h)))
        || !scalarNear(dot(sub(vertex.get(b)!, centre), axis), h)) return;
    }
  }

  const positions: number[] = [], normals: number[] = [], faceOfVertex: number[] = [], indices: number[] = [];
  const edgeLines: number[] = [], edgeOfSegment: number[] = [];
  const emit = (point: Vec3, normal: Vec3, face: number): number => {
    const index = faceOfVertex.length;
    positions.push(...point);
    normals.push(...normal);
    faceOfVertex.push(face);
    return index;
  };
  const xyz = (values: number[], i: number): Vec3 => [values[3 * i], values[3 * i + 1], values[3 * i + 2]];
  const triangle = (a: number, b: number, c: number) => {
    const p = xyz(positions, a), q = xyz(positions, b), r = xyz(positions, c);
    if (dot(cross(sub(q, p), sub(r, p)), xyz(normals, a)) < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  const line = (owner: number | undefined, points: readonly Vec3[]) => {
    if (owner === undefined) return;
    for (let j = 1; j < points.length; j++) {
      edgeLines.push(...points[j - 1], ...points[j]);
      edgeOfSegment.push(owner, owner);
    }
  };
  const strip = (left: number, right: number, width: number) => {
    for (let k = 0; k < width; k++) {
      const a = left + k, b = right + k;
      triangle(a, b, a + 1);
      triangle(a + 1, b, b + 1);
    }
  };
  const readRing = (uses: typeof startUses, rows: Map<string, Vec3[]>) => uses.flatMap(use => {
    const points = rows.get(use.edge)!;
    return (use.sense === 'forward' ? points : [...points].reverse()).slice(0, -1);
  });

  const roundRows: Vec3[][] = [];
  for (const edge of startEdges) {
    const side = sideFor(edge, start)!, [a, b] = edge.vertices, rounded = edge === startArc;
    const width = rounded ? roundDivisions : 1, firstIndex = faceOfVertex.length;
    for (let j = 0; j <= railDivisions; j++) {
      const row: Vec3[] = [], e = radial[j];
      for (let k = 0; k <= width; k++) {
        const phi = phase * (Math.PI / 2 - Math.PI * k / roundDivisions);
        const n = rounded ? add(scale(e, Math.cos(phi)), scale(axis, Math.sin(phi)))
          : side === back ? scale(e, -1) : side.normal;
        const p = k === 0 ? railPoints.get(a)![j] : k === width ? railPoints.get(b)![j]
          : add(add(centre, scale(e, major)), scale(n, minor));
        emit(p, n, side.index);
        row.push(p);
      }
      if (rounded) roundRows.push(row);
      if (j) strip(firstIndex + (j - 1) * (width + 1), firstIndex + j * (width + 1), width);
    }
  }
  if (bore) for (const { rows } of bore.halves) {
    const index = faceOfVertex.length, width = rows[0].points.length;
    for (const [j, row] of rows.entries()) {
      row.points.forEach((point, k) => emit(point, row.normals[k], bore.wall));
      if (j) strip(index + (j - 1) * width, index + j * width, width - 1);
    }
  }

  for (const [isStart, cap, uses, j] of [[true, start, startUses, 0], [false, end, endUses, railDivisions]] as const) {
    const rows = new Map<string, Vec3[]>();
    for (const edge of startEdges) {
      const mate = endOf.get(edge.id)!, [a, b] = edge.vertices;
      const points = edge === startArc ? roundRows[j] : [railPoints.get(a)![j], railPoints.get(b)![j]];
      const capEdge = isStart ? edge : mate;
      rows.set(capEdge.id, isStart || mate.vertices[0] === connections.get(a)!.end ? points : [...points].reverse());
      line(edgeOf.get(capEdge.id)?.index, points);
    }
    const boundary = readRing(uses, rows);
    if (trimmedCaps) {
      const innerUses = isStart ? startInner : endInner;
      if (bore) {
        for (const { edge, points, owner } of bore.capRows(isStart)) {
          rows.set(edge, points);
          line(owner, points);
        }
      } else if (exterior) {
        for (const use of innerUses) {
          const data = exterior.capSamples.get(use.edge);
          if (!data || data.length < 6 || data.length % 3 !== 0) return;
          const points: Vec3[] = [];
          for (let i = 0; i < data.length; i += 3) points.push([data[i], data[i + 1], data[i + 2]]);
          const [a, b] = nativeEdge.get(use.edge)!.vertices.map(id => vertex.get(id)!);
          if (a.some((value, i) => value !== points[0][i]) || b.some((value, i) => value !== points.at(-1)![i])) return;
          rows.set(use.edge, points);
        }
      }
      const inner = readRing(innerUses, rows), idx = faceOfVertex.length;
      const x = radial[j], y = cross(cap.normal, x);
      const project = (points: Vec3[]): [number, number][] => points.map(p => {
        const q = sub(p, centre);
        return [dot(q, x), dot(q, y)];
      });
      for (const point of [...boundary, ...inner]) emit(point, cap.normal, cap.index);
      const triangles = triangulatePolygonWithHoles(project(boundary), [project(inner)]);
      if (exterior) {
        const counts = new Map<number, number>(), size = boundary.length + inner.length;
        const key = (a: number, b: number) => Math.min(a, b) * size + Math.max(a, b);
        for (const [a, b, c] of triangles) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
          const id = key(p, q);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        for (const [first, length] of [[0, boundary.length], [boundary.length, inner.length]]) {
          for (let i = 0; i < length; i++) if (counts.get(key(first + i, first + (i + 1) % length)) !== 1) return;
        }
      }
      for (const [a, b, c] of triangles) triangle(idx + a, idx + b, idx + c);
      continue;
    }
    const backEdge = (isStart ? startEdges : endEdges).find(edge => sideFor(edge, cap) === back)!;
    const corner = boundary.indexOf(vertex.get(backEdge.vertices[0])!);
    if (corner < 0) return;
    // The verified D contour is convex. A fan from an inner corner keeps every rim segment.
    const index = faceOfVertex.length;
    for (let k = 0; k < boundary.length; k++) emit(boundary[(corner + k) % boundary.length], cap.normal, cap.index);
    for (let k = 1; k + 1 < boundary.length; k++) triangle(index, index + k, index + k + 1);
  }
  for (const [id, points] of railPoints) line(edgeOf.get(nativeRailId.get(id)!)?.index, points);

  const bytes = 8 * (positions.length + edgeLines.length)
    + 4 * (normals.length + faceOfVertex.length + indices.length + edgeOfSegment.length);
  if (bytes > packetBudget) return;
  const min = [...base.bounds.min] as Vec3, max = [...base.bounds.max] as Vec3;
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
  // Tensor interpolation: the angular second derivative bounds are R+r, r and r.
  // The same rail sagitta bounds the cylinder and annuli, and the cap uses the profile sagitta.
  const d = sweep / railDivisions, e = Math.PI / roundDivisions;
  const error = Math.max(((major + minor) * d ** 2 + 2 * minor * d * e + minor * e ** 2) / 8, bore?.error ?? 0) + tolerance;
  return { positions: new Float64Array(positions), normals: new Float32Array(normals), faceOfVertex: new Float32Array(faceOfVertex),
    indices: new Uint32Array(indices), edgeLines: new Float64Array(edgeLines), edgeOfSegment: new Float32Array(edgeOfSegment),
    bounds: { min, max }, error };
}

/** Refine the viewport mesh for a native Sweep with a semicircle, a back and two straight sides. */
export function arcSweepMixedDisplayMesh(base: DisplayMesh, brep: Brep): DisplayMesh {
  if (base.arcSweepDetail) return base;
  const cached = byMesh.get(base);
  if (cached) return cached;
  let detail: BoundedDisplayMesh | undefined;
  try { detail = buildDetail(base, brep); } catch { /* A display refinement can always use the canonical mesh. */ }
  const result = detail ? { ...base, arcSweepDetail: detail } : base;
  byMesh.set(base, result);
  return result;
}

/** Generate only new exterior vertices, triangles and edge segments for the original start-rim fillet. */
export function mixedSweepFilletExterior(base: DisplayMesh, brep: Brep, exterior: FilletExterior): BoundedDisplayMesh | undefined {
  try { return buildDetail(base, brep, exterior); } catch { return; }
}
