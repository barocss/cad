import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convexHull } from '@barocss/cad';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, placeBody, type BodyResult } from '@barocss/cad-model/engine/evaluate';
import { rotationMatrix } from '@barocss/cad-model/engine/placement';
import { solveDoc } from '@barocss/cad-model/assembly/edit';
import { tablesFor } from '@barocss/cad-model/assembly/faces';
import { BASE } from '@barocss/cad-model/assembly/mates';
import { jointTreeOf } from '@barocss/cad-model/robot/joints';
import { sweepLinks } from '@barocss/cad-model/robot/sweep';
import { workspaceMap } from '@barocss/cad-model/robot/workspace';
import { mapRobotWorkspace } from '../src/robot/RobotWorkspacePanel';

function fixture(name: string) {
  const doc = JSON.parse(readFileSync(resolve(process.cwd(), `../../packages/barocss-cad/conformance/rm/${name}/case.json`), 'utf8')).input.document as StudioDoc;
  const original = structuredClone(doc), solved = solveDoc(doc);
  const tree = jointTreeOf(solved.doc, { instances: solved.doc.instances ?? [], problems: solved.problems }, tablesFor(solved.doc));
  assert.equal(tree.problems.length, 0);
  const bodies = new Map<string, BodyResult[]>();
  const evaluate = (part: StudioDoc) => { const result = evaluateDoc(part, 1); assert.ok(result.ok, JSON.stringify(result)); return result.bodies; };
  bodies.set(BASE, evaluate(solved.doc));
  for (const inst of solved.doc.instances ?? []) {
    const rotation = [...rotationMatrix(inst.rotation)];
    bodies.set(inst.id, evaluate(inst.doc).map(body => placeBody({ ...body, mesh: { ...body.mesh, positions: body.mesh.positions.slice(), normals: body.mesh.normals.slice(), edgeLines: body.mesh.edgeLines.slice() } }, rotation, inst.position)));
  }
  const readBodies = (part: string) => bodies.get(part);
  const links = sweepLinks(tree, readBodies, points => convexHull(points).positions);
  // This fixture's serial chain has exactly one leaf; avoid repeating production's depth reduction.
  const leaves = tree.links.filter(link => !tree.joints.some(joint => joint.parent === link.id));
  const end = name === 'chain-2r' ? leaves[0].id : 'b';
  if (name === 'chain-2r') assert.equal(leaves.length, 1);
  const origin = tree.joints.find(joint => joint.child === end)!.origin;
  const hull = links.find(link => link.link === end)!.hull;
  const points = Array.from({ length: hull.length / 3 }, (_, index) => Array.from(hull.slice(index * 3, index * 3 + 3)));
  // Stable sorting keeps the first hull corner when distances tie, as the previous inspector did.
  const tool = points.sort((a, b) => Math.hypot(...b.map((value, k) => value - origin[k])) - Math.hypot(...a.map((value, k) => value - origin[k])))[0];
  return { doc, original, tree, readBodies, links, end, tool };
}

test('workspace extraction keeps the deepest-link farthest-hull tool and deterministic map without document edits', () => {
  const f = fixture('chain-2r'), beforeTree = structuredClone(f.tree);
  const expected = workspaceMap(f.tree, { link: f.end, tool: f.tool, samples: 128, h: 10 });
  const actual = mapRobotWorkspace(f.tree, f.readBodies, 128, 10, false);
  assert.deepEqual(actual, expected);
  assert.deepEqual(mapRobotWorkspace(f.tree, f.readBodies, 128, 10, false), actual);
  assert.ok(actual.voxels.length > 0);
  assert.notDeepEqual(actual, workspaceMap(f.tree, { link: f.end, samples: 128, h: 10 }), 'the hull tip, not the joint origin, is mapped');
  assert.deepEqual(f.doc, f.original);
  assert.deepEqual(f.tree, beforeTree);
});

test('contact-free mapping passes the native link geometry only when requested', () => {
  const f = fixture('ccd-post');
  const unfiltered = workspaceMap(f.tree, { link: f.end, tool: f.tool, samples: 128, h: 10 });
  const filtered = workspaceMap(f.tree, { link: f.end, tool: f.tool, samples: 128, h: 10, links: f.links });
  assert.deepEqual(mapRobotWorkspace(f.tree, f.readBodies, 128, 10, false), unfiltered);
  assert.deepEqual(mapRobotWorkspace(f.tree, f.readBodies, 128, 10, true), filtered);
  assert.ok(filtered.excluded > 0, 'the post fixture exercises exclusion, not only the no-contact branch');
  assert.equal(unfiltered.excluded, 0);
  assert.deepEqual(f.doc, f.original);
});

test('an unlimited slide refuses without changing the tree or document', () => {
  const f = fixture('chain-2r');
  const tree = { ...f.tree, joints: f.tree.joints.map((joint, index) => index ? joint : { ...joint, type: 'prismatic' as const, limit: undefined }) };
  const before = structuredClone(tree);
  assert.throws(() => mapRobotWorkspace(tree, f.readBodies, 32, 10, false), /\[NO_RANGE\].*slide .*has no limits/);
  assert.deepEqual(tree, before);
  assert.deepEqual(f.doc, f.original);
});
