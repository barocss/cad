import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

export async function readHeldFilletSummary(flow, file, label) {
  const bytes = await readFile(file);
  const session = { app: flow.app, output: flow.output, clientName: 'held-fillet-recovery', autonomy: 1 };
  const read = await withMcpSession(session, file, label, async (call, request) => {
    const revision = await currentPartRevision(call);
    const describe = await call('describe', { tool: 'query', action: 'summary' });
    assert.match(JSON.stringify(describe), /held_finish_recovery/);
    const args = { action: 'summary', body: 'b2', response_format: 'detailed' };
    const result = await request('tools/call', { name: 'query', arguments: args });
    assert.equal(result.isError, false, JSON.stringify(result));
    const summary = JSON.parse(result.content[0].text);
    assert.deepEqual(result.structuredContent, summary);
    const concise = await call('query', { ...args, response_format: 'concise' });
    assert.equal(concise.held_finish_recovery, undefined);
    assert.equal(await currentPartRevision(call), revision);
    return { summary, revision };
  });
  assert.deepEqual(await readFile(file), bytes);
  return read;
}
