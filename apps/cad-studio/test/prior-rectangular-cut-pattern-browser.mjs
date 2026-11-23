import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const agent = process.argv.includes('--agent');
const linear = process.argv.includes('--linear');
const f = await createFlow({
  name: 'prior-rectangular-cut-pattern', output: process.argv[2], envFrozen: linear ? 'D1830_SOURCE_FROZEN' : agent ? 'D1829_SOURCE_FROZEN' : 'D1828_SOURCE_FROZEN',
  qualification: linear ? '#25 repeat the earlier rectangular through-cut along a signed XY line.' :
    agent ? '#25 revision-bound local Agent proposal for the earlier through-Subtract.' :
    '#25 repeat only the chosen earlier through-Subtract on its current same-stock result.',
  limits: ['One original rectangular stock and two disjoint full-height rectangular cuts, XY rectangular pattern in desktop Studio.'],
  initialFiles: [import.meta.filename, 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/cutPatternSource.ts',
    'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx', 'packages/barocss-cad-model/src/app/commands.ts',
    'packages/barocss-cad-model/src/chat/part/features.ts',
    'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/engine/part.ts',
    'packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/part/part-transform.ts',
    'packages/barocss-cad/src/part/part-types.ts', 'packages/barocss-cad/src/part/part-prior-rectangular-cut.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { emptyDoc, withNode, type BodyRef } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!input.nodes) {
  let doc = emptyDoc();
  const ref = (node: number): BodyRef => ({ node, side: 'solid' });
  const box = (min: [number, number], max: [number, number]) => {
    const sketch = doc.nodes.length;
    doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min, max });
    doc = withNode(doc, { kind: 'extrude', sketch, height: 10 });
  };
  box([0, 0], [60, 40]);
  box([8, 8], [12, 10]);
  doc = withNode(doc, { kind: 'difference', parent: ref(1), tool: ref(3) });
  box([8, 26], [14, 28]);
  console.log(JSON.stringify(withNode(doc, { kind: 'difference', parent: ref(4), tool: ref(6) })));
} else {
  const [body] = partBreps(input);
  const { brep } = body;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const caps = brep.faces.flatMap(face => {
    const plane = faceGeometry(face);
    if (plane.kind !== 'plane' || Math.abs(plane.n[2]) < 1 - 1e-9) return [];
    const openings = face.loops.map(id => loops.get(id)!).filter(loop => loop.kind === 'inner').map(loop => {
      const curves = loop.coedges.map(id => edges.get(uses.get(id)!.edge)!.curve);
      if (curves.length !== 4 || curves.some(curve => curve.degree !== 1 || curve.controlPoints.length !== 2))
        throw Error('Expected four native straight edges for a rectangular opening.');
      const points = curves.flatMap(curve => curve.controlPoints);
      if (points.some(point => Math.abs(point[2] - plane.o[2]) > 1e-8)) throw Error('Opening is off its cap.');
      return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
        Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    });
    return [{ z: plane.o[2], openings }];
  });
  console.log(JSON.stringify({ counts: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1), caps }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Rectangular cut pattern', exact: true });
const phase = (p, state) => p.locator('.status').filter({ hasText: new RegExp(`^${state}$`) }).waitFor();
const field = (p, label) => p.getByLabel(label, { exact: true });
const equivalent = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, JSON.stringify({ actual: a, expected: b }));
const order = (a, b) => a[0] - b[0] || a[1] - b[1];
const older = [8, 8, 12, 10], later = [8, 26, 14, 28];
const shift = (box, x, y) => [box[0] + x, box[1] + y, box[2] + x, box[3] + y];
const grid = (box, sx) => [box, shift(box, sx, 0), shift(box, 0, 8), shift(box, sx, 8)];

async function native(label, doc, openings) {
  const result = await f.inspect(label, doc);
  assert.ok(result.counts.valid, result.counts.issues.join('\n'));
  assert.equal(result.counts.topology.length, 1);
  assert.equal(result.counts.topology[0].genus, openings.length);
  assert.equal(result.caps.length, 2);
  result.caps.map(cap => cap.z).sort((a, b) => a - b).forEach((z, i) => equivalent(z, 10 * i));
  const expected = [...openings].sort(order);
  for (const cap of result.caps) {
    assert.equal(cap.openings.length, expected.length);
    cap.openings.sort(order).forEach((opening, i) => opening.forEach((p, k) => equivalent(p, expected[i][k])));
  }
  const net = { volume: 24000, moment: [24000 * 30, 24000 * 20, 24000 * 5] };
  for (const [x0, y0, x1, y1] of openings) {
    const removed = 10 * (x1 - x0) * (y1 - y0);
    net.volume -= removed;
    net.moment[0] -= removed * (x0 + x1) / 2;
    net.moment[1] -= removed * (y0 + y1) / 2;
    net.moment[2] -= removed * 5;
  }
  equivalent(result.mass.volume, net.volume);
  result.mass.centroid.forEach((value, i) => equivalent(value, net.moment[i] / net.volume));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  equivalent(bodies[0].volume, net.volume);
  f.report.observations.push({ label, volume: result.mass.volume, centroid: result.mass.centroid, openings: expected });
  return result;
}

async function chooseSource(entry) {
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await browser.locator('.ol:not(.ol-step)').first().click();
  if (entry === 'Browser') await browser.locator('.ol-step').filter({ hasText: 'Subtract' }).first().click();
  if (entry === 'History') await f.page.locator('.history [data-node-index="4"]').click();
  if (entry) await f.closeEditor();
}

async function openPattern(entry) {
  await chooseSource(entry);
  await clickModelCommand(f.page, 'Pattern', 'Rectangular cut pattern');
  const p = hud();
  await p.waitFor();
  const source = entry ? 'Subtract 1 (n4)' : 'Subtract 2 (n7)';
  await p.getByText(source, { exact: true }).waitFor();
  return p;
}

async function setGrid(p, secondSpacing = 8) {
  await field(p, 'First count').fill('2');
  await field(p, 'Second spacing').fill(String(secondSpacing));
  await field(p, 'Second count').fill('2');
}

async function apply(p, before, label, usesEarlier) {
  await phase(p, 'preview');
  await f.same(before);
  await button('Apply', p).click();
  await f.changed(before);
  const doc = (await f.snapshot(label)).doc, pattern = doc.nodes.at(-1);
  assert.deepEqual(doc.nodes.slice(0, -1), before.nodes);
  assert.deepEqual(pattern.parent, { node: 7, side: 'solid' });
  assert.deepEqual(pattern.source, usesEarlier ? { node: 4, side: 'solid' } : undefined);
  assert.deepEqual([pattern.axis, pattern.spacing, pattern.count, pattern.axis2, pattern.spacing2, pattern.count2], ['x', 16, 2, 'y', 8, 2]);
  return doc;
}

async function approveAgentPattern(source) {
  const file = join(f.output, 'agent-proposal.bcad');
  const original = Buffer.from(JSON.stringify(source));
  await writeFile(file, original);
  const session = { app: f.app, output: f.output, clientName: f.name };
  await withMcpSession(session, file, 'earlier-cut-agent', async call => {
    const command = 'rectangular-feature-pattern';
    const description = await call('describe', { command });
    assert.match(description.values.source, /stable feature ID.*expectedRevision/);
    const expectedRevision = await currentPartRevision(call);
    const values = { source: 'n4', axis: 'x', spacing: 16, count: 2, axis2: 'y', spacing2: 8, count2: 2 };
    const op = (override = {}) => ({ tool: 'features', args: { action: 'command', command, bodies: ['b7'], expectedRevision, values, ...override } });
    const dry = (operation, error = false) => call('features', { action: 'batch', dryRun: true, ops: [operation] }, error);
    const result = await dry(op());
    assert.equal(result.dryRun, true);
    equivalent(result.change.volume, -240);
    assert.match(result.would_apply[0].did, /"source":"n4"/);
    assert.match((await dry(op({ expectedRevision: '0000000000000000' }), true)).error, /part changed/);
    assert.match((await dry(op({ values: { ...values, source: 'n7' } }), true)).error, /distinct/);
    const overlap = await dry(op({ values: { ...values, spacing2: 18 } }), true);
    assert.deepEqual([overlap.failed_op, overlap.kept], [0, 'nothing was applied']);
    assert.match(overlap.error, /kernel could not build/i);
    assert.deepEqual(await readFile(file), original);
    const proposal = await call('proposals', { action: 'propose', title: 'Repeat earlier Subtract n4 on current stock n7', ops: [op()] });
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    const pendingBytes = await readFile(file);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
    assert.deepEqual(await readFile(file), pendingBytes);
  });

  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, source.nodes);
  await f.freshOpen(file, pending, 'agent-pending-open');
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Chat').first().click();
  const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
  await card.waitFor();
  await f.snapshot('01-agent-pending');
  await button('Preview', card).click();
  await button('Hide', card).waitFor();
  await f.same(pending);
  await card.getByLabel('Volume change').getByText(/^[−-]240(?:\.0+)? mm³(?: \(.*\))?$/).waitFor();
  await native('pending-original-cuts', pending, [older, later]);
  await f.snapshot('02-agent-preview');
  await button('Accept', card).click();
  await f.changed(pending);
  const approved = (await f.snapshot('03-agent-approved')).doc;
  assert.deepEqual(approved.nodes.slice(0, -1), source.nodes);
  assert.deepEqual(approved.nodes.at(-1).source, { node: 4, side: 'solid' });
  assert.deepEqual(approved.nodes.at(-1).parent, { node: 7, side: 'solid' });
  assert.deepEqual(approved.proposals.map(proposal => proposal.status), ['accepted']);
  const { kind, proposal, by } = approved.history.at(-1);
  assert.deepEqual([kind, proposal, by.agent], ['accept', 'P1', 'user']);
  await native('agent-approved-five-cuts', approved, [...grid(older, 16), later]);
  const saved = await f.save('agent-earlier-cut');
  const reopened = await f.freshOpen(saved.file, approved, 'agent-approved-fresh-open');
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await native('agent-reopened-five-cuts', reopened.doc, [...grid(older, 16), later]);
  await f.snapshot('04-agent-reopened');
}

async function applyLinearPattern(source) {
  const open = async entry => {
    await chooseSource(entry);
    await clickModelCommand(f.page, 'Pattern', 'Linear cut pattern');
    const panel = f.page.getByRole('dialog', { name: 'Linear cut pattern', exact: true });
    await panel.getByText(entry ? 'Subtract 1 (n4)' : 'Subtract 2 (n7)', { exact: true }).waitFor();
    await field(panel, 'Count').fill('2');
    await field(panel, 'Spacing').fill('16');
    return panel;
  };
  const applyLinear = async (panel, label, earlier) => {
    await phase(panel, 'preview');
    await f.same(source);
    await button('Apply', panel).click();
    await f.changed(source);
    const { doc } = await f.snapshot(label), node = doc.nodes.at(-1);
    assert.deepEqual(doc.nodes.slice(0, -1), source.nodes);
    assert.deepEqual(node.parent, { node: 7, side: 'solid' });
    assert.deepEqual(node.source, earlier ? { node: 4, side: 'solid' } : undefined);
    assert.deepEqual([node.kind, node.axis, node.spacing, node.count], ['linear-feature-pattern', 'x', 16, 2]);
    return doc;
  };
  const control = await applyLinear(await open(null), '01-linear-current-control', false);
  await native('linear-current-source', control, [older, later, shift(later, 16, 0)]);
  await f.undo();
  await f.same(source);

  const panel = await open('Browser');
  const undo = await button('Undo').getAttribute('data-tip');
  for (const spacing of [0, -8, -3]) {
    await field(panel, 'Spacing').fill(String(spacing));
    await phase(panel, 'refused');
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
  }
  await f.snapshot('02-linear-overlap-refused');
  await field(panel, 'Spacing').fill('16');
  const browser = await applyLinear(panel, '03-linear-earlier-positive', true);
  const positive = [older, later, shift(older, 16, 0)];
  await native('linear-positive', browser, positive);
  await f.undo();
  await f.same(source);
  const history = await applyLinear(await open('History'), '04-linear-history-applied', true);
  assert.deepEqual(history, browser);

  await f.openFeatureEditor(8, 'linear cut spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Spacing').fill('-6');
  const edited = (await f.applyEditor(history, '05-linear-earlier-negative')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...history.nodes.at(-1), spacing: -6 });
  const negative = [older, later, shift(older, -6, 0)];
  await native('linear-negative', edited, negative);
  await f.undo();
  await f.same(history);
  await native('linear-undo-positive', history, positive);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('linear-earlier-cut');
  await f.freshOpen(saved.file, edited, 'linear-saved-fresh-open');
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await native('linear-reopened-negative', edited, negative);
  await f.openFeatureEditor(8, 'retained linear cut source');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  assert.equal(await field(f.editor(), 'Spacing').inputValue(), '-6');
  await f.snapshot('06-linear-reopened-source');
  await f.closeEditor();
  await f.same(edited);
}

await f.run(async () => {
  const source = await f.inspect('seed', {});
  if (agent) return approveAgentPattern(source);
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'two-rectangular-through-cuts.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Show its features', browser).click();
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await native('original-two-cuts', source, [older, later]);
  if (linear) return applyLinearPattern(source);

  const latest = await openPattern(null);
  await setGrid(latest);
  const latestDoc = await apply(latest, source, '01-current-cut-control', false);
  await native('current-source', latestDoc, [older, ...grid(later, 16)]);
  await f.undo();
  await f.same(source);

  const fromBrowser = await openPattern('Browser');
  const undo = await button('Undo').getAttribute('data-tip');
  await setGrid(fromBrowser, 18);
  await phase(fromBrowser, 'refused');
  assert.ok(await button('Apply', fromBrowser).isDisabled());
  const refused = fromBrowser.locator('.hud-error');
  const disclosure = refused.locator('details:not([open]) > summary');
  if (await disclosure.count()) await disclosure.click();
  assert.match(await refused.innerText(), /overlap|touch|intersect|disjoint/i);
  await f.same(source);
  assert.equal(await button('Undo').getAttribute('data-tip'), undo);
  await f.snapshot('02-overlap-refused');
  await setGrid(fromBrowser);
  await phase(fromBrowser, 'preview');
  await f.snapshot('03-earlier-cut-preview');
  const browserDoc = await apply(fromBrowser, source, '04-earlier-cut-applied', true);
  await native('earlier-source-browser', browserDoc, [...grid(older, 16), later]);
  await f.undo();
  await f.same(source);

  const fromHistory = await openPattern('History');
  await setGrid(fromHistory);
  const historyDoc = await apply(fromHistory, source, '05-earlier-cut-history', true);
  assert.deepEqual(historyDoc, browserDoc);
  await native('earlier-source-history', historyDoc, [...grid(older, 16), later]);

  await f.openFeatureEditor(8, 'rectangular cut spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'First spacing').fill('18');
  const edited = (await f.applyEditor(historyDoc, '06-first-spacing-edited')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...historyDoc.nodes.at(-1), spacing: 18 });
  await native('after-spacing-edit', edited, [...grid(older, 18), later]);
  await f.undo();
  await f.same(historyDoc);
  await f.redo();
  await f.same(edited);
  const stored = await f.save('earlier-cut-pattern');
  await f.freshOpen(stored.file, edited, '07-saved-earlier-cut-fresh-open');
  await native('after-fresh-open', edited, [...grid(older, 18), later]);
  await f.openFeatureEditor(8, 'retained earlier source');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  assert.equal(await field(f.editor(), 'First spacing').inputValue(), '18');
  await f.snapshot('08-reopened-earlier-source');
  await f.closeEditor();
  await f.same(edited);
});
