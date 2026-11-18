import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceMap, type WorkspaceOptions } from '../src/robot/workspace';
import type { JointTree } from '../src/robot/joints';
import { isRefusal } from '../src/engine/refusal';

function twoR(): JointTree {
  return {
    version: 1, base: 'L0',
    links: ['L0', 'a', 'b'].map(id => ({ id, part: id, name: id })),
    joints: [
      { key: 'j1', type: 'continuous', parent: 'L0', child: 'a', axis: [0, 0, 1], origin: [0, 0, 0], mates: [] },
      { key: 'j2', type: 'continuous', parent: 'a', child: 'b', axis: [0, 0, 1], origin: [80, 0, 0], mates: [] },
    ],
    loops: [], couplings: [], problems: [], notes: [],
  };
}
const options = (samples: number, h = 5): WorkspaceOptions => ({ link: 'b', tool: [130, 0, 0], samples, h });
const badValues = (e: unknown) => isRefusal(e) && e.code === 'BAD_VALUES';

// Invalid counts must be rejected before the sampling loop, never rounded or executed.
test('workspace rejects fractional, nonfinite, unsafe and nonpositive sample counts without mutation', () => {
  for (const n of [100.5, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 0, -1]) {
    const tree = twoR(), o = options(n), beforeTree = structuredClone(tree), beforeOptions = structuredClone(o);
    assert.throws(() => workspaceMap(tree, o), badValues, String(n));
    assert.deepEqual(tree, beforeTree);
    assert.deepEqual(o, beforeOptions);
  }
});

test('workspace rejects nonfinite and nonpositive voxel size without mutation', () => {
  for (const h of [NaN, Infinity, -Infinity, 0, -1]) {
    const tree = twoR(), o = options(6, h), beforeTree = structuredClone(tree), beforeOptions = structuredClone(o);
    assert.throws(() => workspaceMap(tree, o), badValues, String(h));
    assert.deepEqual(tree, beforeTree);
    assert.deepEqual(o, beforeOptions);
  }
});

test('small positive integer counts retain exact accounting, deterministic JSON and unchanged input', () => {
  for (const n of [1, 6, 10, 100, 128]) {
    const tree = twoR(), o = options(n), beforeTree = structuredClone(tree), beforeOptions = structuredClone(o);
    const map = workspaceMap(tree, o);
    assert.equal(map.samples, n);
    assert.equal(map.excluded, 0);
    assert.equal(map.voxels.reduce((sum, v) => sum + v.count, 0) + map.excluded, n);
    assert.equal(JSON.stringify(workspaceMap(tree, o)), JSON.stringify(map));
    // JSON canonicalizes -0 to 0; compare serialized accounting, not signed-zero identity.
    const restored = JSON.parse(JSON.stringify(map)) as typeof map;
    assert.equal(restored.samples, n);
    assert.equal(restored.voxels.reduce((sum, v) => sum + v.count, 0) + restored.excluded, n);
    assert.deepEqual(tree, beforeTree);
    assert.deepEqual(o, beforeOptions);
  }
});

test('valid N10 preserves the existing missing slide range refusal', () => {
  const tree = twoR();
  tree.joints[1] = { ...tree.joints[1], type: 'prismatic', axis: [1, 0, 0] };
  const before = structuredClone(tree);
  assert.throws(() => workspaceMap(tree, options(10)), (e: unknown) => isRefusal(e) && e.code === 'NO_RANGE');
  assert.deepEqual(tree, before);
});
