import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { sha256 } from './flow-helper.mjs';

async function withMcp(flow, doc, label, run) {
  const path = join(flow.output, label + '.bcad');
  const bytes = JSON.stringify(doc);
  await writeFile(path, bytes, { flag: 'wx' });
  const child = spawn(process.execPath, [join(flow.app, 'scripts/cad-mcp.mjs'), '--doc', path, '--autonomy', '1'],
    { stdio: ['pipe', 'pipe', 'inherit'] });
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout });
  const replies = lines[Symbol.asyncIterator]();
  let id = 0;
  async function request(method, params) {
    const requestId = ++id;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    let timer;
    try {
      const line = await Promise.race([replies.next(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('MCP response timed out')), 15000);
      })]);
      assert.equal(line.done, false);
      const answer = JSON.parse(line.value);
      assert.equal(answer.id, requestId);
      assert.equal(answer.error, undefined, JSON.stringify(answer));
      return answer.result;
    } finally { clearTimeout(timer); }
  }
  try {
    const hello = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'D1260', version: '1' } });
    assert.equal(hello.serverInfo.version, 'barocss-cad-tools-v2');
    return await run(request, args => request('tools/call', { name: 'query', arguments: args }));
  } finally {
    child.stdin.end();
    lines.close();
    let timer;
    try {
      const [code] = await Promise.race([closed, new Promise((_, reject) => {
        timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('MCP did not exit')); }, 5000);
      })]);
      assert.equal(code, 0);
    } finally { clearTimeout(timer); }
    assert.equal(await readFile(path, 'utf8'), bytes);
    flow.report.observations.push({ label, mcpExited: true, fileSHA256: sha256(bytes), fileUnchanged: true });
  }
}

function success(answer) {
  assert.equal(answer.isError, false, JSON.stringify(answer));
  const data = JSON.parse(answer.content[0].text);
  assert.deepEqual(answer.structuredContent, data);
  return data;
}
function refusal(answer, why) {
  assert.equal(answer.isError, true, JSON.stringify(answer));
  assert.equal(answer.structuredContent, undefined);
  const data = JSON.parse(answer.content[0].text);
  assert.match(data.error, why);
  assert.equal(data.maximumAngleDegrees, undefined);
  assert.equal(data.samples, undefined);
  return data;
}

export async function compareMcp(flow, doc, native, studio) {
  const { key: body, records, edges } = native;
  const calls = [], agreement = [], refusals = [];
  const toleranceDegrees = 1e-10;
  const accepted = await withMcp(flow, doc, 'accepted-mcp', async (request, call) => {
    const { tools } = await request('tools/list');
    assert.equal(tools.length, 13);
    const actions = tools.find(tool => tool.name === 'query').inputSchema.properties.action.enum;
    assert.ok(actions.includes('native_joints') && actions.includes('edge_continuity'));
    const discovery = { action: 'native_joints', body };
    const listed = await call(discovery);
    const { revision, ...result } = success(listed);
    assert.match(revision, /^[a-f0-9]{64}$/);
    assert.deepEqual(result, { body, edges });
    calls.push({ input: discovery, handler: 'list_native_joints', response: listed });
    for (const { id, faces, read: { measurement } } of records) {
      const input = { action: 'edge_continuity', body, edgeId: id, expectedRevision: revision };
      const response = await call(input);
      const handler = 'measure_edge_continuity';
      if (measurement.status === 'unsupported') {
        const data = refusal(response, /missing-pcurve/);
        assert.deepEqual({ status: data.status, edgeId: data.edgeId, reason: data.reason }, measurement);
        assert.deepEqual([data.body, data.revision], [body, revision]);
      } else {
        const data = success(response);
        assert.deepEqual(data, { body, revision, ...measurement, unit: 'degrees' });
        const other = faces.find(name => name !== 'n2.face');
        const extrema = [data.minimumAngleDegrees, data.maximumAngleDegrees];
        const difference = Math.max(...extrema.map((angle, index) => Math.abs(angle - studio[other][index])));
        assert.ok(difference <= toleranceDegrees, `${id}: Studio differs by ${difference}°`);
        agreement.push({ edgeId: id, studio: studio[other], mcp: extrema, maximumDifferenceDegrees: difference });
        assert.equal(data.sampleCount, 8);
      }
      calls.push({ input, handler, response });
    }
    const first = records.find(row => row.read.measurement.status === 'measured');
    assert.ok(first);
    const input = { action: 'edge_continuity', body, edgeId: first.id, expectedRevision: revision };
    const wrongBody = await call({ ...input, body: 'b1' });
    refusal(wrongBody, /changed/);
    const unknownEdge = await call({ ...input, edgeId: 'set_material' });
    const unknown = refusal(unknownEdge, /edge-not-found/);
    assert.equal(unknown.edgeId, 'set_material');
    refusals.push({ label: 'wrong-body', response: wrongBody }, { label: 'unknown-edge', response: unknownEdge });
    return { input, revision };
  });
  const revised = structuredClone(doc);
  revised.nodes[1].height = 22;
  await withMcp(flow, revised, 'revised-mcp', async (_, call) => {
    const stale = await call(accepted.input);
    refusal(stale, /changed/);
    refusals.push({ label: 'stale-revision', response: stale });
    const current = success(await call({ action: 'native_joints', body }));
    assert.notEqual(current.revision, accepted.revision);
    assert.ok(current.edges.some(edge => edge.id === accepted.input.edgeId));
    success(await call({ ...accepted.input, expectedRevision: current.revision }));
  });
  const unresolved = structuredClone(doc);
  unresolved.nodes[1].height = { parameter: 'missing_joint_height' };
  await withMcp(flow, unresolved, 'unresolved-mcp', async (_, call) => {
    const response = await call({ action: 'native_joints', body });
    refusal(response, /missing_joint_height/);
    refusals.push({ label: 'evaluation-refusal', response });
  });
  await writeFile(join(flow.output, 'mcp-replies.json'), JSON.stringify({ calls, refusals }, null, 2), { flag: 'wx' });
  flow.report.observations.push({ label: 'studio-mcp-angles', toleranceDegrees, joints: agreement });
  return calls;
}
