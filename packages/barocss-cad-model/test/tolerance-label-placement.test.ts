import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toleranceLabelFixture, toleranceLegacyMoves } from './tolerance-label-placement-fixture';
import { acceptAll } from '../src/drawing/tolerance';
import { drawingIssues, issueContext } from '../src/drawing/issues';
import type { DrawingDimension } from '../src/drawing/types';

const rows = readFileSync(resolve(import.meta.dirname, '../samples/rows/fastener-sizes.json'), 'utf8');
const overlaps = (ctx: ReturnType<typeof issueContext>) => drawingIssues(ctx).filter(x => x.code === 'TEXT_OVER_LINES').flatMap(x => x.dims ?? []);
const withoutPlace = ({ place: _place, ...dim }: DrawingDimension) => { void _place; return dim; };

test('pinned +X/A4/0.5 decorated renderer clears basic rulers and acceptance clears the remaining counted label', async t => {
  const { initial, inputs } = await toleranceLabelFixture(rows), original = structuredClone(initial), start = performance.now();
  const result = acceptAll(inputs), elapsed = performance.now() - start;
  const legacy = toleranceLegacyMoves(inputs, result.accepted), before = issueContext({ ...inputs, settings: legacy }), after = issueContext({ ...inputs, settings: result.settings });
  // D1402's historical renderer had five before/four after. This counterfactual
  // reuses the current renderer: basic own-ruler collisions are now cleared at source.
  assert.deepEqual(overlaps(before), ['d5']);
  assert.deepEqual(overlaps(after), []);
  assert.deepEqual(result.settings.dimensions.map(withoutPlace), legacy.dimensions.map(withoutPlace));
  assert.deepEqual(result.settings.frames, legacy.frames); assert.deepEqual(result.settings.datums, legacy.datums);
  assert.equal(result.settings.orientation, 'x+'); assert.equal(result.settings.sheet, 'A4'); assert.equal(result.settings.scale, 0.5);
  assert.deepEqual(after.layout, before.layout);
  assert.deepEqual(after.sheet.dimensions.map(r => r.ok ? [r.value, r.text] : r), before.sheet.dimensions.map(r => r.ok ? [r.value, r.text] : r));
  const changed = result.settings.dimensions.filter((dim, i) => JSON.stringify(dim.place) !== JSON.stringify(legacy.dimensions[i].place));
  assert.deepEqual(changed.map(d => d.id), ['d5']); assert.equal(changed[0].count, 3); assert.equal(changed[0].basic, true);
  assert.deepEqual(after.sheet.groups.filter(g => g.id !== 'd5'), before.sheet.groups.filter(g => g.id !== 'd5'));
  assert.deepEqual(initial, original);
  // A generous regression ceiling, not an interactive latency claim or a new production search cap.
  assert.ok(elapsed < 5000, `acceptance took ${elapsed} ms`); t.diagnostic(`pinned acceptance ${elapsed.toFixed(1)} ms; current renderer 1→0; historical 5→4 retained in D1402 evidence`);
});

test('current unpinned automatic orientation remains clear after tolerance acceptance', async () => {
  const { inputs } = await toleranceLabelFixture(rows, false), result = acceptAll(inputs);
  assert.deepEqual(drawingIssues(issueContext({ ...inputs, settings: result.settings })), []);
});

test('manual collisions remain visible and repeated resolved automatic placement is unchanged', async t => {
  const { inputs } = await toleranceLabelFixture(rows), accepted = acceptAll(inputs), legacy = toleranceLegacyMoves(inputs, accepted.accepted);
  const manual = { ...legacy, dimensions: legacy.dimensions.map(({ auto: _auto, ...dim }) => { void _auto; return dim; }) };
  const manualResult = acceptAll({ ...inputs, settings: manual }); assert.deepEqual(manualResult.settings, manual);
  const manualIssues = overlaps(issueContext({ ...inputs, settings: manual }));
  assert.ok(manualIssues.length > 0);
  assert.deepEqual(overlaps(issueContext({ ...inputs, settings: manualResult.settings })), manualIssues);
  const start = performance.now(), repeat = acceptAll({ ...inputs, settings: accepted.settings }), elapsed = performance.now() - start;
  assert.deepEqual(repeat.settings, accepted.settings); assert.deepEqual(overlaps(issueContext({ ...inputs, settings: repeat.settings })), []);
  assert.ok(elapsed < 5000, `remaining no-safe labels took ${elapsed} ms`); t.diagnostic(`unchanged resolved-label pass ${elapsed.toFixed(1)} ms`);
});
