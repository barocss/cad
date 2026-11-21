import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const smooth = process.argv.includes('--smooth');
const command = smooth ? 'smooth-turn' : 'ruled-turn';
const commandLabel = smooth ? 'Smooth Turn' : 'Ruled Turn';
const pins = [
  'apps/cad-studio/test/ruled-turn-agent-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'apps/cad-studio/src/App.tsx',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/chat/part/proposals.ts',
  'packages/barocss-cad-model/src/chat/toolset.ts', 'packages/barocss-cad-model/src/app/ruledTurnCommand.ts',
];
const f = await createFlow({
  name: `${command}-agent`,
  output: process.argv[2],
  envFrozen: 'RULED_TURN_AGENT_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'A local MCP proposal locks to the explicit current rectangle, then Studio reviews and saves the native Loft.',
  limits: [`Local stdio MCP, one standalone rectangular profile, −450° ${commandLabel} and explicit user approval.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateCurveD1 } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const outputs = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const [{ brep, key }] = outputs;
const edges = brep.edges.map(edge => {
  const [a, b] = curveDomain(edge.curve);
  return [a, (a + b) / 2, b].map(t => evaluateCurve(edge.curve, t));
});
const rails = brep.edges.filter(edge => /^c[0-3]$/.test(edge.id)).map(({ curve }) => ({
  knots: curve.knots, degree: curve.degree, poles: curve.controlPoints.length,
  samples: Array.from({ length: 121 }, (_, index) => evaluateCurveD1(curve, index / 120)),
}));
console.log(JSON.stringify({ count: outputs.length, key, sha: digestOf(brep), check: checkBrep(brep, { strict: true }),
  closed: brep.shells.length === 1 && brep.shells[0].closed, kind: brep.bodies[0].kind,
  volume: brepMassProperties(brep, 1).volume, edges, rails }));
`,
});

const plane = { origin: [11, -17, 3], normal: [0, 0, 1], xAxis: [1, 0, 0] };
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [1, 2], max: [13, 10], plane },
    { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [15, 2], max: [37, 6], plane },
  ],
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });
const near = (a, b) => Math.hypot(...a.map((value, index) => value - b[index])) < 1e-8;

function cornerAt([x, y], index) {
  const [u, v] = [[x, y], [y, -x], [-x, -y], [-y, x]][index % 4];
  return [18 + u, -11 + v, 3 + index * 10];
}

function checkSmoothRails(result) {
  assert.equal(result.edges.length, 12);
  assert.equal(result.rails.length, 4);
  const corners = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
  for (const [index, rail] of result.rails.entries()) {
    assert.deepEqual([rail.degree, rail.poles], [3, 16]);
    const knots = rail.knots.slice(4, -4);
    assert.ok(knots.every((knot, i) => i === 0 || knot > knots[i - 1]));
    const [u, v] = corners[index];
    for (const [i, { point, derivative }] of rail.samples.entries()) {
      const t = i / (rail.samples.length - 1), angle = -450 * Math.PI / 180 * t;
      const c = Math.cos(angle), s = Math.sin(angle);
      const x = point[0] - 18, y = point[1] + 11;
      assert.ok(Math.hypot(x - (c * u - s * v), y - (s * u + c * v)) < 0.016);
      assert.ok(Math.abs(point[2] - (3 + 50 * t)) < 1e-8);
      assert.ok(x * derivative[1] - y * derivative[0] < 0);
    }
  }
}

async function native(label, doc) {
  const loft = doc.nodes.at(-1);
  assert.equal(loft.kind, 'loft');
  assert.deepEqual(loft.from, [0]);
  assert.deepEqual(doc.nodes.slice(0, 2), source.nodes);
  const spans = smooth ? 15 : 5;
  assert.deepEqual(loft.sections.map(section => section.z), Array.from({ length: spans + 1 }, (_, index) => 50 * (index / spans)));
  assert.equal(loft.smooth, smooth ? true : undefined);
  const result = await f.inspect(label, doc);
  assert.equal(result.count, 1);
  assert.deepEqual([result.check.valid, result.check.counts.bodies, result.check.counts.faces, result.kind, result.closed],
    [true, 1, smooth ? 6 : 22, 'solid', true]);
  assert.ok(Math.abs(result.volume - (smooth ? 4800.280129856528 : 3200)) < 1e-7);
  const rulings = result.edges.filter(([a, , b]) => Math.abs(a[2] - b[2]) > 1e-8);
  if (smooth) {
    checkSmoothRails(result);
  } else {
    assert.equal(rulings.length, 20);
    for (const corner of [[-6, -4], [6, -4], [6, 4], [-6, 4]]) {
      for (let index = 0; index < 5; index++) {
        const a = cornerAt(corner, index), b = cornerAt(corner, index + 1);
        const midpoint = a.map((value, axis) => (value + b[axis]) / 2);
        assert.ok(rulings.some(([p, m, q]) => near(m, midpoint) && ((near(p, a) && near(q, b)) || (near(p, b) && near(q, a)))));
      }
    }
  }
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  const [body] = bodies;
  assert.equal(body.key, result.key);
  assert.ok(Math.abs(body.volume - result.volume) < 1e-7);
  f.report.observations.push({ label, sha: result.sha, volume: result.volume, faces: result.check.counts.faces, rails: rulings.length });
  return result;
}

async function frame() {
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}

async function showSmoothShading() {
  if (smooth && await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const file = join(f.output, `local-${command}-proposal.bcad`);
  const manualFile = join(f.output, `manual-${command}-source.bcad`);
  const original = JSON.stringify(source);
  await writeFile(file, original);
  await writeFile(manualFile, original);

  f.phase = 'discover the earlier rectangle and a current revision, then propose a native turn';
  await withMcpSession({ app: f.app, output: f.output, clientName: `${command}-agent`, autonomy: 1 }, file, command, async (call, request) => {
    const { tools } = await request('tools/list', {});
    assert.match(tools.find(tool => tool.name === 'features').description, new RegExp(`\\b${command}\\b`));
    const description = await call('describe', { command });
    assert.match(description.selection, /values.sketch and expectedRevision/);
    const report = await call('query', { action: 'summary' });
    assert.deepEqual(report.features.map(feature => feature.id), ['n0', 'n1']);
    const { revision } = await call('query', { action: 'rebuild' });
    assert.match(revision, /^[a-f0-9]{16}$/);
    const args = { action: 'command', command, values: { sketch: report.features[0].id, height: 50, angle: -450 } };
    const propose = (args) => ({ action: 'propose', title: `Create a −450° ${commandLabel} from Sketch 1`, ops: [{ tool: 'features', args }] });
    assert.match((await call('features', { ...args, expectedRevision: revision }, true)).error, /propos/i);
    assert.match((await call('proposals', propose(args), true)).error, /needs expectedRevision/i);
    assert.match((await call('proposals', propose({ ...args, expectedRevision: '0'.repeat(16) }), true)).error, /part changed/i);
    assert.match((await call('proposals', propose({ ...args, expectedRevision: revision, values: { ...args.values, sketch: 'n9' } }), true)).error, /current sketch/i);
    assert.equal(await readFile(file, 'utf8'), original);
    const proposal = await call('proposals', propose({ ...args, expectedRevision: revision }));
    assert.deepEqual([proposal.proposal, proposal.applied], ['P1', false]);
    assert.match((await call('proposals', { action: 'accept', id: 'P1' }, true)).error, /user accepts.*studio/i);
  });

  const pending = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(pending.nodes, source.nodes);
  assert.deepEqual(pending.outputs, source.outputs);
  await f.freshOpen(file, pending, 'pending-native-open');
  await button('Chat').first().click();
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await showSmoothShading();
  await f.page.mouse.move(690, 490);
  await f.page.mouse.wheel(0, 440);
  await f.page.waitForTimeout(200);
  await f.same(pending);
  await f.snapshot(`${command}-agent-preview`);
  await button('Accept', card()).click();
  await f.changed(pending);
  const accepted = await f.doc();
  assert.equal(accepted.proposals[0].status, 'accepted');
  const approval = accepted.history.at(-1);
  assert.deepEqual([approval.kind, approval.proposal, approval.by.agent], ['accept', 'P1', 'user']);
  const result = await native('agent-approved-native', accepted);
  await f.undo();
  await f.same(pending);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save(`agent-approved-${command}`);
  await f.freshOpen(saved.file, accepted, 'agent-turn-reopened');
  assert.equal((await native('agent-reopened-native', accepted)).sha, result.sha);
  await frame();
  await showSmoothShading();
  await f.snapshot('agent-turn-reopened-framed');

  f.phase = 'compare with direct Studio authoring of the same earlier rectangle';
  await f.freshOpen(manualFile, source, 'manual-source-open');
  await button('Sketch 1').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command(commandLabel);
  const hud = f.page.getByRole('dialog', { name: commandLabel, exact: true });
  await hud.getByLabel('Height', { exact: true }).fill('50');
  await hud.getByLabel('Turn angle', { exact: true }).fill('-450');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', hud).click();
  await f.changed(source);
  const manual = await f.doc();
  assert.deepEqual(manual.nodes, accepted.nodes);
  assert.deepEqual(manual.outputs, accepted.outputs);
  assert.equal((await native(`manual-${command}-native`, manual)).sha, result.sha);
  await frame();
  await showSmoothShading();
  await f.snapshot(`manual-${command}-framed`);
});
