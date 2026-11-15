import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { emptyDoc, rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, type BodyResult } from '@barocss/cad-model/engine/evaluate';
import { mapSourceScope, type MapSourceScope } from '../src/viewport/mapSourceScope';
import { axisPlane, boxSection, sectionedBodies, type Section } from '../src/viewport/sectionView';
import { MapLegend } from '../src/ui/MapLegend';
import { ViewDisplayControls } from '../src/ui/ViewDisplayControls';
import type { ScalarMap } from '../src/viewport/scalarMaps';

const map: ScalarMap = { body: 'same', per: 'triangle', values: Float32Array.of(2.67, 5.33), unit: 'mm', range: [0, 6.67],
  thresholds: [{ value: 3.33, label: 'nominal' }], legend: { title: 'Wall thickness', stops: [[0, '#000000'], [6.67, '#ffffff']] } };
function source() {
  const doc = rectanglePart(20, 12, 8), result = evaluateDoc(doc, 0); assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}
const scope = (shownBodies: readonly BodyResult[], sectionBodies: readonly BodyResult[] | null, sectionExactShown: boolean, gpuSection: boolean) =>
  mapSourceScope({ shownBodies, sectionBodies, sectionExactShown, gpuSection });

test('scope follows the actual map input identity and exact/CPU basis, not merely an enabled GPU clip', () => {
  const { bodies } = source(), section = bodies.map(body => ({ ...body })), preview = bodies.map(body => ({ ...body }));
  assert.equal(scope(bodies, null, false, false), 'Body mesh');
  assert.equal(scope(bodies, null, true, true), 'Body mesh', 'no section input means no section provenance');
  assert.equal(scope(section, section, true, true), 'Section display mesh', 'exact section input');
  assert.equal(scope(section, section, true, false), 'Section display mesh');
  assert.equal(scope(section, section, false, false), 'Section display mesh', 'CPU clipped display input');
  assert.equal(scope(section, section, false, true), 'Body mesh', 'GPU-only / pending exact still samples body meshes');
  assert.equal(scope(bodies, section, true, true), 'Body mesh', 'body drag or another displayed source wins over a section');
  assert.equal(scope(preview, section, true, false), 'Body mesh', 'do not label an unrelated preview as original or section');
  const sameId = section.map(body => ({ ...body }));
  assert.equal(scope(sameId, section, true, false), 'Body mesh', 'IDs and equal values do not prove array ownership');
});

test('plane, Box and Cut-out CPU display paths receive the section label without changing source meshes or document', () => {
  const { doc, bodies } = source(), before = structuredClone(doc), positions = bodies[0].mesh.positions.slice();
  const sections: Section[] = [
    { mode: 'plane', planes: [axisPlane('y', 6, 'positive')] },
    boxSection([0, 0, 0], [20, 12, 8]),
    { mode: 'cutout', planes: [axisPlane('x', 10, 'negative'), axisPlane('y', 6, 'negative')] },
  ];
  for (const section of sections) {
    const cpu = sectionedBodies(bodies, section, false, 'scope-cap'); assert.ok(cpu.length);
    assert.equal(scope(cpu, cpu, false, false), 'Section display mesh');
    const gpu = sectionedBodies(bodies, section, true, 'scope-cap');
    assert.equal(scope(gpu, gpu, false, true), 'Body mesh');
  }
  assert.deepEqual(doc, before); assert.deepEqual(bodies[0].mesh.positions, positions);
});

test('equal-volume Cut-out decomposition remains section provenance; mass and appearance are not authority', () => {
  const { bodies } = source(), body = bodies[0];
  // Provenance-only fixture: a section result can report the original total
  // volume after decomposition. That is not proof that it is the body-map input.
  const decomposed = [{ ...body, key: 'cut-1', volume: body.volume! / 2 }, { ...body, key: 'cut-2', volume: body.volume! / 2 }];
  assert.equal(decomposed.reduce((sum, piece) => sum + piece.volume, 0), body.volume);
  assert.equal(scope(decomposed, decomposed, true, true), 'Section display mesh');
  assert.equal(scope(bodies, decomposed, true, true), 'Body mesh');
  assert.equal(scope(bodies, null, false, true), 'Body mesh', 'section off restores the body basis');
});

test('existing legend labels the source without changing its title, scalar values, range or thresholds', () => {
  const before = structuredClone(map), values = map.values, range = map.range, thresholds = map.thresholds;
  for (const scope of ['Body mesh', 'Section display mesh'] as MapSourceScope[]) {
    const html = renderToStaticMarkup(createElement(MapLegend, { map, hover: 2.67, scope }));
    assert.ok(html.includes(`aria-label="Map source scope">${scope}</span>`));
    assert.match(html, /Wall thickness/); assert.match(html, /aria-label="Map value">2.67 mm/);
    assert.match(html, /6.67 mm/); assert.doesNotMatch(html, /Original|manufactur|edit face/i);
  }
  const fallback = renderToStaticMarkup(createElement(MapLegend, { map, hover: null }));
  assert.match(fallback, /Map source scope">Body mesh/); assert.match(fallback, /Map value">—/);
  assert.equal(map.values, values); assert.equal(map.range, range); assert.equal(map.thresholds, thresholds); assert.deepEqual(map, before);
});

type ElementProps = { children?: unknown; [key: string]: unknown };
function elements(node: unknown): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
test('view controls forward separate provenance metadata to the existing legend, without wrapping or replacing map data', () => {
  let view: unknown;
  const props = { doc: emptyDoc(), viewport: { current: null }, cornerRight: { current: null },
    display: { effectiveDisplayMode: 'shaded-with-edges', displayMode: 'shaded-with-edges', displayOpen: false },
    view: { rendering: false, viewBackend: 'webgpu' }, section: { section: null },
    analysis: { mapLegend: map, mapScope: 'Section display mesh', mapHover: 2.67, mapKind: 'thickness' },
    picking: { pickFilter: 'all', snapStep: 1 } } as unknown as Parameters<typeof ViewDisplayControls>[0];
  function Probe() { view = ViewDisplayControls(props); return null; }
  renderToStaticMarkup(createElement(Probe));
  const legend = elements(view).find(element => element.type === MapLegend); assert.ok(legend);
  assert.equal(legend.props.map, map); assert.equal(legend.props.scope, 'Section display mesh'); assert.equal(legend.props.hover, 2.67);
});
