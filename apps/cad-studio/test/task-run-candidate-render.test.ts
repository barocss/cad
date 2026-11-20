import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { userToken } from '@barocss/cad-model/team/ecr';
import { digestOf, sha256Hex } from '@barocss/cad-model/util/digest';
import { revisionOf } from '@barocss/cad-model/util/revision';
import { requirementEvidenceOf } from '@barocss/cad-model/chat/requirementEvidence';
import { checkSpec } from '@barocss/cad-model/chat/spec';
import { TaskRunHost } from '../server/taskRun/host';
import { TaskRunStore } from '../server/taskRun/store';
import { taskRunMain } from '../server/taskRun/cli';
import { encodeCandidateReview } from '../src/files/taskCandidateReview';
import { renderTaskCandidate } from '../server/taskRun/candidateRender';
import { readLocalTaskCandidateRender } from '../server/taskRun/localService';
import { fixtureDoc, fixturePlan, fixtureLimits, holeDiameterDocs } from './task-run-fixture';

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

for (const outcome of ['fail', 'unknown'] as const) test(`a genuine protected native requirement ${outcome} refuses views and approval without publishing, then recovers on the same candidate`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'cad-candidate-native-gate-'));
  const directory = join(root, 'run'), source = fixtureDoc();
  if (outcome === 'unknown') {
    source.instances![1].doc = holeDiameterDocs().source.instances![0].doc;
    const hole = source.instances![1].doc.nodes[2];
    assert.equal(hole.kind, 'hole');
    if (hole.kind !== 'hole') throw new Error('Expected the protected fixture hole.');
    hole.radius = 3;
  }
  const protectedExtrude = source.instances![1].doc.nodes[1];
  assert.equal(protectedExtrude.kind, 'extrude');
  if (protectedExtrude.kind !== 'extrude') throw new Error('Expected the protected fixture extrusion.');
  if (outcome === 'fail') protectedExtrude.height = 4;
  const plan = { ...fixturePlan, tasks: [fixturePlan.tasks[0]], protectedOccurrences: ['p2'] };
  let replayFailingProtectedInput = false, replayed = 0;
  const protectedNodes = digestOf(source.instances![1].doc.nodes);
  const controlledEvaluate: typeof evaluate = async input => {
    if (replayFailingProtectedInput && digestOf(input.nodes) === protectedNodes) {
      // Replay real native input: a 3 mm sibling for FAIL, a hole-free prism for UNKNOWN.
      // The owned candidate, authored requirements, and persisted baseline stay unchanged.
      const replay = structuredClone(input), node = replay.nodes[1];
      assert.equal(node.kind, 'extrude');
      if (node.kind !== 'extrude') throw new Error('Expected the replay extrusion.');
      if (outcome === 'fail') node.height = 3;
      else replay.nodes = replay.nodes.slice(0, 2);
      replayed++;
      return evaluate(replay);
    }
    return evaluate(input);
  };
  const host = await TaskRunHost.create(directory, 'candidate-native-gate', source, plan, fixtureLimits, 8, controlledEvaluate);
  try {
    const dispatched = await host.dispatch('make-base', 'base', async ({ runId, task, attempt }) => ({
      runId, attemptId: attempt.id, operationId: attempt.operationId, epoch: attempt.epoch, usage: 1,
      submission: { taskId: task.id, specRevision: attempt.specRevision, inputDigest: attempt.inputDigest, heightMm: 6 },
    }));
    assert.equal(dispatched.phase, 'completed');
    const { receipt } = TaskRunStore.readCandidateReview(directory, 'base');
    const views = await renderTaskCandidate(directory, 'base', receipt, controlledEvaluate);
    assert.deepEqual(Object.keys(views.views).sort(), ['front', 'iso', 'right', 'top']);
    assert.equal(views.geometry.volumeMm3, 1200);
    assert.ok(views.checks.every(check => check.status === 'pass'));
    const accepted = host.acceptedBytes, commits = host.snapshot.commits.length;
    const held = host.snapshot.state.tasks[0];
    assert.ok(held.candidate && held.attempt);
    const decision = { runId: host.snapshot.runId, taskId: 'base', epoch: host.snapshot.epoch,
      attemptId: held.attempt.id, specRevision: held.candidate.specRevision,
      candidateDigest: held.candidate.candidateDigest, approved: true };

    replayFailingProtectedInput = true;
    const protectedDoc = source.instances![1].doc;
    const native = await controlledEvaluate(protectedDoc);
    assert.ok(native.ok);
    assert.equal(native.bodies.length, 1);
    const checked = await checkSpec(protectedDoc, native.bodies, controlledEvaluate);
    assert.equal(checked.outcomes.get(outcome === 'fail' ? 'height' : 'bore')?.status, outcome);
    const evidence = await requirementEvidenceOf(source, 'p2', controlledEvaluate);
    assert.ok(!('error' in evidence));
    const hard = evidence.evidence.find(row => row.requirement?.hard);
    assert.ok(hard);
    if (outcome === 'fail') {
      assert.equal(hard.result.status, 'ok');
      assert.equal(hard.result.verdict, 'fail');
      assert.equal(hard.result.number, 3);
    } else {
      // Unmeasurable checks are UNKNOWN in checkSpec and unsupported in stamped evidence.
      assert.equal(hard.result.status, 'unsupported');
      assert.equal(hard.result.verdict, undefined);
      assert.match(hard.result.why ?? '', /face|match/i);
    }
    const record = readFileSync(join(directory, 'run.json'));
    await assert.rejects(renderTaskCandidate(directory, 'base', receipt, controlledEvaluate), /protected requirements.*p2.*did not pass/i);
    assert.deepEqual(readFileSync(join(directory, 'run.json')), record);
    const refused = await host.decide({ ...decision, operationId: 'refuse-native-failure' }, userToken('2026-11-20T00:00:00Z'));
    assert.equal(refused.code, 'TASK_PROTECTED_CHECK');
    assert.ok(replayed >= 3);
    assert.deepEqual(host.acceptedBytes, accepted);
    assert.equal(host.snapshot.commits.length, commits);
    assert.equal(host.snapshot.pending, undefined);
    assert.equal(host.snapshot.state.tasks[0].phase, 'awaiting-decision');
    assert.equal(TaskRunStore.readCandidateReview(directory, 'base').receipt.candidateDigest, receipt.candidateDigest);

    replayFailingProtectedInput = false;
    const recovered = await renderTaskCandidate(directory, 'base', receipt, controlledEvaluate);
    assert.equal(recovered.candidateDigest, views.candidateDigest);
    assert.equal(recovered.imageSha256, views.imageSha256);
    assert.equal((await host.decide({ ...decision, operationId: 'accept-native-recovery' }, userToken('2026-11-20T00:00:01Z'))).code, 'RUN_ACCEPTED');
    assert.equal(host.snapshot.commits.length, commits + 1);
    assert.notDeepEqual(host.acceptedBytes, accepted);
    assert.equal(host.snapshot.state.tasks[0].phase, 'completed');
  } finally { host.close(); rmSync(root, { recursive: true, force: true }); }
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
