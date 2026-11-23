import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
import { choosePriorCutSource, equivalent, fillMask, inspectorSource, later, newest, older, shift, threeCutFillMask, verifyPriorCut } from './prior-cut-pattern-browser-fixture.mjs';

const mode = process.argv[3];
const workflows = {
  '--agent': ['D1829_SOURCE_FROZEN', '#25 revision-bound local Agent proposal for the earlier through-Subtract.'],
  '--linear': ['D1830_SOURCE_FROZEN', '#25 repeat the earlier rectangular through-cut along a signed XY line.'],
  '--linear-three': ['D1850_SOURCE_FROZEN', '#25 repeat a rectangular through-cut along a signed XY line after two newer cuts.'],
  '--rectangular-three': ['D1851_SOURCE_FROZEN', '#25 repeat the first of three rectangular through-cuts on an XY grid.'],
  '--fill': ['D1831_SOURCE_FROZEN', '#25 repeat the earlier rectangular through-cut at the captured mask cells.'],
  '--fill-three': ['D1852_SOURCE_FROZEN', '#25 repeat the first of three rectangular through-cuts at the captured mask cells.'],
};
const [envFrozen, qualification] = workflows[mode] ?? [
  'D1828_SOURCE_FROZEN', '#25 repeat only the chosen earlier through-Subtract on its current same-stock result.',
];
const f = await createFlow({
  name: 'prior-rectangular-cut-pattern', output: process.argv[2], envFrozen, qualification,
  limits: ['One original rectangular stock and two or three disjoint full-height rectangular cuts in desktop Studio.'],
  initialFiles: [import.meta.filename, 'apps/cad-studio/test/prior-cut-pattern-browser-fixture.mjs', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/cutPatternSource.ts',
    'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/ui/NodeEditor.tsx', 'packages/barocss-cad-model/src/app/commands.ts',
    'packages/barocss-cad-model/src/chat/part/features.ts',
    'packages/barocss-cad-model/src/engine/doc.ts', 'packages/barocss-cad-model/src/engine/part.ts',
    'packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/part/part-transform.ts',
    'packages/barocss-cad/src/part/part-types.ts', 'packages/barocss-cad/src/part/part-prior-rectangular-cut.ts'],
  inspectorSource,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Rectangular cut pattern', exact: true });
const phase = (p, state) => p.locator('.status').filter({ hasText: new RegExp(`^${state}$`) }).waitFor();
const field = (p, label) => p.getByLabel(label, { exact: true });
const grid = (box, sx) => [box, shift(box, sx, 0), shift(box, 0, 8), shift(box, sx, 8)];
const rectangularThree = mode === '--rectangular-three';
const fillThree = mode === '--fill-three';

const native = (label, doc, openings) => verifyPriorCut(f, label, doc, openings);
const chooseSource = entry => choosePriorCutSource(f, entry);

async function openPattern(entry) {
  await chooseSource(entry);
  await clickModelCommand(f.page, 'Pattern', 'Rectangular cut pattern');
  const p = hud();
  await p.waitFor();
  const source = entry ? 'Subtract 1 (n4)' : rectangularThree ? 'Subtract 3 (n10)' : 'Subtract 2 (n7)';
  await p.getByText(source, { exact: true }).waitFor();
  assert.equal(await field(p, 'First direction').locator('option[value="z"]').count(), entry ? 0 : 1);
  assert.equal(await field(p, 'Second direction').locator('option[value="z"]').count(), entry ? 0 : 1);
  return p;
}

async function setGrid(p, secondSpacing = 8) {
  await field(p, 'First count').fill('2');
  await field(p, 'Second spacing').fill(String(secondSpacing));
  await field(p, 'Second count').fill('2');
}

async function apply(p, before, label, usesEarlier, firstSpacing = 16) {
  await phase(p, 'preview');
  await f.same(before);
  await button('Apply', p).click();
  await f.changed(before);
  const doc = (await f.snapshot(label)).doc, pattern = doc.nodes.at(-1);
  assert.deepEqual(doc.nodes.slice(0, -1), before.nodes);
  assert.deepEqual(pattern.parent, { node: before.nodes.length - 1, side: 'solid' });
  assert.deepEqual(pattern.source, usesEarlier ? { node: 4, side: 'solid' } : undefined);
  assert.deepEqual([pattern.axis, pattern.spacing, pattern.count, pattern.axis2, pattern.spacing2, pattern.count2], ['x', firstSpacing, 2, 'y', 8, 2]);
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
  const target = source.nodes.length - 1;
  const acrossTwoCuts = mode === '--linear-three';
  const retained = acrossTwoCuts ? [older, later, newest] : [older, later];
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
    assert.deepEqual(node.parent, { node: target, side: 'solid' });
    assert.deepEqual(node.source, earlier ? { node: 4, side: 'solid' } : undefined);
    assert.deepEqual([node.kind, node.axis, node.spacing, node.count], ['linear-feature-pattern', 'x', 16, 2]);
    return doc;
  };
  if (!acrossTwoCuts) {
    const control = await applyLinear(await open(null), '01-linear-current-control', false);
    await native('linear-current-source', control, [older, later, shift(later, 16, 0)]);
    await f.undo();
    await f.same(source);
  }

  const panel = await open('Browser');
  const undo = await button('Undo').getAttribute('data-tip');
  for (const spacing of [0, -8, -3]) {
    await field(panel, 'Spacing').fill(String(spacing));
    await phase(panel, 'refused');
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
  }
  if (acrossTwoCuts) {
    await field(panel, 'Spacing').fill('16');
    await phase(panel, 'preview');
    await field(panel, 'Count').fill('3');
    await phase(panel, 'refused');
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
    await f.snapshot('02a-overlap-with-third-cut-refused');
    await field(panel, 'Count').fill('2');
    await phase(panel, 'preview');
    await field(panel, 'Spacing').fill('14');
    await field(panel, 'Direction').selectOption('y');
    await phase(panel, 'preview');
    await field(panel, 'Spacing').fill('18');
    await phase(panel, 'refused');
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
    await f.snapshot('02b-overlap-with-second-cut-refused');
    await field(panel, 'Direction').selectOption('x');
  } else await f.snapshot('02-linear-overlap-refused');
  await field(panel, 'Spacing').fill('16');
  const browser = await applyLinear(panel, '03-linear-earlier-positive', true);
  const positive = [...retained, shift(older, 16, 0)];
  await native('linear-positive', browser, positive);
  await f.undo();
  await f.same(source);
  const history = await applyLinear(await open('History'), '04-linear-history-applied', true);
  assert.deepEqual(history, browser);

  await f.openFeatureEditor(target + 1, 'linear cut spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Spacing').fill('-6');
  const edited = (await f.applyEditor(history, '05-linear-earlier-negative')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...history.nodes.at(-1), spacing: -6 });
  const negative = [...retained, shift(older, -6, 0)];
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
  await f.openFeatureEditor(target + 1, 'retained linear cut source');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  assert.equal(await field(f.editor(), 'Spacing').inputValue(), '-6');
  await f.snapshot('06-linear-reopened-source');
  await f.closeEditor();
  await f.same(edited);
}

async function applyFillPattern(source) {
  const index = source.nodes.length;
  const currentSource = fillThree ? newest : later;
  const currentPitch = fillThree ? 6 : 16;
  const retained = fillThree ? [older, later, newest] : [older, later];
  const open = async entry => {
    await chooseSource(entry);
    await clickModelCommand(f.page, 'Pattern', 'Fill cut pattern');
    const panel = f.page.getByRole('dialog', { name: 'Fill cut pattern', exact: true });
    await panel.getByText(entry ? 'Subtract 1 (n4)' : fillThree ? 'Subtract 3 (n10)' : 'Subtract 2 (n7)', { exact: true }).waitFor();
    await field(panel, 'Region snapshot').selectOption(String(index - 1));
    for (const [label, value] of [['Reference X', 10], ['Reference Y', 9], ['X spacing', entry ? 16 : currentPitch], ['Columns', 2], ['Y spacing', 8], ['Rows', 2]])
      await field(panel, label).fill(String(value));
    return panel;
  };
  const applyFill = async (panel, label, earlier) => {
    await phase(panel, 'preview');
    await f.same(source);
    await button('Apply', panel).click();
    await f.changed(source);
    const { doc } = await f.snapshot(label), node = doc.nodes.at(-1);
    assert.deepEqual(doc.nodes.slice(0, -1), source.nodes);
    assert.deepEqual(node.parent, { node: index - 2, side: 'solid' });
    assert.deepEqual(node.source, earlier ? { node: 4, side: 'solid' } : undefined);
    assert.deepEqual(node.region, { points: fillThree ? threeCutFillMask : fillMask });
    assert.deepEqual(node.anchor, [10, 9]);
    assert.deepEqual([node.kind, node.spacing, node.count, node.spacing2, node.count2], ['fill-feature-pattern', earlier ? 16 : currentPitch, 2, 8, 2]);
    return doc;
  };
  const control = await applyFill(await open(null), '01-fill-current-control', false);
  await native('fill-current-source', control, [...retained, shift(currentSource, currentPitch, 0), shift(currentSource, 0, 8)]);
  await f.undo();
  await f.same(source);

  const panel = await open('Browser');
  const undo = await button('Undo').getAttribute('data-tip');
  const overlap = async (key, invalid, restored, label) => {
    await phase(panel, 'preview');
    await field(panel, key).fill(String(invalid));
    await phase(panel, 'refused');
    assert.ok(await button('Apply', panel).isDisabled());
    await f.same(source);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
    const error = panel.locator('.hud-error');
    const details = error.locator('details:not([open]) > summary');
    if (await details.count()) await details.click();
    assert.match(await error.innerText(), /disjoint from the newer cut/);
    await f.snapshot(label);
    await field(panel, key).fill(String(restored));
  };
  await overlap('Y spacing', 18, 8, '02-fill-overlap-refused');
  if (fillThree) await overlap('X spacing', 32, 16, '02a-fill-third-cut-refused');
  const browser = await applyFill(panel, '03-fill-earlier-applied', true);
  const openings = spacing2 => [...retained, shift(older, 16, 0), shift(older, 0, spacing2)];
  await native('fill-earlier-mask-cells', browser, openings(8));
  await f.undo();
  await f.same(source);
  const history = await applyFill(await open('History'), '04-fill-history-applied', true);
  assert.deepEqual(history, browser);

  await f.openFeatureEditor(index, 'fill cut spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Y spacing').fill('5');
  const edited = (await f.applyEditor(history, '05-fill-row-spacing-edited')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...history.nodes.at(-1), spacing2: 5 });
  await native('fill-earlier-after-edit', edited, openings(5));
  await f.undo();
  await f.same(history);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('fill-earlier-cut');
  await f.freshOpen(saved.file, edited, 'fill-saved-fresh-open');
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await native('fill-earlier-after-open', edited, openings(5));
  await f.openFeatureEditor(index, 'fill snapshot and earlier cut');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  assert.equal(await field(f.editor(), 'Y spacing').inputValue(), '5');
  assert.equal(await field(f.editor(), 'Region snapshot').locator('option:checked').textContent(), 'Current region snapshot');
  await f.snapshot('06-fill-reopened-source');
  await f.closeEditor();
  await f.same(edited);
}

await f.run(async () => {
  const third = mode === '--linear-three' || rectangularThree || fillThree;
  const fill = mode === '--fill' || fillThree;
  const source = await f.inspect('seed', { fill, third });
  if (mode === '--agent') return approveAgentPattern(source);
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: third ? 'three-rectangular-through-cuts.bcad' : 'two-rectangular-through-cuts.bcad',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Show its features', browser).click();
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await native('original-through-cuts', source, third ? [older, later, newest] : [older, later]);
  if (mode === '--linear' || mode === '--linear-three') return applyLinearPattern(source);
  if (fill) return applyFillPattern(source);

  const latest = await openPattern(null);
  const currentPitch = rectangularThree ? 6 : 16;
  await field(latest, 'First spacing').fill(String(currentPitch));
  await setGrid(latest);
  const latestDoc = await apply(latest, source, '01-current-cut-control', false, currentPitch);
  await native('current-source', latestDoc, rectangularThree ? [older, later, ...grid(newest, currentPitch)] : [older, ...grid(later, currentPitch)]);
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
  if (rectangularThree) {
    await field(fromBrowser, 'First spacing').fill('32');
    await phase(fromBrowser, 'refused');
    assert.ok(await button('Apply', fromBrowser).isDisabled());
    await f.same(source);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
    await f.snapshot('02a-overlap-third-cut-refused');
    await field(fromBrowser, 'First spacing').fill('16');
    await phase(fromBrowser, 'preview');
  }
  const originals = rectangularThree ? [later, newest] : [later];
  await f.snapshot('03-earlier-cut-preview');
  const browserDoc = await apply(fromBrowser, source, '04-earlier-cut-applied', true);
  await native('earlier-source-browser', browserDoc, [...grid(older, 16), ...originals]);
  await f.undo();
  await f.same(source);

  const fromHistory = await openPattern('History');
  await setGrid(fromHistory);
  const historyDoc = await apply(fromHistory, source, '05-earlier-cut-history', true);
  assert.deepEqual(historyDoc, browserDoc);
  await native('earlier-source-history', historyDoc, [...grid(older, 16), ...originals]);

  await f.openFeatureEditor(source.nodes.length, 'rectangular cut spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'First spacing').fill('18');
  const edited = (await f.applyEditor(historyDoc, '06-first-spacing-edited')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...historyDoc.nodes.at(-1), spacing: 18 });
  await native('after-spacing-edit', edited, [...grid(older, 18), ...originals]);
  await f.undo();
  await f.same(historyDoc);
  await f.redo();
  await f.same(edited);
  const stored = await f.save('earlier-cut-pattern');
  await f.freshOpen(stored.file, edited, '07-saved-earlier-cut-fresh-open');
  await native('after-fresh-open', edited, [...grid(older, 18), ...originals]);
  await f.openFeatureEditor(source.nodes.length, 'retained earlier source');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  assert.equal(await field(f.editor(), 'First spacing').inputValue(), '18');
  await f.snapshot('08-reopened-earlier-source');
  await f.closeEditor();
  await f.same(edited);
});
