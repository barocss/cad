import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

// Delay delivery of one real Worker result without changing the request or result.
export function holdRealSectionReply() {
  const proto = Worker.prototype, post = proto.postMessage;
  const handler = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  const state = window.__sectionReply = { armed: false, held: false, released: 0 };
  const pending = new WeakMap();
  proto.postMessage = function (request, ...rest) {
    if (state.armed && request?.type === 'section') {
      state.armed = false;
      pending.set(this, request.id);
    }
    return post.call(this, request, ...rest);
  };
  Object.defineProperty(proto, 'onmessage', {
    configurable: true,
    get: handler.get,
    set(fn) {
      handler.set.call(this, typeof fn !== 'function' ? fn : function (event) {
        const id = pending.get(this);
        if (id === undefined || event.data?.id !== id || !event.data.result) return fn.call(this, event);
        pending.delete(this);
        state.held = true;
        state.release = () => {
          state.held = false;
          state.released++;
          fn.call(this, event);
        };
      });
    },
  });
}

export async function projectSectionOwnership({ f, doc, button, look, clickCorner, setup, section, near }) {
  const versions = f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
  const project = 'D1975 section ownership';
  const attach = async () => {
    if (!(await versions.isVisible())) await button('Project and versions').click();
    await versions.getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
    await versions.getByRole('button', { name: 'Project in this browser', exact: true }).click();
    await versions.getByLabel('Project', { exact: true }).waitFor();
  };
  const dirty = f.page.getByLabel('Unsaved changes', { exact: true });
  const readPart = () => f.page.evaluate(async project => {
    const root = await navigator.storage.getDirectory();
    const dir = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(project);
    return (await (await dir.getFileHandle('section-input.bcad')).getFile()).text();
  }, project);
  f.phase = 'Save the original part in a browser project';
  await attach();
  await button('Save').click();
  await versions.getByRole('list', { name: 'Project documents', exact: true }).getByText('section-input.bcad', { exact: true }).waitFor();
  await dirty.waitFor({ state: 'hidden' });
  const saved = await readPart();
  assert.deepEqual(JSON.parse(saved), doc);
  await button('Project and versions').click();
  await button('Section view').click();
  await setup();
  const initial = await section();
  const move = button('Section through a vertex');
  const apply = button('Apply section move');
  const cancel = button('Cancel section move');
  const status = f.page.getByRole('group', { name: 'Section', exact: true }).getByRole('status');
  const start = async () => { await move.click(); await status.getByText('Click an original corner.').waitFor(); };
  const candidate = async () => {
    await start();
    await clickCorner();
    await status.getByText('Move to offset 45 mm').waitFor();
  };
  const heldCandidate = async () => {
    await start();
    await f.page.evaluate(() => { window.__sectionReply.armed = true; });
    await clickCorner();
    await f.page.waitForFunction(() => window.__sectionReply.held);
    assert.equal(await apply.isDisabled(), true);
  };
  const release = async () => {
    await f.page.evaluate(async () => {
      window.__sectionReply.release();
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    assert.equal(await apply.count(), 0);
  };

  f.phase = 'Select the same original corner after moving the camera and zooming';
  await look('Top back right');
  await f.page.mouse.move(580, 400);
  await f.page.mouse.wheel(0, 120);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await candidate();
  await f.snapshot('reframed-same-original-corner');
  await cancel.click();
  await look('Top back');

  f.phase = 'Hide the source and release the previous native reply';
  await heldCandidate();
  await button('Hide body').click();
  await button('Show body').waitFor();
  await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().sources.length === 0);
  await release();
  assert.equal(await move.isDisabled(), true);
  assert.deepEqual((await section()).planes, initial.planes);
  await f.snapshot('hidden-source-late-reply-refused');
  await f.undo();
  await f.same(doc);
  await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().sources.join() === 'b1');
  await look('Top back');

  f.phase = 'Replace the document and release the previous native reply';
  const replacement = { ...doc, nodes: [doc.nodes[0], { ...doc.nodes[1], height: 12 }] };
  const replacementFile = join(f.output, 'replacement.bcad');
  await writeFile(replacementFile, JSON.stringify(replacement));
  await heldCandidate();
  await f.openFile(replacementFile, 2);
  await f.same(replacement);
  await release();
  assert.equal((await section()).planes, null);
  await f.snapshot('open-replacement-late-reply-refused');

  f.phase = 'Reopen the project source and prove the session-only move';
  if (!(await versions.isVisible())) await button('Project and versions').click();
  await versions.getByRole('button', { name: 'Open section-input.bcad', exact: true }).click();
  await f.same(doc);
  await dirty.waitFor({ state: 'hidden' });
  assert.equal(await readPart(), saved);
  await button('Project and versions').click();
  await button('Section view').click();
  await setup();
  const before = await f.snapshot('project-source-before-move');
  await candidate();
  await apply.click();
  await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().planes[0].offset === 45);
  const result = await f.snapshot('project-session-section-moved');
  near(result.section.volume, 2343.75);
  assert.deepEqual(result.doc, before.doc);
  assert.deepEqual(result.history, before.history);
  assert.deepEqual(result.selection, before.selection);
  assert.equal(result.dirty, false);
  assert.equal(await readPart(), saved);
  await look('Top front left');
  await f.snapshot('project-section-cap');

  f.phase = 'Explicit Save, project Close and Open preserve original geometry';
  await button('Save').click();
  await dirty.waitFor({ state: 'hidden' });
  assert.equal(await readPart(), saved);
  await button('Project and versions').click();
  await versions.getByRole('button', { name: 'Close project', exact: true }).click();
  await versions.getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await attach();
  await versions.getByRole('button', { name: 'Open section-input.bcad', exact: true }).click();
  await f.same(doc);
  const fresh = await f.snapshot('project-close-fresh-open-original');
  assert.equal(fresh.section.planes, null);
  assert.equal(fresh.dirty, false);
  near(fresh.bodies.bodies[0].volume, 10460);
  assert.equal(await readPart(), saved);

  f.phase = 'Read the original corner after the section removes an earlier body row';
  await button('Project and versions').click();
  const reordered = { ...doc, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [10, 23], max: [15, 27] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { ...doc.nodes[0], id: 'n2' }, { ...doc.nodes[1], id: 'n3', sketch: 2 },
  ], outputs: { ...doc.outputs, b3: { node: 3, side: 'solid' } }, nextId: 4 };
  const reorderedFile = join(f.output, 'reordered.bcad');
  await writeFile(reorderedFile, JSON.stringify(reordered));
  await f.openFile(reorderedFile, 4);
  await f.same(reordered);
  assert.deepEqual((await f.bodies()).bodies.map(body => body.key), ['b1', 'b3']);
  await button('Section view').click();
  await setup('n3.side6');
  assert.deepEqual((await section()).sources, ['b3']);
  await look('Top back right');
  await candidate();
  await f.snapshot('reordered-section-source-corner');
  await cancel.click();

  f.phase = 'New part dismisses the candidate and its delayed reply';
  await heldCandidate();
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  await release();
  assert.equal((await section()).planes, null);
  assert.equal((await f.bodies()).bodies.length, 0);
  await f.snapshot('new-part-late-reply-refused');
}

export async function coincidentSectionCorners({ f, doc, button, look, clickCorner, setup, section, baseline }) {
  const shared = { ...doc, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [25, 30], max: [35, 35] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
    { ...doc.nodes[0], id: 'n2' }, { ...doc.nodes[1], id: 'n3', sketch: 2 },
  ], outputs: { ...doc.outputs, b3: { node: 3, side: 'solid' } }, nextId: 4 };
  const input = join(f.output, 'coincident.bcad');
  await writeFile(input, JSON.stringify(shared));
  await f.openFile(input, 4);
  await f.same(shared);
  await button('Section view').click();
  await setup('n3.side6');
  await look('Top back right');
  const initial = await section();
  assert.deepEqual(initial.sources, ['b1', 'b3']);
  const status = f.page.getByRole('group', { name: 'Section', exact: true }).getByRole('status');
  f.phase = 'Pick two retained native body vertices that share one position';
  await button('Section through a vertex').click();
  if (!baseline) await f.page.evaluate(() => { window.__sectionReply.armed = true; });
  await clickCorner();
  await status.getByText(baseline ? 'The exact section is unavailable at this corner.' : 'More than one original corner has this position.').waitFor();
  if (!baseline) {
    assert.equal(await f.page.evaluate(() => window.__sectionReply.armed), true);
    await f.page.evaluate(() => { window.__sectionReply.armed = false; });
  }
  assert.equal(await button('Apply section move').isDisabled(), true);
  assert.deepEqual((await section()).planes, initial.planes);
  await f.snapshot(baseline ? 'prior-coincident-corner-evaluated' : 'coincident-corner-refused');
  if (baseline) return;

  f.phase = 'Hide the other body and recover the unique original corner';
  await button('Hide body').first().click();
  await f.page.waitForFunction(() => window.__studioSection()?.exact && window.__studioSection().sources.join() === 'b3');
  await button('Section through a vertex').click();
  await clickCorner();
  await status.getByText('Move to offset 45 mm').waitFor();
  await f.snapshot('unique-corner-after-hide');
}
