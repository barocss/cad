// Real stdio frames, not token estimates. Run with --seed <common.bcad> --output <new external directory>.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { withMcpSession } from './mcp-browser-session.mjs';

const { values } = parseArgs({ options: { seed: { type: 'string' }, output: { type: 'string' } } });
assert.ok(values.seed && values.output, 'Supply --seed and --output');
const app = resolve(import.meta.dirname, '..'), output = resolve(values.output);
assert.ok(relative(resolve(app, '../..'), output).startsWith('../'), 'Use an external evidence directory');
await mkdir(output);
const file = join(output, 'edited-stock-part.bcad');
const seedBytes = await readFile(resolve(values.seed));
const seedDoc = JSON.parse(seedBytes.toString('utf8'));
assert.deepEqual(seedDoc.nodes, [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 20] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
]);
await writeFile(file, seedBytes, { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const observations = [], results = {};
const receipt = {
  status: 'RUNNING', transport: 'real child-process stdio JSON-RPC', node: process.version,
  units: { bytes: 'UTF-8 bytes including actual newline delimiters', elapsedMs: 'request write to response frame received' },
  limits: 'One local run. Initialize timing includes server startup and is separate from payload. No provider/model inference, HTTP headers, browser, or tokens counted. Native mass uses default assumed material; volume and dimensions are checked.',
  seed: { path: resolve(values.seed), bytes: seedBytes.length, sha256: hash(seedBytes) }, observations, results,
};
const bodyCheck = (result, height) => {
  assert.equal(result.bodies.length, 1);
  const body = result.bodies[0];
  assert.equal(body.volume, 40 * 20 * height);
  assert.equal(body.volume_basis, undefined, 'Native exact volume, without display-mesh estimate');
  assert.deepEqual(body.bbox, { min: [0, 0, 0], max: [40, 20, height] });
  assert.deepEqual(body.centroid, [20, 10, height / 2]);
};
try {
  await withMcpSession({ app, output, clientName: 'barocss-agent-edit-cost', autonomy: 2,
    telemetry: observation => observations.push({ phase: 'setup', label: 'initialize', ...observation }),
  }, file, 'edit-cost', async (_read, request) => {
    const call = async (name, args, label, phase, expectError = false) => {
      const result = await request('tools/call', { name, arguments: args }, { label, phase });
      assert.equal(result.isError, expectError, label + ': ' + JSON.stringify(result));
      return result;
    };
    const data = result => {
      const parsed = JSON.parse(result.content.find(c => c.type === 'text').text);
      if (result.structuredContent) assert.deepEqual(result.structuredContent, parsed);
      return parsed;
    };
    const listing = await request('tools/list', {}, { phase: 'discovery', label: 'tools-list' });
    assert.ok(listing.tools.some(t => t.name === 'features'));
    for (const [tool, action] of [['features', 'edit'], ['query', 'mass'], ['query', 'rebuild']])
      await call('describe', { tool, action }, `describe-${tool}-${action}`, 'discovery');
    results.initial = data(await call('query', { action: 'mass' }, 'native-before', 'verification'));
    bodyCheck(results.initial, 8);
    assert.deepEqual(await readFile(file), seedBytes, 'Setup and discovery preserve seed bytes');

    const refusal = await call('features', { action: 'edit', index: 1, values: { h: '12 mm' } }, 'edit-refused', 'payload', true);
    assert.equal(data(refusal).error, '"h" must be a number.');
    results.refusal = refusal;
    const refusedBytes = await readFile(file);
    assert.deepEqual(refusedBytes, seedBytes, 'Refused edit preserves the exact saved bytes');
    receipt.refusedFile = { bytes: refusedBytes.length, sha256: hash(refusedBytes), byteIdentical: true };
    results.afterRefusal = data(await call('query', { action: 'mass' }, 'native-after-refusal', 'verification'));
    assert.deepEqual(results.afterRefusal, results.initial);

    results.recovery = data(await call('features', { action: 'edit', index: 1, values: { h: 12 } }, 'edit-recovery', 'payload'));
    const recoveredBytes = await readFile(file);
    const recoveredDoc = JSON.parse(recoveredBytes.toString('utf8'));
    const expectedDoc = structuredClone(seedDoc);
    expectedDoc.nodes[1].height = 12;
    assert.deepEqual(recoveredDoc, expectedDoc, 'Only the targeted height changes; no authored ghost history');
    assert.notDeepEqual(recoveredBytes, seedBytes);
    receipt.recoveredFile = { path: file, bytes: recoveredBytes.length, sha256: hash(recoveredBytes), exactTargetedDocument: true,
      authoredTopLevelKeysAdded: Object.keys(recoveredDoc).filter(key => !(key in seedDoc)) };
    await writeFile(join(output, 'recovered-document.json'), JSON.stringify(recoveredDoc, null, 2));
    results.rebuild = data(await call('query', { action: 'rebuild' }, 'native-rebuild', 'verification'));
    assert.equal(results.rebuild.basis, 'from scratch');
    assert.ok(results.rebuild.built >= 1);
    assert.deepEqual(results.rebuild.loops, []);
    assert.deepEqual(results.rebuild.mates, []);
    results.recovered = data(await call('query', { action: 'mass' }, 'native-after-recovery', 'verification'));
    bodyCheck(results.recovered, 12);
    assert.deepEqual(await readFile(file), recoveredBytes, 'Native read-only checks preserve recovered saved bytes');
  });
  receipt.status = 'PASS';
} catch (error) {
  receipt.status = 'FAIL';
  receipt.failure = String(error.stack ?? error);
  throw error;
} finally {
  receipt.totalsByPhase = {};
  for (const row of observations) {
    const total = receipt.totalsByPhase[row.phase] ??= { calls: 0, requestBytes: 0, responseBytes: 0, elapsedMs: 0 };
    total.calls++;
    total.requestBytes += row.requestBytes;
    total.responseBytes += row.responseBytes;
    total.elapsedMs += row.elapsedMs;
  }
  await writeFile(join(output, 'edit-cost-mcp-receipt.json'), JSON.stringify(receipt, null, 2));
}
console.log(JSON.stringify({ status: receipt.status, output, totalsByPhase: receipt.totalsByPhase }));
