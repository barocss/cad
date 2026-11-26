import assert from 'node:assert/strict';
import test from 'node:test';
import { brepsFor } from '../src/engine/evaluate';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { decodeStudioFile, encodeStudioFile } from '../src/engine/container';
import { readStudioDoc } from '../src/engine/migrate';
import { projectViews } from '../src/drawing/project';
import { sheetDxf, sheetDxfDocument } from '../src/io/dxf';
import { sheetSvg } from '../src/io/svg';
import { drawingIssues, applyFix } from '../src/drawing/issues';
import { checkDrawingMetadata, readRevisions, revisionTableContent } from '../src/drawing/metadata';
import {
  FIRST_SHEET_ID,
  borderZoneFor,
  newRevisionMarkerId,
  resolveRevisionMarkers,
  revisionLocationSummaryMap,
  sheetFrameFor,
} from '../src/drawing/revisionMarkers';
import { checkSavedAnnotationRefs } from '../src/drawing/savedAnnotationRefs';
import { buildSheet } from '../src/drawing/sheet';
import { buildSheets } from '../src/drawing/sheetSet';
import { forSheet, mergeSheet, nextSheetId, removeSheet } from '../src/drawing/sheets';
import { readDrawing, type DrawingRevisionMarker, type DrawingSettings, type DrawingViews, type XY } from '../src/drawing/types';
import { layoutSheet } from '../src/drawing/views';

function samplePart(): { doc: StudioDoc; views: DrawingViews } {
  const doc: StudioDoc = {
    ...emptyDoc(),
    nodes: [
      { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [60, 40] },
      { kind: 'extrude', id: 'n1', sketch: 0, height: 12 },
      { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [15, 15], radius: 3, axis: 'z' },
    ],
    outputs: { b1: { node: 2, side: 'solid' } },
    nextId: 3,
  };
  const built = brepsFor(doc);
  assert.ok('breps' in built && built.breps.length > 0);
  const proj = projectViews(built.breps);
  assert.equal(proj.ok, true);
  return { doc, views: proj.views };
}

/** Independent border-grid zone formula matching the D2022 paper contract. */
function expectedZone(size: 'A4' | 'A3', at: XY): string | null {
  const [W, H] = size === 'A4' ? [297, 210] : [420, 297];
  const fx0 = 10, fy0 = 10, fx1 = W - 10, fy1 = H - 10;
  if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  if (at[0] < fx0 || at[0] > fx1 || at[1] < fy0 || at[1] > fy1) return null;
  const rows = size === 'A4' ? 4 : 6;
  const cols = size === 'A4' ? 6 : 8;
  const col = Math.min(cols - 1, Math.max(0, Math.floor(((at[0] - fx0) / (fx1 - fx0)) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(((at[1] - fy0) / (fy1 - fy0)) * rows)));
  return `${'ABCDEF'[row]}${col + 1}`;
}

test('D2022 border-grid zone formula handles boundaries, A4→A3, off-sheet, and scale/unit invariance', () => {
  // Exact inner frame boundaries on A4 [10, 10, 287, 200]
  assert.equal(borderZoneFor('A4', [10, 10]), 'A1');
  assert.equal(borderZoneFor('A4', [287, 200]), 'D6');
  assert.equal(borderZoneFor('A4', [10, 200]), 'D1');
  assert.equal(borderZoneFor('A4', [287, 10]), 'A6');

  // Outside inner frame → null
  assert.equal(borderZoneFor('A4', [9.99, 50]), null);
  assert.equal(borderZoneFor('A4', [287.01, 50]), null);
  assert.equal(borderZoneFor('A4', [50, 9.99]), null);
  assert.equal(borderZoneFor('A4', [50, 200.01]), null);
  assert.equal(borderZoneFor('A4', [Number.NaN, 50]), null);

  // Points across interior agree with independent formula and shift appropriately on A4→A3
  const samples: XY[] = [[35, 35], [160, 115], [250, 190], [115, 70]];
  for (const pt of samples) {
    assert.equal(borderZoneFor('A4', pt), expectedZone('A4', pt));
    assert.equal(borderZoneFor('A3', pt), expectedZone('A3', pt));
  }
  assert.equal(borderZoneFor('A4', [250, 190]), 'D6');
  assert.equal(borderZoneFor('A3', [250, 190]), 'D5');
  assert.deepEqual(sheetFrameFor('A4'), [10, 10, 287, 200]);
  assert.deepEqual(sheetFrameFor('A3'), [10, 10, 410, 287]);

  // Scale and mm/inch display settings never alter paper-mm zone calculations
  const base: DrawingSettings = {
    sheet: 'A4',
    projection: 'third',
    hidden: true,
    dimensions: [],
    revision: 'B',
    revisions: [{ revision: 'B', date: '2026-11-26', description: 'Flange hole update', eco: 'ECO-42' }],
    revisionMarkers: [{ id: 'rm1', revision: 'B', sheet: FIRST_SHEET_ID, at: [160, 115] }],
  };
  const mmSettings: DrawingSettings = { ...base, scale: 1, units: 'mm' };
  const inchSettings: DrawingSettings = { ...base, scale: 0.5, units: 'inch', dual: true };
  const mmOne = revisionLocationSummaryMap(mmSettings).get('B')!;
  const inchHalf = revisionLocationSummaryMap(inchSettings).get('B')!;
  assert.equal(mmOne.zones, 'C4');
  assert.equal(inchHalf.zones, 'C4');
  assert.equal(mmOne.sheets, '1');
  assert.equal(inchHalf.sheets, '1');
});

test('D2022 multi-sheet revision B matrix, deduplication, move/hide/delete, sheet rename/reorder/delete, and orphan diagnosis', () => {
  const { views } = samplePart();
  const baseSettings: DrawingSettings = {
    sheet: 'A4',
    projection: 'third',
    hidden: true,
    dimensions: [],
    revision: 'B',
    revisions: [
      { revision: 'A', date: '2026-11-20', description: 'Initial release', by: 'ENG' },
      { revision: 'B', date: '2026-11-26', description: 'Updated flange holes', by: 'ENG', eco: 'ECO-42' },
    ],
    sheets: [{ id: 'S2', name: 'Detail Sheet', views: ['right'] }],
    tables: [{ id: 'revisions', from: 'revisions' }],
    revisionMarkers: [
      { id: 'rm1', revision: 'B', sheet: FIRST_SHEET_ID, at: [35, 35] },      // Sheet 1, A1
      { id: 'rm2', revision: 'B', sheet: 'S2', at: [160, 115] },             // Sheet 2, C4
      { id: 'rm3', revision: 'B', sheet: FIRST_SHEET_ID, at: [30, 30] },     // Control: same sheet & same zone A1
    ],
  };

  // Deduplicated summary across Sheet 1 & Sheet 2
  const sum = revisionLocationSummaryMap(baseSettings).get('B')!;
  assert.equal(sum.sheets, '1, 2');
  assert.equal(sum.zones, 'A1, C4');
  assert.equal(sum.markerCount, 3);
  assert.equal(revisionLocationSummaryMap(baseSettings).get('A')!.sheets, null);

  // Build both sheets: Sheet 1 has rm1 + rm3 and full multi-sheet REVISIONS table; Sheet 2 has rm2
  const built = buildSheets(views, baseSettings, { title: 'Bracket', date: '2026-11-26' });
  assert.equal(built.length, 2);
  const svg1 = sheetSvg(built[0].sheet, 'Bracket S1');
  const svg2 = sheetSvg(built[1].sheet, 'Bracket S2');
  assert.ok(svg1.includes('data-revision-marker="rm1"'));
  assert.ok(svg1.includes('data-revision-marker="rm3"'));
  assert.ok(!svg1.includes('data-revision-marker="rm2"'));
  assert.ok(svg1.includes('>SHEETS</text>'));
  assert.ok(svg1.includes('>ZONES</text>'));
  assert.ok(svg1.includes('>1, 2</text>'));
  assert.ok(svg1.includes('>A1, C4</text>'));
  assert.ok(svg2.includes('data-revision-marker="rm2"'));
  assert.ok(!svg2.includes('data-revision-marker="rm1"'));

  // Edit on Sheet 2 via forSheet / mergeSheet preserves Sheet 1 markers
  const s2Local = forSheet(baseSettings, 1);
  assert.deepEqual(s2Local.revisionMarkers?.map(m => m.id), ['rm2']);
  const movedS2 = mergeSheet(baseSettings, 1, {
    ...s2Local,
    revisionMarkers: s2Local.revisionMarkers!.map(m => m.id === 'rm2' ? { ...m, at: [250, 190] as XY } : m),
  });
  assert.equal(movedS2.revisionMarkers?.length, 3);
  assert.equal(revisionLocationSummaryMap(movedS2).get('B')!.zones, 'A1, D6');

  // Hide rm1 (presentation-only): hidden from SVG ink, record & summary preserved
  const hiddenRm1: DrawingSettings = {
    ...baseSettings,
    revisionMarkers: baseSettings.revisionMarkers!.map(m => m.id === 'rm1' ? { ...m, hidden: true as const } : m),
  };
  const builtHidden = buildSheets(views, hiddenRm1, { title: 'Bracket', date: '2026-11-26' });
  const svgHidden = sheetSvg(builtHidden[0].sheet, 'Bracket S1');
  assert.ok(!svgHidden.includes('data-revision-marker="rm1"'));
  assert.ok(svgHidden.includes('data-revision-marker="rm3"'));
  assert.equal(revisionLocationSummaryMap(hiddenRm1).get('B')!.sheets, '1, 2');

  // Delete rm1 and rm3 → only rm2 on Sheet 2 remains
  const deletedSheet1Markers: DrawingSettings = {
    ...baseSettings,
    revisionMarkers: baseSettings.revisionMarkers!.filter(m => m.id === 'rm2'),
  };
  assert.equal(revisionLocationSummaryMap(deletedSheet1Markers).get('B')!.sheets, '2');
  assert.equal(revisionLocationSummaryMap(deletedSheet1Markers).get('B')!.zones, 'C4');

  // Sheet rename preserves marker ownership; sheet reorder updates SHEETS number
  const renamedAndReordered: DrawingSettings = {
    ...baseSettings,
    sheets: [
      { id: 'S3', name: 'New Middle', views: [] },
      { id: 'S2', name: 'Renamed Detail', views: ['right'] },
    ],
  };
  assert.equal(revisionLocationSummaryMap(renamedAndReordered).get('B')!.sheets, '1, 3');

  // Deleting Sheet 2 never silently moves rm2 to Sheet 1; diagnoses REVISION_MARKER_ORPHAN and reserves S2
  const { sheets: _s, notes: _n, ...withoutSheets } = baseSettings; void _s; void _n;
  const afterDeleteSheet2: DrawingSettings = { ...withoutSheets, ...removeSheet(baseSettings, 1) };
  assert.equal(afterDeleteSheet2.revisionMarkers?.find(m => m.id === 'rm2')?.sheet, 'S2');
  assert.equal(nextSheetId(afterDeleteSheet2), 'S3');
  const resolvedAfterSheetDel = resolveRevisionMarkers(afterDeleteSheet2);
  const rm2Status = resolvedAfterSheetDel.find(r => r.marker.id === 'rm2')!;
  assert.equal(rm2Status.ok, false);
  if (!rm2Status.ok) assert.equal(rm2Status.code, 'REVISION_MARKER_ORPHAN');

  // Deleting revision row B never silently relinks markers to revision A
  const afterDeleteRevB: DrawingSettings = {
    ...baseSettings,
    revisions: baseSettings.revisions!.filter(r => r.revision !== 'B'),
  };
  const resolvedAfterRevDel = resolveRevisionMarkers(afterDeleteRevB);
  assert.equal(resolvedAfterRevDel.every(r => !r.ok && r.code === 'REVISION_MARKER_ORPHAN'), true);

  // Off-sheet marker diagnoses REVISION_MARKER_OFF_SHEET with remove-revision-marker fix
  const withOffSheet: DrawingSettings = {
    ...baseSettings,
    sheets: undefined,
    revisionMarkers: [{ id: 'rm9', revision: 'B', sheet: FIRST_SHEET_ID, at: [2, 2] }],
  };
  const layout = layoutSheet(views, withOffSheet);
  const sheet = buildSheet(views, layout, withOffSheet, { title: 'Bracket', date: '2026-11-26' });
  const issues = drawingIssues({ views, layout, settings: withOffSheet, sheet, callout: () => null });
  const offIssue = issues.find(i => i.code === 'REVISION_MARKER_OFF_SHEET');
  assert.ok(offIssue && offIssue.fix?.kind === 'remove-revision-marker');
  const fixed = applyFix({ views, layout, settings: withOffSheet, sheet, callout: () => null }, offIssue.fix!);
  assert.equal(fixed.revisionMarkers, undefined);
});

test('D2022 auto → manual override → marker move → auto toggle off/on → explicit reset preserves authored metadata', () => {
  const markers: DrawingRevisionMarker[] = [
    { id: 'rm1', revision: 'B', sheet: FIRST_SHEET_ID, at: [35, 35] },
    { id: 'rm2', revision: 'B', sheet: 'S2', at: [160, 115] },
  ];
  const base: DrawingSettings = {
    sheet: 'A4',
    projection: 'third',
    hidden: true,
    dimensions: [],
    revision: 'B',
    sheets: [{ id: 'S2', views: ['right'] }],
    revisions: [{ revision: 'B', date: '2026-11-26', description: 'Boss rib thickened', by: 'KJM', eco: 'ECO-77' }],
    revisionMarkers: markers,
  };

  // 1. Auto initial
  assert.equal(revisionLocationSummaryMap(base).get('B')!.sheets, '1, 2');
  assert.equal(revisionLocationSummaryMap(base).get('B')!.zones, 'A1, C4');

  // 2. Manual override
  const overridden: DrawingSettings = {
    ...base,
    revisions: [{ ...base.revisions![0], manualSheets: 'ALL SHEETS', manualZones: 'MANUAL-Z' }],
  };
  assert.deepEqual(checkDrawingMetadata({ revisions: overridden.revisions }), []);
  assert.equal(revisionLocationSummaryMap(overridden).get('B')!.sheets, 'ALL SHEETS');
  assert.equal(revisionLocationSummaryMap(overridden).get('B')!.zones, 'MANUAL-Z');

  // 3. Move marker rm1 (A1 → B3) — manual override stays intact!
  const afterMove: DrawingSettings = {
    ...overridden,
    revisionMarkers: overridden.revisionMarkers!.map(m => m.id === 'rm1' ? { ...m, at: [115, 70] as XY } : m),
  };
  const movedSum = revisionLocationSummaryMap(afterMove).get('B')!;
  assert.equal(movedSum.autoZonesText, 'B3, C4');
  assert.equal(movedSum.sheets, 'ALL SHEETS');
  assert.equal(movedSum.zones, 'MANUAL-Z');

  // 4. Auto toggle off then back on — manual override STILL preserved!
  const autoOff: DrawingSettings = {
    ...afterMove,
    revisions: [{ ...afterMove.revisions![0], autoSheets: false, autoZones: false }],
  };
  assert.equal(revisionLocationSummaryMap(autoOff).get('B')!.sheets, 'ALL SHEETS');
  assert.equal(revisionLocationSummaryMap(autoOff).get('B')!.zones, 'MANUAL-Z');
  const autoBackOn: DrawingSettings = {
    ...autoOff,
    revisions: [{ ...autoOff.revisions![0], autoSheets: true, autoZones: true }],
  };
  assert.equal(revisionLocationSummaryMap(autoBackOn).get('B')!.sheets, 'ALL SHEETS');
  assert.equal(revisionLocationSummaryMap(autoBackOn).get('B')!.zones, 'MANUAL-Z');

  // 5. Explicit reset clears manual overrides and restores live auto summary without touching authored metadata
  const { manualSheets: _ms, manualZones: _mz, autoSheets: _as, autoZones: _az, ...resetRow } = autoBackOn.revisions![0];
  void _ms; void _mz; void _as; void _az;
  const reset: DrawingSettings = { ...autoBackOn, revisions: [resetRow] };
  assert.equal(revisionLocationSummaryMap(reset).get('B')!.sheets, '1, 2');
  assert.equal(revisionLocationSummaryMap(reset).get('B')!.zones, 'B3, C4');
  assert.equal(reset.revisions![0].date, '2026-11-26');
  assert.equal(reset.revisions![0].description, 'Boss rib thickened');
  assert.equal(reset.revisions![0].by, 'KJM');
  assert.equal(reset.revisions![0].eco, 'ECO-77');
});

test('D2022 .bcad round-trip, raw admission rejection, DXF readback, and legacy revision table compatibility', async () => {
  const { doc, views } = samplePart();
  // Legacy revision table with no markers or manual overrides keeps exact 4/5 legacy columns
  const legacy = revisionTableContent([{ revision: 'A', date: '2026-11-26', description: 'Initial' }]);
  assert.deepEqual(legacy.columns.map(c => c.key), ['revision', 'date', 'description', 'by']);

  // Saved admission rejects duplicate IDs, non-finite coordinates, bad revision/sheet
  assert.ok(checkSavedAnnotationRefs({
    revisionMarkers: [
      { id: 'rm1', revision: 'B', sheet: 'S1', at: [35, 35] },
      { id: 'rm1', revision: 'B', sheet: 'S1', at: [50, 50] },
    ],
  }).length > 0);
  assert.ok(checkSavedAnnotationRefs({
    revisionMarkers: [{ id: 'rm1', revision: 'B', sheet: 'S1', at: [Number.NaN, 35] }],
  }).length > 0);
  assert.ok(checkSavedAnnotationRefs({
    revisionMarkers: [{ id: 'rm1', revision: 'B\nX', sheet: 'S1', at: [35, 35] }],
  }).length > 0);
  assert.equal(newRevisionMarkerId([{ id: 'rm1' }, { id: 'rm3' }]), 'rm2');

  // Full .bcad save/open round-trip preserves markers and manual/auto flags while leaving model geometry invariant
  const drawing: DrawingSettings = {
    sheet: 'A4',
    projection: 'third',
    hidden: true,
    dimensions: [],
    revision: 'B',
    revisions: [
      { revision: 'B', date: '2026-11-26', description: 'Changed hole boss', eco: 'ECO-9', autoSheets: false, manualZones: 'Z-OVERRIDE' },
    ],
    sheets: [{ id: 'S2', views: ['right'] }],
    tables: [{ id: 'revisions', from: 'revisions' }],
    revisionMarkers: [
      { id: 'rm1', revision: 'B', sheet: FIRST_SHEET_ID, at: [40, 40] },
      { id: 'rm2', revision: 'B', sheet: 'S2', at: [160, 115] },
    ],
  };
  const encoded = await encodeStudioFile({ ...doc, drawing });
  const decoded = await decodeStudioFile(encoded);
  const reopened = readStudioDoc(decoded.text);
  assert.ok('doc' in reopened);
  if (!('doc' in reopened)) return;
  const restored = readDrawing(reopened.doc.drawing);
  assert.deepEqual(restored.revisionMarkers, drawing.revisionMarkers);
  assert.deepEqual(readRevisions(restored.revisions), drawing.revisions);

  // Independent DXF readback (structured document + AC1015 & R12 byte output)
  const built = buildSheets(views, restored, { title: 'Bracket', date: '2026-11-26' });
  const dxfDoc = sheetDxfDocument(built[0].sheet, built[0].layout);
  const texts = dxfDoc.entities.filter(e => e.type === 'text').map(e => e.text);
  assert.ok(texts.includes('SHEETS'), 'DXF missing SHEETS header');
  assert.ok(texts.includes('ZONES'), 'DXF missing ZONES header');
  assert.ok(texts.includes('Z-OVERRIDE'), 'DXF missing manual zone override');
  assert.ok(texts.includes('B'), 'DXF missing revision marker B');
  for (const version of ['AC1015', 'AC1009'] as const) {
    const dxf = sheetDxf(built[0].sheet, built[0].layout, version);
    const raw = new TextDecoder().decode(dxf.bytes);
    assert.ok(raw.includes('SHEETS'), `${version} DXF text missing SHEETS`);
    assert.ok(raw.includes('Z-OVERRIDE'), `${version} DXF text missing Z-OVERRIDE`);
  }
});
