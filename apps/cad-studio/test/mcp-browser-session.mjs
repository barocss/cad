import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export async function withMcpSession({ app, output, clientName, autonomy = 1, telemetry }, path, label, run) {
  const child = spawn(process.execPath, [join(app, 'scripts/cad-mcp.mjs'), '--doc', path, '--autonomy', String(autonomy)],
    { stdio: ['pipe', 'pipe', 'inherit'] });
  const closed = once(child, 'close');
  // Retain the actual stdout frames, including their line delimiters, for optional wire measurements.
  let pending = Buffer.alloc(0);
  const wireReplies = [];
  if (telemetry) child.stdout.on('data', chunk => {
    pending = Buffer.concat([pending, chunk]);
    let newline;
    while ((newline = pending.indexOf(10)) !== -1) {
      wireReplies.push(pending.subarray(0, newline + 1));
      pending = pending.subarray(newline + 1);
    }
  });
  const lines = createInterface({ input: child.stdout }), replies = lines[Symbol.asyncIterator]();
  let id = 0, timer;
  const events = [];
  const request = async (method, params, measurement = {}) => {
    const frame = { jsonrpc: '2.0', id: ++id, method, params };
    const wireRequest = JSON.stringify(frame) + '\n';
    const started = performance.now();
    child.stdin.write(wireRequest);
    try {
      const next = await Promise.race([replies.next(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('MCP call timed out: '+method)), 20000);
      })]);
      const elapsedMs = performance.now() - started;
      assert.equal(next.done, false);
      const reply = JSON.parse(next.value);
      events.push({ frame, reply });
      if (telemetry) {
        const wireReply = wireReplies.shift();
        assert.ok(wireReply, 'The parsed response has an actual newline-delimited stdout frame');
        assert.deepEqual(JSON.parse(wireReply.toString('utf8')), reply);
        telemetry({ ...measurement, id: frame.id, method, requestBytes: Buffer.byteLength(wireRequest, 'utf8'),
          responseBytes: wireReply.byteLength, elapsedMs });
      }
      assert.equal(reply.id, frame.id);
      assert.equal(reply.error, undefined, JSON.stringify(reply));
      return reply.result;
    } finally { clearTimeout(timer); }
  };
  try {
    const hello = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: clientName, version: '1' } });
    assert.equal(hello.serverInfo.version, 'barocss-cad-tools-v2');
    return await run(async (name, args, error = false) => {
      const reply = await request('tools/call', { name, arguments: args });
      assert.equal(reply.isError, error, JSON.stringify(reply));
      return JSON.parse(reply.content[0].text);
    }, request);
  } finally {
    child.stdin.end();
    lines.close();
    try {
      const [code] = await Promise.race([closed, new Promise((_, reject) => {
        timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('MCP close timed out')); }, 5000);
      })]);
      assert.equal(code, 0);
    } finally {
      clearTimeout(timer);
      await writeFile(join(output, label+'-mcp-transcript.json'), JSON.stringify(events, null, 2));
    }
  }
}
