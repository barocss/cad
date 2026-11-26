import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ASSEMBLY_BASE, readRoverAssembly, roverFrame } from '../src/roverAssembly';

const bytes = await readFile('examples/rover-assembly/rover-assembly.bcad');
const fixture = await readRoverAssembly(new Uint8Array(bytes));

test('review uses 25 native meshes and four exact groups without mutating placements', async () => {
  assert.equal(fixture.parts.length, 25);
  for (const part of fixture.parts) {
    assert.ok(part.mesh.indices.length > 0);
    assert.equal(part.mesh.positions.length, part.mesh.normals.length);
    assert.ok(part.offset.every(Number.isFinite));
  }
  assert.deepEqual(fixture.parts[0].offset, [0, 0, 0]);
  assert.ok(fixture.parts.slice(1).every(part => part.offset.some(v=>v!==0)));
  const expected = [[13,12],[18,5],[21,3],[25,4]];
  for (const [i, [visible, active]] of expected.entries()) {
    const frame = roverFrame(fixture, i, ASSEMBLY_BASE);
    assert.equal(frame.parts.length, visible);
    assert.equal(frame.active.size, active);
    assert.equal(frame.selected, ASSEMBLY_BASE);
    assert.deepEqual([...frame.active], fixture.steps[i].add);
  }
  assert.deepEqual([...roverFrame(fixture,3,'sensor').active], ['bracket','sensor','left-eye','right-eye']);
  assert.equal(roverFrame(fixture,3,'sensor').selected, 'sensor');
  assert.equal(roverFrame(fixture,2,'sensor').selected, null);
  assert.equal(roverFrame(fixture,2,'sensor').parts.some(part=>part.id==='sensor'), false);
  const full=roverFrame(fixture,null,'sensor');
  assert.equal(full.parts.length,25);
  assert.equal(full.active.size,0);
  assert.equal(full.selected,'sensor');
  assert.deepEqual(Buffer.from(await fixture.download().arrayBuffer()), bytes);
});

test('invalid fixture cannot replace the 25-part assembly overview', async () => {
  const bad = JSON.parse(bytes.toString());
  bad.assemblySteps[3].add[0] = 'missing';
  await assert.rejects(readRoverAssembly(new TextEncoder().encode(JSON.stringify(bad))));
});
