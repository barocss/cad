import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/sheet-flat-dxf-roles-browser.mjs',
  'apps/cad-studio/src/ui/FlatPatternDialog.tsx',
  'packages/barocss-cad/src/frame-sheet/sheet-flat.ts',
  'packages/barocss-cad/src/index.ts',
  'packages/barocss-cad-model/src/drawing/tables.ts',
];

const f = await createFlow({
  name: 'sheet-flat-dxf-roles',
  output: process.argv[2],
  envFrozen: 'D2026_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Sheet-metal flat pattern DXF roles & bend/included angle semantics (#199) on a 58°/90° Z-bracket with circular hole + rounded-slot interior cutout: verifies Default (legacy OUTLINE), Shop (INNER_CUT/OUTER_CUT + BEND 58° (INCL 122°)), Cut-only (strictly cut contours, zero bend lines/TEXT), independent ezdxf 1.4.5 audit on exported files, and zero Doc/Undo mutation.',
  limits: ['Export profiles & angle semantics on current B-rep flat patterns; pocket machining, bend-crossing cuts, and CAM toolpath generation remain out of scope.'],
  inspectorSource: `
import { emptyDoc } from '@barocss/cad-model/engine/doc';
const T = 1.5, R = 2, K = 0.44, W = 36;
const th58 = 58 * Math.PI / 180;
const x2 = 60 + 30 * Math.cos(-th58), y2 = 30 * Math.sin(-th58);
const slot = [
  { kind: 'line', start: [24, -14] },
  { kind: 'arc', start: [36, -14], center: [36, -18], direction: 'cw' },
  { kind: 'line', start: [36, -22] },
  { kind: 'arc', start: [24, -22], center: [24, -18], direction: 'cw' },
];
const doc = {
  ...emptyDoc(),
  nodes: [
    { kind: 'sheet-contour', id: 'n0', path: [[0, 25], [0, 0], [60, 0], [x2, y2]], side: 'left', width: W, thickness: T, bendRadius: R, kFactor: K },
    { kind: 'sketch', id: 'n1', profile: 'circle', center: [14, -18], radius: 3.5, plane: { origin: [0, -1, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] } },
    { kind: 'extrude', id: 'n2', sketch: 1, height: T + 3 },
    { kind: 'difference', id: 'n3', parent: { node: 0, side: 'solid' }, tool: { node: 2, side: 'solid' } },
    { kind: 'sketch', id: 'n4', profile: 'loop', segments: slot, plane: { origin: [0, -1, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] } },
    { kind: 'extrude', id: 'n5', sketch: 4, height: T + 3 },
    { kind: 'difference', id: 'n6', parent: { node: 3, side: 'solid' }, tool: { node: 5, side: 'solid' } },
  ],
  outputs: { b1: { node: 6, side: 'solid' } },
  nextId: 7,
};
console.log(JSON.stringify({ doc }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (name, scope = f.page) => scope.getByLabel(name, { exact: true });

async function exportFlatDxf(dialog, filename) {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button('Export flat DXF', dialog).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return { path, text: await readFile(path, 'latin1') };
}

function checkEzdxf(path, expectCutOnly) {
  const py = process.env.DXF_ORACLE_PYTHON || join(homedir(), '.cache', 'barocss-ezdxf', 'bin', 'python');
  const oracleScript = resolve(import.meta.dirname, '../../../packages/barocss-cad/scripts/dxf-oracle.py');
  if (!existsSync(py) || !existsSync(oracleScript)) return;
  const parsed = JSON.parse(execFileSync(py, ['-I', oracleScript, path], { encoding: 'utf8' }));
  assert.deepEqual(parsed.audit, { errors: [], fixes: [] }, `${path}: ezdxf audit failed`);
  assert.equal(parsed.insunits, 4, `${path}: insunits must be mm (4)`);
  if (expectCutOnly) {
    assert.equal(parsed.modelspace.filter(e => e.type === 'TEXT').length, 0);
    assert.ok(parsed.modelspace.some(e => e.type === 'CIRCLE' && e.layer === 'INNER_CUT'));
    assert.ok(parsed.modelspace.some(e => e.type === 'ARC' && e.layer === 'INNER_CUT'));
    assert.ok(parsed.modelspace.some(e => e.type === 'LINE' && e.layer === 'OUTER_CUT'));
  } else {
    const texts = parsed.modelspace.filter(e => e.type === 'TEXT').map(e => e.text);
    assert.ok(texts.some(t => t.includes('BEND 58° (INCL 122°)')), `missing 58/122 in ezdxf: ${texts}`);
    assert.ok(texts.some(t => t.includes('BEND 90° (INCL 90°)')), `missing 90/90 in ezdxf: ${texts}`);
  }
}

await f.run(async () => {
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({
    name: 'z-bracket-58deg.bcad',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(info.doc)),
  });
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.length === 7);
  await f.ready();
  await f.page.waitForTimeout(300);
  const baseline = await f.doc();
  const undoDisabledBefore = await button('Undo').isDisabled();
  const historyBefore = await f.page.locator('.history .hs').count();

  // Select body in browser tree to inspect and open Flat Pattern dialog.
  await f.page.locator('.outliner .ol-row > button.ol').first().click();
  await button('Show the flat pattern').waitFor();
  await button('Show the flat pattern').click();

  const dialog = f.page.getByRole('dialog', { name: 'Flat pattern', exact: true });
  await dialog.waitFor();
  await dialog.getByRole('note', { name: 'Flat DXF role boundary', exact: true }).waitFor();
  const bendListText = await dialog.getByRole('list', { name: 'Flat bend angles', exact: true }).textContent();
  assert.ok(bendListText.includes('Bend 58°') && bendListText.includes('Included 122°'), `missing 58/122 summary: ${bendListText}`);
  assert.ok(bendListText.includes('Bend 90°') && bendListText.includes('Included 90°'), `missing 90/90 summary: ${bendListText}`);
  await f.snapshot('01-flat-default-dialog');

  // Export Default (legacy OUTLINE) DXF.
  const defDxf = await exportFlatDxf(dialog, 'z-bracket-default.dxf');
  assert.ok(defDxf.text.includes('\nOUTLINE\n') || defDxf.text.includes('\r\nOUTLINE\r\n'));
  assert.ok(defDxf.text.includes('58') && defDxf.text.includes('BEND_NOTES'));

  // Switch to Shop profile (OUTER_CUT / INNER_CUT + bend & included angles).
  await field('Flat DXF profile', dialog).selectOption('shop');
  await dialog.getByText(/BEND 58° \(INCL 122°\)/).waitFor();
  await f.snapshot('02-flat-shop-angles');
  const shopDxf = await exportFlatDxf(dialog, 'z-bracket-shop.dxf');
  assert.ok(shopDxf.text.includes('INNER_CUT') && shopDxf.text.includes('OUTER_CUT'));
  assert.ok(shopDxf.text.includes('BEND 58') && shopDxf.text.includes('INCL 122'));
  checkEzdxf(shopDxf.path, false);

  // Switch to Cut-only profile (zero bend lines, zero TEXT).
  await field('Flat DXF profile', dialog).selectOption('cut-only');
  assert.equal(await field('Include bend lines', dialog).isDisabled(), true);
  assert.equal(await field('Include bend notes', dialog).isDisabled(), true);
  await f.snapshot('03-flat-cut-only');
  const cutDxf = await exportFlatDxf(dialog, 'z-bracket-cut-only.dxf');
  assert.ok(cutDxf.text.includes('INNER_CUT') && cutDxf.text.includes('OUTER_CUT'));
  assert.ok(!cutDxf.text.includes('BEND_NOTES') && !cutDxf.text.includes('BEND_UP') && !cutDxf.text.includes('BEND_DOWN'));
  checkEzdxf(cutDxf.path, true);

  // Exporting flat DXFs must never mutate Doc or create Undo/History entries.
  assert.deepEqual(await f.doc(), baseline);
  assert.equal(await button('Undo').isDisabled(), undoDisabledBefore);
  assert.equal(await f.page.locator('.history .hs').count(), historyBefore);
});
