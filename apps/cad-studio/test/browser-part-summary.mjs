import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const unsupported = process.argv.includes('--unsupported');
const name = 'cad_part_summary', measureName = 'cad_part_measure_planes';
const pins = ['apps/cad-studio/test/browser-part-summary.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/chat/useBrowserPartSummary.ts', 'apps/cad-studio/src/ui/ChatPanel.tsx',
  'packages/barocss-cad-model/src/chat/part/query.ts'];
const f = await createFlow({
  name: 'browser-part-summary', output: process.argv[2], envFrozen: 'BROWSER_PART_SUMMARY_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Call the actual Chrome WebMCP API for an explicitly shared current part and compare summaries and plane measurements to local MCP.',
  limits: ['Ordinary base parts, two read-only tools, one isolated desktop Chrome profile.'],
  ...(!unsupported && { async createContext(options) {
    if (!f.browser) {
      const { chromium } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright');
      f.browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true,
        args: ['--enable-unsafe-webgpu', '--enable-blink-features=WebMCP,WebMCPTesting'] });
      f.report.chromeProcessesLaunched = 1;
    }
    return f.browser.newContext(options);
  } }),
});
const stock = height => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 2, parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { kind: 'extrude', id: 'n1', sketch: 0, height },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
});
const button = (name, parent = f.page) => parent.getByRole('button', { name, exact: true });
const chat = () => f.page.getByRole('complementary', { name: 'Chat', exact: true });
const toggle = () => button('Share part summary and plane measurements with browser tools', chat());
const toolList = () => f.page.evaluate(async () => (await document.modelContext?.getTools() ?? []).map(tool => tool.name));
const countTools = expected => f.page.waitForFunction(async ([summary, measure, count]) => {
  const names = (await document.modelContext.getTools()).map(tool => tool.name);
  return names.filter(name => name === summary).length === count && names.filter(name => name === measure).length === count;
}, [name, measureName, expected]);
const getTool = (toolName = name) => f.page.evaluateHandle(async toolName =>
  (await document.modelContext.getTools()).find(tool => tool.name === toolName), toolName);
const invoke = (tool, input = {}) => f.page.evaluate(async ({ tool, input }) => JSON.parse(await document.modelContext.executeTool(tool, input)), { tool, input });

async function localQueries(file) {
  return withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'local-summary', async call => {
    const revision = await currentPartRevision(call);
    const result = await call('query', { action: 'summary', response_format: 'concise' });
    const summary = { revision, units: 'mm', featureCount: result.feature_count,
      bodies: result.bodies.map(({ key, volume, bounds, face_count, edge_count }) => ({
        key, volume, bounds, faceCount: face_count, edgeCount: edge_count,
      })) };
    const measurement = await call('query', { action: 'measure', a: 'n1.top', b: 'n1.bottom' });
    return { summary, measurement };

  });
}

async function openedChat() {
  if (!(await chat().isVisible())) await button('Chat').first().click();
  await chat().waitFor();
}

await f.run(async () => {
  const first = stock(10), second = stock(15), originalFile = join(f.output, 'box-10.bcad'), nextFile = join(f.output, 'box-15.bcad');
  await writeFile(originalFile, JSON.stringify(first));
  await writeFile(nextFile, JSON.stringify(second));
  await f.freshOpen(originalFile, first, 'model-before-sharing');
  await openedChat();

  if (unsupported) {
    assert.equal(await toggle().count(), 0);
    assert.deepEqual(await toolList(), []);
    await f.same(first);
    await f.snapshot('ordinary-studio-without-webmcp');
    return;
  }

  assert.deepEqual(await toolList(), []);
  assert.equal(await toggle().getAttribute('aria-pressed'), 'false');
  const initial = await f.snapshot('sharing-off');
  await toggle().click();
  await countTools(1);
  assert.deepEqual((await toolList()).sort(), [measureName, name].sort());
  const tool = await getTool(), measure = await getTool(measureName), expected = await localQueries(originalFile);
  const measurementSchema = await measure.evaluate(({ inputSchema }) =>
    typeof inputSchema === 'string' ? JSON.parse(inputSchema) : inputSchema);
  assert.deepEqual(measurementSchema.properties.expectedRevision,
    { type: 'string', minLength: 16, maxLength: 16, pattern: '^[a-f0-9]{16}$' });
  assert.equal(measurementSchema.properties.body.minLength, 1);
  const result = await invoke(tool);
  assert.deepEqual(result, expected.summary);
  assert.equal(result.bodies[0].volume, 12000);
  assert.deepEqual(result.bodies[0].bounds, { min: [0, 0, 0], max: [40, 30, 10] });
  assert.deepEqual(await invoke(tool, { includeFiles: true }), { error: { code: 'invalid_arguments', message: 'The CAD part summary takes no arguments.' } });
  const args = { body: 'b1', first: 'top', second: 'bottom', expectedRevision: result.revision };
  const measured = await invoke(measure, args);
  assert.deepEqual(measured, { revision: result.revision, units: 'mm', body: 'b1', faces: ['n1.top', 'n1.bottom'],
    distance: expected.measurement.distance, normalDistance: expected.measurement.normalDistance, angleDegrees: expected.measurement.angle });
  assert.equal(measured.normalDistance, 10);
  const perpendicular = await invoke(measure, { ...args, second: 'right' });
  assert.deepEqual([perpendicular.distance, perpendicular.normalDistance, perpendicular.angleDegrees], [0, null, 90]);
  assert.equal((await invoke(measure, { ...args, second: 'top' })).error.code, 'invalid_arguments');
  assert.equal((await invoke(measure, { ...args, body: 'missing' })).error.code, 'planes_unavailable');
  assert.equal((await invoke(measure, { ...args, expectedRevision: '0000000000000000' })).error.code, 'stale_part');
  assert.equal((await invoke(measure, { ...args, expectedRevision: args.expectedRevision + '\n' })).error.code, 'invalid_arguments');
  await f.same(first);
  const shared = await f.snapshot('original-part-shared');
  assert.deepEqual([shared.history, shared.selection], [initial.history, initial.selection]);

  await toggle().click();
  await countTools(0);
  const lateRead = await f.page.evaluateHandle(summaryName => {
    const prototype = Object.getPrototypeOf(document.modelContext);
    const register = prototype.registerTool;
    const state = { abortedCalls: [] };
    let hold = true;
    prototype.registerTool = async function (tool, options) {
      if (options.signal.aborted) state.abortedCalls.push(tool.name);
      const shouldHold = hold && tool.name === summaryName;
      if (shouldHold) hold = false;
      await Reflect.apply(register, this, [tool, options]);
      if (shouldHold) await new Promise(resolve => { state.release = resolve; });
    };
    state.restore = () => { prototype.registerTool = register; };
    return state;
  }, name);
  await toggle().click();
  await f.page.waitForFunction(state => !!state.release, lateRead);
  const heldTool = await getTool();
  assert.deepEqual(await invoke(heldTool), result);
  await f.openFile(nextFile, second.nodes.length);
  await f.changed(first);
  await f.same(second);
  await countTools(0);
  await openedChat();
  assert.equal(await toggle().getAttribute('aria-pressed'), 'false');
  await assert.rejects(invoke(tool));
  await assert.rejects(invoke(measure, args));
  await f.snapshot('replacement-revokes-old-summary');
  await toggle().click();
  await countTools(1);
  const nextTool = await getTool(), updated = await invoke(nextTool);
  const abortedCalls = await lateRead.evaluate(async state => {
    state.release();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    state.restore();
    return state.abortedCalls;
  });
  assert.deepEqual(abortedCalls, []);
  await assert.rejects(invoke(heldTool));
  await lateRead.dispose();
  assert.notEqual(updated.revision, expected.summary.revision);
  const nextMeasure = await getTool(measureName);
  assert.equal((await invoke(nextMeasure, args)).error.code, 'stale_part');
  const updatedMeasure = await invoke(nextMeasure, { ...args, expectedRevision: updated.revision });
  assert.equal(updatedMeasure.normalDistance, 15);
  assert.deepEqual(updated.bodies.map(({ key, volume }) => [key, volume]), [['b1', 18000]]);
  assert.equal(updated.bodies[0].bounds.max[2], 15);
  await assert.rejects(invoke(tool));
  await f.snapshot('new-part-explicitly-shared');

  await toggle().click();
  await countTools(0);
  await assert.rejects(invoke(nextTool));
  await assert.rejects(invoke(nextMeasure, { ...args, expectedRevision: updated.revision }));
  await toggle().click();
  await countTools(1);
  const lastTool = await getTool(), lastMeasure = await getTool(measureName);
  await button('Close chat', chat()).click();
  await countTools(0);
  await assert.rejects(invoke(lastTool));
  await assert.rejects(invoke(lastMeasure, { ...args, expectedRevision: updated.revision }));
  await f.same(second);
  await openedChat();
  assert.equal(await toggle().getAttribute('aria-pressed'), 'false');
  assert.deepEqual(await toolList(), []);
  await f.snapshot('closed-chat-did-not-restore-sharing');
  const circle = { ...first, nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 5 }, first.nodes[1]] };
  const circleFile = join(f.output, 'circle-10.bcad');
  await writeFile(circleFile, JSON.stringify(circle));
  await f.openFile(circleFile, circle.nodes.length);
  await f.changed(second);
  await f.same(circle);
  await openedChat();
  await toggle().click();
  await countTools(1);
  const cylinder = await invoke(await getTool());
  const declined = await invoke(await getTool(measureName), { ...args, first: 'left', second: 'right', expectedRevision: cylinder.revision });
  assert.equal(declined.error.code, 'planes_unavailable');
  await f.same(circle);
  await f.snapshot('cylinder-unavailable-directions');
  const pattern = {
    ...first, nextId: 3, outputs: { b2: { node: 2, side: 'solid' } },
    nodes: [...first.nodes, { id: 'n2', kind: 'linear-pattern', parent: { node: 1, side: 'solid' }, axis: 'x', spacing: 60, count: 2 }],
  };
  const patternFile = join(f.output, 'two-top-faces.bcad');
  await writeFile(patternFile, JSON.stringify(pattern));
  await f.openFile(patternFile, pattern.nodes.length);
  await f.changed(circle);
  await f.same(pattern);
  await countTools(0);
  await openedChat();
  await toggle().click();
  await countTools(1);
  const combined = await invoke(await getTool());
  assert.deepEqual(combined.bodies.map(body => body.key), ['b2']);
  const ambiguous = await invoke(await getTool(measureName), { ...args, body: 'b2', expectedRevision: combined.revision });
  assert.equal(ambiguous.error.code, 'planes_unavailable');
  await f.same(pattern);
  await f.snapshot('multiple-original-top-planes-refused');
  f.report.observations.push({ browser: f.browser.version(), original: result, measurement: measured, perpendicular,
    replacement: updated, replacementMeasurement: updatedMeasure, unavailable: declined, ambiguous });
});
