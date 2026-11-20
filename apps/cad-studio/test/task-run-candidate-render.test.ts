import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { userToken } from '@barocss/cad-model/team/ecr';
import { sha256Hex } from '@barocss/cad-model/util/digest';
import { revisionOf } from '@barocss/cad-model/util/revision';
import { TaskRunHost } from '../server/taskRun/host';
import { TaskRunStore } from '../server/taskRun/store';
import { taskRunMain } from '../server/taskRun/cli';
import { encodeCandidateReview } from '../src/files/taskCandidateReview';
import { renderTaskCandidate } from '../server/taskRun/candidateRender';
import { readLocalTaskCandidateRender } from '../server/taskRun/localService';
import { fixtureDoc, fixturePlan, fixtureLimits } from './task-run-fixture';

const evaluate = async (doc: Parameters<typeof evaluatePart>[0]) => evaluatePart(doc, 1);
async function pending(fn: (host: TaskRunHost, root: string, directory: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'cad-candidate-render-'));
  const directory = join(root, 'a'.repeat(64));
  const host = await TaskRunHost.create(directory, 'candidate-views', fixtureDoc(), fixturePlan, fixtureLimits, 8, evaluate);
  try {
    const result = await host.dispatch('make-base', 'base', async ({ runId, task, attempt }) => ({
      runId, attemptId: attempt.id, operationId: attempt.operationId, epoch: attempt.epoch, usage: 1,
      submission: { taskId: task.id, specRevision: attempt.specRevision, inputDigest: attempt.inputDigest, heightMm: 6 },
    }));
    assert.equal(result.phase, 'completed', JSON.stringify({result,task:host.snapshot.state.tasks[0]}));
    await fn(host, root, directory);
  } finally { host.close(); rmSync(root, { recursive: true, force: true }); }
}

test('candidate render is a pinned local four-view PNG read with native checks and no store writes', async () => {
  await pending(async (host, root, directory) => {
    const { receipt } = TaskRunStore.readCandidateReview(directory, 'base');
    const record = readFileSync(join(directory, 'run.json')), entries = readdirSync(directory).sort();
    const request = { runKey: 'a'.repeat(64), runId: receipt.runId, taskId: 'base', attemptId: receipt.attemptId,
      candidateDigest: receipt.candidateDigest, baselineDigest: receipt.baseline.modelDigest };
    const result = await readLocalTaskCandidateRender(root, request);
    assert.equal(result.runId, receipt.runId);
    assert.equal(result.taskId, 'base');
    assert.equal(result.attemptId, receipt.attemptId);
    assert.equal(result.candidateDigest, receipt.candidateDigest);
    assert.equal(result.occurrence, 'p1');
    assert.equal(result.geometry.volumeMm3, 1200);
    assert.ok(result.checks.every(check => check.status === 'pass'));
    assert.equal(result.imageSha256, sha256Hex(Buffer.from(result.image.data, 'base64')));
    assert.deepEqual([...Buffer.from(result.image.data, 'base64').subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.deepEqual(Object.keys(result.views).sort(), ['front', 'iso', 'right', 'top']);
    assert.ok(Object.keys(result.legend).length);
    assert.notEqual(result.revision, revisionOf(fixtureDoc()));
    assert.equal(host.snapshot.state.tasks[0].phase, 'awaiting-decision');
    assert.deepEqual(readFileSync(join(directory, 'run.json')), record);
    assert.deepEqual(readdirSync(directory).sort(), entries);
    for (const patch of [{ attemptId: 'old' }, { runId: 'other-run' }, { candidateDigest: '0'.repeat(64) },
      { baselineDigest: '0'.repeat(64) }, { taskId: 'lid' }])
      await assert.rejects(readLocalTaskCandidateRender(root, { ...request, ...patch }));
  });
});

test('candidate renderer rejects forged exported occurrence and retires images after an async stop', async () => {
  await pending(async (host, _root, directory) => {
    const { receipt } = TaskRunStore.readCandidateReview(directory, 'base');
    await assert.rejects(renderTaskCandidate(directory, 'base', { ...receipt, scope: { ...receipt.scope, occurrence: 'p2' } }), /changed/);
    let stopped = false;
    await assert.rejects(renderTaskCandidate(directory, 'base', receipt, async doc => {
      if (!stopped) {
        stopped = true;
        host.control('stop-during-views', 'stop', userToken('2026-11-20T00:00:00Z'));
      }
      return evaluate(doc);
    }), /review|candidate|stopped/i);
    assert.equal(stopped, true);
    assert.equal(host.snapshot.state.phase, 'stopped');
  });
});

test('CLI candidate render requires an explicit current exported review and stays read-only', async () => {
  await pending(async (_host, root, directory) => {
    const { receipt } = TaskRunStore.readCandidateReview(directory, 'base');
    const file = join(root, 'current.bcad-candidate');
    writeFileSync(file, encodeCandidateReview(receipt));
    const record = readFileSync(join(directory, 'run.json'));
    let output = '', errors = '';
    const io = { stdout: { write: (text: string) => { output += text; return true; } },
      stderr: { write: (text: string) => { errors += text; return true; } } };
    assert.equal(await taskRunMain(['render-candidate', directory, 'base'], io), 1);
    assert.equal(output, '');
    assert.match(errors, /--review/);
    errors = '';
    assert.equal(await taskRunMain(['render-candidate', directory, 'base', '--review', file], io), 0, errors);
    const image = JSON.parse(output);
    assert.equal(image.attemptId, receipt.attemptId);
    assert.equal(image.imageSha256, sha256Hex(Buffer.from(image.image.data, 'base64')));
    output = '';
    writeFileSync(file, encodeCandidateReview({ ...receipt, attemptId: 'old-attempt' }));
    assert.equal(await taskRunMain(['render-candidate', directory, 'base', '--review', file], io), 1);
    assert.equal(output, '');
    assert.match(errors, /changed/);
    assert.deepEqual(readFileSync(join(directory, 'run.json')), record);
  });
});
