import assert from 'node:assert/strict';
import test from 'node:test';
import { placedSectionHandleBox } from '../src/viewport/sectionSpan';
import type { Section } from '../src/viewport/sectionView';

const bounds = [
  { min: [-7, 0, 3], max: [5, 20, 11] },
  { min: [-7, 30, 3], max: [5, 50, 11] },
];
const section: Section = { mode: 'plane', planes: [{ axis: 'x', normal: [1, 0, 0], offset: -1 }] };

test('a placed-only arrow follows the visible world envelope throughout an interior one-plane drag', () => {
  assert.deepEqual(placedSectionHandleBox(section, bounds), { min: [-7, 0, 3], max: [5, 50, 11] });
  const moved: Section = { mode: 'plane', planes: [{ axis: 'x', normal: [1, 0, 0], offset: 1.5 }] };
  assert.deepEqual(placedSectionHandleBox(moved, [bounds[1]]), bounds[1]);
  const flipped: Section = { mode: 'plane', planes: [{ axis: 'x', normal: [-1, 0, 0], offset: -1.5 }] };
  assert.deepEqual(placedSectionHandleBox(flipped, [bounds[1]]), bounds[1]);
  assert.equal(placedSectionHandleBox(moved, []), null, 'no displayed geometry after scope loss');
});

test('placed-only eligibility does not admit other modes or unusable spans', () => {
  for (const mode of ['box', 'planes', 'cutout'] as const) assert.equal(placedSectionHandleBox({ ...section, mode }, bounds), null);
  assert.equal(placedSectionHandleBox({ ...section, planes: [...section.planes, ...section.planes] }, bounds), null);
  assert.equal(placedSectionHandleBox({ ...section, planes: [{ ...section.planes[0], offset: 5 }] }, bounds), null);
  assert.equal(placedSectionHandleBox(section, [{ min: [-7, 0, 3], max: [-7, 50, 11] }]), null);
  assert.equal(placedSectionHandleBox(section, [{ min: [-7, 0, 3], max: [Infinity, 50, 11] }]), null);
  assert.equal(placedSectionHandleBox(section, [{ min: [3, 50, 11], max: [5, 0, 3] }]), null);
});
