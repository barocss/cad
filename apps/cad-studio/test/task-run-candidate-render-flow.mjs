import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sha256 } from './flow-helper.mjs';
import { imagePixels } from './render-image-test-helpers.mjs';

const base = '/api/chat/task-runs/';
const renderPath = base + 'render-candidate';
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
async function bounded(promise, label, timeout = 60000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out: ' + label)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}
const matches = action => response => new URL(response.url()).pathname === base + action && response.request().method() === 'POST';

export async function taskRunCandidateRenderFlow({ f, row, launch, source, saved, savedBytes }) {
  const review = f.page.getByRole('region', { name: 'Worker candidate review', exact: true });
  const image = () => review.getByRole('img', { name: 'Current candidate four views', exact: true });
  const render = () => button(review, 'Render candidate four views');
  const recordFile = join(launch.directory, 'run.json');
  const initial = JSON.parse(await readFile(recordFile)).record;
  const durable = async () => ({ record: await readFile(recordFile),
    native: await Promise.all((await readdir(join(launch.directory, 'native'))).sort().map(async name =>
      [name, sha256(await readFile(join(launch.directory, 'native', name)))])) });
  const capture = async (action, control) => {
    const [response] = await Promise.all([f.page.waitForResponse(matches(action)), control.click()]);
    assert.equal(response.status(), 200, await response.text());
    return response;
  };
  const pick = async () => {
    const response = await capture('review', button(row, 'Review candidate p1'));
    const envelope = await response.json(), receipt = JSON.parse(envelope.review).receipt;
    await review.getByText(receipt.attemptId, { exact: true }).waitFor();
    return { response: response.request().postDataJSON(), envelope, receipt };
  };
  const decoded = async () => {
    await image().waitFor();
    await image().evaluate(element => element.decode());
    return { src: await image().getAttribute('src'), pixels: await imagePixels(f.page, await image().getAttribute('src')) };
  };
  await f.page.evaluate(renderPath => {
    const read = Response.prototype.json;
    window.__candidateRenderDelivered = [];
    Response.prototype.json = async function (...args) {
      const value = await read.apply(this, args);
      if (new URL(this.url, location.href).pathname === renderPath)
        window.__candidateRenderDelivered.push({ attemptId: value.attemptId, imageSha256: value.imageSha256, error: value.error });
      return value;
    };
  }, renderPath);

  f.phase = 'capture the authentic attempt A render before controlled delayed delivery';
  const a = await pick();
  const aPin = a.response;
  const aHeld = Promise.withResolvers(), releaseA = Promise.withResolvers(), aDelivered = Promise.withResolvers();
  // Observe route failures immediately, even before the delivery phase is reached.
  void aHeld.promise.catch(() => undefined);
  void aDelivered.promise.catch(() => undefined);
  let first = true, aReply;
  const routePattern = '**' + renderPath;
  const hold = async route => {
    if (!first) return route.continue();
    first = false;
    try {
      const response = await route.fetch({ timeout: 120000 });
      assert.equal(response.status(), 200, await response.text());
      aReply = await response.json();
      assert.equal(aReply.attemptId, aPin.attemptId);
      await writeFile(join(f.output, 'candidate-attempt-A-render.json'), JSON.stringify(aReply));
      aHeld.resolve();
      await releaseA.promise;
      await route.fulfill({ response });
      aDelivered.resolve();
    } catch (error) { aHeld.reject(error); aDelivered.reject(error); await route.abort(); }
  };
  await f.page.route(routePattern, hold);
  try {
    await render().click();
    await bounded(aHeld.promise, 'authentic attempt A render intercepted');
    assert.equal(await image().count(), 0);
    await f.same(source);
    assert.deepEqual(await savedBytes(), saved);
    await f.snapshot('07-attempt-A-render-held');

    f.phase = 'expire attempt A and regenerate B with the actual host and unchanged native source';
    const regenerated = await f.inspect('candidate-regenerate', { directory: launch.directory, taskId: 'p1' }, 'candidate-regenerate');
    const bTask = regenerated.record.state.tasks.find(task => task.id === 'p1');
    assert.notEqual(bTask.attempt.id, aPin.attemptId);
    assert.equal(bTask.candidate.candidateDigest, aPin.candidateDigest);
    assert.deepEqual(regenerated.record.accepted, initial.accepted);
    assert.deepEqual(regenerated.record.commits, []);
    await capture('status', button(row, 'Refresh local run status'));
    await review.waitFor({ state: 'hidden' });
    const b = await pick(), bPin = b.response;
    assert.equal(bPin.attemptId, bTask.attempt.id);
    assert.equal(bPin.candidateDigest, aPin.candidateDigest);
    assert.equal(await image().count(), 0);
    const beforeRender = await durable();

    f.phase = 'display attempt B actual four-view image';
    const bResponse = await capture('render-candidate', render());
    const bReply = await bResponse.json(), shown = await decoded();
    assert.equal(bReply.attemptId, bPin.attemptId);
    assert.equal(bReply.candidateDigest, aReply.candidateDigest);
    assert.equal(bReply.imageSha256, aReply.imageSha256);
    assert.deepEqual(bReply.geometry, aReply.geometry);
    assert.ok(shown.pixels.width > 0 && shown.pixels.height > 0);
    assert.equal(await button(review, 'Approve candidate').isEnabled(), true);
    assert.equal(await button(review, 'Reject candidate').isEnabled(), true);
    await f.same(source);
    assert.deepEqual(await durable(), beforeRender);
    await writeFile(join(f.output, 'candidate-attempt-B-render.json'), JSON.stringify(bReply));
    await f.snapshot('08-attempt-B-current-four-views');

    f.phase = 'deliver the retired A success and preserve B image and decision authority';
    const decisionText = await review.innerText();
    releaseA.resolve();
    await bounded(aDelivered.promise, 'attempt A route fulfillment', 15000);
    await f.page.waitForFunction(attemptId => window.__candidateRenderDelivered.some(reply => reply.attemptId === attemptId), aPin.attemptId);
    await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await decoded(), shown);
    assert.equal(await review.innerText(), decisionText);
    assert.equal(await button(review, 'Approve candidate').isEnabled(), true);
    assert.equal(await button(review, 'Reject candidate').isEnabled(), true);
    await f.same(source);
    assert.deepEqual(await durable(), beforeRender);
    assert.deepEqual(await savedBytes(), saved);
    await f.snapshot('09-late-A-ignored-B-retained');

    f.phase = 'refuse a failed rerender without a last-good image and retry the current attempt';
    await f.page.unroute(routePattern, hold);
    await f.page.route(routePattern, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: 'Controlled candidate render failure.' }) }), { times: 1 });
    await render().click();
    await review.getByRole('status').filter({ hasText: /render|image|fetch/i }).waitFor();
    assert.equal(await image().count(), 0);
    await f.same(source);
    assert.deepEqual(await durable(), beforeRender);
    await f.snapshot('10-failed-render-no-last-good-image');
    const retryResponse = await capture('render-candidate', render());
    const retried = await retryResponse.json(), retryShown = await decoded();
    assert.equal(retried.attemptId, bPin.attemptId);
    assert.equal(retried.imageSha256, bReply.imageSha256);
    assert.deepEqual(retryShown.pixels, shown.pixels);
    await f.snapshot('11-current-B-render-retry');

    f.phase = 'refuse the actual Studio approval with a real controlled zero-height native replay';
    const beforeRefusal = JSON.parse(await readFile(recordFile)).record;
    const beforeRefusalNative = (await durable()).native;
    let nativeRefusal;
    const refusalErrors = [];
    const observeRefusal = message => {
      if (message.type() === 'error' && message.location().url.endsWith(base + 'approve')
        && /409/.test(message.text())) refusalErrors.push(message.text());
    };
    const approvePattern = '**' + base + 'approve';
    const refuseNative = async route => {
      try {
        const request = route.request().postDataJSON();
        assert.equal(request.attemptId, bPin.attemptId);
        assert.equal(request.candidateDigest, bPin.candidateDigest);
        nativeRefusal = await f.inspect('candidate-native-refusal', { root: dirname(launch.directory), request }, 'candidate-native-refusal');
        // Deliver the unchanged request to the real HTTP server after the native refusal is recorded.
        await route.continue();
      } catch (error) { await route.abort(); throw error; }
    };
    f.page.on('console', observeRefusal);
    await f.page.route(approvePattern, refuseNative, { times: 1 });
    try {
      const [response] = await Promise.all([f.page.waitForResponse(matches('approve')), button(review, 'Approve candidate').click()]);
      assert.equal(response.status(), 409);
      assert.deepEqual(await response.json(), { error: nativeRefusal.reply.error, reviewRequired: true });
      await f.page.locator('[role="status"], [role="alert"]').filter({ hasText: /TASK_NATIVE_GATE/ }).first().waitFor();
      const refused = JSON.parse(await readFile(recordFile)).record;
      assert.deepEqual(refused.accepted, beforeRefusal.accepted);
      assert.deepEqual(refused.commits, beforeRefusal.commits);
      assert.deepEqual((await durable()).native, beforeRefusalNative);
      assert.equal(refused.pending, undefined);
      assert.equal(refused.state.tasks.find(task => task.id === 'p1').phase, 'awaiting-decision');
      assert.ok(refused.state.operations.some(operation => operation.phase === 'failed' && operation.code === 'TASK_NATIVE_GATE'));
      await f.same(source);
      assert.deepEqual(await savedBytes(), saved);
      const refusedPresentation = { reviewCount: await review.count(), text: await review.count() ? await review.innerText() : null,
        currentImageCount: await image().count(), checks: await review.count()
          ? await review.getByRole('list', { name: 'Candidate checks', exact: true }).innerText() : null };
      await writeFile(join(f.output, 'candidate-native-refusal.json'), JSON.stringify({ ...nativeRefusal, refusedPresentation,
        acceptedUnchanged: true, publicationsBeforeAndAfter: [beforeRefusal.commits.length, refused.commits.length], nativeFilesUnchanged: true }));
      await f.snapshot('12-native-refusal-source-and-checkpoint-preserved');
      f.report.observations.push({ nativeRefusalControl: 'Actual evaluator receives a cloned candidate with zero extrusion height; product decision service returns its real refusal',
        code: 'TASK_NATIVE_GATE', refusedPresentation, acceptedUnchanged: true, nativeFilesUnchanged: true });
      await review.waitFor({ state: 'hidden' });
      assert.equal(await image().count(), 0);
      await f.page.getByRole('alert').filter({ hasText: /TASK_NATIVE_GATE/ }).waitFor();
    } finally {
      await f.page.unroute(approvePattern, refuseNative);
      f.page.off('console', observeRefusal);
    }
    assert.equal(refusalErrors.length, 1);
    f.report.expectedConsoleErrors = [...(f.report.expectedConsoleErrors ?? []), ...refusalErrors];
    for (const expected of refusalErrors) {
      const index = f.report.consoleErrors.indexOf(expected);
      assert.ok(index >= 0);
      f.report.consoleErrors.splice(index, 1);
    }

    f.phase = 'refresh the refused review and recover through the unchanged product approval service';
    await capture('status', button(row, 'Refresh local run status'));
    const recovered = await pick();
    assert.equal(recovered.response.attemptId, bPin.attemptId);
    assert.equal(recovered.response.candidateDigest, bPin.candidateDigest);
    assert.ok(recovered.receipt.revision > b.receipt.revision);
    assert.equal(await image().count(), 0);
    await capture('render-candidate', render());
    assert.deepEqual((await decoded()).pixels, shown.pixels);

    f.phase = 'approve only the still-current B decision and preserve the original saved native file';
    const approval = await capture('approve', button(review, 'Approve candidate'));
    assert.equal(approval.request().postDataJSON().attemptId, bPin.attemptId);
    const approved = await approval.json();
    assert.equal(approved.checkpoint.taskId, 'p1');
    const final = JSON.parse(await readFile(recordFile)).record;
    assert.equal(final.commits.length, 1);
    assert.equal(final.commits[0].candidateDigest, bPin.candidateDigest);
    await f.same(source);
    assert.deepEqual(await savedBytes(), saved);
    await review.waitFor({ state: 'hidden' });
    await f.snapshot('13-current-B-approved-source-preserved');
    const delivered = await f.page.evaluate(() => window.__candidateRenderDelivered);
    await writeFile(join(f.output, 'candidate-render-ownership.json'), JSON.stringify({ aPin, bPin, regenerated, approved, delivered,
      imageSha256: bReply.imageSha256, pixels: shown.pixels }));
    f.report.observations.push({ actualAttempts: [aPin.attemptId, bPin.attemptId], candidateDigest: aPin.candidateDigest,
      identicalGeometryAndImage: true, delayedAuthenticAReplyDelivered: true, lateAChangedB: false, failedRenderHidLastGood: true, failureControl: 'one controlled invalid render reply; retry uses the actual renderer',
      retryCurrentAttempt: true, nativeSourcePreserved: true, currentBApproved: true, imageSha256: bReply.imageSha256 });
  } finally {
    releaseA.resolve();
    await f.page.unroute(routePattern, hold);
  }
}
