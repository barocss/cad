import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, transformBrep, type Brep, type CadPartDocument, type Curve } from '@barocss/cad';
import { closedRectangularDuctEvidence } from '../src/chat/closedRectangularDuctEvidence';

const source = { outer: [4, 6], inner: [2, 4], outerTags: ['e1', 'e2', 'e3', 'e4'], innerTags: ['e5', 'e6', 'e7', 'e8'] };
type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;

function path(swapped = false, reversed = false): Path {
  const points: Curve['controlPoints'] = [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
    [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]];
  const controlPoints = swapped ? points.map(([x, y]): [number, number, number] => [0, x, y]) : points;
  return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    controlPoints: reversed ? controlPoints.slice().reverse() : controlPoints,
    weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] };
}

function native(curve = path(), inner = source.inner, outer = source.outer, clockwise = true): Brep {
  const corners: [number, number][] = [[-inner[0] / 2, -inner[1] / 2], [inner[0] / 2, -inner[1] / 2],
    [inner[0] / 2, inner[1] / 2], [-inner[0] / 2, inner[1] / 2]];
  const ordered = clockwise ? [corners[0], corners[3], corners[2], corners[1]] : corners;
  const document: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-outer[0] / 2, -outer[1] / 2], max: [outer[0] / 2, outer[1] / 2],
      holes: [ordered.map(start => ({ kind: 'line', start }))], sideTags: { outer: source.outerTags, holes: [source.innerTags] } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', path: curve, mode: 'exact' },
  ] };
  return evaluateCadPart(document).outputs[0].brep;
}

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

test('closed native cavity evidence proves the source sizes, inward walls, strict shells and independent material volume without mutation', t => {
  const curve = path(), brep = native(curve), before = structuredClone({ brep, curve, source });
  const evidence = closedRectangularDuctEvidence(brep, curve, source);
  assert.ok(evidence);
  assert.equal(evidence.exteriorSeams.length, 8);
  assert.equal(evidence.interiorSeams.length, 8);
  assert.equal(new Set([...evidence.exteriorSeams, ...evidence.interiorSeams]).size, 16);
  const cavity = evidence.closedCavity;
  assert.equal(cavity.exteriorFaces.length, 8);
  assert.equal(cavity.interiorFaces.length, 8);
  assert.equal(new Set([...cavity.exteriorFaces, ...cavity.interiorFaces]).size, 16);
  assert.ok(cavity.exteriorFaces.every(name => source.outerTags.some(tag => name.startsWith(`w.side[${tag}]#`))));
  assert.ok(cavity.interiorFaces.every(name => source.innerTags.some(tag => name.startsWith(`w.side[${tag}]#`))));
  assert.notEqual(cavity.exteriorShell, cavity.interiorShell);
  near(cavity.dimensions.pathRadius, 20);
  near(cavity.dimensions.exterior.radial, 4);
  near(cavity.dimensions.exterior.axial, 6);
  near(cavity.dimensions.interior.radial, 2);
  near(cavity.dimensions.interior.axial, 4);
  near(cavity.dimensions.wall.radial, 1);
  near(cavity.dimensions.wall.axial, 1);
  near(cavity.volume.analytic, 640 * Math.PI);
  near(cavity.volume.native, 640 * Math.PI);
  assert.equal(cavity.volume.method, 'quadrature');
  assert.ok(cavity.maximumGapMM < 1e-10);
  assert.deepEqual({ brep, curve, source }, before);
  t.diagnostic(JSON.stringify(evidence));
});

test('changed cavity height, clockwise ordering, reversed path and default swapped radial frame are independently verified', () => {
  const shorter = { ...source, inner: [2, 2] }, curve = path();
  const edited = closedRectangularDuctEvidence(native(curve, shorter.inner), curve, shorter);
  assert.ok(edited);
  near(edited.closedCavity.volume.native, 800 * Math.PI);
  near(edited.closedCavity.dimensions.interior.axial, 2);
  near(edited.closedCavity.dimensions.wall.axial, 2);
  for (const clockwise of [false, true]) for (const reverse of [false, true]) {
    const reversed = path(false, reverse);
    assert.ok(closedRectangularDuctEvidence(native(reversed, source.inner, source.outer, clockwise), reversed, source));
  }
  const swapped = path(true), evidence = closedRectangularDuctEvidence(native(swapped), swapped, source);
  assert.ok(evidence);
  near(evidence.closedCavity.dimensions.exterior.radial, 6);
  near(evidence.closedCavity.dimensions.exterior.axial, 4);
  near(evidence.closedCavity.dimensions.interior.radial, 4);
  near(evidence.closedCavity.dimensions.interior.axial, 2);
});

test('closed native evidence rejects changed source sizes, changed tags and an unsupported or different path', () => {
  const curve = path(), brep = native(curve);
  for (const changed of [{ ...source, outer: [4.1, 6] }, { ...source, inner: [2, 3] }, { ...source, inner: [4, 4] },
    { ...source, outer: [Number.NaN, 6] }, { ...source, innerTags: source.outerTags },
    { ...source, innerTags: ['wrong', ...source.innerTags.slice(1)] }])
    assert.equal(closedRectangularDuctEvidence(brep, curve, changed), undefined);
  const altered = structuredClone(curve); altered.controlPoints[3][1] += .001;
  const openSeam = structuredClone(curve); openSeam.controlPoints[8][1] += 8e-9;
  const kink = structuredClone(curve); kink.controlPoints[7][2] += 1.2e-8;
  const ellipse = { ...curve, controlPoints: curve.controlPoints.map(([x, y, z]): [number, number, number] => [x, 1.1 * y, z]) };
  const open = { ...curve, controlPoints: curve.controlPoints.slice(0, 5), weights: curve.weights.slice(0, 5), knots: [0, 0, 0, 1, 1, 2, 2, 2] };
  for (const changed of [altered, openSeam, kink, ellipse, open, { ...curve, weights: curve.weights.map((weight, i) => i === 3 ? .7 : weight) }])
    assert.equal(closedRectangularDuctEvidence(brep, changed, source), undefined);
  assert.equal(closedRectangularDuctEvidence(native(curve, [2, 2]), curve, source), undefined);
});

function reversedCavity(brep: Brep): Brep {
  const shell = brep.shells[1], faces = new Set(shell.faces);
  const loops = new Set(brep.faces.filter(face => faces.has(face.id)).flatMap(face => face.loops));
  const reverse = (sense: 'forward' | 'reversed') => sense === 'forward' ? 'reversed' as const : 'forward' as const;
  return { ...brep,
    faces: brep.faces.map(face => faces.has(face.id) ? { ...face, sense: reverse(face.sense) } : face),
    loops: brep.loops.map(loop => loops.has(loop.id) ? { ...loop, coedges: loop.coedges.slice().reverse() } : loop),
    coedges: brep.coedges.map(use => loops.has(use.loop) ? { ...use, sense: reverse(use.sense), next: use.prev, prev: use.next } : use),
  };
}

test('a strictly valid outward cavity shell is rejected independently of the topology check', () => {
  const curve = path(), flipped = reversedCavity(native(curve));
  const report = checkBrep(flipped, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.topology.map(item => item.genus), [2]);
  assert.equal(closedRectangularDuctEvidence(flipped, curve, source), undefined);
});

test('missing native charts, disconnected references, a moved body and an unrelated source cannot receive closed cavity evidence', () => {
  const curve = path(), brep = native(curve);
  const missing = { ...brep, coedges: brep.coedges.map((use, i) => i ? use : { ...use, pcurve: null }) };
  const disconnected = { ...brep, shells: brep.shells.map((shell, i) => i ? { ...shell, closed: false } : shell) };
  const renamed = { ...brep, faces: brep.faces.map((face, i) => i ? face : { ...face, name: 'unrelated' }) };
  const moved = transformBrep(brep, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [1, 0, 0] });
  const unrelated = { ...brep, source: { family: 'revolve' as const, id: 'w' } };
  for (const changed of [missing, disconnected, renamed, moved, unrelated])
    assert.equal(closedRectangularDuctEvidence(changed, curve, source), undefined);
});
