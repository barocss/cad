import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const f = await createFlow({
  name: 'guided-junction', envFrozen: 'GUIDED_JUNCTION_FROZEN', output: process.argv[2],
  qualification: '#753 create the guided handle junction in desktop Studio',
  limits: ['One regular triangular chart, a planar donor and one cubic interior guide. Stored in Direct as an open trimmed surface.'],
  initialFiles: ['apps/cad-studio/test/guided-junction-browser.mjs'],
  requiredFrozen: [
    'apps/cad-studio/src/app/useDirectFill.ts', 'apps/cad-studio/src/ui/DirectFillPanel.tsx',
    'packages/barocss-cad-model/src/engine/direct.ts', 'packages/barocss-cad-model/src/engine/guidedJunction.ts',
    'packages/barocss-cad-model/src/engine/trim.ts',
  ],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { buildBrep, checkBrep, evaluateCurve, evaluateSurface, lineCurve, surfaceD1Evaluator } from '@barocss/cad';
import { geometryOf } from '@barocss/cad-model/engine/direct';
import { keptAt, trimmedMesh } from '@barocss/cad-model/engine/trim';
const { direct } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const object = name => direct.objects.find(o => o.id === name || o.name === name);
const geometry = name => geometryOf(direct, object(name));
const patch = geometry('Guided Fill'), d1 = surfaceD1Evaluator(patch);
const traces = [
  ['bodyEdge', t => [t,0]], ['handleEdge', t => [1-t,t]], ['sideEdge', t => [0,t]],
  ['guide', t => [.25,.75*t]],
].map(([name, uv]) => ({name, maxGap: Math.max(...Array.from({length:65}, (_, i) => {
  const t = i/64, p = evaluateCurve(geometry(name),t), q = evaluateSurface(patch,...uv(t));
  return Math.hypot(...p.map((x,k) => x-q[k]));
}))}));
let maxBodyNormalComponent = 0, minProjectedJacobian = Infinity, minInteriorClearance = Infinity;
for (let i=0; i<=16; i++) for (let j=0; i+j<=16; j++) {
  const {point:[x,y],du,dv} = d1(i/16,j/16);
  minProjectedJacobian = Math.min(minProjectedJacobian,du[0]*dv[1]-du[1]*dv[0]);
  if (j===0) maxBodyNormalComponent = Math.max(maxBodyNormalComponent, Math.abs(dv[2]), Math.abs(du[2]));
  // Away from the three shared seams, each original face lies in the opposite projected half-plane.
  if (i>=2 && j>=2 && i+j<=14)
    minInteriorClearance = Math.min(minInteriorClearance,x,y,(1-x/30-y/24)/Math.hypot(1/30,1/24));
}
const trim = object('Guided Fill').trims;
const normals = new Map(['Guided Fill', 'body', 'leftShoulder', 'rightShoulder'].map(name =>
  [name, surfaceD1Evaluator(geometry(name))]));
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const normal = (name, u, v) => { const {du,dv} = normals.get(name)(u,v); return cross(du,dv); };
const angle = (a,b) => Math.atan2(Math.hypot(...cross(a,b)), a.reduce((n,x,i) => n+x*b[i],0)) * 180 / Math.PI;
const angles = [0,0,0];
for (let i=0; i<=64; i++) {
  const t = i/64, n = (u,v) => normal('Guided Fill',u,v);
  angles[0] = Math.max(angles[0],angle(n(t,0),normal('body',t,1)));
  angles[1] = Math.max(angles[1],angle(n(0,t),normal('leftShoulder',1,t)));
  angles[2] = Math.max(angles[2],angle(n(1-t,t),normal('rightShoulder',0,t)));
}
const use = (edge, a, b, sense='forward') => ({ edge, sense, pcurve: lineCurve('uv_'+edge,[...a,0],[...b,0]) });
const face = (id, geometryName, uses) => ({ id, surface:geometry(geometryName), sense:'forward', loops:[{kind:'outer',uses}] });
const points = { a:[0,0,0], b:[30,0,0], c:[0,24,12], lo:[-7.5,0,0], lt:[-7.5,24,12],
  ro:[37.5,0,0], rt:[7.5,24,12], ba:[0,-12,0], bb:[30,-12,0] };
const edges = [
  ...[['ab','a','b','bodyEdge'], ['ac','a','c','sideEdge'], ['bc','b','c','handleEdge']]
    .map(([id,a,b,name]) => ({id,vertices:[a,b],curve:geometry(name)})),
  ...[['lb','lo','a'], ['lt','c','lt'], ['rb','b','ro'], ['rt','rt','c'], ['bb','ba','bb'], ['br','bb','b'], ['bl','ba','a']]
    .map(([id,a,b]) => ({id,vertices:[a,b],curve:lineCurve(id,points[a],points[b])})),
  ...[['lo','lo','lt',[-7.5,12,0]], ['ro','ro','rt',[22.5,12,0]]].map(([id,a,b,mid]) => ({
    id, vertices:[a,b], curve:{kind:'curve',id,degree:2,knots:[0,0,0,1,1,1],weights:[1,1,1],controlPoints:[points[a],mid,points[b]]},
  })),
];
const sheet = buildBrep({
  source:{family:'guided-junction-readback',id:'junction'}, vertices:Object.entries(points).map(([id,point]) => ({id,point})), edges,
  bodies:[{id:'junction',kind:'sheet',shells:[{id:'shell',closed:false,faces:[
    face('patch','Guided Fill',[use('ab',[0,0],[1,0]),use('bc',[1,0],[0,1]),use('ac',[0,0],[0,1],'reversed')]),
    face('body','body',[use('bb',[0,0],[1,0]),use('br',[1,0],[1,1]),use('ab',[0,1],[1,1],'reversed'),use('bl',[0,0],[0,1],'reversed')]),
    face('left','leftShoulder',[use('lb',[0,0],[1,0]),use('ac',[1,0],[1,1]),use('lt',[1,1],[0,1]),use('lo',[0,0],[0,1],'reversed')]),
    face('right','rightShoulder',[use('rb',[0,0],[1,0]),use('ro',[1,0],[1,1]),use('rt',[1,1],[0,1]),use('bc',[0,0],[0,1],'reversed')]),
  ]}]}],
});
const topology = checkBrep(sheet,{strict:true,pcurveSamples:65});
const shared = edges.filter(edge => sheet.coedges.filter(use => use.edge===edge.id && use.twin).length===2).map(edge=>edge.id);
const openUses = sheet.coedges.filter(use=>use.twin===null).length;
const bad = structuredClone(sheet);
bad.bodies[0].kind='solid'; bad.shells[0].closed=true;
const mesh = trimmedMesh(patch,trim);
let maxUVSum = 0;
for (let i=0;i<mesh.positions.length;i+=3) maxUVSum = Math.max(maxUVSum,mesh.positions[i]/30+mesh.positions[i+1]/24);
console.log(JSON.stringify({ traces, maxBodyNormalComponent, minProjectedJacobian, minInteriorClearance, trim,
  kept: [[.25,.5],[.75,.75]].map(([u,v]) => keptAt(trim,u,v,1,1)), guidedPoint: evaluateSurface(patch,.25,.5),
  angles, topology:{valid:topology.valid, counts:topology.counts, shared, openUses, pcurveGap:topology.maximumPcurveGap,
    closureAccepted:checkBrep(bad).valid}, maxUVSum }));
`,
});
const bknots = degree => [...Array(degree + 1).fill(0), ...Array(degree + 1).fill(1)];
const curves = {
  bodyEdge: [[0, 0, 0], [30, 0, 0]],
  handleEdge: [[30, 0, 0], [15, 12, 0], [0, 24, 12]],
  sideEdge: [[0, 0, 0], [0, 12, 0], [0, 24, 12]],
  guide: [[7.5, 0, 0], [7.5, 6, 0], [7.5, 12, 5.625], [7.5, 18, 6.75]],
  disconnected: [[7.5, 0, 0], [7.5, 6, 0], [7.5, 12, 5.625], [7.5, 18, 7]],
};
const curveSource = poles => `@model junction { version:0; length-unit:mm;
  @curve #shape { type:nurbs; degree:${poles.length - 1}; knots:${JSON.stringify(bknots(poles.length - 1))};
    control-points:${JSON.stringify(poles)}; weights:${JSON.stringify(poles.map(() => 1))}; } }`;
const surfaceSource = (points, p, q) => `@model junction { version:0; length-unit:mm;
  @surface #shape { type:nurbs; degree-u:${p}; degree-v:${q}; knots-u:${JSON.stringify(bknots(p))}; knots-v:${JSON.stringify(bknots(q))};
    control-points:${JSON.stringify(points)}; weights:${JSON.stringify(points.map(row => row.map(() => 1)))}; } }`;
const source = Object.fromEntries(Object.entries(curves).map(([id, poles]) => [id, curveSource(poles)]));
source.body = surfaceSource([[[0,-12,0],[0,0,0]],[[30,-12,0],[30,0,0]]], 1, 1);
const shoulder = rows => surfaceSource(rows.map(row => row.map((x,j) => [x,12*j,[0,0,12][j]])),1,2);
source.leftShoulder = shoulder([[-7.5,-7.5,-7.5],[0,0,0]]);
source.rightShoulder = shoulder([[30,15,0],[37.5,22.5,7.5]]);
const object = id => ({ id, name: id, geometry: 'shape', source: id });
const boundary = { format:'barocss-cad-model', schema:3, units:'mm', parameters:{}, nodes:[], outputs:{}, nextId:0,
  direct: { sources: source, objects: Object.keys(source).map(object) } };
const trim = [{ keep:'inside', uv:[[0,0],[1,0],[0,1]] }];
const file = (name, doc) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
const btn = name => f.page.getByRole('button', { name, exact: true });
const row = id => f.page.locator('.outliner .ol.direct').getByText(id, { exact: true });
await f.run(async () => {
  await f.newPage();
  f.phase = 'Current Direct Fill refuses the interior guide as a fourth boundary';
  await f.openFile(file('guided-junction-inputs.bcad', boundary), 0);
  await f.same(boundary);
  await btn('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row('bodyEdge').click();
  for (const id of ['handleEdge','sideEdge','guide']) await row(id).click({ modifiers:['Shift'] });
  const history = async () => [await btn('Undo').isEnabled(), await btn('Redo').isEnabled()];
  const before = await history();
  await btn('Fill the loop').click();
  await f.waitToast(/do not meet end to end|do not close into a loop/i);
  await f.same(boundary);
  assert.deepEqual(await history(), before);
  await f.snapshot('01-existing-fill-refusal');
  await f.dismissToasts();

  f.phase = 'Refuse a disconnected guide and keep the original document';
  const choose = async guide => {
    await row('body').click();
    for (const id of ['sideEdge','handleEdge','bodyEdge',guide]) await row(id).click({modifiers:['Shift']});
  };
  const panel = () => f.page.getByRole('complementary',{name:'Guided Fill',exact:true});
  const apply = () => panel().getByRole('button',{name:'Apply',exact:true});
  const enter = async guide => {
    await btn('Guided Fill').click();
    await panel().getByLabel('G1 seam').selectOption('bodyEdge');
    await panel().getByLabel('Interior guide').selectOption(guide);
  };
  const cancel = async () => {
    await panel().getByRole('button',{name:'Cancel'}).click();
    await panel().waitFor({state:'hidden'});
  };
  await choose('disconnected');
  await enter('disconnected');
  assert.match(await panel().getByRole('alert').innerText(), /guide|boundary/i);
  assert.equal(await apply().isEnabled(), false);
  await f.same(boundary);
  assert.deepEqual(await history(), before);
  await f.snapshot('02-disconnected-guide-refusal');
  await cancel();

  f.phase = 'Preview and apply the open guided patch';
  await choose('guide');
  await enter('guide');
  assert.equal(await apply().isEnabled(), true);
  assert.match(await panel().innerText(), /G0 boundaries\s+(sideEdge, handleEdge|handleEdge, sideEdge)/);
  assert.match(await panel().innerText(), /Open surface/);
  await f.same(boundary);
  assert.deepEqual(await history(), before);
  await f.snapshot('03-guided-preview');
  await cancel();
  await f.same(boundary);
  assert.deepEqual(await history(), before);
  await enter('guide');
  await apply().click();
  await f.changed(boundary);
  const accepted = await f.doc();
  assert.equal(accepted.direct.objects.length, boundary.direct.objects.length+1);
  assert.deepEqual(accepted.direct.objects.slice(0,-1), boundary.direct.objects);
  for (const [key,text] of Object.entries(source)) assert.equal(accepted.direct.sources[key],text);
  const native = await f.inspect('native', accepted);
  assert.ok(native.traces.every(trace=>trace.maxGap < 1e-12));
  assert.equal(native.maxBodyNormalComponent,0);
  assert.ok(Math.abs(native.minProjectedJacobian-720) < 1e-9);
  assert.ok(Math.abs(native.minInteriorClearance - .125/Math.hypot(1/30,1/24)) < 1e-12);
  assert.deepEqual(native.kept,[true,false]);
  assert.deepEqual(native.guidedPoint,[7.5,12,4.5]);
  assert.deepEqual(native.trim,trim);
  assert.ok(native.maxUVSum < 1+1e-6);
  assert.deepEqual(native.topology,{valid:true,
    counts:{bodies:1,shells:1,faces:4,loops:4,coedges:15,edges:12,vertices:9},
    shared:['ab','ac','bc'],openUses:9,pcurveGap:0,closureAccepted:false});
  assert.ok(native.angles[0]<1e-10 && native.angles[1]>21 && native.angles[2]>38);
  await f.snapshot('04-guided-applied');
  await f.undo();
  await f.same(boundary);
  await f.redo();
  await f.same(accepted);
  assert.deepEqual(await f.inspect('redone',await f.doc()),native);
  const saved = await f.save('guided-junction');
  await f.freshOpen(saved.file,accepted,'05-guided-fresh-open');
  assert.deepEqual(await f.inspect('opened',await f.doc()),native);
  f.report.observations.push(native);
});
