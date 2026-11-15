import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { checkPrintPreview } from '@barocss/cad-model/engine/printPreview';
import { PrintLayerHeight } from '../src/viewport/PrintLayerHeight';
import { PrintPanel } from '../src/viewport/PrintPanel';
import { ClearancePanel } from '../src/viewport/ClearancePanel';
import { withPrintPreviewSettings } from '../src/viewport/printSettings';

type Props = { children?: unknown; [key: string]: unknown };
function elements(node: unknown): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function field(view: unknown, name: string) {
  const element = elements(view).find(element => element.props['aria-label'] === name); assert.ok(element, name); return element.props;
}
const valid = [0.2, 0.3, 0.35, 0.301, 0.0001, 13.9, 14, 20, Number.MIN_VALUE, Number.MAX_VALUE];
const invalid = [0, -0, -1, NaN, Infinity, -Infinity];

// Checks actual component props and callbacks, not browser-native validity or
// spinner behavior. Those must be checked in Chrome after this source is frozen.
test('Print layer height retains finite-positive native constraints and exact deferred commit delegation', () => {
  const patches: unknown[] = [], doc = emptyDoc(), before = structuredClone(doc);
  const props: Parameters<typeof PrintPanel>[0] = { options: { layer: 0, layerHeight: 0.35, printed: true, supports: true }, resetKey: doc,
    onOptions: patch => patches.push(patch), onDirection() {}, state: { stage: 'pending', display: null } };
  for (const value of valid) {
    props.options.layerHeight = value;
    const height = elements(PrintPanel(props)).find(element => element.type === PrintLayerHeight); assert.ok(height);
    assert.equal(height.props.value, value); assert.equal(height.props.resetKey, doc);
    (height.props.onCommit as (value: number) => void)(value);
    assert.deepEqual(patches.pop(), { layerHeight: value });
    assert.deepEqual(checkPrintPreview({ version: 1, layerHeight: value }), []);
    const saved = withPrintPreviewSettings(doc, { layerHeight: value });
    assert.equal(JSON.parse(JSON.stringify(saved)).printPreview.layerHeight, value, 'saved precision is unchanged');
    const html = renderToStaticMarkup(createElement(PrintPanel, props));
    assert.match(html, /aria-label="Print layer height \(mm\)"[^>]*min="5e-324"[^>]*step="any"/);
  }
  for (const value of invalid) assert.ok(checkPrintPreview({ version: 1, layerHeight: value }).length);
  const toggle = field(PrintPanel(props), 'Set layer height');
  (toggle.onChange as (event: unknown) => void)({ target: { checked: false } }); assert.deepEqual(patches.pop(), { layerHeight: undefined });
  (toggle.onChange as (event: unknown) => void)({ target: { checked: true } }); assert.deepEqual(patches.pop(), { layerHeight: 0.2 });
  props.options.layerHeight = undefined;
  const html = renderToStaticMarkup(createElement(PrintPanel, props));
  assert.match(html, /aria-label="Print layer height \(mm\)"[^>]*disabled=""[^>]*value="0.2"/);
  assert.deepEqual(doc, before);
});

test('Clearance Near retains finite-positive native constraints for exact committed values', () => {
  for (const near of valid) {
    const html = renderToStaticMarkup(createElement(ClearancePanel, { near, onNear() {}, display: null, labels: new Map() }));
    assert.match(html, /aria-label="Near clearance \(mm\)"[^>]*min="5e-324"[^>]*step="any"/);
    assert.ok(html.includes(`value="${near}"`));
  }
});
