import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const [output, wire] = process.argv.slice(2);
assert.ok(output && wire && isAbsolute(output) && isAbsolute(wire));
const input = join(wire, 'review-b.bcad'), bytes = await readFile(input), source = JSON.parse(bytes);
const acceptedFile = JSON.parse(await readFile(join(wire, 'accepted.bcad')));
const { reviewed, current } = JSON.parse(await readFile(join(wire, 'revisions.json')));
const stale = { action: 'delete', index: 3, expectedRevision: reviewed };
const fresh = { action: 'delete', index: 1, expectedRevision: current };

const port = createServer();
port.listen(0, '127.0.0.1');
await once(port, 'listening');
process.env.CAD_STUDIO_CHAT_PORT = String(port.address().port);
await new Promise((done, reject) => port.close(error => error ? reject(error) : done()));

const scripted = 'apps/cad-studio/test/fixtures/scripted-claude.mjs';
const pins = [
  scripted, 'apps/cad-studio/test/revision-pinned-delete-browser.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'apps/cad-studio/server/chatServer.ts',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/chat/useStudioChat.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/chat/toolDefinitions.ts',
];
const f = await createFlow({
  name: 'revision-pinned-delete', envFrozen: 'REVISION_DELETE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'A stale feature index refuses in the actual Studio chat and retains both solids. A fresh proposed delete needs explicit approval.',
  limits: ['One base part with independently authored boxes. Scripted provider uses the real chat server and MCP.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => ({
  key, valid: checkBrep(brep, { strict: true }).valid,
  volume: brepMassProperties(brep, 1).volume, points: brep.vertices.map(v => v.point),
}))));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const frameAll = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const history = async () => ({
  undo: await button('Undo').isEnabled(), redo: await button('Redo').isEnabled(),
  labels: await f.page.locator('.history .hs').evaluateAll(items => items.map(el => el.getAttribute('aria-label'))),
});
const expected = {
  b3: { min: [60, 0, 0], max: [80, 10, 5], volume: 20 * 10 * 5 },
  b5: { min: [120, 0, 0], max: [135, 12, 10], volume: 15 * 12 * 10 },
};
async function measure(label, doc, keys) {
  await f.same(doc);
  const native = await f.inspect(label, doc), { bodies } = await f.bodies();
  assert.deepEqual(native.map(({ key }) => key).sort(), keys);
  assert.deepEqual(bodies.map(({ key }) => key).sort(), keys);
  for (const { key, valid, volume, points } of native) {
    const { min, max, volume: wanted } = expected[key];
    assert.equal(valid, true);
    assert.ok(Math.abs(volume - wanted) < 1e-7);
    assert.ok(Math.abs(bodies.find(body => body.key === key).volume - wanted) < 1e-7);
    assert.deepEqual(points.map(p => p.join(',')).sort(),
      [min[0], max[0]].flatMap(x => [min[1], max[1]].flatMap(y => [min[2], max[2]].map(z => [x, y, z].join(',')))).sort());
  }
  f.report.observations.push({ label, volumes: native.map(({ key, volume }) => [key, volume]) });
}

async function turn(label, call, refused) {
  f.phase = label;
  const chat = f.page.getByRole('textbox', { name: 'Chat message', exact: true });
  if (!await chat.isVisible()) await button('Chat').first().click();
  await f.page.waitForFunction(() => document.querySelector('[aria-label="Chat message"]')?.disabled === false);
  const response = f.page.waitForResponse(r => new URL(r.url()).pathname === '/api/chat/turn' && r.request().method() === 'POST');
  await chat.fill('script ' + JSON.stringify({ calls: [call] }));
  await chat.press('Enter');
  const wireResponse = await response;
  assert.equal(wireResponse.status(), 200);
  assert.equal(wireResponse.request().postDataJSON().autonomy, 2);
  const reply = (await wireResponse.body()).toString('utf8');
  await writeFile(join(output, label.toLowerCase().replaceAll(' ', '-') + '.sse'), reply);
  const events = reply.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  assert.equal(events.at(-1).end, 'done', reply);
  const message = events.find(event => event.type === 'tool');
  assert.equal(message?.isError, refused, reply);
  await f.page.waitForFunction(() => document.querySelector('[aria-label="Chat message"]')?.disabled === false);
  f.report.observations.push({ label, message, documents: events.filter(event => event.type === 'state').length });
  return { events, message };
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (!['http:', 'https:'].includes(url.protocol) || url.origin === origin || ['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
      return route.abort();
    });
    return context;
  };
  const provider = join(output, 'scripted-provider.mjs');
  const interpreter = process.platform === 'darwin' && !/\s/.test(process.execPath) ? process.execPath : '/usr/bin/env node';
  await writeFile(provider, `#!${interpreter}\nimport ${JSON.stringify(resolve(f.repo, scripted))};\n`, { mode: 0o700, flag: 'wx' });
  const env = { ...process.env, CAD_STUDIO_CLAUDE: provider, CAD_STUDIO_CHAT_ORIGINS: origin };
  for (const key of ['CAD_SCRIPTED_COST_USD', 'CAD_SCRIPTED_SLEEP_MS', 'CAD_SCRIPTED_MARK', 'CAD_AB_LOG']) delete env[key];
  const server = spawn(process.execPath, [join(f.app, 'scripts/chat-server.mjs')], { cwd: f.app, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(server, 'close');
  let stdout = '', stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk; });
  const ready = new Promise(done => server.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.includes('chat server on')) done(true);
  }));
  try {
    assert.ok(await Promise.race([ready, closed.then(() => false), new Promise(done => setTimeout(() => done(false), 15000).unref())]), stderr);
    await f.freshOpen(input, source, 'current-review');
    await measure('current', source, ['b3', 'b5']);
    const before = await history();
    const rejected = await turn('Refuse the stale delete', { tool: 'features', args: stale }, true);
    assert.match(rejected.message.summary, /changed since the requested revision.*before deleting the feature/);
    assert.ok(!rejected.events.some(event => event.type === 'state'));
    await measure('after-stale-refusal', source, ['b3', 'b5']);
    assert.deepEqual(await history(), before);
    await f.page.getByText(/review the current part again before deleting the feature/i).first().waitFor();
    await frameAll();
    await f.snapshot('stale-delete-refused');

    const needsApproval = await turn('Require a proposal for the current delete', { tool: 'features', args: fresh }, true);
    assert.match(needsApproval.message.summary, /propose it/);
    assert.ok(!needsApproval.events.some(event => event.type === 'state'));
    await f.same(source);
    assert.deepEqual(await history(), before);

    const title = 'Remove the reviewed 20 × 10 × 5 mm box';
    await turn('Propose the fresh delete', { tool: 'proposals', args: { action: 'propose', title, ops: [{ tool: 'features', args: fresh }] } }, false);
    await f.changed(source);
    const proposed = await f.doc();
    assert.deepEqual(proposed.nodes, source.nodes);
    assert.equal(proposed.proposals[0].title, title);
    assert.equal(proposed.proposals[0].status, 'open');
    await measure('proposal-pending', proposed, ['b3', 'b5']);
    const card = f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
    await button('Accept', card).click();
    await f.page.waitForFunction(() => window.__studioDoc?.proposals?.[0]?.status === 'accepted');
    await f.ready();
    const accepted = await f.doc();
    assert.deepEqual(accepted.nodes, acceptedFile.nodes);
    assert.deepEqual(accepted.outputs, acceptedFile.outputs);
    await measure('proposal-accepted', accepted, ['b5']);
    await frameAll();
    await f.snapshot('fresh-delete-accepted');
    await f.undo(); await measure('undo', proposed, ['b3', 'b5']);
    await f.redo(); await measure('redo', accepted, ['b5']);
    const saved = await f.save('approved-delete');
    await f.freshOpen(saved.file, accepted, 'approved-delete-reopened');
    await measure('reopened', accepted, ['b5']);
    assert.deepEqual(await readFile(input), bytes);
  } finally {
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
    await closed;
    await writeFile(join(output, 'chat-stderr.txt'), stderr);
  }
});
