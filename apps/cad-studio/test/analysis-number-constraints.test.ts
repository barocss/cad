import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { checkPrintPreview } from '@barocss/cad-model/engine/printPreview';
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
test('Print layer height HTML constraints match its existing finite-positive domain without rounding or a new increment grid', () => {
  const patches: unknown[] = [], doc = emptyDoc(), before = structuredClone(doc);
  for (const value of valid) {
    const props: Parameters<typeof PrintPanel>[0] = { options: { layer: 0, layerHeight: value, printed: true, supports: true },
      onOptions: patch => patches.push(patch), onDirection() {}, state: { stage: 'pending', display: null } };
    const input = field(PrintPanel(props), 'Print layer height (mm)');
    assert.equal(input.type, 'number'); assert.equal(input.min, Number.MIN_VALUE); assert.equal(input.step, 'any');
    assert.equal(input.value, value); assert.equal(input.disabled, false);
    assert.equal(input.onKeyDown, undefined, 'do not replace native keyboard behavior');
    (input.onChange as (event: unknown) => void)({ target: { valueAsNumber: value } });
    assert.deepEqual(patches.pop(), { layerHeight: value });
    assert.deepEqual(checkPrintPreview({ version: 1, layerHeight: value }), []);
    const saved = withPrintPreviewSettings(doc, { layerHeight: value });
    assert.equal(JSON.parse(JSON.stringify(saved)).printPreview.layerHeight, value, 'saved precision is unchanged');
    const html = renderToStaticMarkup(createElement(PrintPanel, props));
    assert.match(html, /aria-label="Print layer height \(mm\)"[^>]*min="5e-324"[^>]*step="any"/);
  }
  const props: Parameters<typeof PrintPanel>[0] = { options: { layer: 0, layerHeight: 0.35, printed: true, supports: true },
    onOptions: patch => patches.push(patch), onDirection() {}, state: { stage: 'pending', display: null } };
  const input = field(PrintPanel(props), 'Print layer height (mm)');
  for (const value of invalid) {
    (input.onChange as (event: unknown) => void)({ target: { valueAsNumber: value } });
    assert.deepEqual(patches, []); assert.ok(checkPrintPreview({ version: 1, layerHeight: value }).length);
  }
  const toggle = field(PrintPanel(props), 'Set layer height');
  (toggle.onChange as (event: unknown) => void)({ target: { checked: false } }); assert.deepEqual(patches.pop(), { layerHeight: undefined });
  (toggle.onChange as (event: unknown) => void)({ target: { checked: true } }); assert.deepEqual(patches.pop(), { layerHeight: 0.2 });
  props.options.layerHeight = undefined;
  const estimated = field(PrintPanel(props), 'Print layer height (mm)'); assert.equal(estimated.value, 0.2); assert.equal(estimated.disabled, true);
  assert.deepEqual(doc, before);
});

test('Clearance Near uses the same finite-positive native constraints and retains its exact callback admission', () => {
  const changes: number[] = [];
  for (const near of valid) {
    const props: Parameters<typeof ClearancePanel>[0] = { near, onNear: value => changes.push(value), display: null, labels: new Map() };
    const input = field(ClearancePanel(props), 'Near clearance (mm)');
    assert.equal(input.type, 'number'); assert.equal(input.min, Number.MIN_VALUE); assert.equal(input.step, 'any'); assert.equal(input.value, near);
    assert.equal(input.onKeyDown, undefined);
    (input.onChange as (event: unknown) => void)({ target: { valueAsNumber: near } }); assert.equal(changes.pop(), near);
    const html = renderToStaticMarkup(createElement(ClearancePanel, props));
    assert.match(html, /aria-label="Near clearance \(mm\)"[^>]*min="5e-324"[^>]*step="any"/);
  }
  const input = field(ClearancePanel({ near: 20, onNear: value => changes.push(value), display: null, labels: new Map() }), 'Near clearance (mm)');
  for (const value of invalid) (input.onChange as (event: unknown) => void)({ target: { valueAsNumber: value } });
  assert.deepEqual(changes, []);
});
