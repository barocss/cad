import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { solveDoc } from '../src/assembly/edit';
import { tablesFor } from '../src/assembly/faces';
import { jointTree, jointTreeOf } from '../src/robot/joints';
import { Robot } from '../src/api/robot';
import { dispatchTool } from '../src/chat/tools';
import { evaluateDoc } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
function fixture(base = 'base'): StudioDoc {
  const part = rectanglePart(10, 10, 10);
  return { ...rectanglePart(20, 20, 5), instances: ['a', 'b', 'g'].map((id, i) => ({ id, name: 'Same name', doc: part, position: [i * 20, 0, 20], rotation: [0, 0, 0], ...(id === 'g' ? { grounded: true } : {}) })),
    mates: [{ id: 'ab', kind: 'lock', a: { part: 'a', face: '' }, b: { part: 'b', face: '' }, rel: { position: [20, 0, 0], rotation: [0, 0, 0] } }], robot: { version: 1, base } };
}
const tree = (doc: StudioDoc) => { const solved = solveDoc(doc); assert.deepEqual(solved.problems, []); return jointTreeOf(solved.doc, { instances: solved.doc.instances!, problems: solved.problems }, tablesFor(solved.doc)); };
test('disconnected groups report selected-base reachability without denying existing locks or grounding', () => {
  for (const base of ['base', 'a']) {
    const doc = fixture(base), before = JSON.stringify(doc), result = tree(doc);
    const included = base === 'base' ? ['base', 'g'] : ['a', 'b'], excluded = base === 'base' ? ['a', 'b'] : ['base', 'g'];
    assert.equal(result.base, base); assert.deepEqual(result.links.map(link => link.id), included);
    assert.deepEqual(result.joints.map(j => [j.parent, j.child, j.type, j.mates]), [[...included, 'fixed', base === 'base' ? [] : ['ab']]]);
    assert.deepEqual(result.loops, []); assert.deepEqual(result.problems.map(p => [p.code, p.parts]), excluded.map(id => ['NOT_CONNECTED', [id]]));
    for (const issue of result.problems) {
      assert.match(issue.message, /not reachable from the selected base/);
      assert.ok(issue.message.includes(`(${base})`)); assert.ok(issue.message.includes(`(${issue.parts![0]})`));
      assert.doesNotMatch(issue.message, /joined to no other|is not fixed/);
    }
    assert.equal(JSON.stringify(doc), before);
  }
  const fallback = tree(fixture('missing'));
  assert.equal(fallback.base, 'base'); assert.equal(fallback.problems[0].code, 'BASE_UNKNOWN');
  assert.ok(fallback.problems.slice(1).every(p => p.message.includes('Base part (base)')));
});
test('public joints and controlled get_joints agree, preserve documents and survive container fresh read', async () => {
  for (const base of ['base', 'a']) {
    const doc = fixture(base), before = JSON.stringify(doc), robot = new Robot(doc), publicTree = robot.joints();
    const evaluated = evaluateDoc(doc, 1); assert.ok(evaluated.ok);
    const reply = await dispatchTool({ doc, bodies: evaluated.bodies }, 'get_joints', {}, async d => evaluateDoc(d, 2));
    assert.ok(!reply.isError, reply.content); assert.deepEqual(JSON.parse(reply.content), publicTree);
    assert.equal(JSON.stringify(reply.state.doc), before); assert.equal(JSON.stringify(robot.doc), before);
    const read = await readStudioFile(encodeStudioFile(doc)); assert.ok(!('error' in read));
    if ('error' in read) return;
    assert.deepEqual(read.doc.instances, doc.instances); assert.deepEqual(read.doc.mates, doc.mates); assert.deepEqual(read.doc.robot, doc.robot);
    assert.deepEqual(new Robot(read.doc).joints(), publicTree); assert.equal(JSON.stringify(doc), before);
  }
});

test('failed mates and cam-only relationships remain excluded rather than becoming valid tree edges', () => {
  const doc = fixture('a');
  const input = { instances: doc.instances!, mates: doc.mates!, tables: tablesFor(doc), settings: doc.robot };
  const failed = jointTree({ ...input, mateProblems: [{ mate: 'ab', reason: 'controlled failed mate' }] });
  assert.deepEqual(failed.links.map(link => link.id), ['a']);
  assert.ok(failed.problems.some(problem => problem.code === 'MATE_PROBLEM'));
  assert.deepEqual(failed.problems.filter(p => p.code === 'NOT_CONNECTED').map(p => p.parts), [['base'], ['b'], ['g']]);
  const cam = jointTree({ ...input, mates: [{ ...doc.mates![0], kind: 'cam' }] });
  assert.deepEqual(cam.links.map(link => link.id), ['a']);
  assert.deepEqual(cam.problems.filter(p => p.code === 'NOT_CONNECTED').map(p => p.parts), [['base'], ['b'], ['g']]);
  assert.deepEqual(cam.couplings, [], 'disconnected cam-only relationship adds no coupling');
});
