import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const inlet = process.argv.includes('--inlet');
const cap = inlet ? 'inlet' : 'outlet';
const primary = inlet ? 'n1.start' : 'n1.end';
const opposite = inlet ? 'n1.end' : 'n1.start';
const axis = inlet ? 0 : 2;
const donorSketch = inlet ? { min: [-19, 40], max: [-14, 48] } : { min: [40, 48], max: [48, 54] };
const sourcePick = inlet ? ['Left', [-10, 1.55, 0]] : ['Top', [13.55, 30, 28]];
const refusedPick = inlet ? ['Top', [-16.5, 44, 5]] : ['Right', [48, 51, 34.5]];
const firstDonor = inlet ? { face: 'n3.side1', pick: ['Right', [-14, 44, 2.5]], station: -14 }
  : { face: 'n3.bottom', pick: ['Bottom', [44, 51, 32]], station: 32 };
const secondDonor = inlet ? { face: 'n3.side3', pick: ['Left', [-11, 44, 2.5]], station: -11 }
  : { face: 'n3.top', pick: ['Top', [44, 51, 29]], station: 29 };
const movedStation = inlet ? -6 : 24;
const collapseTranslation = inlet ? [19, 0, 0] : [0, 0, -19];
const solid = node => ({ node, side: 'solid' });
const source = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 5,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
      holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'cw' }]],
      sideTags: { outer: ['e0'], holes: [['bore']] } },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Perpendicular bore', mode: 'exact', path: {
      degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
      controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 23], [12, 30, 28]],
    } },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', ...donorSketch },
    { id: 'n3', kind: 'extrude', sketch: 2, ...(inlet ? {} : { from: 32 }), height: 5 },
    { id: 'n4', kind: 'translate', parent: solid(3), offset: [0, 0, 0] },
  ], outputs: { b1: solid(1), b4: solid(4) } };
const modelPins = ['engine/doc', 'engine/offsetPlane', 'app/nativeOffsetFace', 'app/offsetFaceEdit', 'app/profileCommands', 'app/offsetPlanePick']
  .map(path => `packages/barocss-cad-model/src/${path}.ts`);
const pins = ['apps/cad-studio/test/perpendicular-outlet-reference-plane-browser.mjs', ...modelPins];
const f = await createFlow({ name: 'perpendicular-cap-reference-plane', output: process.argv[2], envFrozen: inlet ? 'D1960_SOURCE_FROZEN' : 'D1927_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `The original annular ${cap} follows one parallel native plane on a separate solid.`,
  limits: [`Original ${cap} of the four-span perpendicular annular Sweep and a separate moved rectangular solid. Desktop only.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const evaluated = evaluateDoc(doc, 1);
if (!evaluated.ok) throw new Error(evaluated.error.detail);
console.log(JSON.stringify(partBreps(doc).map(({key,brep}) => {
  const caps = Object.fromEntries(brep.faces.flatMap(face => {
    const plane = faceGeometry(face);
    if (plane.kind !== 'plane') return [];
    const loops = brep.loops.filter(loop => face.loops.includes(loop.id));
    return [[face.name, { plane, rings: loops.map(loop => loop.kind) }]];
  }));
  const joins = [[0,0],[1,12],[2,18]].flatMap(([axis,value]) => brep.edges.filter(edge =>
    edge.curve.controlPoints.every(point => Math.abs(point[axis]-value)<1e-9)).map(edge => [edge,digestOf(brep.coedges.filter(use => use.edge === edge.id))]));
  const fixed = brep.faces.filter(face => face.name !== '${primary}' && !face.name?.startsWith('n1.${inlet ? 'lead' : 'tail'}.'));
  return { key, caps, joins, retained: digestOf(fixed), topology: checkBrep(brep,{strict:true}), hash: digestOf(brep),
    mass: brepMassProperties(brep,1),
    mesh: evaluated.bodies.find(body => body.key === key).mesh.faces.map(face => [face.name,face.index]) };
})));
`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const field = (root, name) => root.getByLabel(name, { exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const status = (root, value) => root.locator('.status').filter({ hasText: new RegExp(`^${value}$`) }).waitFor();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, JSON.stringify({ actual, expected }));
async function pick(view, point) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  await f.page.waitForFunction(direction => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === direction;
  }, view.toUpperCase());
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), point);
  assert.ok(pixel && await f.page.evaluate(coords => document.elementFromPoint(...coords)?.matches('canvas.vp-canvas'), pixel));
  await f.page.mouse.click(...pixel);
}
async function verify(label, doc, original, station, donorFace) {
  const actual = await f.inspect(label, doc), part = actual.find(item => item.key === 'b5'), donor = actual.find(item => item.key === 'b4');
  assert.ok(part?.topology.valid && donor?.topology.valid && actual.length === 2);
  assert.equal(part.topology.topology[0].genus, 1);
  assert.deepEqual(part.topology.counts, { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 72, edges: 36, vertices: 20 });
  assert.deepEqual(part.caps[opposite], original.caps[opposite]);
  assert.deepEqual(part.joins, original.joins);
  assert.equal(part.joins.length, 12);
  assert.equal(part.retained, original.retained);
  near(part.caps[primary].plane.o[axis], station);
  assert.deepEqual(part.caps[primary].rings, ['outer','inner']);
  near(donor.caps[donorFace].plane.o[axis], station);
  const d = inlet ? -10 - station : station - 28;
  const length = 15 * Math.PI + 20 + d;
  const baseMoment = [108 * Math.PI + 861 / 4, 180 * Math.PI + 480, 162 * Math.PI - 381 / 4];
  const extensionMoment = inlet ? [-10 * d - d * d / 2, 0, 0] : [12 * d, 30 * d, 28 * d + d * d / 2];
  const centroid = baseMoment.map((value, i) => (value + extensionMoment[i]) / length);
  near(part.mass.volume, 3*Math.PI*length);
  part.mass.centroid.forEach((value,i) => near(value,centroid[i]));
  near((await f.bodies()).bodies.find(body => body.key === 'b5').volume, part.mass.volume);
  f.report.observations.push({ label, station, donorFace, volume: part.mass.volume, centroid: part.mass.centroid, hash: part.hash, gap: part.topology.maximumPcurveGap });
  return part.hash;
}
const open = doc => ({ name: `perpendicular-${cap}-reference.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });

await f.run(async () => {
  await f.newPage();
  await f.openFile(open(source), 5);
  await f.same(source);
  const original = (await f.inspect('original',source)).find(item => item.key === 'b1');
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  f.phase = `pick the original annular ${cap} face`;
  const filter = button('Selection filter');
  for (let i = 0; i < 4 && (await filter.innerText()).trim() !== 'Faces'; i++) await filter.click();
  assert.equal((await filter.innerText()).trim(),'Faces');
  await pick(...sourcePick);
  const capIndex = original.mesh.find(([name]) => name === primary)[1];
  await f.page.waitForFunction(index => {
    const picked = window.__studioSelection.selection.faces[0];
    return picked?.face === index && window.__studioBodies().bodies[picked.body]?.key === 'b1';
  }, capIndex);
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = hud('Offset face');
  if (baseline) {
    await status(panel,'preview');
    assert.equal(await field(panel,'Mode').count(),0);
    await f.same(source);
    await f.snapshot('00-original-cap-distance-only');
    return;
  }
  await field(panel,'Mode').selectOption('to-plane');
  await pick(...refusedPick);
  await status(panel,'refused');
  assert.match(await panel.locator('.hud-error').innerText(), /parallel/i);
  assert.ok(await button('Apply',panel).isDisabled());
  await f.same(source);
  await f.snapshot('01-nonparallel-donor-refused');
  await pick(...firstDonor.pick);
  await status(panel,'preview');
  await panel.getByText(firstDonor.face, { exact: false }).waitFor();
  await f.same(source);
  await f.snapshot('02-parallel-donor-preview');
  await button('Apply',panel).click();
  await f.changed(source);
  const first = (await f.snapshot('03-cap-aligned')).doc, node = first.nodes[5];
  assert.deepEqual([node.kind,node.parent,node.faces,node.target.feature,node.target.body,node.target.face],
    ['offset-face',solid(1),[primary],'n4',solid(4),firstDonor.face]);
  assert.equal(Object.hasOwn(node,'distance'),false);
  await verify('first-native',first,original,firstDonor.station,firstDonor.face);

  await f.openFeatureEditor(4,'move the same donor by 8 mm');
  await field(f.editor(),inlet ? 'ΔX' : 'ΔZ').fill(inlet ? '8' : '-8');
  const moved = (await f.applyEditor(first,'04-donor-moved')).doc;
  assert.deepEqual(moved.nodes[5],node);
  await verify('moved-native',moved,original,movedStation,firstDonor.face);
  await button('Iso',f.page.locator('.views')).click();
  await f.snapshot('05-cap-follows-donor');

  await f.openFeatureEditor(5,'reselect the parallel face in History');
  await button('Edit offset',f.editor()).click();
  const edit = hud('Edit Offset face');
  assert.equal(await field(edit,'Mode').inputValue(),'to-plane');
  await pick(...secondDonor.pick);
  await status(edit,'preview');
  await edit.getByText(secondDonor.face,{exact:false}).waitFor();
  await f.same(moved);
  await f.snapshot('06-retarget-preview');
  await button('Apply',edit).click();
  await f.changed(moved);
  const retargeted = (await f.snapshot('07-cap-retargeted')).doc;
  assert.deepEqual(retargeted.nodes[5].sigs,node.sigs);
  assert.equal(retargeted.nodes[5].target.face,secondDonor.face);
  const result = await verify('retarget-native',retargeted,original,secondDonor.station,secondDonor.face);
  await f.undo(); await f.same(moved);
  await f.redo(); await f.same(retargeted);
  const saved = await f.save('native-annular-plane-offset');
  await f.freshOpen(saved.file,retargeted,'08-native-open');
  assert.equal(await verify('reopened-native',await f.doc(),original,secondDonor.station,secondDonor.face),result);

  const collapsed = { ...retargeted, nodes: retargeted.nodes.map((node,i) => i === 4 ? { ...node, offset:collapseTranslation } : node) };
  await f.dismissToasts();
  await f.page.getByLabel('Model file',{exact:true}).setInputFiles(open(collapsed));
  await f.waitToast(inlet ? /reach or cross the retained inlet-to-bend join/i : /reach or cross the retained bend-to-outlet join/i);
  await f.same(retargeted);
  await f.snapshot('09-collapse-keeps-open-document');
});
