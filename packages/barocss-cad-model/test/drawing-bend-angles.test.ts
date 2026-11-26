import test from 'node:test';
import assert from 'node:assert/strict';
import { bendTable } from '../src/drawing/tables';
import { cellText } from '../src/drawing/table';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import type { BendTable } from '@barocss/cad';

test('D2026 bendTable separates BEND ANGLE (58°) and INCLUDED (122°) when requested while preserving default 8-column table and bend-table provenance', () => {
  const th = 58 * Math.PI / 180;
  const shopTable: BendTable = {
    id: 'shop-58',
    sources: [{ id: 'press', label: 'Shop brake chart (58 deg)' }],
    rows: [
      { thickness: 2, radius: 3, angle: 58, deduction: 2.1, source: 'press' },
      { thickness: 2, radius: 3, angle: 90, deduction: 4.2, source: 'press' },
    ],
  };
  const doc: StudioDoc = {
    ...emptyDoc(),
    nodes: [{
      kind: 'sheet-contour',
      id: 'n0',
      path: [[0, 0], [50, 0], [50 + 35 * Math.cos(th), 35 * Math.sin(th)]],
      side: 'left',
      width: 20,
      thickness: 2,
      bendRadius: 3,
      bendTable: shopTable,
    }],
    outputs: { b1: { node: 0, side: 'solid' } },
    nextId: 1,
  };

  // Default bendTable remains backward-compatible (8 columns).
  const legacy = bendTable({ doc });
  assert.ok(!('error' in legacy), JSON.stringify(legacy));
  assert.deepEqual(legacy.columns.map(c => c.label), ['BEND', 'DIR', 'ANGLE', 'R', 'K', 'BA', 'BD', 'TABLE ROWS']);
  assert.equal(cellText(legacy.rows[0][2], legacy.columns[2]), '58.0');

  // Explicit included-angle table separates BEND ANGLE (58.0°) and INCLUDED (122.0°) and preserves table provenance.
  const full = bendTable({ doc }, { includeIncludedAngle: true });
  assert.ok(!('error' in full), JSON.stringify(full));
  assert.deepEqual(full.columns.map(c => c.label), ['BEND', 'DIR', 'BEND ANGLE', 'INCLUDED', 'R', 'K', 'BA', 'BD', 'TABLE ROWS']);
  assert.equal(full.rows.length, 1);
  const row = full.rows[0];
  assert.ok(Math.abs((row[2] as number) - 58) < 1e-9);
  assert.ok(Math.abs((row[3] as number) - 122) < 1e-9);
  assert.equal(cellText(row[2], full.columns[2]), '58.0');
  assert.equal(cellText(row[3], full.columns[3]), '122.0');
  assert.ok(Math.abs((row[7] as number) - 2.1) < 1e-9);
  assert.match(String(row[8]), /^shop-58 row 0/);
});
