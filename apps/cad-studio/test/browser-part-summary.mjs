import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

const unsupported = process.argv.includes('--unsupported');
const name = 'cad_part_summary';
const pins = ['apps/cad-studio/test/browser-part-summary.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/chat/useBrowserPartSummary.ts', 'apps/cad-studio/src/ui/ChatPanel.tsx',
  'packages/barocss-cad-model/src/chat/part/query.ts'];
const f = await createFlow({
  name: 'browser-part-summary', output: process.argv[2], envFrozen: 'BROWSER_PART_SUMMARY_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Call the actual Chrome WebMCP API for an explicitly shared current part and compare the local MCP query.',
  limits: ['One ordinary base part, one read-only input-free tool, one isolated desktop Chrome profile.'],
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
const toggle = () => button('Share part summary with browser tools', chat());
const toolList = () => f.page.evaluate(async () => (await document.modelContext?.getTools() ?? []).map(tool => tool.name));
const countTools = expected => f.page.waitForFunction(async ([tool, count]) =>
  (await document.modelContext.getTools()).filter(item => item.name === tool).length === count, [name, expected]);
const getTool = () => f.page.evaluateHandle(async name => (await document.modelContext.getTools()).find(tool => tool.name === name), name);
const invoke = (tool, input = {}) => f.page.evaluate(async ({ tool, input }) => JSON.parse(await document.modelContext.executeTool(tool, input)), { tool, input });

async function localSummary(file) {
  return withMcpSession({ app: f.app, output: f.output, clientName: f.name }, file, 'local-summary', async call => {
    const revision = await currentPartRevision(call);
    const result = await call('query', { action: 'summary', response_format: 'concise' });
    return { revision, units: 'mm', featureCount: result.feature_count,
      bodies: result.bodies.map(({ key, volume, bounds, face_count, edge_count }) => ({
        key, volume, bounds, faceCount: face_count, edgeCount: edge_count,
      })) };
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
  assert.deepEqual(await toolList(), [name]);
  const tool = await getTool(), expected = await localSummary(originalFile);
  const result = await invoke(tool);
  assert.deepEqual(result, expected);
  assert.equal(result.bodies[0].volume, 12000);
  assert.deepEqual(result.bodies[0].bounds, { min: [0, 0, 0], max: [40, 30, 10] });
  assert.deepEqual(await invoke(tool, { includeFiles: true }), { error: { code: 'invalid_arguments', message: 'The CAD part summary takes no arguments.' } });
  await f.same(first);
  const shared = await f.snapshot('original-part-shared');
  assert.deepEqual([shared.history, shared.selection], [initial.history, initial.selection]);

  await f.openFile(nextFile, second.nodes.length);
  await f.changed(first);
  await f.same(second);
  await countTools(0);
  await openedChat();
  assert.equal(await toggle().getAttribute('aria-pressed'), 'false');
  await assert.rejects(invoke(tool));
  await f.snapshot('replacement-revokes-old-summary');
  await toggle().click();
  await countTools(1);
  const nextTool = await getTool(), updated = await invoke(nextTool);
  assert.notEqual(updated.revision, expected.revision);
  assert.deepEqual(updated.bodies.map(({ key, volume }) => [key, volume]), [['b1', 18000]]);
  assert.equal(updated.bodies[0].bounds.max[2], 15);
  await assert.rejects(invoke(tool));
  await f.snapshot('new-part-explicitly-shared');

  await toggle().click();
  await countTools(0);
  await assert.rejects(invoke(nextTool));
  await toggle().click();
  await countTools(1);
  const lastTool = await getTool();
  await button('Close chat', chat()).click();
  await countTools(0);
  await assert.rejects(invoke(lastTool));
  await f.same(second);
  await openedChat();
  assert.equal(await toggle().getAttribute('aria-pressed'), 'false');
  assert.deepEqual(await toolList(), []);
  await f.snapshot('closed-chat-did-not-restore-sharing');
  f.report.observations.push({ browser: f.browser.version(), original: result, replacement: updated, scopedRefusals: 5 });
});
