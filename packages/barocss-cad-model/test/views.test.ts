import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluatePart } from '../src/engine/evaluate';
import { directOps, emptyDirect, importSource } from '../src/engine/direct';
import { emptyDoc, rectanglePart, cylinderPart, withNode, type StudioDoc } from '../src/engine/doc';
import { revisionOf } from '../src/util/revision';
import { runTool, type ChatState } from '../src/chat/tools';
import { v2Result } from '../src/chat/groups';
import { directInspectionRevision } from '../src/chat/sweepSource';

// Views for an agent (A2.3): one PNG sheet of exact line views with numbered faces, and its legend.
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
async function stateOf(doc: StudioDoc): Promise<ChatState> { const r = await evaluate(doc); assert.ok(r.ok); return { doc, bodies: r.bodies }; }
const parse = (content: string) => JSON.parse(content) as Record<string, any>;

test('Direct image review pins visible display geometry and preserves literal IDs in the public result', async () => {
  const source = `@model rails {version:0;length-unit:mm;
    @curve #a {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,0,0],[20,0,0]];weights:[1,1];}
    @curve #b {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,10,0],[20,10,5]];weights:[1,1];}
  }`;
  const rails = importSource(emptyDirect(), source, 'Rails');
  const direct = directOps.ruledSurface(rails, rails.objects[0].id, rails.objects[1].id);
  direct.objects[0] = { ...direct.objects[0], id: 'get_part_summary', name: 'run_command' };
  const state = { doc: { ...emptyDoc(), direct }, bodies: [] };
  const pin = directInspectionRevision(state.doc);
  const read = async (current: ChatState, extra: Record<string, unknown> = {}) =>
    runTool(current, 'query', { action: 'render', expectedDirectRevision: pin, ...extra }, async () => { throw new Error('Unexpected part evaluation'); });
  const image = await read(state);
  assert.ok(!image.isError, image.content);
  const { directObjects, revision, imageSha256 } = parse(v2Result(image.content, 'render_views'));
  assert.equal(revision, pin);
  assert.deepEqual(directObjects[0], { id: 'get_part_summary', name: 'run_command', kind: 'curve' });
  assert.equal(imageSha256, createHash('sha256').update(Buffer.from(image.images![0].data, 'base64')).digest('hex'));
  assert.equal(image.state.doc, state.doc);
  assert.equal(image.changed, false);
  const edited = { ...state, doc: { ...state.doc, direct: { ...direct, objects: direct.objects.map(object => ({ ...object, hidden: true })) } } };
  for (const [current, args, code] of [
    [edited, {}, 'DIRECT_RENDER_STALE'],
    [edited, { expectedDirectRevision: directInspectionRevision(edited.doc) }, 'DIRECT_RENDER_EMPTY'],
    [state, { expectedRevision: revisionOf(state.doc) }, 'DIRECT_RENDER_INPUT'],
    [state, { section: { axis: 'z', at: 1 } }, 'DIRECT_RENDER_INPUT'],
    [{ ...state, partOf: 'p1' }, {}, 'DIRECT_RENDER_SCOPE'],
  ] as const) {
    const refused = await read(current, args);
    assert.equal(parse(refused.content).code, code);
    assert.equal(refused.images, undefined);
    assert.equal(refused.state, current);
  }
});

test('render_views: a 1000 × 1000 PNG of four views, faces numbered with a legend, highlight and section', async () => {
  let s = await stateOf(rectanglePart(40, 20, 8));
  s = (await runTool(s, 'run_command', { command: 'hole', faces: ['n1.top'], values: { d: 8, x: 20, y: 10 } }, evaluate)).state;
  const t = performance.now(), r = await runTool(s, 'render_views', { highlight: ['n1.top'] }, evaluate), ms = performance.now() - t;
  assert.ok(!r.isError, r.content);
  const out = parse(r.content), png = Buffer.from(r.images![0].data, 'base64');
  if (process.env.VIEWS_OUT) writeFileSync(process.env.VIEWS_OUT, png);
  assert.equal(out.revision, parse((await runTool(s, 'query', { action: 'rebuild' }, evaluate)).content).revision);
  assert.equal(out.imageSha256, createHash('sha256').update(png).digest('hex'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1000, 1000]);
  assert.ok(png.length < 200_000, `${png.length} bytes`);
  assert.ok(Object.values(out.legend).includes('n1.top'), JSON.stringify(out.legend));
  assert.ok(out.views.top.visible_faces.includes('n1.top') && !out.views.top.visible_faces.includes('n1.bottom'));
  assert.ok(out.views.iso.visible_faces.includes('n2.side0'), 'the bore shows in the isometric view');
  assert.ok(ms < 5000, `${ms} ms`);
  // The same again: from the cache.
  const t2 = performance.now(); await runTool(s, 'render_views', { highlight: ['n1.top'] }, evaluate); assert.ok(performance.now() - t2 < 50);
  const cut = await runTool(s, 'render_views', { section: { axis: 'y', at: 10 } }, evaluate);
  assert.ok(!cut.isError, cut.content);
  assert.ok(parse(cut.content).views.front.visible_faces.some((n: string) => n.includes('.cut')), JSON.stringify(parse(cut.content).views.front));
});

test('query.render checks an optional rebuild revision before rendering and pins section images to the source', async () => {
  const s = await stateOf(rectanglePart(30, 15, 6)), before = structuredClone(s.doc);
  const rebuild = await runTool(s, 'query', { action: 'rebuild' }, evaluate);
  assert.ok(!rebuild.isError, rebuild.content);
  const revision = parse(rebuild.content).revision;
  const pinned = await runTool(s, 'query', { action: 'render', expectedRevision: revision, section: { axis: 'z', at: 3 } }, evaluate);
  assert.ok(!pinned.isError, pinned.content);
  const view = parse(pinned.content);
  assert.equal(view.revision, revision);
  assert.equal(view.imageSha256, createHash('sha256').update(Buffer.from(pinned.images![0].data, 'base64')).digest('hex'));
  assert.equal(pinned.changed, false);
  assert.equal(pinned.state.doc, s.doc);
  assert.deepEqual(s.doc, before);
  const neverEvaluate = async () => { throw new Error('a refused render must not evaluate a section'); };
  for (const expectedRevision of ['', 'short', 'a'.repeat(64), 'A'.repeat(16), null, 0]) {
    const refused = await runTool(s, 'query', { action: 'render', expectedRevision }, neverEvaluate);
    assert.equal(refused.isError, true);
    assert.equal(parse(refused.content).code, 'RENDER_INPUT');
    assert.equal(refused.images, undefined);
    assert.equal(refused.state, s);
  }
  const changed = await stateOf(rectanglePart(31, 15, 6));
  const stale = await runTool(changed, 'query', { action: 'render', expectedRevision: revision, section: { axis: 'z', at: 3 } }, neverEvaluate);
  assert.equal(stale.isError, true);
  assert.equal(parse(stale.content).code, 'RENDER_STALE');
  assert.equal(parse(stale.content).revision, revisionOf(changed.doc));
  assert.equal(parse(stale.content).expectedRevision, revision);
  assert.equal(stale.images, undefined);
  assert.equal(stale.state, changed);
});

test('review pins follow document changes and cached images follow the supplied bodies', async () => {
  const master = withNode(withNode(rectanglePart(20, 10, 4), { kind: 'sketch', profile: 'circle', center: [35, 5], radius: 4 }), { kind: 'extrude', sketch: 2, height: 12 });
  const combined = await stateOf(master);
  assert.equal(combined.bodies.length, 2);
  const full = await runTool(combined, 'query', { action: 'render' }, evaluate);
  const subset = await runTool({ ...combined, bodies: [combined.bodies[0]] }, 'query', { action: 'render' }, evaluate);
  assert.ok(!full.isError && !subset.isError, full.content + subset.content);
  assert.equal(parse(full.content).revision, parse(subset.content).revision);
  assert.notEqual(parse(full.content).imageSha256, parse(subset.content).imageSha256);
  const empty = await runTool({ ...combined, bodies: [] }, 'query', { action: 'render' }, evaluate);
  assert.equal(empty.isError, true);
  assert.match(parse(empty.content).error, /no body to show/);
  assert.equal(empty.images, undefined);
  // An unused parameter changes the rebuild revision without changing the rendered geometry.
  const changed = await stateOf({ ...master, parameters: { ...master.parameters, spare: 1 } });
  const updated = await runTool(changed, 'query', { action: 'render' }, evaluate);
  assert.ok(!full.isError && !updated.isError, full.content + updated.content);
  assert.notEqual(parse(full.content).revision, parse(updated.content).revision);
  assert.equal(parse(full.content).imageSha256, parse(updated.content).imageSha256);
});

test('part-scoped render uses the same scoped revision as rebuild and preserves the root document', async () => {
  const part = cylinderPart(4, 12);
  const s = await stateOf({ ...rectanglePart(40, 30, 8), instances: [{ id: 'p1', name: 'Pin', doc: part, position: [50, 0, 0], rotation: [0, 0, 0], grounded: true }] });
  const before = structuredClone(s.doc);
  const rebuild = await runTool(s, 'query', { action: 'rebuild', part: 'p1' }, evaluate);
  assert.ok(!rebuild.isError, rebuild.content);
  const pin = parse(rebuild.content);
  assert.equal(pin.part, 'p1');
  assert.notEqual(pin.revision, revisionOf(s.doc));
  const out = await runTool(s, 'query', { action: 'render', part: 'p1', expectedRevision: pin.revision }, evaluate);
  assert.ok(!out.isError, out.content);
  assert.equal(parse(out.content).part, 'p1');
  assert.equal(parse(out.content).revision, pin.revision);
  assert.equal(parse(out.content).imageSha256, createHash('sha256').update(Buffer.from(out.images![0].data, 'base64')).digest('hex'));
  assert.equal(out.changed, false);
  assert.equal(out.state.doc, s.doc);
  assert.deepEqual(s.doc, before);
  const stale = await runTool(s, 'query', { action: 'render', part: 'p1', expectedRevision: revisionOf(s.doc) }, evaluate);
  assert.equal(stale.isError, true);
  assert.equal(parse(stale.content).code, 'RENDER_STALE');
  assert.equal(stale.images, undefined);
});


test('opposite solid views identify their actual directions and isolate cached images by orientation', async () => {
  const block = await stateOf(rectanglePart(40, 20, 8));
  const { state } = await runTool(block, 'run_command', { command: 'hole', faces: ['n1.top'], values: { d: 8, x: 8, y: 6 } }, evaluate);
  const read = (extra: Record<string, unknown> = {}) => runTool(state, 'query', { action: 'render', ...extra }, evaluate);
  const standard = await read();
  assert.ok(!standard.isError, standard.content);
  const original = parse(v2Result(standard.content, 'render_views'));
  const opposite = await read({ orientation: 'opposite' });
  assert.ok(!opposite.isError, opposite.content);
  const image = parse(v2Result(opposite.content, 'render_views'));
  assert.deepEqual(Object.keys(image.views), ['back', 'top', 'left', 'iso']);
  assert.equal(image.orientation, 'opposite');
  assert.match(image.layout, /back .*left/);
  assert.equal(image.revision, original.revision);
  assert.notEqual(image.imageSha256, original.imageSha256);
  assert.equal(image.imageSha256, createHash('sha256').update(Buffer.from(opposite.images![0].data, 'base64')).digest('hex'));
  assert.equal((await read({ orientation: 'standard' })).content, standard.content);
  assert.deepEqual((await read({ orientation: 'standard' })).images, standard.images);
  assert.deepEqual((await read({ orientation: 'opposite' })).images, opposite.images);
  assert.equal(parse((await read({ orientation: 'opposite', section: { axis: 'y', at: 10 } })).content).code, 'RENDER_ORIENTATION_SCOPE');
  assert.equal(opposite.state.doc, state.doc);
  assert.equal(opposite.changed, false);
});
