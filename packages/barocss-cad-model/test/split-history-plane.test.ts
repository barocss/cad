import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode } from '../src/engine/doc';
import { commands, type Ctx } from '../src/app/commands';
import { editCommand } from '../src/app/editCommand';
import { splitNormalProblem, splitPlaneProblem, splitPlaneText } from '../src/app/splitPlaneInput';

function fixture(parameter = false) {
  const doc = withNode({ ...rectanglePart(40, 30, 10), parameters: { cut: 70 } },
    { kind: 'split', parent: { node: 1, side: 'solid' }, axis: 'x', normal: [2, 2, 0], at: parameter ? { parameter: 'cut' } : 70 });
  const ctx: Ctx = { doc, bodies: [], selection: { faces: [], edges: [], bodies: [] } };
  const command = editCommand(2, doc.nodes, doc)!;
  return { doc, ctx, command, values: command.defaults!(ctx) };
}
test('Split History title stays neutral and Plane step follows edited At and direction', () => {
  const { doc, ctx, command, values } = fixture();
  const before = JSON.stringify(doc);
  assert.equal(command.label, 'Edit Split');
  assert.deepEqual(command.steps!(ctx, values), [{ label: 'Plane', text: '2X+2Y = 70', done: true }]);
  assert.equal(command.steps!(ctx, { ...values, at: 80 })[0].text, '2X+2Y = 80');
  assert.equal(command.steps!(ctx, { ...values, nx: -1, ny: 0, nz: 1, at: -12 })[0].text, '−X+Z = -12');
  assert.equal(JSON.stringify(doc), before);
});
test('creation and History refuse the same zero direction before evaluation', () => {
  const { doc, ctx, command, values } = fixture();
  const zero = { ...values, nx: 0, ny: 0, nz: 0 };
  assert.deepEqual(command.steps!(ctx, zero), []);
  assert.deepEqual(command.handles!(ctx, zero), []);
  const create = commands.find(c => c.id === 'split')!;
  const refusal = (error: unknown) => error instanceof Error && /SPLIT_PLANE/.test(String(error)) && /must not be zero/.test(String(error));
  assert.throws(() => command.build!(ctx, zero), refusal);
  assert.throws(() => create.build!(ctx, { axis: 'n', nx: 0, ny: 0, nz: 0, at: 70 }), refusal);
  assert.equal(splitPlaneProblem(doc.nodes[2]), null);
  for (const n of [[0, 0, 0], [NaN, 1, 0], [Infinity, 1, 0], [1, 2]]) assert.ok(splitNormalProblem(n));
  assert.equal(splitNormalProblem([0, -2, 0]), null);
  assert.equal(splitNormalProblem([1e-10, 0, 0]), null);
  const tiny = command.build!(ctx, { ...values, nx: 1e-10, ny: 0, nz: 0, at: 2e-9 }).nodes[2];
  assert.ok(tiny.kind === 'split'); assert.deepEqual(tiny.normal, [1e-10, 0, 0]);
  assert.equal(splitPlaneProblem(doc.nodes[1]), null);
});
test('parameter At displays resolved value and preserves binding unless explicitly changed', () => {
  const { ctx, command, values } = fixture(true);
  assert.equal(command.steps!(ctx, values)[0].text, '2X+2Y = 70');
  const unchanged = command.build!(ctx, values).nodes[2];
  assert.ok(unchanged.kind === 'split'); assert.deepEqual(unchanged.at, { parameter: 'cut' });
  const changed = command.build!(ctx, { ...values, at: 80 }).nodes[2];
  assert.ok(changed.kind === 'split'); assert.equal(changed.at, 80);
  const cardinal = { ...ctx.doc, nodes: ctx.doc.nodes.map(n => n.kind === 'split' ? { ...n, normal: undefined, axis: 'z' as const, at: 5 } : n) };
  const edit = editCommand(2, cardinal.nodes, cardinal)!, cc = { ...ctx, doc: cardinal };
  assert.equal(edit.steps!(cc, edit.defaults!(cc))[0].text, 'Z = 5');
});

test('current plane coefficients retain small and non-rounded represented numbers', () => {
  assert.equal(splitPlaneText([0.0004, 1, 0]), '0.0004X+Y');
  assert.equal(splitPlaneText([1e-10, 0, -1]), '1e-10X−Z');
  assert.equal(splitPlaneText([-0, -0.123456789, 2]), '−0.123456789Y+2Z');
  const { ctx, command, values } = fixture();
  assert.equal(command.steps!(ctx, { ...values, nx: 0.0004, ny: 1, at: 12.3456789 })[0].text, '0.0004X+Y = 12.3456789');
});
