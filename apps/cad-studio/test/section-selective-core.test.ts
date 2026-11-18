import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { posedBody } from '@barocss/cad-model/robot/preview';
import { axisSection, sectionedInstances } from '../src/viewport/sectionView';
import { motionOf, poseMatrix } from '../src/viewport/instancePose';

function fixture() {
  const evaluated = evaluateDoc(rectanglePart(20, 12, 8), 1);
  assert.ok(evaluated.ok);
  const body = evaluated.bodies[0];
  const pose = poseMatrix({ R: Float64Array.from([0, -1, 0, 1, 0, 0, 0, 0, 1]), t: Float64Array.from([5, 0, 0]) }, [0, 0, 3]);
  const instances = [{ id: 'a', bodies: [body], placement: pose }, { id: 'b', bodies: [body], placement: pose }];
  const poses = new Map([['a', pose], ['b', pose]]);
  const section = axisSection({ axis: 'x', at: 0, keep: 'positive' });
  return { body, pose, instances, poses, section };
}

test('selective section: CPU excluded occurrence receives its complete world pose once, with no cap or shared mutation', () => {
  const { body, pose, instances, poses, section } = fixture();
  const original = structuredClone(instances);
  const [a, b] = sectionedInstances(instances, poses, section, false, ['a']);
  assert.deepEqual(a.bodies[0].mesh, posedBody(body, motionOf(pose)).mesh);
  assert.equal('placement' in a, false, 'the posed CPU packet must not receive the placement again');
  assert.equal(a.bodies[0].mesh.faces.some(f => f.id === 'section-cap'), false);
  assert.ok(b.bodies[0].mesh.faces.some(f => f.id === 'section-cap'), 'same shared body in b remains clipped');
  assert.ok('sourceBodies' in a && 'sourceFaces' in a && 'sourceEdges' in a);
  assert.deepEqual(a.sourceBodies, [0]);
  for (const f of body.mesh.faces) assert.equal(a.sourceFaces![0][f.index], f.index);
  for (const e of body.mesh.edges) assert.equal(a.sourceEdges![0][e.index], e.index);
  assert.deepEqual(instances, original);
  assert.equal(instances[0].bodies[0], instances[1].bodies[0]);
});

test('selective section: existing provenance and missing authority survive an uncut copy', () => {
  const { body, poses, section } = fixture();
  const faces = body.mesh.faces.map(f => f.index === 0 ? -1 : f.index + 10);
  const edges = body.mesh.edges.map(e => e.index === 0 ? -1 : e.index + 20);
  const packet = [{ id: 'a', bodies: [body], sourceBodies: [7], sourceFaces: [faces], sourceEdges: [edges] }];
  const [shown] = sectionedInstances(packet, poses, section, false, ['a']);
  assert.deepEqual(shown.sourceBodies, [7]);
  assert.deepEqual(shown.sourceFaces, [faces]);
  assert.deepEqual(shown.sourceEdges, [edges]);
  const [missing] = sectionedInstances([{ ...packet[0], sourceFaces: [], sourceEdges: [] }], poses, section, false, ['a']);
  assert.ok(missing.sourceFaces![0].every(v => v === -1));
  assert.ok(missing.sourceEdges![0].every(v => v === -1));
});

test('selective section: GPU keeps geometry identity, clearing exclusions restores old CPU results and multi-plane ignores them', () => {
  const { instances, poses, section } = fixture();
  assert.equal(sectionedInstances(instances, poses, section, true, ['a']), instances);
  assert.deepEqual(sectionedInstances(instances, poses, section, false, []), sectionedInstances(instances, poses, section, false));
  assert.deepEqual(sectionedInstances(instances, poses, section, false, ['missing']), sectionedInstances(instances, poses, section, false));
  const multiple = { ...section, planes: [...section.planes, ...section.planes] };
  assert.deepEqual(sectionedInstances(instances, poses, multiple, false, ['a']), sectionedInstances(instances, poses, multiple, false));
});
