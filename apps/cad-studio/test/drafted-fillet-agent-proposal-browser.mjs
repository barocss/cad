import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';
import { box, inspectorSource, oracleSource } from './drafted-extrude-variable-fillet-oracle.mjs';

const output = process.argv[2];
assert.ok(output && relative(resolve(import.meta.dirname, '../../..'), resolve(output)).startsWith('../'));
const pins = [
  'apps/cad-studio/test/drafted-extrude-variable-fillet-oracle.mjs', 'apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/server/cadDoc.ts', 'apps/cad-studio/server/cadMcp.ts',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/state/useProposalPreview.ts', 'apps/cad-studio/src/ui/ProposalBrowser.tsx',
  'packages/barocss-cad-model/src/chat/part/proposals.ts', 'packages/barocss-cad-model/src/chat/part/nativeContinuity.ts',
  'packages/barocss-cad-model/src/chat/part/features.ts', 'packages/barocss-cad-model/src/engine/mesh.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts',
];
const f = await createFlow({
  name: 'drafted-fillet-agent-proposal', envFrozen: 'D1272_SOURCE_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Discover a drafted rim with local stdio MCP, preview the proposal in Studio, approve it and reopen the native result.',
  limits: ['One drafted extrusion at 12 degrees, one native shared edge, one circular four-radius fillet, local autonomy L1.'],
  inspectorSource, oracleSource,
});
const mcp = (path, label, run) => withMcpSession({ app: f.app, output, clientName: 'barocss-drafted-fillet-test' }, path, label, run);
const angle = 12;
const stock = { ...box, nodes: [box.nodes[0], { ...box.nodes[1], draft: angle }] };
const title = 'Fillet the front drafted rim';
const values = { radius: 1.25, endRadius: 2.5, stationMode: 'two-interior', stationAt: 25, stationRadius: 3, station2At: 62.5, station2Radius: 1 };
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const card = () => f.page.getByRole('listitem', { name: 'Proposal P1', exact: true });

async function inspect(doc, label, edge) {
  const [worker] = (await f.bodies()).bodies;
  const source = await f.inspect(label+'-stock', stock);
  const actual = await f.inspect(label+'-fillet', doc);
  assert.equal(worker.key, actual.key);
  await f.runOracle({ stock: source, actual, angle, edge, studioVolume: worker.volume }, label);
  f.report.observations.push({ label, nativeHash: actual.sha, workerVolume: worker.volume });
  return actual;
}
async function shownBody(key) {
  await f.page.waitForFunction(key => {
    const shown=window.__studioSection?.();
    return shown?.shownKeys?.length===1 && shown.shownKeys[0]===key;
  }, key);
  return f.page.evaluate(() => window.__studioSection().shownVolume);
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Discover a unique native edge and propose its four-radius fillet in MCP';
  const file = join(output, 'pending-agent.bcad'), original = Buffer.from(JSON.stringify(stock));
  await writeFile(file, original, { flag: 'wx' });
  const witness = await mcp(file, 'pending', async call => {
    const before = await call('query',{action:'summary'});
    assert.equal(before.feature_count,2);
    assert.equal(before.bodies.length,1);
    const body=before.bodies[0].key;
    const found=await call('query',{action:'native_joints',body});
    const candidates=found.edges.filter(e=>e.faces.includes('n1.side0') && e.faces.includes('n1.top'));
    assert.equal(candidates.length,1);
    const [edge]=candidates;
    assert.match(found.revision,/^[a-f0-9]{64}$/);
    const measured=await call('query',{action:'edge_curvature',body,edgeId:edge.id,expectedRevision:found.revision});
    assert.equal(measured.edgeId,edge.id);
    assert.equal(measured.minimum,0);
    assert.equal(measured.maximum,0);
    const help=await call('describe',{command:'fillet'});
    assert.match(help.values.stationMode,/two-interior/);
    assert.match(help.values.station2At,/after stationAt/);
    const args={action:'command',command:'fillet',edges:[edge.name],values};
    assert.match((await call('features',args,true)).error,/autonomy L1/i);
    assert.match((await call('proposals',{action:'propose',title,ops:[{tool:'features',args:{...args,values:{...values,station2At:25}}}]},true)).error,/position 2 after/i);
    assert.deepEqual(await readFile(file),original);
    const proposal=await call('proposals',{action:'propose',title,ops:[{tool:'features',args}]});
    assert.deepEqual([proposal.proposal,proposal.applied,proposal.change.volume],['P1',false,-19.129]);
    const pending=await readFile(file);
    assert.match((await call('proposals',{action:'accept',id:'P1'},true)).error,/user accepts proposals in the studio/i);
    assert.deepEqual(await readFile(file),pending);
    const unchanged=await call('query',{action:'summary'});
    assert.deepEqual(unchanged,before);
    return {body,edge,revision:found.revision,changeVolumeMM3:proposal.change.volume};
  });
  const pendingBytes=await readFile(file), pending=JSON.parse(pendingBytes);
  assert.deepEqual(pending.nodes,stock.nodes);
  assert.deepEqual(pending.outputs,stock.outputs);
  assert.deepEqual(pending.proposals.map(p=>[p.id,p.status]),[['P1','open']]);
  assert.deepEqual(pending.history.map(h=>h.kind),['proposal']);
  f.report.observations.push({label:'local-agent',...witness,pendingHash:sha256(pendingBytes)});

  f.phase = 'Preview without applying, flip to the original and hide';
  await f.newPage();
  const [choose] = await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
  await choose.setFiles(file);
  await f.same(pending);
  await button('Iso',f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  await button('Chat').first().click();
  await card().getByText(title,{exact:false}).waitFor();
  const baseMesh=await shownBody(witness.body);
  await button('Preview',card()).click();
  await button('Hide',card()).waitFor();
  const delta=card().getByLabel('Volume change');
  await delta.getByText('−19.13 mm³ (−0.18%)',{exact:true}).waitFor();
  const candidateMesh=await shownBody('b2');
  assert.ok(baseMesh-candidateMesh>18 && baseMesh-candidateMesh<20);
  await f.same(pending);
  await f.snapshot('pending-after-preview');
  await button('Show before',card()).click();
  assert.equal(await shownBody(witness.body),baseMesh);
  await f.same(pending);
  await f.snapshot('pending-before-preview');
  await button('Hide',card()).click();
  assert.equal(await shownBody(witness.body),baseMesh);
  await f.same(pending);
  assert.deepEqual(await readFile(file),pendingBytes);

  f.phase = 'Approve in Studio and compare the native part with the preview';
  await button('Preview',card()).click();
  await button('Hide',card()).waitFor();
  assert.equal(await shownBody('b2'),candidateMesh);
  await button('Accept',card()).click();
  await f.page.waitForFunction(() => window.__studioDoc?.proposals?.[0]?.status==='accepted');
  await f.ready();
  const accepted=await f.doc(), feature=accepted.nodes[2], history=accepted.history.at(-1);
  assert.deepEqual(accepted.nodes.slice(0,2),stock.nodes);
  assert.deepEqual([history.kind,history.proposal,history.by.agent,history.proposed_by.agent,accepted.proposals[0].decided.by],
    ['accept','P1','user','chat','user']);
  assert.deepEqual(feature.edges,[witness.edge.name]);
  assert.deepEqual(feature.radii.map(p=>p.radius),[1.25,3,1,2.5]);
  assert.deepEqual(feature.radii.slice(1,-1).map(p=>p.fraction),[.25,.625]);
  assert.equal(await shownBody('b2'),candidateMesh);
  const native=await inspect(accepted,'approved',witness.edge.name);
  await f.snapshot('studio-approved');
  await f.undo();
  await f.same(pending);
  assert.equal(await shownBody(witness.body),baseMesh);
  await f.redo();
  await f.same(accepted);

  f.phase = 'Reopen the approved part and verify the agent decision and native geometry';
  const saved=await f.save('approved-agent-fillet');
  await f.freshOpen(saved.file,accepted,'fresh-open');
  const reopened=await inspect(await f.doc(),'reopened',witness.edge.name);
  assert.equal(reopened.sha,native.sha);
  const savedBytes=await readFile(saved.file);
  await mcp(saved.file,'reopened',async call=>{
    const summary=await call('query',{action:'summary'});
    const restored=summary.features.find(row=>row.node.kind==='fillet')?.node;
    assert.equal(summary.feature_count,3);
    assert.equal(summary.facts.volume,10553.215);
    assert.deepEqual(restored,feature);
    const decided=await call('proposals',{action:'list',all:true});
    assert.deepEqual(decided.proposals.map(p=>[p.id,p.status]),[['P1','accepted']]);
    f.report.observations.push({label:'mcp-reopened',volumeMM3:summary.facts.volume,proposalStatus:'accepted',savedHash:sha256(savedBytes)});
  });
  assert.deepEqual(await readFile(saved.file),savedBytes);
  assert.deepEqual(await readFile(file),pendingBytes);
  f.report.observations.push({label:'studio-preview',baseMeshVolume:baseMesh,candidateMeshVolume:candidateMesh,displayDelta:'−19.13 mm³ (−0.18%)'});
});
