import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { withMcp } from './fillet-continuity-mcp.mjs';
const output = resolve(process.argv[2]);
assert.ok(relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
await mkdir(output, { recursive: true });
const flow = { output, app: resolve(import.meta.dirname, '..'), report: { observations: [] } };
const box = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 20] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const gear = { ...box, nodes: [{ id: 'n0', kind: 'gear', module: 2, teeth: 12, faceWidth: 5, center: [0, 0], generator: 'spur-gear@1' }], outputs: { b0: { node: 0, side: 'solid' } }, nextId: 1 };
for (const [label, doc, pair, message] of [
  ['box-same-face', box, ['n1.top', 'n1.top'], /different face/],
  ['gear-ambiguous-role', gear, ['n0.flankL', 'n0.top'], /fits \d+ display faces/],
]) await withMcp(flow, doc, label, async (_request, call) => {
  const before = await call({ action: 'mass' }); assert.equal(before.isError, false);
  for (const action of ['select', 'measure']) {
    const selector = { between: pair };
    const result = await call(action === 'select' ? { action, edges: [selector] } : { action, a: selector, b: pair[1] });
    assert.equal(result.isError, true, JSON.stringify(result)); assert.match(result.content[0].text, message);
  }
  if (label === 'box-same-face') {
    const unique = await call({ action: 'select', edges: [{ between: ['n1.side0', 'n1.top'] }] });
    assert.equal(unique.isError, false, JSON.stringify(unique));
    assert.match(unique.content[0].text, /n1.side0\|n1.top/);
  }
  const after = await call({ action: 'mass' }); assert.deepEqual(after, before);
});
await writeFile(resolve(output, 'receipt.json'), JSON.stringify({ status: 'PASS', ...flow.report }, null, 2));
console.log(JSON.stringify({ status: 'PASS', output }));
