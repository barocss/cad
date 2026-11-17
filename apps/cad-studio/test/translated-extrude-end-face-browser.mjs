import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFlow, sha256 } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline'), rotated = process.argv.includes('--rotated'), front = process.argv.includes('--front'), triangle = process.argv.includes('--triangle'), circle = process.argv.includes('--circle'), convexTarget = process.argv.includes('--convex-target');
assert.ok(!(triangle && circle) && (!(triangle || circle) || front), 'Profile variants require --front and are mutually exclusive');
assert.ok(!convexTarget || (front && !circle && !triangle && !rotated), '--convex-target requires --front with a rectangle source');
const profileName = circle ? 'circle' : triangle ? 'triangle' : 'rectangle';
const decision = convexTarget ? 'CONVEX_TARGET' : circle ? 'CIRCLE_END_FACE' : triangle ? 'TRIANGLE_END_FACE' : front ? 'FRONT_END_FACE' : rotated ? 'D844' : 'D843';
const frameName = convexTarget ? 'Front XZ rectangle to convex quadrilateral' : circle ? 'Front XZ circular standoff' : triangle ? 'Front XZ triangular rib' : front ? 'standard Front XZ' : rotated ? 'cardinal YZ' : 'translated XY';
const pins = [
  'apps/cad-studio/test/translated-extrude-end-face-browser.mjs',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/faceEndExtrude.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
];
const f = await createFlow({
  name: 'translated-extrude-end-face', output: process.argv[2], envFrozen: decision + '_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: baseline ? `Measure the pre-extension command and Open behavior on a ${frameName} source.`
    : `Qualify a literal ${profileName} in the ${frameName} frame and its original opposing native end face.`,
  limits: [`One ${frameName} ${profileName}, positive travel, one current opposed native ${convexTarget ? 'convex quadrilateral' : 'rectangular'} cap, desktop WebGPU.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const part = toPartDocument(doc), result = evaluateCadPart(part);
const axis = doc.nodes[2].plane.normal.findIndex(value => value !== 0);
console.log(JSON.stringify({
  extrusion: part.features.find(feature => feature.id === 'n3'),
  outputs: result.outputs.map(output => ({
    id: output.id, valid: checkOutput(output).valid, count: output.bodyCount, mass: massPropertiesOf(output),
    surfaces: output.brep.faces.map(face=>({name:face.name,...faceGeometry(face)})),
    corners: output.brep.vertices.map(vertex => vertex.point),
    walls: output.brep.faces.filter(face => face.name?.startsWith('n3.side[')).map(face => ({name:face.name,points:face.loops.flatMap(id => output.brep.loops.find(loop => loop.id === id).coedges.flatMap(id => { const coedge=output.brep.coedges.find(c => c.id === id),edge=output.brep.edges.find(e => e.id === coedge.edge);return edge.vertices.map(id => output.brep.vertices.find(v => v.id === id).point); }))})),
    faces: output.brep.faces.filter(face => face.name === output.id + (output.id === 'n1' ? '.bottom' : '.top'))
      .map(face => {
        const plane = faceGeometry(face);
        return { name: face.name, normal: plane.kind === 'plane' ? plane.n : null, levels: face.surface.controlPoints.flat().map(point => point[axis]) };
      }),
  })),
}));
`,
  snapshotExtra: () => ({
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    historyControls: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`).disabled),
  }),
});
const offset = front ? [12, 100, -7] : rotated ? [-100, 12, -7] : [12, -7, -100], normalAxis = front ? 1 : rotated ? 0 : 2;
const normal = front ? [0, -1, 0] : rotated ? [1, 0, 0] : [0, 0, 1], xAxis = rotated ? [0, 1, 0] : [1, 0, 0];
const plane = { origin: offset, normal, xAxis };
const world = ([x, y, z]) => front ? [x + offset[0], offset[1] - z, y + offset[2]] : rotated ? [z + offset[0], x + offset[1], y + offset[2]] : [x + offset[0], y + offset[1], z + offset[2]];
const targetStart = travel => rotated || front ? travel : world([0, 0, travel])[2];
const targetPoints = [[-5,-3],[15,-3],[15,9],[-5,7]];
const targetProfile = convexTarget ? { id:'n0',kind:'sketch',profile:'polygon',points:targetPoints,plane } : rotated || front
  ? { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-5, front ? -3 : -5], max: [15, front ? 9 : 15], plane }
  : { id: 'n0', kind: 'sketch', profile: 'rectangle', min: world([-5, -5, 0]).slice(0, 2), max: world([15, 15, 0]).slice(0, 2) };
const recipe = {
  id: 'n3', kind: 'face-end-extrude', sketch: 2,
  target: { body: { node: 1, side: 'solid' }, feature: 'n1', face: 'n1.bottom' },
};
const sourceAt = (localZ, bound, radius=3) => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    targetProfile,
    { id: 'n1', kind: 'extrude', sketch: 0, from: targetStart(localZ), height: 5 },
    circle ? { id:'n2',kind:'sketch',profile:'circle',center:[5,3],radius,plane,sideTags:{outer:['standoff']} } : triangle ? { id: 'n2', kind: 'sketch', profile: 'polygon', points: [[0,0],[10,0],[0,6]], plane, sideTags: { outer: ['rib-a','rib-b','rib-c'] } } : { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, front ? 6 : 10], plane },
    ...(bound ? [recipe] : []),
  ],
  outputs: { b1: { node: 1, side: 'solid' }, ...(bound ? { b3: { node: 3, side: 'solid' } } : {}) }, nextId: bound ? 4 : 3,
});
const button = (panel, name) => panel.getByRole('button', { name, exact: true });
const field = (panel, name) => panel.getByLabel(name, { exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-8;
const name = decision + '-face-end.bcad', project = decision + ' face end ' + randomUUID();
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });

async function open(file, doc) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button(f.page, 'Open').click()]);
  await chooser.setFiles({ name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
}

async function geometry(label, travel, radius=3) {
  const expected = sourceAt(travel, true, radius);
  assert.deepEqual(await f.doc(), expected);
  await f.ready();
  const native = await f.inspect(label, expected);
  assert.deepEqual(native.extrusion, { id: 'n3', kind: 'extrude', sketch: 'n2', height: travel });
  const { fresh, massReady, bodies } = await f.bodies();
  assert.ok(fresh && massReady);
  assert.deepEqual(bodies.map(body => body.key), ['b1', 'b3']);
  assert.equal(native.outputs.length, 2);
  const targetExtent = world([0, 0, travel])[normalAxis];
  for (const [id, us, vs, lo, hi, volume, centroid] of [
    ['n1', [-5, 15], front ? [-3, 9] : [-5, 15], travel, travel + 5, convexTarget ? 1100 : front ? 1200 : 2000, world([convexTarget ? 175/33 : 5, convexTarget ? 83/33 : front ? 3 : 5, travel + 2.5])],
    ['n3', [0, 10], front ? [0, 6] : [0, 10], 0, travel, (circle ? Math.PI*radius**2 : triangle ? 30 : front ? 60 : 100) * travel, world([triangle ? 10/3 : 5, triangle ? 2 : front ? 3 : 5, travel / 2])],
  ]) {
    const exact = native.outputs.find(output => output.id === id);
    assert.ok(exact?.valid && exact.count === 1);
    if (!(circle && id === 'n3')) assert.equal(exact.corners.length, triangle && id === 'n3' ? 6 : 8);
    // Independent shoelace oracle: target area 220, centroid (175/33,83/33).
    const corners = convexTarget && id === 'n1' ? targetPoints.flatMap(([x,y])=>[lo,hi].map(z=>world([x,y,z]))) : triangle && id === 'n3' ? [[0,0],[10,0],[0,6]].flatMap(([x,y]) => [lo,hi].map(z => world([x,y,z]))) : us.flatMap(x => vs.flatMap(y => [lo, hi].map(z => world([x, y, z]))));
    if (!(circle && id === 'n3')) assert.ok(corners.every(point => exact.corners.some(corner => corner.every((value, i) => near(value, point[i])))));
    if (circle && id === 'n3') {
      const start=world([5,3,0]),heightAt=p=>p.reduce((s,n,i)=>s+(n-start[i])*normal[i],0);
      const radial=p=>Math.hypot(...p.map((n,i)=>n-start[i]-heightAt(p)*normal[i]));
      const cylinders=exact.surfaces.filter(s=>s.kind==='cylinder');assert.ok(cylinders.length>0);
      assert.ok(exact.surfaces.every(s=>s.kind==='plane'||s.kind==='cylinder'));
      for(const side of cylinders){assert.equal(side.out,1);assert.ok(near(side.r,radius));assert.ok(near(radial(side.c),0));assert.ok(near(Math.abs(side.a.reduce((sum,n,i)=>sum+n*normal[i],0)),1));assert.match(side.name,/^n3\.side\[standoff\]/);}
      assert.ok(exact.corners.length>=4);for(const p of exact.corners){assert.ok(near(radial(p),radius));assert.ok(near(heightAt(p),0)||near(heightAt(p),travel));}
      const caps=exact.surfaces.filter(s=>s.kind==='plane');assert.equal(caps.length,2);
      for(const h of [0,travel])assert.ok(caps.some(p=>near(heightAt(p.o),h)&&p.n.every((n,i)=>near(n,(h===0?-1:1)*normal[i]))));
    }
    if (triangle && id === 'n3') for (const [i,tag] of ['rib-a','rib-b','rib-c'].entries()) {
      const wall=exact.walls.find(face=>face.name===`n3.side[${tag}]`);assert.ok(wall);
      const p=[[0,0],[10,0],[0,6]],ends=[p[i],p[(i+1)%3]].flatMap(([x,y])=>[0,travel].map(z=>world([x,y,z])));
      assert.ok(ends.every(p=>wall.points.some(q=>q.every((n,j)=>near(n,p[j])))));
      assert.ok(wall.points.every(p=>ends.some(q=>q.every((n,j)=>near(n,p[j])))));
    }
    assert.equal(exact.faces.length, 1);
    assert.ok(exact.faces[0].normal?.every((value, i) => near(value, (id === 'n1' ? -1 : 1) * normal[i])));
    assert.ok(exact.faces[0].levels.length >= 4 && exact.faces[0].levels.every(z => near(z, targetExtent)));
    for (const measured of [exact.mass, bodies.find(body => body.key === 'b' + id.slice(1))]) {
      assert.ok(near(measured.volume, volume));
      assert.ok(measured.centroid.every((value, i) => near(value, centroid[i])));
    }
  }
  f.report.observations.push({ label, offset, normalAxis, sourceExtent: offset[normalAxis], targetAndEndExtent: targetExtent, travel, extrusionVolumeMm3: (circle ? Math.PI*radius**2 : triangle ? 30 : front ? 60 : 100) * travel, nativeCorners: native.outputs.reduce((sum,o)=>sum+o.corners.length,0) });
}

async function pickLowerCap() {
  await button(f.page, 'View cube directions').click();
  const view = front ? 'Back' : rotated ? 'Left' : 'Bottom';
  await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  await f.page.waitForFunction(name => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === name;
  }, view.toUpperCase());
  const pixel = await f.page.evaluate(point => {
    const xy = window.__studioScreenOf(point);
    return xy && document.elementFromPoint(...xy)?.closest('.vp-canvas') ? xy : null;
  }, world([13, front ? 7 : 13, 20]));
  assert.ok(pixel);
  await f.page.mouse.click(...pixel);
}

async function setTargetStart(travel, expected) {
  await f.openFeatureEditor(1, 'target start Z');
  const before = await f.doc();
  await field(f.editor(), 'Start Z').fill(String(targetStart(travel)));
  await button(f.editor(), 'Apply').click();
  if (expected) {
    await f.changed(before);
    await f.editor().waitFor({ state: 'hidden' });
  } else {
    const error = f.editor().locator('.hud-error');
    await error.waitFor();
    assert.match(await error.textContent(), rotated || front ? /positive extrusion direction/i : /positive (Z|extrusion direction)/i);
    assert.deepEqual(await f.doc(), before);
    await f.closeEditor();
  }
}

await f.run(async () => {
  await f.newPage();
  const seed = sourceAt(20, false);
  f.phase = 'open and select the translated rectangle';
  await open(name, seed);
  await f.same(seed);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button(f.page.getByRole('group', { name: 'History', exact: true }), circle ? 'Sketch · circle' : triangle ? 'Sketch · polygon' : 'Sketch · rectangle').click();
  await f.editor().waitFor();
  await f.closeEditor();
  await f.openExtrudeHud();
  const hud = f.hud(), depth = field(hud, 'Depth');
  assert.equal(await field(hud, 'Distance').inputValue(), '8');
  if (baseline && convexTarget) {
    f.phase = 'existing source supports To face but convex target is refused';
    assert.equal(await depth.count(), 1);
    await depth.selectOption('to-face');
    await pickLowerCap();
    await hud.getByText('n1.bottom', { exact: true }).waitFor();
    await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'refused');
    assert.equal(await button(hud,'Apply').isEnabled(),false);
    assert.deepEqual(await f.doc(),seed);
    const failed=await f.snapshot('00-convex-target-pre-extension-refusal');
    assert.match(failed.hud,/rectangle|rectangular/i);
    f.report.observations.push({label:'convex-target-baseline',depthPresent:true,target:'n1.bottom',refused:true,unchanged:true});
    await button(hud,'Cancel').click();await f.same(seed);
    return;
  }
  if (baseline) {
    assert.equal(await depth.count(), 0);
    await button(hud, 'Cancel').click();
    await hud.waitFor({ state: 'hidden' });
    f.phase = 'the pre-extension Studio opens the authored recipe and cannot evaluate it';
    await open(decision + '-unsupported-candidate.bcad', sourceAt(20, true));
    const notice = await f.waitToast(/literal rectangle(?: or straight triangle)? on (the default|a default or translated) XY plane/i);
    assert.deepEqual(await f.doc(), sourceAt(20, true));
    const failed = await f.snapshot('00-pre-extension-refusal');
    assert.equal(failed.bodies.fresh, false);
    assert.deepEqual(failed.bodies.bodies.map(body => body.key), ['b1']);
    await f.undo();
    assert.deepEqual(await f.doc(), seed);
    f.report.observations.push({ label: 'pre-extension-refusal', offset, fixedDistancePreview: 8, notice, failedGeometryFresh: false, undoRestoredSeed: true });
    return;
  }
  f.phase = 'create a bound end on the translated XY rectangle';
  await depth.selectOption('to-face');
  await pickLowerCap();
  await hud.getByText('n1.bottom', { exact: true }).waitFor();
  const apply = button(hud, 'Apply');
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'preview');
  await f.snapshot('01-translated-preview');
  await apply.click();
  await f.changed(seed);
  await geometry('translated-applied', 20);
  const accepted = await f.snapshot('02-translated-accepted');

  f.phase = 'refuse zero and reverse travel in negative world coordinates';
  await setTargetStart(0, false);
  await setTargetStart(-1, false);
  const refused = await f.snapshot('03-travel-refused');
  for (const key of ['doc', 'bodies', 'history', 'historyControls', 'dirty', 'selection']) assert.deepEqual(refused[key], accepted[key], key);
  await setTargetStart(30, true);
  await geometry('negative-world-target-moved', 30);
  await f.undo();
  await geometry('translated-first-undo', 20);
  await f.redo();
  await geometry('translated-first-redo', 30);

  f.phase = 'save the translated relation and reopen it after reload';
  async function attachProject() {
    if (!(await versions().isVisible())) await button(f.page, 'Project and versions').click();
    await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
    await button(versions(), 'Project in this browser').click();
    await field(versions(), 'Project').waitFor();
  }
  await attachProject();
  const edited = await f.doc();
  await button(f.page, 'Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const bytes = Buffer.from(await f.page.evaluate(async ([project, name]) => {
    const root = await navigator.storage.getDirectory(), projects = await root.getDirectoryHandle('projects');
    const directory = await projects.getDirectoryHandle(project), file = await (await directory.getFileHandle(name)).getFile();
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  }, [project, name]));
  assert.deepEqual(JSON.parse(bytes), edited);
  f.report.files.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  await button(versions(), 'Close project').click();
  await field(versions(), 'Project').waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');
  await f.ready();
  await attachProject();
  await button(versions(), 'Open ' + name).click();
  await f.same(edited);
  await geometry('translated-reopened', 30);
  await setTargetStart(40, true);
  await geometry('translated-post-open-target-moved', 40);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('04-translated-post-open');
  if(circle){
    await f.openFeatureEditor(3,'standoff source radius');
    await button(f.editor(),'Edit sketch').click();
    await f.sketchPanel().waitFor();
    await f.sketchPanel().locator('input#sk-diameter').fill('8');
    await f.finishSketch('reopened-radius-accepted');await geometry('reopened-radius-edited',40,4);await f.undo();await geometry('radius-undo',40,3);await f.redo();await geometry('radius-redo',40,4);await button(f.page,'Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('05-reopened-radius-edit');
  }
  assert.deepEqual(f.report.downloads, []);
});
