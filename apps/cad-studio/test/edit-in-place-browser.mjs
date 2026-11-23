// Roadmap 10 ⑧: edit a part in place inside an assembly, in the actual Studio. Fixture apps/cad-studio/test/fixtures/edit-in-place.bcad: a base plate and two occurrences
// (Cube 1, Cube 2) of one definition "cube" (a 20 mm cube, Rev A). Real clicks and keys: Cube 2's Instance panel "Edit part"; the banner; the History step and feature editor of the
// cube's extrude (its first value, the width, 20 → 30, Apply); Cmd+S during the session (refused); Finish; Undo / Redo of the whole assembly; a second session changed and then Cancel → Discard.
// The independent Python oracle (python3 -I, zero product imports) checks the stored documents: after Finish both occurrences hold the edited definition (height 30) at Rev B, with their
// placements kept (the edit is the width, the feature editor's first value); after Undo the assembly equals the opened one; after Discard nothing changed.
// Root must freeze all sources first. Run from apps/cad-studio:
//   EDIT_IN_PLACE_SOURCE_FROZEN=1 PW_DIR=/Users/user/.cache/barocss-playwright/node_modules/playwright \
//   CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node test/edit-in-place-browser.mjs /absolute/artifacts
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const oracleSource = String.raw`"""Both cube occurrences take the in-place edit (the cube's width 30) at Rev B, placements kept. Product imports: zero."""
import json, sys
d = json.load(sys.stdin); doc = d['doc']; original = d['original']
inst = {i['id']: i for i in doc['instances']}; was = {i['id']: i for i in original['instances']}
for k in ('c1', 'c2'):
    i = inst[k]
    sk = next(n for n in i['doc']['nodes'] if n['kind'] == 'sketch')
    assert sk['max'][0] == 30, (k, 'width', sk['max'])
    assert i['part']['id'] == 'cube' and i['part']['rev'] == 'B', (k, i['part'])
    assert i['position'] == was[k]['position'] and i['rotation'] == was[k]['rotation'], (k, 'placement kept')
assert inst['c1']['doc'] == inst['c2']['doc'], 'one shared definition'
assert doc['nodes'] == original['nodes'], 'the base part untouched'
print(json.dumps({'status': 'PASS', 'productImports': 0}))
`;
const fixture = join(import.meta.dirname, 'fixtures', 'edit-in-place.bcad');
const extractedStatus = process.argv.includes('--extracted-status');
const expectCoveredNotice = process.argv.includes('--expect-covered-notice');
const dismissNotice = process.argv.includes('--dismiss-notice');
assert.ok(!(expectCoveredNotice && dismissNotice));
const f = await createFlow({ name: 'edit-in-place', envFrozen: 'EDIT_IN_PLACE_SOURCE_FROZEN', output: process.argv[2], qualification: 'EDIT_IN_PLACE', oracleSource,
  limits: ['One shared definition with one extrusion width edit. The see-through context is judged from screenshots.'],
  initialFiles: ['apps/cad-studio/test/edit-in-place-browser.mjs', 'apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/test/fixtures/edit-in-place.bcad', 'apps/cad-studio/src/app/editInPlace.ts',
    'apps/cad-studio/src/App.tsx', 'packages/barocss-cad-model/src/assembly/definitions.ts'],
  requiredFrozen: ['apps/cad-studio/src/app/editInPlace.ts'],
  extraFrozen: extractedStatus ? ['apps/cad-studio/src/ui/InPlaceEditStatus.tsx'] : [] });

const banner = () => f.page.getByRole('status', { name: 'Editing a part in place', exact: true });
function noticePosition(requireSeparation) {
  const status = document.querySelector('.in-place-bar'), notice = document.querySelector('.toast-stack > .toast[role="alert"]');
  const dismiss = notice?.querySelector('button[aria-label="Dismiss"]');
  if (!status || !notice || !dismiss) return null;
  const bounds = dismiss.getBoundingClientRect();
  const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const placement = {
    statusBottom: status.getBoundingClientRect().bottom,
    noticeTop: notice.getBoundingClientRect().top,
    dismissTarget: dismiss.contains(target),
    coveredByStatus: status.contains(target),
  };
  return requireSeparation
    ? placement.dismissTarget
      && Math.abs(placement.noticeTop - Math.max(status.parentElement.getBoundingClientRect().top + 144, placement.statusBottom + 8)) <= 1
    : placement;
}
const pick = async name => { await f.page.locator('.ol.instance:not(.nested)').filter({ hasText: name }).first().click(); await f.page.getByRole('complementary', { name: 'Instance', exact: true }).waitFor(); };
async function enter() {
  await pick('Cube 2'); await f.page.getByRole('complementary', { name: 'Instance', exact: true }).getByRole('button', { name: 'Edit part', exact: true }).click();
  await banner().waitFor(); await f.page.waitForFunction(() => !window.__studioDoc.instances, null, { timeout: 30000 }); await f.ready();
}
async function widthTo(v) {
  await f.openFeatureEditor(1, 'extrude');
  const field = f.editor().locator('input[type="number"]').first(); await field.fill(String(v));
  const before = await f.doc(); await f.editor().getByRole('button', { name: 'Apply', exact: true }).click(); await f.changed(before); await f.closeEditor();
}

await f.run(async () => {
  await f.newPage(); await f.openFile(fixture, 2); const original = await f.doc(); await f.snapshot('01-opened');

  f.phase = 'enter'; await enter();
  const text = await banner().textContent(); f.report.observations.push({ banner: text }); assert.match(text, /Editing Cube 2 · shared by 2/);
  const partDoc = await f.doc(); assert.equal(partDoc.nodes.length, 2, 'the working document is the cube definition'); await f.snapshot('02-in-place');
  const details = banner().locator('details');
  await details.locator('summary').click();
  assert.ok(await details.evaluate(element => element.open));
  assert.match(await details.innerText(), /Finish updates all 2 instances in one step/);
  await f.snapshot('02-details');

  f.phase = 'edit and Cmd+S refused'; await widthTo(30); await f.snapshot('03-width-30');
  const downloads = f.report.downloads.length; await f.page.evaluate(() => document.activeElement?.blur()); await f.page.keyboard.press('Meta+s');
  const notice = await f.waitToast(/before saving/);
  f.report.observations.push({ saveRefused: notice });
  assert.equal(f.report.downloads.length, downloads, 'nothing saved during the session');
  await f.snapshot('03-save-refused');
  if (expectCoveredNotice || dismissNotice) {
    const draft = await f.doc();
    const history = f.page.locator('.history .hs');
    const historyBefore = await history.evaluateAll(steps => steps.map(step => step.getAttribute('aria-label')));
    const placement = await f.page.evaluate(noticePosition);
    assert.ok(placement);
    if (expectCoveredNotice) {
      assert.ok(placement.statusBottom > placement.noticeTop && placement.coveredByStatus && !placement.dismissTarget);
      await f.same(draft);
      f.report.observations.push({ label: 'details-cover-dismiss', ...placement });
      await f.snapshot('03-covered-dismiss');
      return;
    }
    const separated = async label => {
      await f.page.waitForFunction(noticePosition, true);
      f.report.observations.push({ label, ...await f.page.evaluate(noticePosition) });
    };
    await separated('expanded-at-1440');
    await f.snapshot('03-notice-separated');
    await details.locator('summary').click();
    await separated('collapsed-at-1440');
    await details.locator('summary').click();
    await f.page.setViewportSize({ width: 1100, height: 1000 });
    await separated('expanded-at-1100');
    await f.snapshot('03-notice-narrow-desktop');
    await f.page.getByRole('alert').getByRole('button', { name: 'Dismiss', exact: true }).click();
    await f.page.getByRole('alert').filter({ hasText: 'before saving' }).waitFor({ state: 'hidden' });
    assert.ok(await details.evaluate(element => element.open));
    await f.same(draft);
    assert.deepEqual(await history.evaluateAll(steps => steps.map(step => step.getAttribute('aria-label'))), historyBefore);
    await f.page.setViewportSize({ width: 1440, height: 1000 });
    await f.snapshot('03-notice-dismissed');
  }

  f.phase = 'finish'; await banner().getByRole('button', { name: 'Finish', exact: true }).click();
  await banner().waitFor({ state: 'hidden' }); await f.page.waitForFunction(() => window.__studioDoc.instances?.length === 2, null, { timeout: 30000 }); await f.ready();
  const finished = await f.doc(); await f.snapshot('04-finished'); await f.runOracle({ doc: finished, original }, '04-finished');
  if (dismissNotice) {
    const top = await f.page.locator('.toast-stack').evaluate(element => Number.parseFloat(getComputedStyle(element).top));
    assert.equal(top, 144);
  }

  f.phase = 'undo, redo'; await f.undo(); await f.same(original); await f.redo(); await f.same(finished);

  f.phase = 'cancel and keep the draft'; await enter(); await widthTo(45);
  const draft = await f.doc();
  const statusAction = name => banner().getByRole('button', { name, exact: true });
  await statusAction('Cancel').click();
  await statusAction('Discard').waitFor();
  await f.same(draft);
  await f.snapshot('05-discard-offered');
  await statusAction('Keep editing').click();
  await statusAction('Finish').waitFor();
  await f.same(draft);
  await f.snapshot('06-keep-editing');

  f.phase = 'discard the draft'; await statusAction('Cancel').click(); await statusAction('Discard').click();
  await banner().waitFor({ state: 'hidden' }); await f.same(finished); await f.snapshot('07-discarded');
  const saved = await f.save('in-place-finished');
  const reopened = (await f.freshOpen(saved.file, finished, '08-fresh-open')).doc;
  await f.runOracle({ doc: reopened, original }, '08-fresh-open');
});
