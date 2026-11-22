import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const plus = (a, b) => a.map((x,i) => x + b[i]);
const minus = (a, b) => a.map((x,i) => x - b[i]);
const times = (a, f) => a.map(x => x * f);
const dot = (a, b) => a.reduce((sum,x,i) => sum+x*b[i],0);
const norm = a => Math.hypot(...a);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const R = 20;
function section(t, r, f) {
  const sr = r - f, rho = R + sr * Math.cos(t), y = Math.sqrt(rho ** 2 - f ** 2);
  const center = [f,y,sr*Math.sin(t)];
  const a = Math.asin(f/rho);
  const cap = [-1,0,0], wall = [Math.cos(t)*Math.sin(a),Math.cos(t)*Math.cos(a),Math.sin(t)];
  const projection = minus(wall, times(cap,dot(cap, wall)));
  return {center, cap, tangent:times(projection, 1/norm(projection)), sweep: Math.acos(dot(cap,wall)), a};
}
function blendPoint(s, f, w) {
  const angle = w*s.sweep;
  return plus(s.center, times(plus(times(s.cap,Math.cos(angle)),times(s.tangent,Math.sin(angle))),f));
}
function removedVolume(r, f, n=160, m=64) {
  const h = 1e-4;
  let old=0, fillet=0;
  for(let i=0;i<n;i++) {
    const t=i*2*Math.PI/n, at=section(t,r,f), left=section(t-h,r,f), right=section(t+h,r,f);
    const rho0=R+r*Math.cos(t);
    old+=r*Math.cos(t)*rho0**2*(at.a/2-Math.sin(2*at.a)/4);
    for(let j=0;j<=m;j++){
      const w=j/m, a=w*at.sweep, p=blendPoint(at,f,w);
      const dt=times(minus(blendPoint(right,f,w),blendPoint(left,f,w)),1/(2*h));
      const dw=times(plus(times(at.cap,-Math.sin(a)),times(at.tangent,Math.cos(a))),f*at.sweep);
      const coeff=j===0||j===m?1:j%2?4:2;
      fillet+=coeff*p[0]*((p[0]-f)/f)*norm(cross(dt,dw))/(3*m);
    }
  }
  return (old-fillet)*2*Math.PI/n;
}

const path = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  controlPoints: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
    [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
};
const solid = node => ({ node, side: 'solid' });
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 5,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Circular rail', path, mode: 'exact' },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [0, -30], max: [30, 30] },
    { id: 'n3', kind: 'extrude', sketch: 2, height: 10, from: -5, made: { command: 'box', values: { w: 30, d: 60, h: 10, x: 0, y: -30, z: -5 } } },
    { id: 'n4', kind: 'intersect', left: solid(1), right: solid(3) }],
  outputs: { b4: solid(4) } };
const pins = [
  'packages/barocss-cad/src/brep/exact-ring-intersect.ts', 'packages/barocss-cad/src/blend/edge-finish.ts',
  'packages/barocss-cad/src/blend/rolling-ball.ts', 'apps/cad-studio/src/app/filletFamily.ts',
];
const f = await createFlow({
  name: 'exact-half-ring-rim-fillet', output: process.argv[2], envFrozen: 'D1678_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Round one complete cap rim of an Exact Sweep half ring and measure the untouched opposite rim.',
  limits: ['Desktop WebGPU; one centered box Intersect, one external constant-radius Fillet, original R20 mm rail.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry, massPropertiesOf,
  measureBrepEdgeContinuity, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [output] } = partSnapshot(doc), { brep } = output;
const at = ([a,b],t) => a+(b-a)*t;
const byUse = new Map(brep.coedges.map(use => [use.id, use]));
const faceByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop,face])));
const byEdge = new Map(brep.edges.map(edge => [edge.id, edge]));
const edgeUses = new Map(brep.edges.map(edge => [edge.id, []]));
for (const use of brep.coedges) edgeUses.get(use.edge).push(use);
const edgesOf = face => face.loops.flatMap(id => brep.loops.find(loop => loop.id === id).coedges)
  .map(id => byEdge.get(byUse.get(id).edge));
const param = Array.from({length:17},(_,i)=>i/16);
const edgeInfo = edge => ({ id: edge.id, name: edge.name, degree: edge.curve.degree,
  points: param.map(t=>evaluateCurve(edge.curve,at(curveDomain(edge.curve),t))),
  faces: edgeUses.get(edge.id).map(use=>faceByLoop.get(use.loop).name),
  bindings: edgeUses.get(edge.id).map(use=>!!use.pcurve),
  joint: measureBrepEdgeContinuity(brep,edge.id) });
const caps = brep.faces.flatMap(face => {
  const plane=faceGeometry(face);
  return plane.kind==='plane' ? [{name:face.name,plane,edges:edgesOf(face).map(edgeInfo)}] : [];
});
const finishId=doc.nodes.find(node=>node.kind==='fillet')?.id;
const rounds = finishId ? brep.faces.filter(face=>face.name?.startsWith(finishId+'.face')) : [];
const roundNames = new Set(rounds.map(face=>face.name));
const contacts = brep.edges.map(edgeInfo).filter(edge=>edge.faces.filter(face=>roundNames.has(face)).length === 1);
const roundSamples = rounds.flatMap(face=>{
  const {u,v}=surfaceDomain(face.surface);
  return [.17,.39,.66,.83].flatMap(s=>[.17,.41,.72,.86].map(t=>evaluateSurface(face.surface,at(u,s),at(v,t))));
});
const inherited = brep.faces.filter(face=>faceGeometry(face).kind!=='plane' && !roundNames.has(face.name)).map(face=>{
  const {u,v}=surfaceDomain(face.surface);
  return [0,.29,.63,1].flatMap(s=>[0,.35,.71,1].map(t=>evaluateSurface(face.surface,at(u,s),at(v,t))));
});
const properties=massPropertiesOf(output);
console.log(JSON.stringify({ check:checkBrep(brep,{strict:true}), digest:digestOf(brep), mass:properties,
  quadrature:brepMassProperties(brep,1).volume, caps, roundSamples, contacts, inherited,
  fits:output.fillet??[], targets:output.filletTargets??[] }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const dialog = name => f.page.getByRole('dialog', { name, exact: true });
const views = () => f.page.locator('.views');
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));
const names = edges => edges.map(edge => edge.name).sort();
const side = cap => Math.sign(cap.edges[0].points[0][1]);

function distanceToBallCenters(point, r, f) {
  const centerDistance = t => norm(minus(point, section(t, r, f).center));
  const at = Math.atan2(point[2], Math.hypot(f, point[1]) - R);
  let lo = at - .42, hi = at + .42;
  for (let i = 0; i < 45; i++) {
    const left = (2 * lo + hi) / 3, right = (lo + 2 * hi) / 3;
    if (centerDistance(left) <= centerDistance(right)) hi = right;
    else lo = left;
  }
  return centerDistance((lo + hi) / 2);
}

async function verify(label, doc, r, fillet, picked, opposing) {
  const geometry = await f.inspect(label, doc);
  assert.ok(geometry.check.valid, geometry.check.issues.join('\n'));
  assert.equal(geometry.check.counts.bodies, 1);
  assert.equal(geometry.check.counts.shells, 1);
  assert.equal(geometry.check.topology[0].genus, 0);
  assert.equal(geometry.caps.length, 2);
  const cap = geometry.caps.find(item => side(item) === 1);
  const far = geometry.caps.find(item => side(item) === -1);
  assert.ok(cap && far);
  assert.deepEqual(names(far.edges), opposing);
  assert.deepEqual(geometry.targets.slice().sort(), picked);
  assert.equal(geometry.fits.length, 1);
  const fit = geometry.fits[0];
  assert.deepEqual(fit.edges.slice().sort(), picked);
  assert.ok(fit.patches > 1 && fit.stations > fit.patches);
  for (const bound of [fit.contact, fit.section, fit.ball]) assert.ok(bound >= 0 && bound < 8e-7);
  assert.ok(fit.normal >= 0 && fit.normal < 1e-3);
  assert.equal(geometry.mass.method, 'quadrature');
  assert.ok(geometry.check.maximumEdgeSurfaceGap < 1e-6);

  let untouchedError = 0, transitionError = 0, supportError = 0, envelopeError = 0;
  for (const edge of far.edges) {
    assert.equal(edge.degree, 2);
    for (const [x, y, z] of edge.points)
      untouchedError = Math.max(untouchedError, Math.abs(x), Math.abs(Math.hypot(y + R, z) - r));
    assert.deepEqual(edge.bindings, [true, true]);
    assert.equal(edge.joint.status, 'measured', JSON.stringify(edge.joint));
    near(edge.joint.maximumAngleDegrees, 90, 1e-6);
    assert.equal(edge.joint.sampleCount, 8);
  }
  for (const edge of geometry.contacts) {
    const planar = edge.faces.includes(cap.name);
    for (const [x, y, z] of edge.points) {
      assert.ok(y > 0 && x > -1e-6 && x < 2 * fillet);
      const rho = Math.hypot(x, y);
      const residual = planar
        ? Math.max(Math.abs(x), Math.abs(Math.hypot(Math.hypot(fillet, y) - R, z) - (r - fillet)))
        : Math.max(Math.abs(Math.hypot(rho - R, z) - r), Math.abs(x * (rho - fillet * (rho - R) / r) / rho - fillet));
      transitionError = Math.max(transitionError, residual);
    }
  }
  assert.ok(geometry.contacts.some(edge => edge.faces.includes(cap.name)));
  assert.ok(geometry.contacts.some(edge => !edge.faces.includes(cap.name)));
  assert.ok(geometry.roundSamples.length && geometry.inherited.length);
  for (const point of geometry.roundSamples)
    envelopeError = Math.max(envelopeError, Math.abs(distanceToBallCenters(point, r, fillet) - fillet));
  for (const [x, y, z] of geometry.inherited.flat())
    supportError = Math.max(supportError, Math.abs(Math.hypot(Math.hypot(x, y) - R, z) - r));
  near(untouchedError, 0, 1e-7);
  near(supportError, 0, 1e-7);
  near(transitionError, 0, 1e-6);
  near(envelopeError, 0, 2e-6);

  const removal = removedVolume(r, fillet);
  const expected = Math.PI ** 2 * R * r ** 2 - removal;
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  for (const value of [geometry.mass.volume, geometry.quadrature, bodies[0].volume]) near(value, expected, 3e-6);
  f.report.observations.push({ label, r, fillet, removal, expected, volume: geometry.mass.volume, workers: bodies[0].volume,
    untouchedError, transitionError, supportError, envelopeError, fit, counts: geometry.check.counts,
    maximumEdgeSurfaceGap: geometry.check.maximumEdgeSurfaceGap, far: far.edges.map(({id,name,bindings,joint}) =>
      ({id,name,bindings,status:joint.status,reason:joint.reason,angle:joint.maximumAngleDegrees})), digest: geometry.digest });
  return geometry;
}

async function measureOpposite(geometry, label) {
  f.phase = 'Measure the unchanged opposite circular rim in Studio';
  await browser().getByRole('button', { name: /^Sweep along Circular rail/ }).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const edges = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  const far = geometry.caps.find(cap => side(cap) === -1);
  for (const [i, edge] of far.edges.entries()) {
    await edges.selectOption(edge.id);
    await button('Measure continuity', panel).click();
    const angle = result.locator('[data-continuity-angle]');
    await angle.waitFor();
    assert.equal(await angle.innerText(), '90°');
    assert.match(await result.innerText(), /Native samples\s+8/);
    f.report.observations.push({ label: label + '-' + i, text: await result.innerText(), edge: edge.name });
    if (i === 0) await f.snapshot(label);
  }
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'exact-half-ring.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const stock = await f.inspect('stock', seed);
  assert.ok(stock.check.valid && stock.caps.length === 2);
  const picked = names(stock.caps.find(cap => side(cap) === 1).edges);
  const opposing = names(stock.caps.find(cap => side(cap) === -1).edges);
  assert.equal(picked.length, 2);
  assert.equal(opposing.length, 2);

  f.phase = 'Pick one half of the positive-Y circular cut rim';
  await button('View cube directions', f.page.getByRole('group', { name: 'View cube', exact: true })).click();
  await f.page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.waitForFunction(() => document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT');
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  const point = [0, R + Math.SQRT2, Math.SQRT2];
  const pixel = await f.page.evaluate(p => window.__studioScreenOf(p), point);
  assert.ok(pixel && await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);
  await f.snapshot('01-single-rim-pick');
  await f.page.evaluate(() => document.activeElement?.blur());
  f.phase = 'Refuse the excessive default before starting a valid preview';
  const beforeDefault = Date.now();
  await f.command('Fillet');
  const hud = dialog('Fillet'), radius = hud.getByLabel('Radius', { exact: true });
  await hud.locator('.status').filter({ hasText: /^refused$/ }).waitFor({ timeout: 15000 });
  assert.equal(await radius.inputValue(), '3');
  assert.ok(await button('Apply', hud).isDisabled());
  await f.same(seed);
  f.report.observations.push({ label: 'default-radius-refused', elapsedMs: Date.now() - beforeDefault, radius: 3 });
  await f.snapshot('01-default-radius-refused');

  f.phase = 'Preview the complete positive-Y rim at 0.5 mm';
  await radius.fill('0.5');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor({ timeout: 90000 });
  const scope = hud.getByRole('group', { name: 'Fillet scope' });
  const scopedNames = async label => (await scope.locator('.field').filter({ hasText: label })
    .locator('span[title]').getAttribute('title')).split('\n').filter(Boolean);
  const authored = await scopedNames('Picked native edges');
  const added = await scopedNames('Tangent edges added');
  assert.deepEqual([...authored, ...added].sort(), picked);
  await f.same(seed);
  await f.snapshot('02-complete-rim-preview');

  f.phase = 'Refuse the oversized rim fillet';
  await radius.fill('2');
  await hud.locator('.status').filter({ hasText: /^refused$/ }).waitFor({ timeout: 15000 });
  assert.ok(await button('Apply', hud).isDisabled());
  await f.same(seed);
  await f.snapshot('03-oversize-refused');

  f.phase = 'Preview and apply the complete positive-Y rim';
  await radius.fill('0.5');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor({ timeout: 90000 });
  await f.same(seed);
  await button('Apply', hud).click();
  await f.changed(seed);
  await button('Iso', views()).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const rounded = (await f.snapshot('04-rim-filleted')).doc;
  const feature = rounded.nodes[5];
  assert.deepEqual([feature.kind, feature.parent, feature.radius, feature.edges.slice().sort()], ['fillet', solid(4), 0.5, authored.slice().sort()]);
  await measureOpposite(await verify('filleted', rounded, 2, 0.5, picked, opposing), '05-opposite-rim');

  await f.openFeatureEditor(5);
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.75');
  const edited = (await f.applyEditor(rounded, '06-radius-edited')).doc;
  assert.deepEqual(edited.nodes[5], { ...feature, radius: 0.75 });
  await verify('edited', edited, 2, 0.75, picked, opposing);
  await f.undo();
  await f.same(rounded);
  await f.redo();
  await f.same(edited);

  await f.openFeatureEditor(1);
  await f.editor().getByLabel('Diameter', { exact: true }).fill('6');
  const enlarged = (await f.applyEditor(edited, '07-upstream-diameter-edited')).doc;
  assert.equal(enlarged.nodes[0].radius, 3);
  assert.deepEqual(enlarged.nodes.slice(1), edited.nodes.slice(1));
  const beforeOpen = await verify('enlarged', enlarged, 3, 0.75, picked, opposing);
  await f.undo();
  await f.same(edited);
  await f.redo();
  await f.same(enlarged);
  const saved = await f.save('half-ring-fillet');
  const reopened = (await f.freshOpen(saved.file, enlarged, '08-reopened')).doc;
  const afterOpen = await verify('reopened', reopened, 3, 0.75, picked, opposing);
  assert.equal(afterOpen.digest, beforeOpen.digest);
  await measureOpposite(afterOpen, '09-reopened-opposite-rim');
  await f.openFeatureEditor(5);
  assert.equal(await f.editor().getByLabel('Radius', { exact: true }).inputValue(), '0.75');
  await f.snapshot('10-reopened-fillet-edit');
});
