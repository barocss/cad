import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, flat, upper, lower, expectedRadius = '3'] = process.argv.slice(2);
const app = resolve(import.meta.dirname, '..');
assert.ok(output && flat && upper && lower && isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
const radius = Number(expectedRadius), diameter = 2 * radius, wrongDiameter = diameter + 2;
assert.ok(Number.isFinite(radius) && radius > 0);
const pins = [
  'apps/cad-studio/src/ui/RequirementsBrowser.tsx',
  'apps/cad-studio/src/state/useModelChecks.ts',
  'packages/barocss-cad/src/brep/cylindrical-bore.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts',
  'packages/barocss-cad-model/src/chat/spec.ts',
];
const f = await createFlow({
  name: 'tilted-bore-requirement', envFrozen: 'D1439_SOURCE_FROZEN', output,
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Verify the same exact through-bore diameter in Studio Requirements and stdio MCP.',
});
const req = (id, source, fn, value, body) => ({ id, source, hard: true, basis: 'stated',
  check: { op: '==', query: { fn, face: { feature: 2, role: 'side0', on: body } }, value, tol: 0.001, unit: 'mm' } });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  for (const [label, input, body, reference] of [
    ['flat', flat, 'b2', 'b5'], ['tilted-upper', upper, 'b6', 'b5'], ['tilted-lower', lower, 'b6', 'b5'],
  ]) {
    const original = await readFile(input), doc = JSON.parse(original);
    doc.requirements = [
      req('radius', `Bore radius ${radius} mm`, 'radius', radius, body),
      req('diameter', `Through bore diameter ${diameter} mm`, 'hole_diameter', diameter, body),
      req('mismatch', `Test a ${wrongDiameter} mm diameter`, 'hole_diameter', wrongDiameter, body),
      req('wrong-body', 'Check the separate reference body', 'hole_diameter', diameter, reference),
    ];
    const file = join(output, label + '.bcad'), bytes = Buffer.from(JSON.stringify(doc));
    await writeFile(file, bytes);
    f.phase = 'Read stdio MCP requirement evidence for ' + label;
    const reports = await withMcpSession({ app, output, clientName: 'cad-tilted-bore-requirement' }, file, label, async call => {
      const check = await call('requirements', { action: 'check', part: 'base' });
      const evidence = await call('requirements', { action: 'evidence', part: 'base' });
      const rows = JSON.parse(evidence.files[0].text).evidence.filter(row => row.requirement);
      const result = id => rows.find(row => row.requirement.id === id).result;
      assert.equal(check.summary.pass, 2);
      assert.equal(check.summary.fail, 1);
      assert.equal(check.summary.unknown, 1);
      near(result('radius').number, radius);
      near(result('diameter').number, diameter);
      near(result('mismatch').number, diameter);
      assert.equal(result('diameter').verdict, 'pass');
      assert.equal(result('mismatch').verdict, 'fail');
      assert.equal(result('wrong-body').status, 'unsupported');
      assert.equal(result('wrong-body').number, null);
      return check.summary;
    });
    await f.freshOpen(file, doc, label + '-open');
    f.phase = 'Read desktop Studio requirements for ' + label;
    const marker = `${reports.pass} ✓ · ${reports.fail} ✗ · ${reports.unknown} ?`;
    await f.page.locator('.req-head').filter({ hasText: marker }).waitFor();
    const row = id => f.page.getByRole('listitem', { name: 'Requirement ' + id, exact: true });
    assert.match(await row('radius').getAttribute('class'), /\bpass\b/);
    assert.match(await row('diameter').getAttribute('class'), /\bpass\b/);
    assert.match(await row('mismatch').getAttribute('class'), /\bfail\b/);
    const measured = /· ([\d.]+) \(want ([\d.]+)/.exec(await row('mismatch').innerText());
    assert.ok(measured);
    near(Number(measured[1]), diameter);
    near(Number(measured[2]), wrongDiameter);
    assert.match(await row('wrong-body').getAttribute('class'), /\bunknown\b/);
    await f.same(doc);
    assert.deepEqual(await readFile(file), bytes);
    assert.deepEqual(await readFile(input), original);
    await f.snapshot(label + '-requirements');
    f.report.observations.push({ label, radius, diameter, status: reports });
  }
});
