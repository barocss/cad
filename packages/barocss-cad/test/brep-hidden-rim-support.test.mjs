import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepFromPrismatic, checkBrep, evaluateCadPart, faceGeometry, massPropertiesOf, mergeBreps, projectBrepHiddenLines,
  prismaticExtrude, transformBrep } from '../dist/index.js';
import { convexCylinderRimSupport } from '../dist/brep/brep-hidden-rim-support.js';
import { circleOf } from '../dist/brep/brep-tessellate.js';

const fixture = JSON.parse(readFileSync(new URL('../conformance/r12c/bearing-6204-seat.json', import.meta.url)));
const original = () => evaluateCadPart(fixture.input.partDocument).outputs.map(output => output.brep);
const view = { toward: [275,-420,235], up: [0,0,1] }, options = { segmentsPerQuarter: 12, prefixes: ['s/','h/','b/'] };
const positive = 'h/oe.bottom|oe.side0#2', negative = 'h/oe.bottom|oe.side0#1';
const tangent = Math.atan2(275, 420), front = (tangent + 0.5236293967630139) / 2;
const rear = (tangent - Math.PI - 2.617996234664054) / 2;
const dot = (a,b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const pointAt = (angle, z = 28) => [35 * Math.cos(angle), 35 * Math.sin(angle), z];
const identity = p => p;
const projected = (frame,p) => [dot(frame.right,p), dot(frame.up,p)];
const relative = (p,o) => p.map((v,i) => v - o[i]);

function intervals(frame, name, rotate = identity) {
  const source = frame.edges.find(edge => edge.name === name);
  assert.ok(source?.circle, name);
  const X = projected(frame, rotate([1,0,0])), Y = projected(frame, rotate([0,1,0]));
  const det = X[0] * Y[1] - Y[0] * X[1];
  assert.ok(Math.abs(det) > 0.01);
  const inverse = p => [(Y[1] * p[0] - Y[0] * p[1]) / det, (X[0] * p[1] - X[1] * p[0]) / det];
  return source.pieces.filter(piece => piece.visible && piece.ink !== false).map(({curve}) => {
    assert.equal(curve.kind, 'arc');
    const u = inverse(curve.u), v = inverse(curve.v);
    const offset = Math.atan2(u[1],u[0]), sign = Math.sign(u[0] * v[1] - u[1] * v[0]);
    return [offset + sign * curve.t0, offset + sign * curve.t1].sort((a,b) => a-b);
  });
}
const visible = (runs, angle) => runs.some(([a,b]) => [-1,0,1].some(i => angle + i*2*Math.PI >= a - 1e-9 && angle + i*2*Math.PI <= b + 1e-9));

function verify(frame, rotate = identity, place = identity) {
  const upperHalf = intervals(frame, positive, rotate), lowerHalf = intervals(frame, negative, rotate);
  for (let j = 0; j <= 64; j++) {
    assert.ok(visible(upperHalf, tangent * j/64), 'Complete front arc through the generator');
    assert.equal(visible(lowerHalf, tangent - Math.PI - 0.0001 - 0.05 * j/64), false, 'Robust rear hit');
  }
  const end = projected(frame, place(pointAt(tangent)));
  const legacy = projected(frame, place(pointAt(0.5236293967630139)));
  assert.ok(Math.hypot(...relative(end,legacy)) > 0.8);
  const lines = frame.edges.filter(edge => edge.name.startsWith('h/') && edge.cylinder && Math.abs(edge.cylinder.radius - 35) < 1e-8)
    .flatMap(edge => edge.pieces.filter(piece => piece.visible && piece.ink !== false && piece.curve.kind === 'line').map(piece => piece.curve));
  assert.ok(lines.some(line => [line.a,line.b].some(p => Math.hypot(...relative(p,end)) < 1e-7)));
  assert.equal(visible(lowerHalf, rear), false);
}

test('the complete original bearing keeps its front rim and hides the false-visible rear rim', () => {
  const bodies = original(), bytes = JSON.stringify(bodies);
  assert.equal(fixture.input.partDocument.features.length, 7);
  assert.deepEqual(bodies.map(b => b.faces.length), [18,6,16]);
  assert.ok(bodies.every(b => checkBrep(b,{strict:true}).valid));
  const frame = projectBrepHiddenLines(bodies, view, options);
  verify(frame);
  const upperRim = 'h/oe.side0#2|oe.top';
  const behindShaft = Math.atan2(420, -275);
  const withoutShaft = projectBrepHiddenLines(bodies.slice(1), view, {...options, prefixes:options.prefixes.slice(1)});
  assert.equal(visible(intervals(withoutShaft,upperRim),behindShaft),true);
  assert.equal(visible(intervals(frame,upperRim),behindShaft),false);
  assert.equal(JSON.stringify(bodies), bytes);
});

function usesOf(body, name) {
  const edge = body.edges.find(edge => edge.name === name.slice(2));
  assert.ok(edge);
  const uses = body.coedges.filter(use => use.edge === edge.id);
  const faces = uses.map(use => body.faces.find(face => face.loops.includes(use.loop)));
  const capIndex = faces.findIndex(face => faceGeometry(face).kind === 'plane');
  assert.ok(capIndex >= 0);
  return {edge, uses, faces, cap:uses[capIndex], plane:faces[capIndex], cylinder:faces[1-capIndex]};
}

test('the complete cap pcurve and its absence agree on the assembled and rigidly rotated bearing', () => {
  const bodies = original();
  const angle = 0.37, c = Math.cos(angle), s = Math.sin(angle);
  const matrix = [1,0,0,0,c,-s,0,s,c], offset = [13,-21,7];
  const rotate = p => [p[0],c*p[1]-s*p[2],s*p[1]+c*p[2]];
  const place = p => rotate(p).map((v,i) => v + offset[i]);
  const transformed = bodies.map(body => transformBrep(body,{matrix, offset}));
  assert.ok(transformed.every(body => checkBrep(body,{strict:true}).valid));
  for (const [model, camera, direction, point] of [
    [bodies, view, identity, identity],
    [transformed,{toward:rotate(view.toward),up:rotate(view.up)},rotate,place],
  ]) {
    const copy = structuredClone(model);
    for (const name of [positive,negative]) delete usesOf(copy[1], name).cap.pcurve;
    assert.ok(checkBrep(copy[1],{strict:true}).valid);
    const withPC = projectBrepHiddenLines(model, camera, options);
    const withoutPC = projectBrepHiddenLines(copy, camera, options);
    verify(withPC, direction, point);
    verify(withoutPC, direction, point);
    for (const name of [positive,negative]) assert.deepEqual(intervals(withPC,name,direction),intervals(withoutPC,name,direction));
  }
});

test('a foreground part keeps covering a proved native front rim', () => {
  const bodies = original(), frame = projectBrepHiddenLines(bodies,view,options);
  const ring = [[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]].map((a,i,all) => ({kind:'line',a,b:all[(i+1)%all.length]}));
  const cover = brepFromPrismatic(prismaticExtrude([ring],0,1),{id:'rim-cover'});
  const matrix = [0,1,2].flatMap(i => [frame.right[i],frame.up[i],frame.toward[i]]);
  const offset = pointAt(front).map((v,i) => v+3*frame.toward[i]);
  const foreground = transformBrep(cover,{matrix,offset});
  assert.ok(checkBrep(foreground,{strict:true}).valid);
  assert.ok(visible(intervals(frame,positive),front));
  const assembled = projectBrepHiddenLines([...bodies,foreground],view,options);
  assert.equal(visible(intervals(assembled,positive),front),false);
  const merged = mergeBreps([bodies[1],foreground],{family:'test',id:'cover-rim'});
  assert.equal(visible(intervals(projectBrepHiddenLines([bodies[0],merged,bodies[2]],view,options),positive),front),false);
});

test('malformed pcurve, cylinder and topology owners do not receive a native rim certificate', () => {
  const source = original()[1];
  const prove = () => convexCylinderRimSupport([0.51,-0.78,0.44],{
    circle:circleOf, primitive:face => faceGeometry(face), inPlane:() => true, charge:() => {},
  });
  const owner = usesOf(source, positive);
  assert.ok(prove()(source,owner.edge,...owner.faces)?.nativeHidden);
  for (const mutate of [
    (_b,o) => { o.cap.pcurve.controlPoints[1][0] += 1e-5; },
    (_b,o) => { o.cap.pcurve.weights[1] += 1e-5; },
    (_b,o) => { o.cap.pcurve.knots[5] = 0.75; },
    (_b,o) => { o.plane.surface.controlPoints[1][1][0] += 0.1; },
    (_b,o) => { o.cylinder.sense = o.cylinder.sense === 'forward' ? 'reversed' : 'forward'; },
    (_b,o) => { o.cap.twin = 'foreign'; },
    (b,o) => { b.loops.find(loop => loop.id === o.cylinder.loops[0]).coedges.pop(); },
  ]) {
    const body = structuredClone(source), next = usesOf(body, positive);
    mutate(body,next);
    assert.equal(prove()(body,next.edge,...next.faces),null);
  }
});

const gearbox = JSON.parse(readFileSync(new URL('../conformance/r12c/accept-gearbox-shaft.json', import.meta.url)));
const glandFront = 'g/n8.bottom|n8.side0#2', glandRear = 'g/n8.bottom|n8.side0#1';
const glandPoint = angle => pointAt(angle, 80);

test('the original gland keeps its no-pcurve outer rim connected without losing real cover', () => {
  const source = gearbox.input.partDocument, sourceBytes = JSON.stringify(source);
  const { outputs } = evaluateCadPart(source);
  assert.equal(source.features.length, 11);
  assert.deepEqual(outputs.map(output => output.id), ['n0','n2','n3','n4','n5','n6','n9','n10']);
  for (const [i, output] of outputs.entries()) {
    const expected = gearbox.expect.outputs[i], props = massPropertiesOf(output);
    assert.ok(checkBrep(output.brep, { strict: true }).valid);
    assert.ok(Math.abs(props.volume - expected.volume.value) <= expected.volume.relTol * expected.volume.value);
    assert.ok(props.centroid.every((value, axis) => Math.abs(value - expected.centroid.value[axis]) <= expected.centroid.absTol));
  }
  const gland = outputs[6].brep, bytes = JSON.stringify(gland), glandOptions = { segmentsPerQuarter: 12, prefixes: ['g/'] };
  assert.equal(gland.faces.length, 12);
  assert.ok(usesOf(gland, glandFront).uses.every(use => !use.pcurve));
  const frame = projectBrepHiddenLines([gland], view, glandOptions);
  const intervalsFront = intervals(frame,glandFront), intervalsRear = intervals(frame,glandRear);
  for (let j = 0; j <= 64; j++) {
    assert.ok(visible(intervalsFront, tangent * j/64), 'Original front rim reaches the tangent generator');
    assert.equal(visible(intervalsRear, tangent - Math.PI - 0.005 - 0.04 * j/64), false, 'Rear rim stays hidden');
  }
  const join = projected(frame,glandPoint(tangent));
  const ring = frame.edges.find(edge => edge.name === glandFront);
  const rimEnds = ring.pieces.filter(piece => piece.visible && piece.curve.kind === 'arc')
    .flatMap(({curve}) => [curve.t0,curve.t1].map(t => curve.center.map((v, i) => v + curve.u[i] * Math.cos(t) + curve.v[i] * Math.sin(t))));
  assert.ok(rimEnds.some(point => Math.hypot(...relative(point,join)) < 1e-7));
  assert.ok(frame.edges.filter(edge => edge.cylinder && Math.abs(edge.cylinder.radius - 35) < 1e-8).some(edge => edge.pieces.some(piece =>
    piece.visible && piece.curve.kind === 'line' && [piece.curve.a,piece.curve.b].some(p => Math.hypot(...relative(p,join)) < 1e-7))));

  const coverLoop = [[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]].map((a,i,all) => ({kind:'line',a,b:all[(i+1)%all.length]}));
  const cover = brepFromPrismatic(prismaticExtrude([coverLoop],0,1),{id:'gland-cover'});
  const matrix = [0,1,2].flatMap(i => [frame.right[i],frame.up[i],frame.toward[i]]);
  const offset = glandPoint(front).map((v,i) => v+3*frame.toward[i]);
  const foreground = transformBrep(cover,{matrix,offset});
  assert.ok(checkBrep(foreground,{strict:true}).valid);
  const covered = projectBrepHiddenLines([gland,foreground],view,{...glandOptions,prefixes:['g/','cover/']});
  assert.ok(visible(intervalsFront,front));
  assert.equal(visible(intervals(covered,glandFront),front),false);
  assert.equal(JSON.stringify(gland),bytes);
  assert.equal(JSON.stringify(source),sourceBytes);
});

test('gland reconstruction refuses unmatched coefficients, pcurves and other boundary owners', () => {
  const source = evaluateCadPart(gearbox.input.partDocument).outputs.find(output => output.id === 'n9').brep;
  const certify = (body, owner) => convexCylinderRimSupport([0.51,-0.78,0.44], {
    circle: circleOf, primitive: face => faceGeometry(face), inPlane: () => true, charge: () => {},
  })(body,owner.edge,...owner.faces);
  const generator = body => body.edges.find(edge => edge.name === 'n8.side0#1|n8.side0#2#1');
  const peer = (body, owner) => body.coedges.find(use => use.edge === generator(body).id
    && !owner.cylinder.loops.includes(use.loop));
  assert.ok(certify(source, usesOf(source,glandFront))?.nativeHidden);
  for (const mutate of [
    body => { for (const point of generator(body).curve.controlPoints) point[0] += 1e-8; },
    body => { generator(body).curve.weights[1] += 1e-8; },
    (_body,owner) => { owner.cap.pcurve = structuredClone(owner.edge.curve); },
    (body,owner) => { body.loops.find(loop => loop.id === peer(body,owner).loop).face = 'missing-face'; },
    (body,owner) => {
      const use = peer(body,owner), loop = body.loops.find(item => item.id === use.loop);
      body.coedges.push({...use,id:'extra-generator-use'});
      loop.coedges.push('extra-generator-use');
    },
  ]) {
    const body = structuredClone(source), owner = usesOf(body,glandFront);
    mutate(body,owner);
    assert.equal(certify(body,owner),null);
  }
});
