import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const obtuse = process.argv.includes('--obtuse');
const rotated = process.argv.includes('--rotated') && !obtuse;
const acute = process.argv.includes('--acute');
const caseName = obtuse ? 'obtuse-sector' : acute ? 'acute-sector' : 'quarter-disk';
const pins = [
  'apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs',
  'packages/barocss-cad/src/features/drafted-extrusion.ts',
  ...(!baseline || rotated ? ['packages/barocss-cad/src/features/drafted-quarter-disk.ts'] : []),
  'packages/barocss-cad/src/part/part-profile-solid.ts',
];
const f = await createFlow({
  name: 'quarter-disk-draft-extrude', output: process.argv[2], envFrozen: 'QUARTER_DISK_DRAFT_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Draft the two radial walls and arc of an original circular sector, then edit and reopen it.',
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry, massPropertiesOf, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs: [output] } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const { brep } = output;
console.log(JSON.stringify({
  report: checkBrep(brep, { strict: true }), mass: massPropertiesOf(output),
  digest: createHash('sha256').update(JSON.stringify(brep)).digest('hex'),
  baseVertices: brep.vertices.filter(vertex => vertex.point[2] === 0).map(vertex => vertex.point),
  edgesOwnEnds: brep.edges.every(({ curve, vertices }) => vertices.every((id, end) => {
    const point = curve.controlPoints[end === 0 ? 0 : curve.controlPoints.length - 1];
    return brep.vertices.find(vertex => vertex.id === id).point.every((coordinate, axis) => coordinate === point[axis]);
  })),
  seams: brep.edges.filter(edge => edge.curve.controlPoints[0][2] !== edge.curve.controlPoints.at(-1)[2]).map(edge => {
    const { curve } = edge, [a, b] = curveDomain(curve);
    const points = Array.from({length: 9}, (_, i) => evaluateCurve(curve, a + i * (b-a)/8));
    return { name: edge.name, degree: curve.degree, points };
  }),
  faces: brep.faces.map(face => {
    const { u, v } = surfaceDomain(face.surface);
    return { name: face.name, kind: faceGeometry(face).kind, uPoles: face.surface.controlPoints.length, points: [0.21,0.43,0.79].flatMap(a => [0.1,0.5,0.9]
      .map(b => evaluateSurface(face.surface, u[0]+a*(u[1]-u[0]), v[0]+b*(v[1]-v[0])))) };
  }),
}));
`,
});
const radius = 10, height = 10;
const arcStart = rotated ? [8, 6] : [10, 0];
const arcEnd = obtuse ? [-6, 8] : acute ? (rotated ? [0, 10] : [6, 8]) : (rotated ? [-6, 8] : [0, 10]);
const halfAngle = obtuse ? Math.atan2(4, -3) / 2 : acute ? Math.atan2(4, 3) / 2 : Math.PI / 4;
const cotangent = obtuse ? 0.5 : acute ? 2 : 1;
const lastWallDistance = (x, y) => obtuse ? 0.8 * x + 0.6 * y : acute ? 0.8 * x - 0.6 * y : x;
const outward = obtuse ? -45 : -10;
const inSketchFrame = ([x, y, z]) => rotated ? [(4 * x + 3 * y) / 5, (-3 * x + 4 * y) / 5, z] : [x, y, z];
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'loop', segments: [
    { kind: 'line', start: [0, 0] },
    { kind: 'arc', start: arcStart, center: [0, 0], direction: 'ccw' },
    { kind: 'line', start: arcEnd },
  ] }], outputs: {},
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (name, scope) => scope.getByLabel(name, { exact: true });
const status = (value, hud = f.hud()) => hud.locator('.status').getByText(value, { exact: true }).waitFor();
const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

function volumeAt(slope) {
  const n = 4096;
  const area = z => {
    const d = z * slope, r = radius - d, q = Math.sqrt(r * r - d * d);
    return r * r * (halfAngle - Math.atan2(d, q)) + d * (cotangent * d - q);
  };
  let sum = area(0) + area(height);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * area(i * height / n);
  return sum * height / (3 * n);
}

async function check(label, doc, angle) {
  const result = await f.inspect(label, doc), slope = Math.tan(angle * Math.PI / 180), volume = volumeAt(slope);
  assert.ok(result.report.valid, result.report.issues.join('\n'));
  assert.deepEqual(result.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(result.report.topology[0].genus, 0);
  for (const [x, y] of [[0, 0], arcStart, arcEnd]) {
    assert.ok(result.baseVertices.some(point => point[0] === x && point[1] === y), `Missing authored vertex (${x}, ${y})`);
  }
  assert.equal(result.edgesOwnEnds, true);
  assert.equal(result.faces.filter(face => face.kind === 'plane').length, 4);
  const cone = result.faces.filter(face => face.kind !== 'plane');
  assert.equal(cone.length, 2);
  if (obtuse && angle === outward) assert.deepEqual(cone.map(face => face.uPoles), [5, 5]);
  for (const face of cone) for (const [x, y, z] of face.points) near(Math.hypot(x, y), radius - slope * z);
  const joins = result.seams.filter(seam => seam.degree === 2);
  assert.equal(joins.length, 2);
  for (const seam of joins) {
    const alongY = seam.name.includes('n1.side0');
    for (const [x, y, z] of seam.points.map(inSketchFrame)) {
      near(alongY ? y : lastWallDistance(x, y), slope * z);
      near(Math.hypot(x, y), radius - slope * z);
    }
  }
  const corner = result.seams.find(seam => seam.name === 'n1.side0|n1.side2');
  assert.equal(corner.degree, 1);
  for (const [x, y, z] of corner.points.map(inSketchFrame)) { near(x, cotangent * slope * z); near(y, slope * z); }
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(result.mass.volume, volume, 1e-6);
  near(bodies[0].volume, volume, 1e-6);
  f.report.observations.push({ label, angle, volume, nativeVolume: result.mass.volume, digest: result.digest, counts: result.report.counts });
  return result.digest;
}

await f.run(async () => {
  f.phase = 'Open the original circular sector and start Extrude';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: caseName + '-sketch.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  const prepare = async angle => {
    await button('Sketch 1', browser).click();
    await f.openExtrudeHud();
    await field('Distance', f.hud()).fill(String(height));
    await field('Draft', f.hud()).fill(String(angle));
  };
  await prepare(10);
  const hud = f.hud();
  if (baseline) {
    await status('refused');
    assert.match(await hud.locator('details code').textContent(), /not tangent/);
    assert.equal(await button('Apply', hud).isDisabled(), true);
    await f.same(seed);
    await f.snapshot('baseline-' + caseName + '-refused');
    return;
  }
  await status('preview');
  await f.same(seed);
  await f.snapshot(caseName + '-preview');
  await button('Cancel', hud).click();
  await f.same(seed);
  await prepare(10);
  await status('preview');
  await button('Apply', hud).click();
  await f.changed(seed);
  const first = await f.doc();
  assert.deepEqual(first.nodes[0], seed.nodes[0]);
  assert.equal(first.nodes[1].draft, 10);
  await check('inward-draft', first, 10);
  await f.snapshot('inward-' + caseName);

  f.phase = 'Refuse collapse and edit to a signed outward Draft';
  await f.openFeatureEditor(1, 'Draft Extrude');
  const editor = f.editor(), draft = field('Draft', editor);
  const collapseAngles = obtuse ? [[30, 'inward'], [-84, 'outward']] : acute ? [[20, 'inward'], [-40, 'outward']] : [[30, '']];
  for (const [angle, suffix] of collapseAngles) {
    await draft.fill(String(angle));
    await button('Apply', editor).click();
    await editor.locator('.hud-error-title').waitFor();
    await f.same(first);
    await f.snapshot(caseName + '-collapse-refused' + (suffix ? '-' + suffix : ''));
  }
  await draft.fill(String(outward));
  const second = (await f.applyEditor(first, 'outward-' + caseName)).doc;
  assert.deepEqual(second.nodes[1], { ...first.nodes[1], draft: outward });
  const digest = await check('outward-draft', second, outward);
  await f.undo();
  await f.same(first);
  await f.redo();
  await f.same(second);
  const saved = await f.save(caseName + '-draft');
  const reopened = (await f.freshOpen(saved.file, second, caseName + '-draft-reopened')).doc;
  assert.equal(await check('outward-native-reopen', reopened, outward), digest);
});
