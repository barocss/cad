import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/sketch-open-ends-browser.mjs',
  'apps/cad-studio/src/app/sketchOpenGuidance.ts',
  'apps/cad-studio/src/sketch/openEnds.ts',
  'apps/cad-studio/src/sketch/useSketchOpenEnds.ts',
  'apps/cad-studio/src/sketch/useSketchActions.ts',
  'apps/cad-studio/src/ui/OpenEndsControls.tsx',
  'apps/cad-studio/src/ui/StudioSketchInspector.tsx',
  'apps/cad-studio/src/viewport/sketchOverlay.tsx',
  'apps/cad-studio/src/styles.css',
  'apps/cad-studio/src/App.tsx',
];

const f = await createFlow({
  name: 'sketch-open-ends',
  output: process.argv[2],
  envFrozen: 'D2015_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Find open ends marks only unclosed material Line/Arc chain ends matching Finish, auto-shows on Finish open-chain refusal, updates live on close/Undo/Esc/sketch switch without mutating doc/history, stays distinguishable when zoomed out, and never intercepts sketch picking/snapping.',
  limits: ['XY sketch with closed rectangle, open construction line, and open material chain. No auto-close, forced snap, or schema change.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (d.seed) {
  const guide = {
    kind: 'polygon',
    points: [[0, -10], [40, -10]],
    bulges: [0, 0],
    closed: false,
    construction: true,
    ids: ['e5', 'e6'],
    pending: false,
  };
  const sketchNode = {
    kind: 'sketch',
    profile: 'rectangle',
    min: [0, 0],
    max: [40, 30],
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] },
    construction: [guide],
    id: 'n0',
  };
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), sketchNode), { kind: 'extrude', sketch: 0, height: 4 })));
} else {
  console.log(JSON.stringify({ ok: true }));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const openEndMarkers = () => f.page.locator('.vp-overlay [data-open-end]');

async function readMarkers() {
  return f.page.evaluate(() =>
    [...document.querySelectorAll('.vp-overlay [data-open-end]')].map(el => {
      const rect = el.getBoundingClientRect();
      const text = el.querySelector('text')?.textContent?.trim() ?? '';
      const hasRing = !!el.querySelector('circle.sk-open-end-ring');
      const hasDiamond = !!el.querySelector('polygon.sk-open-end-diamond');
      const pointerEvents = getComputedStyle(el).pointerEvents;
      const pillRect = el.querySelector('rect.sk-open-end-pill')?.getBoundingClientRect();
      return {
        label: el.getAttribute('data-open-end'),
        role: el.getAttribute('data-open-role'),
        point: el.getAttribute('data-open-point'),
        text,
        hasRing,
        hasDiamond,
        pointerEvents,
        box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        pill: pillRect ? { x: pillRect.x, y: pillRect.y, w: pillRect.width, h: pillRect.height } : null,
      };
    }),
  );
}

await f.run(async () => {
  const seed = await f.inspect('seed', { seed: true });
  await f.newPage();
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({
    name: 'open-ends-seed.bcad',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await f.ready();

  // Open Edit sketch on the sketch containing a closed rectangle + open construction line.
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, -10], [80, 30]]);

  // Closed rectangle + open construction line must report 0 open ends.
  await button('Find open ends', f.sketchPanel()).click();
  await f.sketchPanel().getByText('No open ends found in material contours.', { exact: true }).waitFor();
  assert.equal(await openEndMarkers().count(), 0);
  await button('Hide open ends', f.sketchPanel()).click();
  await f.same(seed);

  // Draw an intentionally open material Line chain: (50, 0) -> (80, 0) -> (80, 20).
  await f.tool('Line', 'l');
  await f.worldClick([50, 0]);
  await f.worldClick([80, 0]);
  await f.worldClick([80, 20]);

  const undoDisabledBefore = await button('Undo').isDisabled();
  const docBefore = await f.doc();

  // 1) User clicks Find open ends: marks ONLY (50, 0) and (80, 20), never closed rect or open construction line.
  await button('Find open ends', f.sketchPanel()).click();
  await f.sketchPanel().getByText('Found 2 open ends (1 open chain).', { exact: true }).waitFor();
  await f.page.waitForFunction(() => document.querySelectorAll('.vp-overlay [data-open-end]').length === 2);
  const markers1 = await readMarkers();
  assert.deepEqual(markers1.map(m => [m.label, m.point]), [['Open A', '50,0'], ['Open B', '80,20']]);
  assert.ok(markers1.every(m => m.hasRing && m.hasDiamond && m.text === m.label && m.pointerEvents === 'none'));
  assert.equal(await button('Undo').isDisabled(), undoDisabledBefore, 'Find open ends must not change Undo state');
  await f.same(docBefore);
  await f.snapshot('01-open-ends-found');

  // Toggle hide cleanly without mutating doc/history.
  await button('Hide open ends', f.sketchPanel()).click();
  await f.page.waitForFunction(() => document.querySelectorAll('.vp-overlay [data-open-end]').length === 0);
  assert.equal(await button('Undo').isDisabled(), undoDisabledBefore, 'Hide open ends must not change Undo state');
  await f.same(docBefore);

  // 2) Finish while open: refused with guidance AND markers auto-appear!
  await f.page.locator('.topbar button.finish').click();
  await f.sketchPanel().getByRole('alert').waitFor();
  await f.page.waitForFunction(() => document.querySelectorAll('.vp-overlay [data-open-end]').length === 2);
  await button('Hide open ends', f.sketchPanel()).waitFor();
  await f.snapshot('02-finish-refusal-auto-marks');

  // 3) Zoom out strongly: both markers stay visible with symbol+text and non-overlapping badges, pointer-events none.
  const canvasBox = await f.page.locator('.vp-canvas').boundingBox();
  assert.ok(canvasBox);
  await f.page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await f.page.mouse.wheel(0, 600);
  await f.page.waitForTimeout(300);
  await f.page.mouse.wheel(0, 600);
  await f.page.waitForTimeout(300);
  const zoomed = await readMarkers();
  assert.equal(zoomed.length, 2);
  assert.ok(zoomed.every(m => m.hasRing && m.hasDiamond && m.pointerEvents === 'none' && m.pill && m.pill.w > 20));
  const [pA, pB] = zoomed.map(m => m.pill);
  const pillsOverlap = pA.x < pB.x + pB.w && pB.x < pA.x + pA.w && pA.y < pB.y + pB.h && pB.y < pA.y + pA.h;
  assert.equal(pillsOverlap, false, `expected separated badges when zoomed out, got ${JSON.stringify([pA, pB])}`);
  await f.snapshot('03-zoomed-out-markers');

  // Zoom back in cleanly so (50, 0) is well inside canvas.
  await f.page.mouse.wheel(0, -1200);
  await f.page.waitForTimeout(350);
  await f.frame([[0, -10], [80, 30]]);

  // 4) Clicking directly on the Open A marker at (50, 0) passes through (not intercepted!) and closes the chain!
  await f.worldClick([50, 0]);
  await f.page.waitForFunction(() => document.querySelectorAll('.vp-overlay [data-open-end]').length === 0);
  await f.sketchPanel().getByText('No open ends found in material contours.', { exact: true }).waitFor();
  await f.snapshot('04-closed-no-open-ends');

  // 5) Undo closing restores open chain -> markers reappear live; Escape hides markers without leaving sketch.
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Meta+z');
  await f.page.waitForFunction(() => document.querySelectorAll('.vp-overlay [data-open-end]').length === 2);
  await f.page.keyboard.press('Escape');
  await f.page.waitForFunction(() => document.querySelectorAll('.vp-overlay [data-open-end]').length === 0);
  await f.sketchPanel().waitFor();

  // Redo closing, Finish sketch cleanly, then open a new sketch and confirm 0 stale markers leak.
  await f.page.keyboard.press('Meta+Shift+z');
  await f.page.waitForTimeout(150);
  const finished = (await f.finishSketch('05-finished-closed')).doc;
  assert.equal(finished.nodes[0].regions?.length, 1, 'closed second contour persisted as region');

  await f.page.getByLabel('Mode', { exact: true }).getByRole('button', { name: 'Sketch', exact: true }).click();
  await f.sketchPanel().waitFor();
  assert.equal(await openEndMarkers().count(), 0, 'new sketch must have zero stale open-end markers');
  await f.page.keyboard.press('Escape');
  await f.sketchPanel().waitFor({ state: 'hidden' });
});
