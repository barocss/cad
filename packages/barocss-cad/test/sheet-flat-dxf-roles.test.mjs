import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  evaluateCadPart, flatPatternDxf, flatPatternOf, includedBendAngle, isFlatPatternError, writeDxf,
} from '../dist/index.js';

const D = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const out = features => evaluateCadPart(D(features)).outputs.at(-1);
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

/**
 * Z-bracket with one UP bend (58° bend / 122° included) and one DOWN bend (90° bend / 90° included),
 * plus one circular through-hole and one rounded-slot (line + arc) interior cutout on the flat middle leg.
 */
function fixtureWithCutoutsAndTwoBends() {
  const T = 1.5, R = 2, K = 0.44, W = 36;
  const th58 = 58 * Math.PI / 180;
  // Path: leg0 horizontal (0,0)->(50,0), bend1 DOWN 90° to (50,-25)? Wait:
  // A Z-path gives one bend turning left (one direction) and one turning right (opposite direction)!
  // Leg0: (0,25) -> (0,0) (downward -Y), turn +90° CCW to +X: (0,0)->(60,0),
  // then turn CW by 58°: direction (cos(-58°), sin(-58°)) of length 30!
  const x2 = 60 + 30 * Math.cos(-th58), y2 = 30 * Math.sin(-th58);
  const slot = [
    { kind: 'line', start: [24, -14] },
    { kind: 'arc', start: [36, -14], center: [36, -18], direction: 'cw' },
    { kind: 'line', start: [36, -22] },
    { kind: 'arc', start: [24, -22], center: [24, -18], direction: 'cw' },
  ];
  return out([
    { id: 'z', kind: 'sheet-contour', path: [[0, 25], [0, 0], [60, 0], [x2, y2]], side: 'left', width: W, thickness: T, bendRadius: R, kFactor: K },
    // Circular hole on middle leg (y=0..T plane -> normal +Y, xAxis +X, z is -W..0 -> v = -z in [0, W]?)
    // On plane { origin: [0, -1, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] }, local yAxis = cross(normal, xAxis) = [0, 0, -1]!
    // So world [x, y, z] has local u = x, v = -z! Middle leg spans z in [0, W] -> v in [-W, 0]!
    { id: 'h1', kind: 'sketch', profile: 'circle', center: [14, -18], radius: 3.5, plane: { origin: [0, -1, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] } },
    { id: 'h1e', kind: 'extrude', sketch: 'h1', height: T + 3 },
    { id: 'd1', kind: 'difference', target: 'z', tool: 'h1e' },
    { id: 'h2', kind: 'sketch', profile: 'loop', segments: slot, plane: { origin: [0, -1, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] } },
    { id: 'h2e', kind: 'extrude', sketch: 'h2', height: T + 3 },
    { id: 'd2', kind: 'difference', target: 'd1', tool: 'h2e' },
  ]);
}

test('D2026 bend angle and included angle (180 - bend) hold exactly across 30, 58, 90, 120, 150 deg without changing angle', () => {
  const T = 2, R = 3, K = 0.4, A = 50, B = 35;
  for (const deg of [30, 58, 90, 120, 150]) {
    const th = deg * Math.PI / 180;
    const o = out([{ id: 'c', kind: 'sheet-contour', path: [[0, 0], [A, 0], [A + B * Math.cos(th), B * Math.sin(th)]], side: 'left', width: 20, thickness: T, bendRadius: R, kFactor: K }]);
    const flat = flatPatternOf(o);
    assert.equal(flat.bends.length, 1);
    const b = flat.bends[0];
    close(b.angle, deg, 1e-9, `bend angle ${deg}`);
    close(b.includedAngle, 180 - deg, 1e-9, `included angle ${deg}`);
    close(b.angle + b.includedAngle, 180, 1e-12, `sum ${deg}`);
    close(includedBendAngle(b.angle), b.includedAngle, 1e-12, `helper ${deg}`);

    const shopDoc = flatPatternDxf(flat, { profile: 'shop' });
    const note = shopDoc.entities.find(e => e.layer === 'BEND_NOTES');
    assert.ok(note && note.type === 'text');
    assert.ok(note.text.includes(`BEND ${deg}° (INCL ${180 - deg}°)`), `unexpected note: ${note.text}`);
  }
});

test('D2026 flatPatternDxf separates OUTER_CUT / INNER_CUT, omits bend lines/notes in cut-only, preserves exact curves and flat invariance, and audits clean in ezdxf', () => {
  const o = fixtureWithCutoutsAndTwoBends();
  const flat = flatPatternOf(o);
  const flatBefore = JSON.stringify(flat);

  // Confirm fixture has 1 outer loop, 2 inner loops (circle + rounded slot), 1 UP bend and 1 DOWN bend (58° and 90°).
  assert.equal(flat.loops.filter(l => l.outer).length, 1);
  assert.equal(flat.loops.filter(l => !l.outer).length, 2);
  assert.deepEqual(flat.bends.map(b => b.direction).sort(), ['down', 'up']);
  const angles = flat.bends.map(b => Math.round(b.angle)).sort((a, b) => a - b);
  assert.deepEqual(angles, [58, 90]);

  // Default profile is byte-for-byte identical whether options are omitted or { profile: 'default' }.
  const def0 = writeDxf(flatPatternDxf(flat), { version: 'AC1015' });
  const def1 = writeDxf(flatPatternDxf(flat, { profile: 'default' }), { version: 'AC1015' });
  assert.deepEqual(Buffer.from(def0.bytes), Buffer.from(def1.bytes));

  // Shop profile: INNER_CUT before OUTER_CUT, exact CIRCLE + ARC + LINE preserved, UP/DOWN dashed centerlines, BEND + INCL notes.
  const shop = flatPatternDxf(flat, { profile: 'shop' });
  assert.deepEqual(shop.layers.map(l => l.name), ['INNER_CUT', 'OUTER_CUT', 'BEND_UP', 'BEND_DOWN', 'BEND_NOTES']);
  const innerEnts = shop.entities.filter(e => e.layer === 'INNER_CUT');
  const outerEnts = shop.entities.filter(e => e.layer === 'OUTER_CUT');
  assert.ok(innerEnts.some(e => e.type === 'circle'), 'inner circular hole preserved as exact CIRCLE');
  assert.ok(innerEnts.some(e => e.type === 'arc'), 'inner slot arcs preserved as exact ARC');
  assert.ok(innerEnts.some(e => e.type === 'line'), 'inner slot lines preserved as exact LINE');
  assert.equal(outerEnts.length, 4, 'outer boundary has 4 lines');
  const firstOuterIdx = shop.entities.findIndex(e => e.layer === 'OUTER_CUT');
  const lastInnerIdx = shop.entities.map(e => e.layer).lastIndexOf('INNER_CUT');
  assert.ok(lastInnerIdx < firstOuterIdx, 'INNER_CUT entities emitted before OUTER_CUT');
  assert.equal(shop.entities.filter(e => e.layer === 'BEND_UP').length, 1);
  assert.equal(shop.entities.filter(e => e.layer === 'BEND_DOWN').length, 1);
  const shopNotes = shop.entities.filter(e => e.layer === 'BEND_NOTES').map(e => e.text);
  assert.ok(shopNotes.some(t => t.includes('BEND 58° (INCL 122°)')), `missing 58/122 note: ${shopNotes}`);
  assert.ok(shopNotes.some(t => t.includes('BEND 90° (INCL 90°)')), `missing 90/90 note: ${shopNotes}`);

  // Cut-only profile: strictly INNER_CUT + OUTER_CUT, zero bend lines, zero TEXT, zero linetypes.
  const cutOnly = flatPatternDxf(flat, { profile: 'cut-only' });
  assert.deepEqual(cutOnly.layers.map(l => l.name), ['INNER_CUT', 'OUTER_CUT']);
  assert.deepEqual(cutOnly.linetypes, []);
  assert.equal(cutOnly.entities.filter(e => e.type === 'text').length, 0);
  assert.equal(cutOnly.entities.filter(e => e.layer === 'BEND_UP' || e.layer === 'BEND_DOWN' || e.layer === 'BEND_NOTES').length, 0);
  assert.equal(cutOnly.entities.length, innerEnts.length + outerEnts.length);

  // Exporting with any profile/option combination never mutates flat geometry or bend data.
  assert.equal(JSON.stringify(flat), flatBefore);

  // Independent ezdxf 1.4.5 oracle verification when local venv is present.
  const py = process.env.DXF_ORACLE_PYTHON || join(homedir(), '.cache', 'barocss-ezdxf', 'bin', 'python');
  const oracleScript = resolve(import.meta.dirname, '../scripts/dxf-oracle.py');
  if (existsSync(py) && existsSync(oracleScript)) {
    const dir = mkdtempSync(join(tmpdir(), 'd2026-dxf-'));
    try {
      for (const [tag, doc] of [['shop', shop], ['cut-only', cutOnly]]) {
        for (const version of ['AC1015', 'AC1009']) {
          const p = join(dir, `${tag}.${version}.dxf`);
          writeFileSync(p, writeDxf(doc, { version }).bytes);
          const raw = execFileSync(py, ['-I', oracleScript, p], { encoding: 'utf8' });
          const parsed = JSON.parse(raw);
          assert.deepEqual(parsed.audit, { errors: [], fixes: [] }, `${tag} ${version} ezdxf audit`);
          assert.equal(parsed.insunits, version === 'AC1009' ? null : 4, `${tag} ${version} insunits`);
          assert.deepEqual(parsed.modelspace.map(e => e.layer), doc.entities.map(e => e.layer), `${tag} ${version} layers`);
          if (tag === 'cut-only') {
            assert.equal(parsed.modelspace.filter(e => e.type === 'TEXT').length, 0);
            assert.ok(parsed.modelspace.some(e => e.type === 'CIRCLE' && e.layer === 'INNER_CUT'));
            assert.ok(parsed.modelspace.some(e => e.type === 'ARC' && e.layer === 'INNER_CUT'));
          } else {
            assert.equal(parsed.layers.find(l => l.name === 'BEND_UP').linetype, 'DASHED');
            assert.equal(parsed.layers.find(l => l.name === 'BEND_DOWN').linetype, 'DASHED');
            const texts = parsed.modelspace.filter(e => e.type === 'TEXT').map(e => e.text);
            assert.ok(texts.some(t => t.includes('BEND 58° (INCL 122°)')));
          }
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('D2026 flatPatternDxf refuses invalid textHeight, unsupported profile, unknown option keys, and cut-only with bend lines/notes', () => {
  const th = 58 * Math.PI / 180;
  const flat = flatPatternOf(out([{ id: 'c', kind: 'sheet-contour', path: [[0, 0], [50, 0], [50 + 35 * Math.cos(th), 35 * Math.sin(th)]], side: 'left', width: 20, thickness: 2, bendRadius: 3, kFactor: 0.4 }]));
  for (const bad of [
    { textHeight: 0 },
    { textHeight: -2 },
    { textHeight: Number.NaN },
    { profile: 'cam-toolpath' },
    { pocket: true },
    { profile: 'cut-only', includeBendLines: true },
    { profile: 'cut-only', includeBendNotes: true },
    { includeBendLines: 'yes' },
  ]) {
    assert.throws(
      () => flatPatternDxf(flat, bad),
      e => isFlatPatternError(e) && e.code === 'INVALID_INPUT',
      `expected INVALID_INPUT for ${JSON.stringify(bad)}`,
    );
  }
});
