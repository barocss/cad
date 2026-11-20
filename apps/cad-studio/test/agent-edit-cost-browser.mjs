// Actual Studio HTTP entities, local chat service and real grouped MCP; no paid model.
// Run from apps/cad-studio, under the root heavy gate and source freeze:
// AGENT_EDIT_COST_SOURCE_FROZEN=1 PW_DIR=... CHROME=... node test/agent-edit-cost-browser.mjs --output /external/run --seed /external/seed.bcad
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const args = process.argv.slice(2);
const argument = name => args[args.indexOf(name) + 1];
assert.ok(args.includes('--output') && args.includes('--seed'), '--output and --seed required');
const output = argument('--output'), seedFile = resolve(argument('--seed'));
assert.ok(isAbsolute(output));
const seedBytes = await readFile(seedFile), seed = JSON.parse(seedBytes);
assert.deepEqual(seed.nodes.map(n => [n.id, n.kind]), [['n0', 'sketch'], ['n1', 'extrude']]);
assert.deepEqual([seed.nodes[0].profile, seed.nodes[0].min, seed.nodes[0].max], ['rectangle', [0, 0], [40, 20]]);
assert.equal(seed.nodes[1].height, 8);
assert.equal(seed.nodes[1].made, undefined);
const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
process.env.CAD_STUDIO_CHAT_PORT = String(probe.address().port);
await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
const scripted = 'apps/cad-studio/test/fixtures/scripted-claude.mjs';
const pins = ['apps/cad-studio/test/agent-edit-cost-browser.mjs', scripted,
  'apps/cad-studio/scripts/chat-server.mjs', 'apps/cad-studio/server/chatServer.ts',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/part/features.ts',
  'packages/barocss-cad-model/src/chat/groups.ts', 'apps/cad-studio/src/chat/client.ts',
  'apps/cad-studio/src/chat/transport.ts', 'apps/cad-studio/src/chat/useStudioChat.ts'];
const f = await createFlow({ name: 'agent-edit-cost', envFrozen: 'AGENT_EDIT_COST_SOURCE_FROZEN', output,
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Real desktop Studio refused and recovered grouped edit, HTTP UTF-8 entity bytes, native Save and fresh Open.',
  limits: ['Scripted provider, no live model or token/billing estimate.', 'HTTP decoded body entities only; excludes headers, TLS, HTTP framing, compression and provider/MCP process traffic.', 'One 40 × 20 mm stock; no claim about other feature types or renderer comparison.'],
  inspectorSource: `import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ brep }) => ({ valid: checkBrep(brep, { strict: true }).valid,
volume: brepMassProperties(brep, 1).volume, corners: brep.vertices.map(v => v.point), faces: brep.faces.length, edges: brep.edges.length }))));`,
  oracleSource: `import itertools,json,math,sys
r=json.load(sys.stdin)
b,=r['native']; h=r['height']; expected=40*20*h
assert b['valid'] and abs(b['volume']-expected)<1e-7 and abs(r['workerVolume']-expected)<1e-7
assert (len(b['corners']),b['faces'],b['edges'])==(8,6,12)
for p in itertools.product([0,40],[0,20],[0,h]):
 assert any(math.dist(p,q)<1e-9 for q in b['corners'])
print(json.dumps({'status':'PASS','expectedVolumeMm3':expected,'nativeVolumeMm3':b['volume']}))`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const undo = () => f.page.locator('button[aria-label="Undo"]');
const redo = () => f.page.locator('button[aria-label="Redo"]');
const history = async () => ({ undoEnabled: await undo().isEnabled(), redoEnabled: await redo().isEnabled(),
  labels: await f.page.locator('.history .hs').evaluateAll(items => items.map(x => x.getAttribute('aria-label'))) });
async function native(label, doc) {
  await f.same(doc);
  const bodies = (await f.bodies()).bodies; assert.equal(bodies.length, 1);
  const read = await f.inspect(label + '-native', doc);
  await f.runOracle({ native: read, workerVolume: bodies[0].volume, height: doc.nodes[1].height }, label);
  return { native: read, worker: bodies };
}
const utf8 = value => Buffer.byteLength(value, 'utf8');
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const wrapper = join(output, 'record-scripted-claude.mjs'), providerLog = join(output, 'provider.jsonl');
  const interpreter = process.platform === 'darwin' && !/\s/.test(process.execPath) ? process.execPath : '/usr/bin/env node';
  await writeFile(wrapper, `#!${interpreter}\nimport { appendFileSync } from 'node:fs';\nimport { pathToFileURL } from 'node:url';\nconst write=process.stdout.write.bind(process.stdout);\nif(process.argv[2]!=='--version')process.stdout.write=(chunk,...args)=>{appendFileSync(${JSON.stringify(providerLog)},chunk);return write(chunk,...args);};\nawait import(pathToFileURL(${JSON.stringify(resolve(f.repo, scripted))}).href);\n`, { mode: 0o700, flag: 'wx' });
  const env = { ...process.env, CAD_STUDIO_CLAUDE: wrapper, CAD_STUDIO_CHAT_ORIGINS: origin };
  for (const key of ['CAD_SCRIPTED_COST_USD', 'CAD_SCRIPTED_SLEEP_MS', 'CAD_SCRIPTED_MARK', 'CAD_AB_LOG']) delete env[key];
  const chat = spawn(process.execPath, [join(f.app, 'scripts/chat-server.mjs')], { cwd: f.app, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(chat, 'close'); let stdout = '', stderr = '';
  chat.stderr.on('data', c => { stderr += c; });
  const ready = new Promise(done => chat.stdout.on('data', c => { stdout += c; if (stdout.includes('chat server on')) done(true); }));
  const setup = [], pendingSetup = []; let recording = true, providerCursor = 0;
  const isTurn = request => new URL(request.url()).pathname === '/api/chat/turn' && request.method() === 'POST';
  const installSetup = page => page.on('response', response => {
    const request = response.request();
    if (!recording || !new URL(request.url()).pathname.startsWith('/api/chat/') || isTurn(request)) return;
    pendingSetup.push((async () => {
      const body = await response.body(), sent = request.postDataBuffer() ?? Buffer.alloc(0);
      setup.push({ method: request.method(), path: new URL(request.url()).pathname, status: response.status(),
        requestBodyUtf8Bytes: sent.length, responseDecodedEntityBytes: body.length, responseSHA256: sha256(body) });
    })());
  });
  async function turn(label, call, expectedError) {
    f.phase = label;
    const input = f.page.getByRole('textbox', { name: 'Chat message', exact: true });
    if (!await input.isVisible()) await button('Chat').first().click();
    await f.page.waitForFunction(() => document.querySelector('[aria-label="Chat message"]')?.disabled === false);
    const requestPromise = f.page.waitForRequest(isTurn), responsePromise = f.page.waitForResponse(r => isTurn(r.request()));
    const start = performance.now();
    await input.fill('script ' + JSON.stringify({ calls: [call] })); await input.press('Enter');
    const request = await requestPromise, response = await responsePromise;
    assert.equal(response.status(), 200);
    const requestBytes = request.postDataBuffer(), responseBytes = await response.body();
    assert.ok(requestBytes); const wire = JSON.parse(requestBytes), responseText = responseBytes.toString('utf8');
    assert.equal(Buffer.compare(Buffer.from(requestBytes.toString('utf8')), requestBytes), 0);
    assert.equal(Buffer.compare(Buffer.from(responseText), responseBytes), 0);
    const events = responseText.split('\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));
    assert.equal(events.at(-1).end, 'done', responseText);
    await f.page.waitForFunction(() => document.querySelector('[aria-label="Chat message"]')?.disabled === false);
    await f.ready();
    const elapsedMs = performance.now() - start;
    const provider = (await readFile(providerLog, 'utf8')).trim().split('\n').map(x => JSON.parse(x));
    const results = provider.filter(x => x.type === 'user').flatMap(x => x.message.content).slice(providerCursor);
    providerCursor += results.length; assert.equal(results.length, 1);
    const result = results[0], body = JSON.parse(result.content[0].text);
    assert.equal(Boolean(result.is_error), expectedError, JSON.stringify(body));
    const docText = JSON.stringify(wire.doc); assert.ok(requestBytes.toString('utf8').includes(docText));
    assert.deepEqual(wire.doc, seed, 'both feature calls must begin from the identical opened seed');
    assert.equal(wire.autonomy, 2);
    await writeFile(join(output, label + '-request.json'), requestBytes);
    await writeFile(join(output, label + '-response.sse'), responseBytes);
    const measure = { label, call, elapsedMs, status: response.status(), requestBodyUtf8Bytes: requestBytes.length,
      requestEmbeddedWholeDocumentUtf8Bytes: utf8(docText), requestOtherUtf8Bytes: requestBytes.length - utf8(docText),
      responseDecodedSseEntityUtf8Bytes: responseBytes.length, responseContentEncoding: response.headers()['content-encoding'] ?? 'identity',
      requestSHA256: sha256(requestBytes), responseSHA256: sha256(responseBytes), result: body,
      responseEmbeddedDocuments: events.flatMap((e, i) => e.doc ? [{ eventIndex: i, type: e.type, utf8Bytes: utf8(JSON.stringify(e.doc)) }] : []) };
    f.report.observations.push(measure); await f.persist(); return { body, events, measure };
  }
  try {
    assert.ok(await Promise.race([ready, closed.then(() => false), new Promise(done => setTimeout(() => done(false), 15000).unref())]), stderr);
    const newContext = f.browser.newContext.bind(f.browser);
    f.browser.newContext = async options => {
      const context = await newContext(options); context.on('page', installSetup); return context;
    };
    await f.newPage();
    await f.openFile(seedFile, 2); await f.same(seed);
    const initialHistory = await history(), initialShape = await native('01-opened', seed);
    await f.snapshot('01-opened');
    await undo().click(); await f.ready();
    const predecessor = await f.doc();
    assert.notDeepEqual(predecessor, seed);
    await redo().click(); await f.same(seed);
    assert.deepEqual(await history(), initialHistory);
    const refused = await turn('02-refused', { tool: 'features', args: { action: 'edit', index: 1, values: { h: '12 mm' } } }, true);
    assert.equal(refused.body.error, '"h" must be a number.');
    assert.equal(refused.events.some(e => e.type === 'state'), false);
    await f.same(seed); assert.deepEqual(await history(), initialHistory);
    assert.deepEqual(await native('02-refused', seed), initialShape);
    await f.snapshot('02-refused');
    await turn('03-recovered', { tool: 'features', args: { action: 'edit', index: 1, values: { h: 12 } } }, false);
    const recovered = await f.doc(); assert.equal(recovered.nodes[1].height, 12);
    const expectedModel = structuredClone(seed); expectedModel.nodes[1].height = 12;
    const { history: recoveredHistory, ...recoveredModel } = recovered;
    assert.deepEqual(recoveredModel, expectedModel);
    assert.equal(recoveredHistory.at(-1).kind, 'prompt');
    assert.equal(recoveredHistory.at(-1).by.agent, 'chat');
    assert.ok(!recoveredHistory.some(entry => entry.prompt?.includes('12 mm')), 'refusal leaves no design-history entry');
    assert.deepEqual(recovered.nodes[0], seed.nodes[0]);
    assert.equal(recovered.nodes.length, 2); assert.ok(await undo().isEnabled());
    await native('03-recovered', recovered); await f.snapshot('03-recovered');
    await undo().click(); await f.same(seed); assert.deepEqual((await history()).labels, initialHistory.labels);
    assert.equal(await undo().isEnabled(), initialHistory.undoEnabled, 'no ghost undo entry from refused edit');
    await native('04-undo', seed); await f.snapshot('04-undo');
    await undo().click(); await f.same(predecessor);
    await redo().click(); await f.same(seed);
    await redo().click(); await f.same(recovered); await native('05-redo', recovered);
    const saved = await f.save('recovered-height-12');
    await Promise.all(pendingSetup); recording = false;
    f.report.observations.push({ label: 'transport-setup', entities: setup,
      requestBodyUtf8Bytes: setup.reduce((n, x) => n + x.requestBodyUtf8Bytes, 0),
      responseDecodedEntityBytes: setup.reduce((n, x) => n + x.responseDecodedEntityBytes, 0),
      boundary: 'Observed /api/chat non-turn decoded body entities in first context through Save, including initial navigation status calls.' });
    await f.freshOpen(saved.file, recovered, '06-fresh-open');
    await native('06-fresh-open', recovered); await f.snapshot('07-reopened-9600');
    assert.deepEqual(await readFile(seedFile), seedBytes);
    f.report.observations.push({ label: 'custody-and-recovery', seedFile, seedSHA256: sha256(seedBytes),
      recoveredFile: saved.file, recoveredSHA256: sha256(await readFile(saved.file)), initialHistory,
      refusalDocShapeHistoryIntact: true, oneRecoveryUndoRestoresSeed: true, redoRestoresRecoveredDocument: true,
      originalSeedBytesPreserved: true, freshOpenNativeVolumeMm3: 9600 });
  } finally {
    if (chat.exitCode === null && chat.signalCode === null) chat.kill('SIGTERM');
    await closed; await writeFile(join(output, 'chat-stdout.txt'), stdout); await writeFile(join(output, 'chat-stderr.txt'), stderr);
    f.report.cleanup.push('CHAT_CLOSED');
  }
});
