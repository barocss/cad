import assert from 'node:assert/strict';
import test from 'node:test';
import { runLockedPlateStudy } from './locked-plate-study';

const study = runLockedPlateStudy();

test('the pinned mesh and exact native target refuse distinct failure controls', () => {
  const { controls, refusedReferences, winner } = study;
  assert.deepEqual(refusedReferences, {
    unknownScale: { error: 'REFERENCE_SCALE_UNKNOWN' },
    openMesh: { error: 'REFERENCE_MESH_OPEN_OR_INVALID' },
  });
  for (const [name, code] of [
    ['wrongCentre', 'WRONG_BORE_LOCATION'],
    ['missingHole', 'MISSING_BORE'],
    ['wrongThickness', 'WRONG_PLATE_BOUNDS'],
    ['nearlyThrough', 'UNVERIFIED_THROUGH_BORE'],
    ['swapped', 'WRONG_BORE_DIAMETER'],
  ] as const) assert.ok(controls[name].issues.includes(code), name);
  assert.ok(controls.nearlyThrough.iou > 0.999 && controls.nearlyThrough.iou < 1);
  assert.ok(Math.abs(controls.swapped.iou - 0.981232) < 0.001);
  assert.deepEqual(winner.evidence.issues, []);
  assert.equal(winner.evidence.iou, 1);
});

test('both search policies share the catalog, order and limit with separate prefix feedback', () => {
  assert.equal(study.runs.length, 8);
  for (const { finalOnly, perFeature } of study.runs) {
    for (const run of [finalOnly, perFeature]) {
      assert.ok(run.observations.length <= study.budget);
      assert.equal(new Set(run.observations.map(value => JSON.stringify(value.path))).size, run.observations.length);
      if (run.passing) {
        assert.deepEqual(run.passing.issues, []);
        assert.equal(run.passing.bodySha256, study.winner.evidence.bodySha256);
      }
    }
    assert.ok(finalOnly.observations.every(row => row.path.length === 3 || row.evidence === undefined));
    assert.ok(perFeature.observations.every(row => row.evidence !== undefined));
  }
  assert.ok(study.runs[0].finalOnly.passing, 'both policies pass when the correct choices are offered first');
  assert.equal(study.runs[7].finalOnly.passing, undefined);
  assert.ok(study.runs[7].perFeature.passing);
});

test('a real repair sequence recovers after a drop in observed overlap', () => {
  const [stock, wrong, healed, firstHole, complete] = study.witness;
  assert.ok(wrong.iou < stock.iou);
  assert.ok(Math.abs(healed.iou - stock.iou) < 1e-9);
  assert.ok(firstHole.iou > healed.iou);
  assert.equal(complete.iou, 1);
  assert.deepEqual(complete.issues, []);
  assert.equal(new Set(study.witness.map(row => row.revision)).size, 5);
});
