import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/src/ui/SectionBar.tsx'];
const f = await createFlow({ name: 'section-box-help', output: process.argv[2], envFrozen: 'SECTION_BOX_HELP_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Section Box help moves to its control while drag, reset and face-pick guidance remain.',
  limits: ['Desktop WebGPU default Bracket; no other renderer or assistive-device qualification.'] });
const button = name => f.page.getByRole('button', { name, exact: true });
const section = () => f.page.getByRole('group', { name: 'Section', exact: true });
const planes = () => f.page.evaluate(() => window.__studioSection().planes);
await f.run(async () => {
  for (const width of [1024, 1440]) {
    await f.newPage(); await f.page.setViewportSize({ width, height: width === 1024 ? 800 : 900 });
    const doc = await f.doc();
    await button('Section view').click();
    const box = section().getByRole('radio', { name: 'Box', exact: true });
    await box.click();
    await f.page.waitForFunction(() => window.__studioSection().mode === 'box' && window.__studioSection().exact);
    assert.equal(await section().getByText("drag a face's arrow", { exact: true }).count(), 0);
    await box.hover();
    await f.page.locator('.tooltip').getByText("Drag a face's arrow to move that side of the section box.", { exact: true }).waitFor();
    await f.page.mouse.move(400, 100); await f.page.keyboard.press('Tab'); await box.focus();
    const id = await box.getAttribute('aria-describedby'); assert.ok(id);
    assert.match(await f.page.locator(`[id="${id}"]`).innerText(), /Drag a face's arrow/);
    await f.snapshot('help-' + width); await box.evaluate(el => el.blur());
    const before = await planes();
    const vector = await f.page.evaluate(() => {
      const handles = [...document.querySelectorAll('g.gizmo-handle')].filter(el => el.getAttribute('data-handle')?.startsWith('section'));
      const mid = el => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
      const values = handles.flatMap(el => { const c = el.querySelector('circle'), p = el.querySelector('polygon'); return c && p ? [{ root: mid(c), head: mid(p) }] : []; });
      return { count: handles.length, pick: values.find(v => Math.hypot(v.head[0] - v.root[0], v.head[1] - v.root[1]) > 15) };
    });
    assert.equal(vector.count, 6); assert.ok(vector.pick);
    const { root, head } = vector.pick, delta = head.map((v, i) => v - root[i]), length = Math.hypot(...delta);
    await f.page.mouse.move(...head); await f.page.mouse.down();
    await f.page.mouse.move(head[0] - delta[0] / length * 35, head[1] - delta[1] / length * 35, { steps: 12 }); await f.page.mouse.up();
    await f.page.waitForFunction(before => JSON.stringify(window.__studioSection().planes) !== JSON.stringify(before), before);
    await f.page.waitForFunction(() => window.__studioSection().exact);
    const dragged = await planes(); await f.same(doc); await f.snapshot('dragged-' + width);
    await button('Reset the section box').click();
    await f.page.waitForFunction(before => JSON.stringify(window.__studioSection().planes) === JSON.stringify(before), before);
    await f.same(doc);
    await section().getByRole('radio', { name: 'Plane', exact: true }).click();
    await button('Section from a face').click(); await section().getByText('Click a flat face', { exact: true }).waitFor();
    await f.snapshot('face-pick-' + width); await f.page.keyboard.press('Escape');
    await section().getByText('Click a flat face', { exact: true }).waitFor({ state: 'hidden' }); await f.same(doc);
    f.report.observations.push({ width, before, dragged, reset: true, facePrompt: true });
  }
});
