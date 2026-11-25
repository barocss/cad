import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { assertSavedDrawingDocument } from '../src/engine/savedDrawing';
import { defaultDrawing, readDrawing, sigOk, type EdgeRef } from '../src/drawing/types';

const validUnsigned: EdgeRef = { edge: 'n1.e0', near: [1, 2, 3] };
const validSigned: EdgeRef = { edge: 'n1.e1', near: [4, 5, 6], sig: { k: 'line', p: [4, 5, 6], d: [1, 0, 0], s: 10 } };
const validSignedNoDir: EdgeRef = { edge: 'n1.e2', near: [7, 8, 9], sig: { k: 'circle', p: [7, 8, 9], s: 0, r: 5 } };

function docWithDrawing(drawing: Record<string, unknown>): StudioDoc {
  return { ...rectanglePart(30, 20, 10), drawing: { ...defaultDrawing(), ...drawing } as StudioDoc['drawing'] };
}

test('drawing annotation sig admission: accepts valid unsigned and signed refs across all 5 collections', () => {
  assert.equal(sigOk(validSigned.sig), true);
  assert.equal(sigOk(validSignedNoDir.sig), true);
  assert.equal(sigOk({}), false);
  assert.equal(sigOk({ k: 'line', p: [1, 2], s: 10 }), false);
  assert.equal(sigOk({ k: 'line', p: [1, Number.NaN, 3], s: 10 }), false);
  assert.equal(sigOk({ k: 'line', p: [1, 2, 3], d: [1, 0], s: 10 }), false);
  assert.equal(sigOk({ k: '', p: [1, 2, 3], s: 10 }), false);

  const doc = docWithDrawing({
    arcCenterlines: [{ id: 'ac1', view: 'top', first: validUnsigned, second: validSigned }],
    centerMarkGroups: [{ id: 'cmg1', kind: 'linear', view: 'top', connectingLines: true, members: [validUnsigned, validSigned, validSignedNoDir] }],
    bisectorCenterlines: [{ id: 'cl1', view: 'top', first: validUnsigned, second: validSigned }],
    virtualSharps: [{ id: 'vs1', view: 'top', first: validUnsigned, second: validSigned }],
    ordinateGroups: [{ id: 'ord1', view: 'top', axis: 'horizontal', lineCoord: 30, origin: { ...validUnsigned, at: 'end' }, members: [{ id: 'm1', point: { ...validSigned, at: 'center' } }] }],
  });

  assert.doesNotThrow(() => assertSavedDrawingDocument(doc));
  const parsed = readDrawing(doc.drawing);
  assert.equal(parsed.arcCenterlines?.length, 1);
  assert.equal(parsed.centerMarkGroups?.length, 1);
  assert.equal(parsed.bisectorCenterlines?.length, 1);
  assert.equal(parsed.virtualSharps?.length, 1);
  assert.equal(parsed.ordinateGroups?.length, 1);
});

test('drawing annotation sig admission: rejects empty/malformed sig and short vectors with explicit DRAWING_OPTIONS error (never TypeError)', () => {
  const badSigs: readonly unknown[] = [
    {},
    { k: 'line', p: [1, 2], s: 5 },
    { k: 'line', p: [1, Number.NaN, 3], s: 5 },
    { k: 'line', p: [1, 2, 3], d: [1, 2], s: 5 },
    { k: 'line', p: [1, 2, 3], s: 'bad' },
  ];

  const cases: readonly { name: string; build: (badSig: unknown) => Record<string, unknown> }[] = [
    {
      name: 'arcCenterlines',
      build: sig => ({ arcCenterlines: [{ id: 'ac1', view: 'top', first: { ...validUnsigned, sig }, second: validSigned }] }),
    },
    {
      name: 'centerMarkGroups',
      build: sig => ({ centerMarkGroups: [{ id: 'cmg1', kind: 'linear', view: 'top', connectingLines: true, members: [{ ...validUnsigned, sig }, validSigned, validSignedNoDir] }] }),
    },
    {
      name: 'bisectorCenterlines',
      build: sig => ({ bisectorCenterlines: [{ id: 'cl1', view: 'top', first: { ...validUnsigned, sig }, second: validSigned }] }),
    },
    {
      name: 'virtualSharps',
      build: sig => ({ virtualSharps: [{ id: 'vs1', view: 'top', first: { ...validUnsigned, sig }, second: validSigned }] }),
    },
    {
      name: 'ordinateGroups.origin',
      build: sig => ({ ordinateGroups: [{ id: 'ord1', view: 'top', axis: 'horizontal', lineCoord: 30, origin: { ...validUnsigned, at: 'end', sig }, members: [] }] }),
    },
    {
      name: 'ordinateGroups.member',
      build: sig => ({ ordinateGroups: [{ id: 'ord1', view: 'top', axis: 'horizontal', lineCoord: 30, origin: { ...validUnsigned, at: 'end' }, members: [{ id: 'm1', point: { ...validSigned, at: 'center', sig } }] }] }),
    },
  ];

  for (const c of cases) {
    for (const bad of badSigs) {
      const drawing = c.build(bad);
      const doc = docWithDrawing(drawing);
      assert.throws(
        () => assertSavedDrawingDocument(doc),
        err => err instanceof Error && /DRAWING_OPTIONS/.test(err.message) && /invalid reference signature/i.test(err.message) && !/is not iterable/.test(err.message),
        `${c.name} must throw explicit DRAWING_OPTIONS error for ${JSON.stringify(bad)}`,
      );
      // Direct readDrawing also never throws a TypeError (drops the malformed annotation safely)
      assert.doesNotThrow(() => readDrawing(drawing), `${c.name} readDrawing must never throw`);
    }
  }

  // Short near vector also rejected cleanly with DRAWING_OPTIONS
  const shortNearDoc = docWithDrawing({
    arcCenterlines: [{ id: 'ac1', view: 'top', first: { edge: 'n1.e0', near: [1, 2] }, second: validSigned }],
  });
  assert.throws(
    () => assertSavedDrawingDocument(shortNearDoc),
    err => err instanceof Error && /DRAWING_OPTIONS/.test(err.message) && /invalid near point/i.test(err.message),
  );
});
