import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const triangular = process.argv.includes('--triangle');
const polygon = ['pentagon', 'hexagon', 'trapezoid', 'skew-quadrilateral']
  .find(name => process.argv.includes('--' + name));
const polygonProfiles = {
  pentagon: { corners: [[-7, -4], [2, -3], [1, -1], [-4, 1], [-6, -1]], volume: 1350.078786522149 },
  hexagon: { corners: [[-7, -5], [1, -5], [3, -3], [2, -1], [-3, 1], [-7, -1]], volume: 2300.134228889587 },
  trapezoid: { corners: [[-8, -5], [2, -5], [0, -1], [-7, -1]], volume: 1700.0992126575209 },
  'skew-quadrilateral': { corners: [[-7, -4], [2, -3], [0, -1], [-5, 1]], volume: 1225.0714914738019 },
};
const convex = polygon && polygonProfiles[polygon];
const tilted = triangular || !!convex;
const screw = tilted || process.argv.includes('--screw');
const smooth = screw || process.argv.includes('--smooth');
const command = screw ? 'smooth-screw' : smooth ? 'smooth-turn' : 'ruled-turn';
const commandLabel = screw ? 'Smooth Screw' : smooth ? 'Smooth Turn' : 'Ruled Turn';
const profile = polygon ?? (triangular ? 'triangle' : 'rectangle');
const screwInput = { axisX: tilted ? 10 : -1, axisY: tilted ? -3 : 1, pitch: 40 };
const insideAxis = tilted ? { axisX: 7, axisY: -5 } : { axisX: 3, axisY: 4 };
const pins = [
  'packages/barocss-cad/src/internal/triangular-screw-axis.ts', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad/src/internal/convex-polygon-screw-axis.ts', 'packages/barocss-cad-model/src/engine/screwDisplay.ts',
  'apps/cad-studio/src/state/useProposalPreview.ts', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  'packages/barocss-cad-model/src/app/smoothLoftTurn.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
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
  qualification: `A local MCP proposal locks to the explicit current ${profile}, then Studio reviews and saves the native Loft.`,
  limits: [`Local stdio MCP, one standalone ${profile}, −450° ${commandLabel} and explicit user approval.`],
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
const rails = brep.edges.filter(edge => /^c[0-9]+$/.test(edge.id)).map(({ curve }) => ({
  knots: curve.knots, degree: curve.degree, poles: curve.controlPoints.length,
  samples: Array.from({ length: 121 }, (_, index) => evaluateCurveD1(curve, index / 120)),
}));
console.log(JSON.stringify({ count: outputs.length, key, sha: digestOf(brep), check: checkBrep(brep, { strict: true }),
  closed: brep.shells.length === 1 && brep.shells[0].closed, kind: brep.bodies[0].kind,
  volume: brepMassProperties(brep, 1).volume, edges, rails }));
`,
});

const plane = {
  origin: tilted ? [11, -17, 23] : [11, -17, 3],
  normal: tilted ? [0, .6, .8] : [0, 0, 1],
  xAxis: [1, 0, 0],
};
const target = convex ? { profile: 'polygon', points: convex.corners.map(([u, v]) => [u + 10, v - 3]) }
  : triangular ? { profile: 'polygon', points: [[3, -7], [12, -6], [6, -2]] }
  : { profile: 'rectangle', min: [1, 2], max: [13, 10] };
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', ...target, plane },
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
  const corners = convex?.corners ?? (triangular ? [[-7, -4], [2, -3], [-4, 1]]
    : screw ? [[2, 1], [14, 1], [14, 9], [2, 9]] : [[-6, -4], [6, -4], [6, 4], [-6, 4]]);
  assert.equal(result.edges.length, corners.length * 3);
  assert.equal(result.rails.length, corners.length);
  const pivot = tilted ? [21, -19.4, 24.8] : screw ? [10, -16, 3] : [18, -11, 3];
  const [, ny, nz] = plane.normal;
  for (const [index, rail] of result.rails.entries()) {
    assert.deepEqual([rail.degree, rail.poles], [3, 16]);
    const knots = rail.knots.slice(4, -4);
    assert.ok(knots.every((knot, i) => i === 0 || knot > knots[i - 1]));
    const [u, v] = corners[index];
    for (const [i, { point, derivative }] of rail.samples.entries()) {
      const t = i / (rail.samples.length - 1), angle = -450 * Math.PI / 180 * t;
      const c = Math.cos(angle), s = Math.sin(angle);
      const x = point[0] - pivot[0], dy = point[1] - pivot[1], dz = point[2] - pivot[2];
      const y = nz * dy - ny * dz, axial = ny * dy + nz * dz;
      const error = Math.hypot(x - (c * u - s * v), y - (s * u + c * v));
      assert.ok(error < (screw ? 0.04 : 0.016));
      if (i % 8 === 0) assert.ok(error < 1e-8);
      assert.ok(Math.abs(axial - 50 * t) < 1e-8);
      assert.ok(x * (nz * derivative[1] - ny * derivative[2]) - y * derivative[0] < 0);
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
  const faceCount = convex ? convex.corners.length + 2 : triangular ? 5 : smooth ? 6 : 22;
  assert.deepEqual([result.check.valid, result.check.counts.bodies, result.check.counts.faces, result.kind, result.closed],
    [true, 1, faceCount, 'solid', true]);
  const expectedVolume = convex?.volume ?? (triangular ? 1050.0612784061159 : smooth ? 4800.280129856528 : 3200);
  assert.ok(Math.abs(result.volume - expectedVolume) < 1e-7);
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
  f.report.observations.push({ label, sha: result.sha, volume: result.volume, faces: result.check.counts.faces, rails: smooth ? result.rails.length : rulings.length });
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

  f.phase = `discover the earlier ${profile} and a current revision, then propose a native turn`;
  await withMcpSession({ app: f.app, output: f.output, clientName: `${command}-agent`, autonomy: 1 }, file, command, async (call, request) => {
    const { tools } = await request('tools/list', {});
    assert.match(tools.find(tool => tool.name === 'features').description, new RegExp(`\\b${command}\\b`));
    const description = await call('describe', { command });
    assert.match(description.selection, /values.sketch and expectedRevision/);
    if (triangular) assert.match(description.selection, /straight triangle/);
    if (convex) assert.match(description.selection, /convex polygon with 4 to 64 straight sides/);
    const report = await call('query', { action: 'summary' });
    assert.deepEqual(report.features.map(feature => feature.id), ['n0', 'n1']);
    const { revision } = await call('query', { action: 'rebuild' });
    assert.match(revision, /^[a-f0-9]{16}$/);
    const args = { action: 'command', command, values: { sketch: report.features[0].id, ...(screw ? screwInput : { height: 50 }), angle: -450 } };
    const propose = (args) => ({ action: 'propose', title: `Create a −450° ${commandLabel} from Sketch 1`, ops: [{ tool: 'features', args }] });
    assert.match((await call('features', { ...args, expectedRevision: revision }, true)).error, /propos/i);
    assert.match((await call('proposals', propose(args), true)).error, /needs expectedRevision/i);
    assert.match((await call('proposals', propose({ ...args, expectedRevision: '0'.repeat(16) }), true)).error, /part changed/i);
    assert.match((await call('proposals', propose({ ...args, expectedRevision: revision, values: { ...args.values, sketch: 'n9' } }), true)).error, /current sketch/i);
    if (screw) assert.match((await call('proposals', propose({ ...args, expectedRevision: revision,
      values: { ...args.values, ...insideAxis } }), true)).error,
      convex ? /axis outside it with clearance/i : new RegExp(`axis outside the ${profile}`, 'i'));
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
  if (tilted) {
    f.phase = 'change the document before approving the pinned triangle proposal';
    await f.page.evaluate(() => document.activeElement?.blur());
    await f.command('Box');
    const box = f.page.getByRole('dialog', { name: 'Box', exact: true });
    await box.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
    await button('Apply', box).click();
    await f.changed(pending);
    const edited = await f.doc();
    assert.deepEqual(edited.proposals, pending.proposals);
    assert.equal((await f.bodies()).bodies.length, 1);
    await card().getByText('stale ·', { exact: true }).waitFor();
    assert.ok(await button('Preview', card()).isDisabled());
    assert.equal(await button('Accept', card()).count(), 0);
    assert.ok(await button('Rebase & preview', card()).isEnabled());
    await f.same(edited);
    await f.snapshot(`stale-${profile}-screw-refused`);
    await f.undo();
    await f.same(pending);
  }
  f.phase = 'review the native proposal in Studio';
  await button('Preview', card()).click();
  await button('Hide', card()).waitFor();
  await showSmoothShading();
  await f.page.mouse.move(690, 490);
  await f.page.mouse.wheel(0, 440);
  await f.page.waitForTimeout(200);
  await f.same(pending);
  let previewDetail;
  if (tilted) {
    await f.page.waitForFunction(() => window.__studioLoftDisplay?.(0)?.kind === 'smooth-turn');
    previewDetail = await f.page.evaluate(() => window.__studioLoftDisplay(0));
    await button('Show changes', card()).click();
    await button('Show shape', card()).waitFor();
    await f.page.waitForFunction(() => window.__studioProposalOverlay?.()?.method === 'boolean');
    await f.same(pending);
    await f.snapshot(`${profile}-screw-proposal-changes`);
    await button('Show shape', card()).click();
    await button('Show changes', card()).waitFor();
    await f.page.waitForFunction(() => window.__studioLoftDisplay?.(0)?.kind === 'smooth-turn');
    assert.deepEqual(await f.page.evaluate(() => window.__studioLoftDisplay(0)), previewDetail);
    f.report.observations.push({ label: 'proposal-shape', detail: previewDetail });
  }
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
  if (screw) {
    const detail = await f.page.evaluate(() => window.__studioLoftDisplay?.(0));
    assert.ok(detail?.kind === 'smooth-turn' && detail.triangles > detail.baseTriangles);
    if (tilted) assert.deepEqual(detail, previewDetail);
    f.report.observations.push({ label: 'reopened-display', detail });
  }
  await f.snapshot('agent-turn-reopened-framed');

  f.phase = `compare with direct Studio authoring of the same earlier ${profile}`;
  await f.freshOpen(manualFile, source, 'manual-source-open');
  await button('Sketch 1').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command(commandLabel);
  const hud = f.page.getByRole('dialog', { name: commandLabel, exact: true });
  if (screw) {
    await hud.getByLabel('Axis X', { exact: true }).fill(String(screwInput.axisX));
    await hud.getByLabel('Axis Y', { exact: true }).fill(String(screwInput.axisY));
    await hud.getByLabel('Pitch per revolution', { exact: true }).fill(String(screwInput.pitch));
  } else await hud.getByLabel('Height', { exact: true }).fill('50');
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
