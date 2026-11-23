import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const storedDistance = -4, nextDistance = -6;
const capCenter = distance => [20, 34 + distance, 0];

export async function checkSavedOutletDrag(f, stored, verify, expectMissing) {
  const button = (name, target = f.page) => target.getByRole('button', { name, exact: true });
  const group = () => f.page.locator('g.gizmo-handle[data-handle="d"]');
  const panel = () => f.page.getByRole('dialog', { name: 'Edit Offset face', exact: true });
  const field = () => panel().getByLabel('Offset', { exact: true });
  const preview = () => panel().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  const edit = async () => {
    await f.openFeatureEditor(2, 'open the saved outlet Offset');
    await button('Edit offset', f.editor()).click();
    await preview();
  };
  const cancel = () => button('Cancel', panel()).click();
  const apply = () => button('Apply', panel()).click();
  const top = async () => {
    await button('Top', f.page.locator('.views')).click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  };
  const pixel = point => f.page.evaluate(point => window.__studioScreenOf(point), point);
  const center = async () => {
    const box = await group().locator('circle').boundingBox();
    assert.ok(box, 'The saved cap must have one pointer handle.');
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  const capGap = async distance => {
    const point = await center(), projected = await pixel(capCenter(distance));
    const gap = Math.hypot(point[0] - projected[0], point[1] - projected[1]);
    assert.ok(gap < 0.5, JSON.stringify({ point, projected, gap }));
    return gap;
  };

  await top();
  await edit();
  assert.equal(Number(await field().inputValue()), storedDistance);
  if (expectMissing) {
    assert.equal(await group().count(), 0);
    await f.snapshot('12-history-offset-missing-handle');
    await field().fill(String(nextDistance));
    await preview();
    await f.same(stored);
    await cancel();
    f.report.observations.push({ label: 'outlet-history-handle-absent', typedPreview: nextDistance });
    return;
  }

  const anchorGapPx = await capGap(storedDistance), from = await center();
  const projectedFrom = await pixel(capCenter(storedDistance)), projectedTo = await pixel(capCenter(nextDistance));
  const travel = projectedTo.map((value, axis) => value - projectedFrom[axis]);
  const dragPixels = Math.hypot(...travel);
  assert.ok(dragPixels > 8, JSON.stringify({ from, travel }));
  const undoBefore = await button('Undo').getAttribute('data-tip');
  const drag = async label => {
    const point = await center();
    await f.page.mouse.move(...point);
    await f.page.mouse.down();
    const start = performance.now();
    await f.page.mouse.move(point[0] + travel[0], point[1] + travel[1], { steps: 7 });
    await f.page.locator('.gizmo-readout').filter({ hasText: /Offset [−-]6 mm/ }).waitFor();
    await preview();
    const previewMs = performance.now() - start;
    assert.equal(Number(await field().inputValue()), nextDistance);
    const previewGapPx = await capGap(nextDistance);
    await f.same(stored);
    assert.equal(await button('Undo').getAttribute('data-tip'), undoBefore);
    await f.snapshot(label);
    await f.page.mouse.up();
    return { previewMs, previewGapPx };
  };
  await drag('12-outlet-history-drag-cancel');
  await cancel();
  await f.same(stored);

  await edit();
  const measured = await drag('13-outlet-history-drag-preview');
  await apply();
  await f.changed(stored);
  const accepted = (await f.snapshot('14-outlet-history-drag-applied')).doc;
  assert.deepEqual(accepted, { ...stored, nodes: [...stored.nodes.slice(0, 2), { ...stored.nodes[2], distance: nextDistance }] });
  const native = await verify('outlet-history-drag-native', accepted, nextDistance);

  await f.undo();
  await f.same(stored);
  await f.redo();
  await f.same(accepted);
  await f.undo();
  await f.same(stored);
  await edit();
  await field().fill(String(nextDistance));
  await preview();
  await apply();
  await f.same(accepted);
  const saved = await f.save('paired-elbow-outlet-history-drag');
  const reopened = (await f.freshOpen(saved.file, accepted, '15-outlet-history-drag-open')).doc;
  assert.equal((await verify('outlet-history-drag-reopened-native', reopened, nextDistance)).digest, native.digest);
  await top();
  await edit();
  assert.equal(Number(await field().inputValue()), nextDistance);
  const reopenedGapPx = await capGap(nextDistance);
  await f.snapshot('16-outlet-history-handle-reopened');
  await cancel();
  await f.same(reopened);
  f.report.observations.push({ label: 'outlet-history-handle', anchorGapPx, dragPixels, ...measured, reopenedGapPx });
}
