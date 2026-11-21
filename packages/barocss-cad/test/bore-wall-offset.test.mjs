import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, createCylindricalBoreCheck, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry } from '../dist/index.js';
import { transformBrep, quarterTurn } from '../dist/brep/brep-transform.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import { annularCapReplacementFrame, boreWallOffsetFrame, boredCapOffsetFrame, circularWallOffsetFrame,
  offsetBoreWallIfAdmitted, offsetCircularWallIfAdmitted } from '../dist/features/bored-cap-offset.js';

const plate = ({ min = [0, 0], max = [40, 30], center = [11, 9], radius = 3, from = -2, height = 10, ...hole } = {}) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min, max },
    { id: 'b', kind: 'extrude', sketch: 's', from, height },
    { id: 'h', kind: 'hole', target: 'b', face: 'b.top', center, radius, ...hole },
  ],
});
const solid = doc => evaluateCadPart(doc).outputs[0].brep;
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const pointClose = (a, b) => a.forEach((value, axis) => close(value, b[axis]));
const walls = brep => brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const identity = brep => ({
  source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
  coedges: brep.coedges.map(({ pcurve, ...use }) => ({ ...use, pcurve: pcurve && { ...pcurve, controlPoints: undefined } })),
  faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: { ...surface, controlPoints: undefined } })),
  edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: { ...curve, controlPoints: undefined } })),
  vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex),
});

for (const distance of [1, -2]) {
  test(`through-bore offset ${distance} changes only the inner cylinder and its cap trims`, () => {
    const doc = plate(), source = freeze(solid(doc)), saved = structuredClone(source);
    const names = walls(source).map(face => face.name), radius = 3 - distance;
    assert.equal(names.length, 2);
    for (const name of names) {
      const frame = boreWallOffsetFrame(source, name);
      assert.deepEqual(frame.faces, names);
      close(frame.anchor[2], 3);
      close(Math.hypot(frame.anchor[0] - 11, frame.anchor[1] - 9), 3);
      pointClose(frame.normal, [(11 - frame.anchor[0]) / 3, (9 - frame.anchor[1]) / 3, 0]);
      close(Math.hypot(...frame.normal), 1);
      const result = offsetBoreWallIfAdmitted(source, name, distance), report = checkBrep(result, { strict: true });
      assert.ok(report.valid, report.issues.join('\n'));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 });
      assert.equal(report.topology[0].genus, 1);
      assert.ok(report.maximumEdgeSurfaceGap < 1e-9 && report.maximumPcurveGap < 1e-9);
      assert.deepEqual(identity(result), identity(source));
      assert.ok(boredCapOffsetFrame(result, 'b.top'), 'the result must keep the exact native cap/inner-rim proof');
      for (const [index, face] of source.faces.entries()) {
        if (!names.includes(face.name)) assert.equal(result.faces[index], face, `${face.name} support must be untouched`);
      }
      const innerLoops = new Map(source.loops.filter(loop => loop.kind === 'inner').map(loop => [loop.id, loop.face]));
      const capById = new Map(source.faces.map(face => [face.id, face]));
      const edgeById = new Map(result.edges.map(edge => [edge.id, edge]));
      for (const [index, use] of source.coedges.entries()) {
        const changed = result.coedges[index], cap = capById.get(innerLoops.get(use.loop));
        if (!cap) {
          assert.equal(changed, use, 'all wall and outer-cap UV uses must be untouched');
          continue;
        }
        const project = ([x, y]) => cap.name === 'b.top' ? [x / 40, y / 30, 0] : [y / 30, x / 40, 0];
        assert.deepEqual(changed.pcurve.controlPoints, edgeById.get(use.edge).curve.controlPoints.map(project));
      }
      const bore = walls(result);
      close(createCylindricalBoreCheck(result)(bore), 2 * radius);
      for (const wall of bore) {
        const support = faceGeometry(wall);
        close(support.r, radius);
        pointClose(support.c, [11, 9, -2]);
        pointClose(support.a, [0, 0, 1]);
        assert.equal(support.out, -1);
        for (const u of [0, 0.13, 0.49, 0.77, 1]) {
          for (const v of [0, 0.43, 1]) {
            const point = evaluateSurface(wall.surface, u, v);
            close(Math.hypot(point[0] - 11, point[1] - 9), radius);
            close(point[2], -2 + 10 * v);
          }
        }
      }
      for (const edge of result.edges.filter(edge => edge.curve.degree === 2)) {
        for (const t of [0, 0.17, 0.63, 1]) {
          const point = evaluateCurve(edge.curve, t);
          close(Math.hypot(point[0] - 11, point[1] - 9), radius);
          assert.ok(point[2] === -2 || point[2] === 8);
        }
      }
      // Independent stock-minus-disc moments, rather than the moved control net or display mesh.
      const area = 1200 - Math.PI * radius ** 2, mass = brepMassProperties(result, 1);
      close(mass.volume, area * 10, area * 1e-8);
      pointClose(mass.centroid, [(1200 * 20 - Math.PI * radius ** 2 * 11) / area,
        (1200 * 15 - Math.PI * radius ** 2 * 9) / area, 3]);
      const edit = { id: 'offset', kind: 'offset-face', target: 'h', face: name, distance };
      assert.deepEqual(solid({ ...doc, features: [...doc.features, edit] }), result);
    }
    assert.deepEqual(source, saved);
  });
}

test('through-bore offset retains a translated negative-coordinate plate and its independent volume', () => {
  const source = solid(plate({ min: [-40, -30], max: [0, 0], center: [-29, -21] }));
  const result = offsetBoreWallIfAdmitted(source, walls(source)[0].name, -2);
  const mass = brepMassProperties(result, 1);
  close(mass.volume, (1200 - 25 * Math.PI) * 10, 1e-7);
  for (const wall of walls(result)) pointClose(faceGeometry(wall).c, [-29, -21, -2]);
});

test('through-bore offset refuses its axis and nearest plate wall with no source mutation', () => {
  const source = freeze(solid(plate())), saved = structuredClone(source), name = walls(source)[0].name;
  for (const distance of [3, 4, 3 - 5e-8])
    assert.throws(() => offsetBoreWallIfAdmitted(source, name, distance), /reach or cross the bore axis/);
  for (const distance of [-6, -7, -6 + 5e-8])
    assert.throws(() => offsetBoreWallIfAdmitted(source, name, distance), /reach or cross an outer plate wall/);
  for (const distance of [0, NaN, Infinity, -Infinity, 10001])
    assert.throws(() => offsetBoreWallIfAdmitted(source, name, distance), /distance/);
  assert.throws(() => offsetBoreWallIfAdmitted(source, name, Number.MIN_VALUE), /too small/);
  assert.deepEqual(source, saved);
});

test('through-bore wall admission refuses outer supports and other topologies', () => {
  const doc = plate(), source = solid(doc), name = walls(source)[0].name;
  for (const face of ['b.top', 'b.bottom', 'b.side0', 'missing', `${name}+b.top`]) {
    assert.equal(boreWallOffsetFrame(source, face), undefined);
    assert.equal(offsetBoreWallIfAdmitted(source, face, 1), undefined);
  }
  const twoBores = solid({ ...doc, features: [...doc.features,
    { id: 'j', kind: 'hole', target: 'h', face: 'b.top', center: [27, 20], radius: 2 }] });
  const blind = solid(plate({ depth: 4 }));
  const altered = structuredClone(source);
  altered.faces.find(face => face.name === name).surface.controlPoints[1][0][0] += 0.01;
  const badTrim = structuredClone(source), inner = badTrim.loops.find(loop => loop.kind === 'inner');
  badTrim.coedges.find(use => use.loop === inner.id).pcurve.controlPoints[1][0] += 1e-9;
  const duplicate = structuredClone(source);
  walls(duplicate)[1].name = name;
  for (const brep of [twoBores, blind, altered, badTrim, duplicate, transformBrep(source, { matrix: quarterTurn('x', 90) }),
    { ...source, source: { ...source.source, family: 'step-import' } }]) {
    assert.equal(boreWallOffsetFrame(brep, name), undefined);
    assert.equal(offsetBoreWallIfAdmitted(brep, name, 1), undefined);
  }
});

const tube = ({ center = [14, 9], bore = center, from = 0 } = {}) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center, radius: 9 },
    { id: 'n1', kind: 'extrude', sketch: 'n0', from, height: 16 },
    { id: 'n2', kind: 'hole', target: 'n1', face: 'n1.top', center: bore, radius: 4 },
  ],
});
const innerWalls = brep => walls(brep).filter(face => faceGeometry(face).out === -1);

for (const distance of [1, -2]) {
  test(`coaxial tube inner-wall offset ${distance} preserves the outer cylinder, rim and cap charts`, () => {
    const doc = tube(), source = freeze(solid(doc)), saved = structuredClone(source), names = innerWalls(source).map(face => face.name);
    const radius = 4 - distance;
    close(brepMassProperties(source, 1).volume, Math.PI * (9 ** 2 - 4 ** 2) * 16, 1e-7);
    for (const name of names) {
      const frame = boreWallOffsetFrame(source, name);
      assert.deepEqual(frame.faces, names);
      close(frame.anchor[2], 8);
      close(Math.hypot(frame.anchor[0] - 14, frame.anchor[1] - 9), 4);
      pointClose(frame.normal, [(14 - frame.anchor[0]) / 4, (9 - frame.anchor[1]) / 4, 0]);
      const result = offsetBoreWallIfAdmitted(source, name, distance), report = checkBrep(result, { strict: true });
      assert.ok(report.valid, report.issues.join('\n'));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 });
      assert.equal(report.topology[0].genus, 1);
      assert.ok(report.maximumEdgeSurfaceGap < 1e-9 && report.maximumPcurveGap < 1e-9);
      assert.deepEqual(identity(result), identity(source));
      assert.ok(annularCapReplacementFrame(result, 'n1.top'), 'the exact annular cap proof survives the radial edit');
      const innerLoopIds = new Set(source.loops.filter(loop => loop.kind === 'inner').map(loop => loop.id));
      for (const [index, face] of source.faces.entries()) {
        if (!names.includes(face.name)) assert.equal(result.faces[index], face, `${face.name} support and chart must stay exact`);
      }
      for (const [index, use] of source.coedges.entries()) {
        if (!innerLoopIds.has(use.loop)) assert.equal(result.coedges[index], use, 'outer and cylinder UV uses must stay exact');
      }
      const movedLoops = new Set(innerWalls(source).flatMap(face => face.loops));
      const movedEdges = new Set(source.coedges.filter(use => movedLoops.has(use.loop)).map(use => use.edge));
      for (const [index, edge] of source.edges.entries()) {
        if (!movedEdges.has(edge.id)) assert.equal(result.edges[index], edge, 'outer rims and seams must stay exact');
      }
      for (const wall of walls(result)) {
        const support = faceGeometry(wall);
        close(support.r, support.out === -1 ? radius : 9);
        pointClose(support.c, [14, 9, 0]);
        pointClose(support.a, [0, 0, 1]);
        for (const u of [0, .19, .5, .83, 1]) {
          const point = evaluateSurface(wall.surface, u, .37);
          close(Math.hypot(point[0] - 14, point[1] - 9), support.out === -1 ? radius : 9);
          close(point[2], 16 * .37);
        }
      }
      const mass = brepMassProperties(result, 1);
      close(mass.volume, Math.PI * (9 ** 2 - radius ** 2) * 16, 1e-7);
      pointClose(mass.centroid, [14, 9, 8]);
      const edit = { id: 'offset', kind: 'offset-face', target: 'n2', face: name, distance };
      assert.deepEqual(solid({ ...doc, features: [...doc.features, edit] }), result);
    }
    assert.deepEqual(source, saved);
  });
}

test('coaxial tube proof accepts native circle roundoff near zero and negative coordinates', () => {
  for (const center of [[0, 0], [.125, -.25], [-14, -9]]) {
    const source = solid(tube({ center, from: -2 })), name = innerWalls(source)[0].name;
    const result = offsetBoreWallIfAdmitted(source, name, -2);
    assert.ok(result);
    close(brepMassProperties(result, 1).volume, Math.PI * (81 - 36) * 16, 1e-7);
    pointClose(brepMassProperties(result, 1).centroid, [...center, 6]);
  }
});

test('coaxial tube offset rejects inner collapse, outer contact and unsupported outer selection', () => {
  const source = freeze(solid(tube())), saved = structuredClone(source), name = innerWalls(source)[0].name;
  for (const distance of [4, 5, 4 - 5e-8])
    assert.throws(() => offsetBoreWallIfAdmitted(source, name, distance), /reach or cross the bore axis/);
  for (const distance of [-5, -6, -5 + 5e-8])
    assert.throws(() => offsetBoreWallIfAdmitted(source, name, distance), /reach or cross the outer tube wall/);
  for (const distance of [0, NaN, Infinity, -Infinity])
    assert.throws(() => offsetBoreWallIfAdmitted(source, name, distance), /distance/);
  for (const face of source.faces.filter(face => !innerWalls(source).includes(face))) {
    assert.equal(boreWallOffsetFrame(source, face.name), undefined);
    assert.equal(offsetBoreWallIfAdmitted(source, face.name, 1), undefined);
  }
  assert.deepEqual(source, saved);
});

test('coaxial tube radial admission rejects genuine eccentricity without narrowing annular cap replacement', () => {
  for (const offset of [1e-9, 1]) {
    const source = solid(tube({ bore: [14 + offset, 9] })), name = innerWalls(source)[0].name;
    assert.ok(checkBrep(source, { strict: true }).valid);
    assert.ok(annularCapReplacementFrame(source, 'n1.top'), 'the existing eccentric annular cap family is unchanged');
    assert.equal(boreWallOffsetFrame(source, name), undefined);
    assert.equal(offsetBoreWallIfAdmitted(source, name, 1), undefined);
  }
});

const outerWalls = brep => walls(brep).filter(face => faceGeometry(face).out === 1);

for (const distance of [2, -1]) {
  test(`coaxial tube outer-wall offset ${distance} retains the complete native bore and reprojects both cap loops`, () => {
    const doc = tube(), source = freeze(solid(doc)), saved = structuredClone(source), names = outerWalls(source).map(face => face.name);
    const radius = 9 + distance, boreFaces = innerWalls(source), boreLoops = new Set(boreFaces.flatMap(face => face.loops));
    const boreEdges = new Set(source.coedges.filter(use => boreLoops.has(use.loop)).map(use => use.edge));
    const boreVertices = new Set(source.edges.filter(edge => boreEdges.has(edge.id)).flatMap(edge => edge.vertices));
    assert.equal(boreEdges.size, 6); assert.equal(boreVertices.size, 4);
    for (const name of names) {
      const frame = circularWallOffsetFrame(source, name);
      assert.deepEqual(frame.faces, names);
      close(frame.anchor[2], 8);
      close(Math.hypot(frame.anchor[0] - 14, frame.anchor[1] - 9), 9);
      pointClose(frame.normal, [(frame.anchor[0] - 14) / 9, (frame.anchor[1] - 9) / 9, 0]);
      const result = offsetCircularWallIfAdmitted(source, name, distance), report = checkBrep(result, { strict: true });
      assert.ok(report.valid, report.issues.join('\n'));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 8, coedges: 24, edges: 12, vertices: 8 });
      assert.equal(report.topology[0].genus, 1);
      assert.ok(report.maximumEdgeSurfaceGap < 1e-9 && report.maximumPcurveGap < 1e-9);
      assert.deepEqual(identity(result), identity(source));
      for (const [index, face] of source.faces.entries()) if (boreFaces.includes(face)) assert.equal(result.faces[index], face);
      for (const [index, edge] of source.edges.entries()) if (boreEdges.has(edge.id)) assert.equal(result.edges[index], edge);
      for (const [index, vertex] of source.vertices.entries()) if (boreVertices.has(vertex.id)) assert.equal(result.vertices[index], vertex);
      for (const [index, use] of source.coedges.entries()) if (boreLoops.has(use.loop)) assert.equal(result.coedges[index], use);
      assert.ok(boreWallOffsetFrame(result, boreFaces[0].name), 'the retained bore still passes the existing native proof');
      assert.ok(annularCapReplacementFrame(result, 'n1.top'), 'both new cap charts retain exact native trim bindings');
      const edgeById = new Map(result.edges.map(edge => [edge.id, edge]));
      let reversedUses = 0, changedInnerUV = 0;
      for (const capName of ['n1.bottom', 'n1.top']) {
        const cap = result.faces.find(face => face.name === capName), support = faceGeometry(cap), up = capName === 'n1.top';
        assert.equal(support.kind, 'plane');
        pointClose(support.n, [0, 0, up ? 1 : -1]);
        close(support.o[2], up ? 16 : 0);
        const poles = cap.surface.controlPoints.flat(), xs = poles.map(point => point[0]), ys = poles.map(point => point[1]);
        const min = [Math.min(...xs), Math.min(...ys)], max = [Math.max(...xs), Math.max(...ys)];
        pointClose([...min, 0], [14 - radius, 9 - radius, 0]);
        pointClose([...max, 0], [14 + radius, 9 + radius, 0]);
        for (const use of result.coedges.filter(use => cap.loops.includes(use.loop))) {
          const previous = source.coedges.find(original => original.id === use.id), edge = edgeById.get(use.edge);
          const projected = edge.curve.controlPoints.map(([x, y]) => {
            const u = (x - min[0]) / (max[0] - min[0]), v = (y - min[1]) / (max[1] - min[1]);
            return up ? [u, v, 0] : [v, u, 0];
          });
          assert.deepEqual(use.pcurve.controlPoints, projected, 'UV poles follow the stored edge, including reversed coedges');
          assert.equal(use.pcurve.id, previous.pcurve.id);
          assert.equal(use.pcurve.weights, previous.pcurve.weights);
          assert.equal(use.pcurve.knots, previous.pcurve.knots);
          if (use.sense === 'reversed') reversedUses++;
          if (boreEdges.has(use.edge) && JSON.stringify(use.pcurve.controlPoints) !== JSON.stringify(previous.pcurve.controlPoints)) changedInnerUV++;
        }
      }
      assert.ok(reversedUses > 0 && changedInnerUV === 4, 'both stationary bore rims need new cap UV coordinates');
      for (const wall of outerWalls(result)) {
        close(faceGeometry(wall).r, radius);
        for (const u of [0, .17, .5, .81, 1]) {
          const point = evaluateSurface(wall.surface, u, .37);
          close(Math.hypot(point[0] - 14, point[1] - 9), radius);
          close(point[2], 16 * .37);
        }
      }
      const mass = brepMassProperties(result, 1);
      close(mass.volume, Math.PI * (radius ** 2 - 16) * 16, 1e-7);
      pointClose(mass.centroid, [14, 9, 8]);
      const edit = { id: 'offset', kind: 'offset-face', target: 'n2', face: name, distance };
      assert.deepEqual(solid({ ...doc, features: [...doc.features, edit] }), result);
    }
    assert.deepEqual(source, saved);
  });
}

test('tube outer-wall offset refuses bore contact, unsupported selection, distance and deep range overflow', () => {
  const source = freeze(solid(tube())), saved = structuredClone(source), name = outerWalls(source)[0].name;
  for (const distance of [-5, -6, -9, -5 + 5e-8])
    assert.throws(() => offsetCircularWallIfAdmitted(source, name, distance), /reach or cross the retained bore/);
  for (const distance of [0, NaN, Infinity, -Infinity, 10001])
    assert.throws(() => offsetCircularWallIfAdmitted(source, name, distance), /distance/);
  assert.throws(() => offsetCircularWallIfAdmitted(source, name, 10000), /modeling range/);
  assert.throws(() => offsetCircularWallIfAdmitted(source, name, Number.MIN_VALUE), /too small/);
  for (const face of source.faces.filter(face => !outerWalls(source).includes(face))) {
    assert.equal(circularWallOffsetFrame(source, face.name), undefined);
    assert.equal(offsetCircularWallIfAdmitted(source, face.name, 1), undefined);
  }
  assert.deepEqual(source, saved);
});

test('tube outside admission tolerates native rounding but refuses genuine eccentric axes', () => {
  for (const center of [[0, 0], [.125, -.25], [-14, -9]]) {
    const source = solid(tube({ center, from: -2 })), name = outerWalls(source)[0].name;
    const result = offsetCircularWallIfAdmitted(source, name, 2);
    close(brepMassProperties(result, 1).volume, 1680 * Math.PI, 1e-7);
    pointClose(brepMassProperties(result, 1).centroid, [...center, 6]);
    for (const face of innerWalls(source)) assert.equal(result.faces.find(item => item.id === face.id), face);
  }
  for (const offset of [1e-9, 1]) {
    const source = solid(tube({ bore: [14 + offset, 9] })), name = outerWalls(source)[0].name;
    assert.ok(annularCapReplacementFrame(source, 'n1.top'));
    assert.equal(circularWallOffsetFrame(source, name), undefined);
    assert.equal(offsetCircularWallIfAdmitted(source, name, 2), undefined);
  }
});
