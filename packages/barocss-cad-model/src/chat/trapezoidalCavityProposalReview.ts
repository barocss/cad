import { brepMassProperties, CadNumericPolicy, checkBrep, faceGeometry, type Brep } from '@barocss/cad';
import type { Dim, StudioDoc } from '../engine/doc';
import { partBreps } from '../engine/evaluate';
import { bodyKeyFor } from '../engine/ids';
import type { Proposal } from '../engine/schema/proposals';
import { cross, dot, len, scale, sub, unit } from '../engine/vec3';
import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import { closedDuctCircle, isolatedDuctShell } from './closedRectangularDuctEvidence';

const tolerance = CadNumericPolicy.linearTolerance;
const near = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
const usesParameter = (value: Dim, name: string) => typeof value !== 'number' && value.parameter === name;
const dimension = (value: Dim, doc: StudioDoc) => typeof value === 'number' ? value : doc.parameters[value.parameter];
const range = (values: number[]): [number, number] => [Math.min(...values), Math.max(...values)];

export function trapezoidalCavityProposal(doc: StudioDoc, proposal: Proposal) {
  if (proposal.status !== 'open' || proposal.ops.length !== 1 || doc.nodes.length !== 2 || doc.instances?.length) return;
  const [{ tool, args }] = proposal.ops;
  if (tool !== 'set_parameters' || !isObj(args) || Object.keys(args).join() !== 'set' || !isObj(args.set)) return;
  const keys = Object.keys(args.set);
  if (keys.length !== 1) return;
  const [parameter] = keys, value = args.set[parameter];
  if (!Object.hasOwn(doc.parameters, parameter) || typeof value !== 'number' || !Number.isFinite(value) ||
    value === doc.parameters[parameter]) return;

  const [sketch, sweep] = doc.nodes, body = bodyKeyFor(doc.nodes, 1, 'solid');
  if (Object.keys(doc.outputs).length !== 1 || doc.outputs[body]?.node !== 1 || doc.outputs[body]?.side !== 'solid' ||
    sketch.kind !== 'sketch' || sketch.profile !== 'polygon' || sketch.points.length !== 4 || sketch.plane || sketch.on ||
    sketch.outline || sketch.holeOutlines?.length || sketch.regions?.length || sketch.association || sketch.pocketFloor ||
    sketch.suppressed || sketch.held !== undefined || sweep.kind !== 'sweep-curve' || sweep.sketch !== 0 ||
    sweep.mode !== 'exact' || !sweep.id || sweep.suppressed || sweep.held !== undefined) return;
  const tags = sketch.sideTags, hole = sketch.holes?.[0];
  if (tags?.outer.length !== 4 || tags.holes?.length !== 1 || tags.holes[0].length !== 4 ||
    new Set([...tags.outer, ...tags.holes[0]]).size !== 8 || sketch.holes?.length !== 1 ||
    hole?.length !== 4 || hole.some(segment => segment.kind !== 'line')) return;

  const bound = hole.map(({ start: [x] }) => usesParameter(x, parameter));
  if (bound.filter(Boolean).length !== 2 || hole.some(({ start: [x, y] }, i) =>
    typeof y !== 'number' || !bound[i] && typeof x !== 'number') ||
    sketch.points.some(point => point.some(d => usesParameter(d, parameter)))) return;
  const [left, right] = range(hole.map(({ start: [x] }) => dimension(x, doc)));
  if (!(left < value) || right !== doc.parameters[parameter]) return;

  const frame = closedDuctCircle(sweep.path);
  if (!frame) return;
  const projected = sub([1, 0, 0], scale(frame.tangent, frame.tangent[0]));
  const x = unit(len(projected) < 1e-6 ? sub([0, 1, 0], scale(frame.tangent, frame.tangent[1])) : projected);
  if (len(cross(x, frame.radial)) > tolerance) return;
  const radialSign = Math.sign(dot(x, frame.radial)), axialSign = Math.sign(dot(cross(frame.tangent, x), frame.axis));
  return { revision: digestOf(proposal), body, feature: sweep.id, parameter, value, frame, radialSign, axialSign,
    points: sketch.points, hole, outerTags: tags.outer, innerTags: tags.holes[0] };
}

type Edit = NonNullable<ReturnType<typeof trapezoidalCavityProposal>>;

function ownedShell(brep: Brep, feature: string, tags: readonly string[]) {
  const names = tags.flatMap(tag => [1, 2].map(half => `${feature}.side[${tag}]#${half}`));
  const faces = names.map(name => brep.faces.find(face => face.name === name));
  const shell = brep.shells.find(shell => shell.closed && shell.faces.length === names.length &&
    faces.every(face => face && shell.faces.includes(face.id)));
  return shell && { shell, names };
}

function measureCavity(doc: StudioDoc, edit: Edit) {
  const { body, feature, frame, radialSign, axialSign } = edit;
  const parts = partBreps(doc);
  if (parts.length !== 1 || parts[0].key !== body) return;
  const { brep } = parts[0];
  if (brep.source.family !== 'sweep-curve' || brep.source.id !== feature || brep.bodies.length !== 1 ||
    brep.bodies[0].kind !== 'solid' || brep.shells.length !== 2 || brep.coedges.length !== 64 ||
    brep.coedges.some(use => !use.pcurve)) return;
  const report = checkBrep(brep, { strict: true });
  if (!report.valid || report.topology[0]?.genus !== 2 ||
    Math.max(report.maximumVertexGap, report.maximumPcurveGap, report.maximumEdgeSurfaceGap) > tolerance) return;
  const exterior = ownedShell(brep, feature, edit.outerTags), cavity = ownedShell(brep, feature, edit.innerTags);
  if (!exterior || !cavity || exterior.shell.id === cavity.shell.id) return;

  const center = [0, 1].map(axis => {
    const [min, max] = range(edit.points.map(point => dimension(point[axis], doc)));
    return min + (max - min) / 2;
  });
  const points = edit.hole.map(({ start: [x, y] }) => [
    frame.radius + radialSign * (dimension(x, doc) - center[0]), axialSign * (dimension(y, doc) - center[1]),
  ]);
  const [r0, r1] = range(points.map(point => point[0])), [z0, z1] = range(points.map(point => point[1]));
  if (!(r0 > tolerance && r1 - r0 > tolerance && z1 - z0 > tolerance)) return;
  for (const [i, [r, z]] of points.entries()) {
    const [nr, nz] = points[(i + 1) % points.length];
    if ((r === nr) === (z === nz)) return;
    for (const name of cavity.names.slice(2 * i, 2 * i + 2)) {
      const face = brep.faces.find(face => face.name === name)!;
      const native = faceGeometry(face);
      if (r === nr) {
        if (native.kind !== 'cylinder' || !near(native.r, r) || native.out !== (r === r0 ? 1 : -1) ||
          len(cross(native.a, frame.axis)) > tolerance || len(cross(sub(native.c, frame.center), frame.axis)) > tolerance) return;
      } else if (native.kind !== 'plane' || !near(dot(native.n, frame.axis), z === z0 ? 1 : -1) ||
        !near(dot(sub(native.o, frame.center), frame.axis), z)) return;
    }
  }
  const exteriorBrep = isolatedDuctShell(brep, exterior.shell);
  const outerMass = brepMassProperties(exteriorBrep, 1), netMass = brepMassProperties(brep, 1);
  const cavityVolumeMM3 = Math.PI * (r1 - r0) * (r1 + r0) * (z1 - z0);
  const measured = outerMass.volume - netMass.volume;
  if (outerMass.method !== 'quadrature' || netMass.method !== 'quadrature' ||
    !(Number.isFinite(measured) && measured > 0 && netMass.volume > 0) ||
    Math.abs(measured - cavityVolumeMM3) > CadNumericPolicy.relativeComparison * Math.max(1, cavityVolumeMM3)) return;
  return { brep, exteriorDigest: digestOf(exteriorBrep), faces: cavity.names,
    dimensions: { radialMM: r1 - r0, axialMM: z1 - z0 }, cavityVolumeMM3: measured, materialVolumeMM3: netMass.volume };
}

export function reviewedTrapezoidalCavityEvidence(base: StudioDoc, candidate: StudioDoc, edit: Edit) {
  if (digestOf([candidate.nodes, candidate.outputs, candidate.direct]) !== digestOf([base.nodes, base.outputs, base.direct]) ||
    digestOf(candidate.parameters) !== digestOf({ ...base.parameters, [edit.parameter]: edit.value })) return;
  try {
    const original = measureCavity(base, edit), revised = measureCavity(candidate, edit);
    if (!original || !revised || original.exteriorDigest !== revised.exteriorDigest ||
      !near(original.dimensions.axialMM, revised.dimensions.axialMM) ||
      near(original.dimensions.radialMM, revised.dimensions.radialMM)) return;
    return { brep: revised.brep, trapezoidalCavityEdit: { body: edit.body, feature: edit.feature, faces: revised.faces,
      exteriorSha256: revised.exteriorDigest, parameter: { name: edit.parameter, before: base.parameters[edit.parameter], after: edit.value },
      before: { ...original.dimensions, cavityVolumeMM3: original.cavityVolumeMM3, materialVolumeMM3: original.materialVolumeMM3 },
      after: { ...revised.dimensions, cavityVolumeMM3: revised.cavityVolumeMM3, materialVolumeMM3: revised.materialVolumeMM3 } } };
  } catch { return; }
}
