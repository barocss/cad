import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { MeasureResult } from '@barocss/cad-model/app/measure';
import { MeasurementInspector, PinnedMeasurement } from '../src/ui/MeasurementInspector';
import { MEASURE_SECONDARY_UNIT_KEY } from '../src/ui/measureSecondaryUnits';

test('Inspector inch wiring covers item and between scalars, preserves angles/source and excludes pinned display', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem(key: string) { assert.equal(key, MEASURE_SECONDARY_UNIT_KEY); return 'inch'; }, setItem() { assert.fail('render must not write storage'); } } });
  try {
    const evaluated = evaluateDoc(rectanglePart(10, 10, 10), 1); assert.ok(evaluated.ok);
    const mesh = evaluated.bodies[0].mesh;
    const synthetic = { ...mesh, edgeLines: Float64Array.of(0, 0, 0, 25.4, 0, 0), edgeOfSegment: Float32Array.of(0, 0),
      edges: [{ ...mesh.edges[0], straight: true }], faces: [{ ...mesh.faces[0], kind: 'curved' as const, area: 645.16, radius: 12.7 }] };
    const targets = [{ pick: { body: 0, edge: 0 }, body: 'b1', label: 'Source', mesh: synthetic }, { pick: { body: 0, face: 0 }, body: 'b1', label: 'Source', mesh: synthetic }];
    const measured: MeasureResult = { distance: 25.4, normalDistance: 12.7, angle: 90, a: [0, 0, 0], b: [-25.4, 0, 50.8], axes: { angle: 90, offset: 25.4, coaxial: false } };
    const before = structuredClone({ measured, synthetic });
    const html = renderToStaticMarkup(createElement(MeasurementInspector, { pickFilter: 'all', targets,
      items: targets.map(t => ({ pick: t.pick, mesh: synthetic })), measured, onClose() {} }));
    for (const pattern of [/Length <b>25\.4 mm \(1 in\)/, /Area <b>645\.16 mm² \(mesh\) \(1 in²\)/,
      /Radius <b>12\.7 mm \(0\.5 in\)/, /Distance <b>25\.4 mm \(1 in\)/, /Normal distance <b>12\.7 mm \(0\.5 in\)/,
      /Angle <b>90°<\/b>/, /Axes <b>90° apart, 25\.4 mm off \(1 in\)/,
      /ΔX ΔY ΔZ <b>-25\.4, 0, 50\.8 mm \(-1 in, 0 in, 2 in\)/]) assert.match(html, pattern);
    assert.deepEqual({ measured, synthetic }, before);
    assert.match(html, /value="inch" selected=""/);
    assert.doesNotMatch(renderToStaticMarkup(createElement(PinnedMeasurement, { distance: 25.4, onClear() {} })), /\(1 in\)|Secondary units/);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
