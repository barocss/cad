import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSurface, importSource, type DirectGeometry } from '@barocss/cad-model/engine/direct';
import { inspectSurfacePoint, surfaceIsoScope } from '../src/ui/surfaceInspection';
const source = '@model test { version: 0; length-unit: mm; @surface #panel { type: nurbs; degree-u:1; degree-v:1; knots-u:[-2,-2,6,6]; knots-v:[1,1,7,7]; control-points:[[[10,-6,3],[10,24,3]],[[50,-6,3],[50,24,3]]]; weights:[[1,1],[1,1]]; } }';
const seed = () => importSource({ sources: {}, objects: [] }, source, 'Inspection');
function trimmed(keep: 'inside' | 'outside' = 'outside'): DirectGeometry {
  const direct = seed();
  return { ...direct, objects: direct.objects.map(o => ({ ...o, trims: [{ keep, uv: [[0, 2], [2, 2], [2, 4], [0, 4]] }] })) };
}
function read(direct: DirectGeometry, u: number, v: number) { return inspectSurfacePoint(direct, direct.objects[0].id, u, v); }

test('stored trim hole classifies remaining, removed and exact boundary without changing support numbers', () => {
  const direct = trimmed(), before = structuredClone(direct);
  for (const [u, v, word] of [[1, 3, 'Removed'], [4, 3, 'Remaining'], [0, 3, 'Remaining']] as const) {
    const { region, ...numbers } = read(direct, u, v);
    assert.ok(region.startsWith(word)); assert.match(region, /stored trim loops/);
    assert.deepEqual(numbers, analyzeSurface(direct, direct.objects[0].id, u, v));
  }
  assert.deepEqual(direct, before);
});

test('island and multiple loops reuse all-loops display policy', () => {
  const island = trimmed('inside');
  assert.match(read(island, 1, 3).region, /^Remaining/);
  assert.match(read(island, 4, 3).region, /^Removed/);
  island.objects[0].trims!.push({ keep: 'outside', uv: [[.5, 2.5], [1.5, 2.5], [1.5, 3.5], [.5, 3.5]] });
  assert.match(read(island, 1, 3).region, /^Removed/);
});

test('same id replacement, clone, untrim and new source are read afresh', () => {
  const direct = trimmed(), clone = structuredClone(direct);
  assert.match(read(direct, 1, 3).region, /^Removed/);
  delete clone.objects[0].trims;
  assert.equal(read(clone, 1, 3).region, 'Untrimmed support surface');
  assert.match(read(direct, 1, 3).region, /^Removed/);
  assert.equal(read(seed(), 1, 3).region, 'Untrimmed support surface');
});

test('invalid domain or absent/ambiguous source produces no region answer', () => {
  const direct = trimmed();
  for (const [u, v] of [[-3, 3], [1, 8], [NaN, 3], [1, Infinity]]) assert.throws(() => read(direct, u, v));
  assert.throws(() => inspectSurfacePoint(direct, 'missing', 1, 3));
  const duplicate = { ...direct, objects: [...direct.objects, direct.objects[0]] };
  assert.throws(() => read(duplicate, 1, 3), /one current surface/);
});

test('iso scope explicitly describes support-surface output before execution', () => {
  assert.match(surfaceIsoScope(true), /whole support surface; stored trim loops are not applied/);
  assert.match(surfaceIsoScope(false), /whole untrimmed support surface/);
});
