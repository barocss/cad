import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, subdBrep, validateCage } from '@barocss/cad';
import { evaluatePart } from '../src/engine/evaluate';
import { emptyDoc, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { dispatchTool, runTool, TOOLS, type ChatState } from '../src/chat/tools';
import { fullCage } from '../src/subd/cageEdit';

// R8.2 (D83): the agent's SubD cage tools — the editor's steps on a subd node, each one checked: the cage a manifold,
// the kernel's body valid; moves are value edits, topology changes proposals at autonomy L2.
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
const parse = (content: string) => JSON.parse(content) as Record<string, any>;
type Subd = Extract<ModelNode, { kind: 'subd' }>;
async function boxState(n = 2): Promise<ChatState> {
  const made = await dispatchTool({ doc: emptyDoc(), bodies: [] }, 'run_command', { command: 'subd-box', values: { w: 30, d: 20, h: 16, n, x: 0, y: 0, z: 0 } }, evaluate);
  assert.ok(!made.isError, made.content);
  return made.state;
}
const subdIndex = (s: ChatState) => s.doc.nodes.findIndex(n => n.kind === 'subd');
const cageOf = (s: ChatState) => (s.doc.nodes[subdIndex(s)] as Subd).cage;
/** The body the kernel builds from the node valid, and its volume. */
function sound(s: ChatState): number {
  const node = s.doc.nodes[subdIndex(s)] as Subd, b = subdBrep(fullCage({ cage: node.cage, ...(node.mirror ? { mirror: node.mirror } : {}) }));
  assert.equal(checkBrep(b).valid, true, checkBrep(b).issues[0]);
  assert.equal(validateCage(fullCage({ cage: node.cage, ...(node.mirror ? { mirror: node.mirror } : {}) })).valid, true);
  return s.bodies.reduce((v, x) => v + (x.volume ?? 0), 0);
}

test('R8.2 the tools listed for the agent; subd_cage and subd_select read without changing the part', async () => {
  for (const n of ['subd_cage', 'subd_select', 'subd_move', 'subd_scale', 'subd_rotate', 'subd_extrude', 'subd_insert_loop', 'subd_bridge', 'subd_fill', 'subd_weld', 'subd_crease', 'subd_delete']) assert.ok(TOOLS.some(t => t.name === n), n);
  const s = await boxState(), i = subdIndex(s);
  const info = await dispatchTool(s, 'subd_cage', { index: i }, evaluate), c = parse(info.content);
  assert.ok(!info.isError && !info.changed); assert.equal(c.faces, 24); assert.equal(c.vertices, 26); assert.equal(c.validation.valid, true); assert.equal(c.validation.poles, 8);
  const top = parse((await dispatchTool(s, 'subd_select', { index: i, what: 'faces', normal: [0, 0, 1] }, evaluate)).content);
  assert.match(top.cageRevision, /^[a-f0-9]{64}$/);
  assert.equal(top.cageRevision, c.cageRevision);
  assert.equal(top.count, 4); assert.ok(top.faces.every((f: any) => f.normal[2] > 0.99 && Math.abs(f.centre[2] - 16) < 1e-9));
  const corner = parse((await dispatchTool(s, 'subd_select', { index: i, what: 'faces', normal: [0, 0, 1], box: { min: [0, 0, 0] } }, evaluate)).content);
  assert.equal(corner.count, 1);
  const before = JSON.stringify(s.doc), tilted = [Math.sin(Math.PI / 18), 0, Math.cos(Math.PI / 18)];
  for (const tool of ['subd_select', 'subd']) {
    const args = { index: i, what: 'faces', normal: [0, 0, 1], ...(tool === 'subd' ? { action: 'select' } : {}) };
    const picked = await dispatchTool(s, tool, { ...args, withinAngle: 5 }, evaluate);
    assert.ok(!picked.isError && !picked.changed, picked.content);
    assert.deepEqual(parse(picked.content), top); assert.equal(picked.state.doc, s.doc);
    const defaultTilt = await dispatchTool(s, tool, { ...args, normal: tilted }, evaluate);
    assert.ok(!defaultTilt.isError && !defaultTilt.changed, defaultTilt.content);
    assert.deepEqual(parse(defaultTilt.content), top); assert.equal(defaultTilt.state.doc, s.doc);
    const narrowTilt = await dispatchTool(s, tool, { ...args, normal: tilted, withinAngle: 5 }, evaluate);
    assert.ok(!narrowTilt.isError && !narrowTilt.changed, narrowTilt.content);
    assert.deepEqual(parse(narrowTilt.content), { ok: true, faces: [], count: 0, cageRevision: top.cageRevision }); assert.equal(narrowTilt.state.doc, s.doc);
    const refused = await dispatchTool(s, tool, { ...args, within_deg: 5 }, evaluate);
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.match(parse(refused.content).error, /\[UNKNOWN_ARGUMENT\].*"within_deg"/);
    assert.match(parse(refused.content).error, /withinAngle/); assert.equal(refused.state.doc, s.doc);
  }
  assert.equal(JSON.stringify(s.doc), before);
  assert.match(parse((await dispatchTool(s, 'subd_cage', { index: 5 }, evaluate)).content).error, new RegExp(`no feature 5; the SubD features are ${i}`));
});

test('read the whole region within explicit creases from current face seeds', async () => {
  const initial = await boxState(), index = subdIndex(initial), cage = cageOf(initial);
  const upper = cage.faces.flatMap((face, id) => face.every(v => cage.positions[v * 3 + 2] === 16) ? [id] : []);
  assert.equal(upper.length, 4);
  const perimeter = new Map<string, [number, number]>();
  for (const id of upper) {
    const face = cage.faces[id];
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length], key = [a, b].sort((x, y) => x - y).join(':');
      if (!perimeter.delete(key)) perimeter.set(key, [a, b]);
    });
  }
  assert.equal(perimeter.size, 8);
  const creased = await dispatchTool(initial, 'subd_crease', { index, edges: [...perimeter.values()] }, evaluate);
  assert.ok(!creased.isError && creased.changed, creased.content);
  const state = creased.state;
  const info = parse((await dispatchTool(state, 'subd', { action: 'cage', index }, evaluate)).content);
  const args = { action: 'select', what: 'linked-within-creases', index, cageRevision: info.cageRevision,
    seedFaces: [upper.at(-1), upper[0], upper[0]], limit: 4 };
  for (const name of ['subd', 'subd_select']) {
    const { action, ...inputs } = args;
    const found = await dispatchTool(state, name, name === 'subd' ? {action,...inputs} : inputs, evaluate);
    assert.ok(!found.isError && !found.changed, found.content);
    const result = parse(found.content);
    assert.equal(result.cageRevision, info.cageRevision);
    assert.equal(result.count, 4);
    assert.deepEqual(result.faces.map((face: {face:number}) => face.face), upper);
    assert.equal(found.state.doc, state.doc);
  }
  const reject = async (nextState: ChatState, nextArgs: Record<string, unknown>, match: RegExp) => {
    const reply = await dispatchTool(nextState, 'subd', { ...args, ...nextArgs }, evaluate);
    assert.ok(reply.isError && !reply.changed, reply.content);
    assert.match(parse(reply.content).error, match);
    assert.equal(reply.state.doc, nextState.doc);
    assert.equal(parse(reply.content).faces, undefined);
  };
  await reject(state, { cageRevision: undefined }, /cage revision.*changed/i);
  await reject(initial, {}, /cage revision.*changed/i);
  await reject(state, { seedFaces: [] }, /seedFaces/);
  await reject(state, { seedFaces: [24] }, /seedFaces/);
  await reject(state, { limit: 3 }, /region has 4 faces.*limit of 3/);
  await reject(state, { limit: 501 }, /limit from 1 to 500/);
  await reject(state, { box: { min: [-1,-1,0] } }, /separate select/);
  await reject(state, { what: 'faces' }, /Use seedFaces and cageRevision/);
  await reject(state, { index: String(index) }, /index as an integer/);
  for (const feature of [{suppressed:true}, {held:'test'}] as const) {
    const doc = {...state.doc,nodes:state.doc.nodes.map((node,i)=>i===index?{...node,...feature}:node)};
    await reject({...state,doc}, {}, /Restore the active/);
  }
  await reject({ ...state, partOf: 'occurrence' }, {}, /base part/);
});

test('scale uses the exact selected cage revision and changes each selected point once', async () => {
  const state = await boxState(), index = subdIndex(state);
  const query = { action: 'select', index, what: 'faces', normal: [0, 0, 1], box: { min: [0, 0, 0] } };
  const selected = parse((await dispatchTool(state, 'subd', query, evaluate)).content);
  assert.equal(selected.count, 1);
  const [{ face, centre }] = selected.faces;
  const args = { action: 'scale', index, cageRevision: selected.cageRevision, factor: 1.1, faces: [face, face] };
  const before = cageOf(state), vertices = new Set(before.faces[face]);
  const scaled = await dispatchTool(state, 'subd', args, evaluate);
  assert.ok(!scaled.isError && scaled.changed, scaled.content);
  assert.equal(parse(scaled.content).cage.new, undefined);
  const after = cageOf(scaled.state);
  before.positions.forEach((original, i) => {
    const pivot = centre[i % 3];
    if (vertices.has(Math.floor(i / 3))) assert.ok(Math.abs(after.positions[i] - (pivot + 1.1 * (original - pivot))) < 1e-12);
    else assert.equal(after.positions[i], original);
  });
  assert.deepEqual(after.faces, before.faces);
  assert.deepEqual(after.creases, before.creases);
  assert.ok(sound(scaled.state) > 0);
  const readBack = parse((await dispatchTool(scaled.state, 'subd', query, evaluate)).content);
  assert.notEqual(readBack.cageRevision, selected.cageRevision);
  const neverEvaluate = async () => { throw new Error('An invalid scale must stop before native evaluation'); };
  for (const [source, input] of [
    [scaled.state, args],
    [state, { ...args, factor: 0 }],
    [state, { ...args, factor: -1 }],
    [state, { ...args, factor: 1 }],
    [state, { ...args, faces: [] }],
    [state, { ...args, cageRevision: undefined }],
    [state, { ...args, index: null }],
    [state, { ...args, index: false }],
    [state, { ...args, index: '0' }],
  ] as const) {
    const refused = await dispatchTool(source, 'subd', input, neverEvaluate);
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state.doc, source.doc);
  }
  const stale = await dispatchTool(scaled.state, 'subd', args, neverEvaluate);
  assert.match(parse(stale.content).error, /cage revision.*changed/i);
  const placedState = { ...state, partOf: 'p1' };
  const placedPick = await dispatchTool(placedState, 'subd', query, neverEvaluate);
  assert.ok(!placedPick.isError && !placedPick.changed);
  assert.equal(parse(placedPick.content).cageRevision, undefined);
  const placedScale = await dispatchTool(placedState, 'subd', args, neverEvaluate);
  assert.match(parse(placedScale.content).error, /available on the base part/i);
  assert.equal(placedScale.state.doc, state.doc);
  const partArg = await dispatchTool(state, 'subd', { ...args, part: 'p1' }, neverEvaluate);
  assert.match(parse(partArg.content).error, /UNKNOWN_ARGUMENT.*"part"/);
  assert.equal(partArg.state.doc, state.doc);
});

test('signed rotation uses the exact current vertex or selection centre and refuses stale or invalid input', async () => {
  const state = await boxState(), index = subdIndex(state);
  const selection = parse((await dispatchTool(state, 'subd', { action: 'select', index, what: 'faces',
    normal: [0, 0, 1], box: { min: [0, 0, 0] } }, evaluate)).content);
  const [{ face, centre }] = selection.faces;
  const before = cageOf(state), vertices = new Set(before.faces[face]);
  const pivot=[0,10,16];
  const pivotVertex=Array.from({length:before.positions.length/3},(_,id)=>id)
    .find(id=>before.positions.slice(id*3,id*3+3).every((value,axis)=>value===pivot[axis]));
  assert.ok(pivotVertex!==undefined);
  const args={action:'rotate',index,axis:'z',degrees:15,faces:[face],cageRevision:selection.cageRevision};
  async function verify(degrees:number, anchor:number[], vertex?:number) {
    const result=await dispatchTool(state,'subd',{...args,degrees,...(vertex===undefined?{}:{pivotVertex:vertex})},evaluate);
    assert.ok(!result.isError && result.changed,result.content);
    assert.equal(parse(result.content).cage.new,undefined);
    const after=cageOf(result.state), theta=degrees*Math.PI/180, c=Math.cos(theta), s=Math.sin(theta);
    for(let id=0;id<before.positions.length/3;id++) {
      const p=before.positions.slice(3*id,3*id+3), actual=after.positions.slice(3*id,3*id+3);
      if(!vertices.has(id)){assert.deepEqual(actual,p);continue;}
      const x=p[0]-anchor[0], y=p[1]-anchor[1];
      const expected=[anchor[0]+c*x-s*y,anchor[1]+s*x+c*y,p[2]];
      assert.ok(actual.every((value,i)=>Math.abs(value-expected[i])<1e-12));
    }
    assert.deepEqual(after.faces,before.faces);
    assert.deepEqual(after.creases,before.creases);
    assert.ok(sound(result.state)>0);
    return result.state;
  }
  const turned=await verify(15,pivot,pivotVertex);
  await verify(-15,pivot,pivotVertex);
  await verify(15,centre);
  const neverEvaluate=async()=>{throw new Error('An invalid rotation must stop before evaluation');};
  for(const input of [
    {...args,pivotVertex:-1}, {...args,pivotVertex:100}, {...args,pivotVertex:1.5},
    {...args,pivotVertex:null}, {...args,pivotVertex:'0'}, {...args,axis:'n'}, {...args,degrees:Infinity},
    {...args,degrees:360}, {...args,part:'p1'},
  ]) {
    const refused=await dispatchTool(state,'subd',input,neverEvaluate);
    assert.ok(refused.isError && !refused.changed,refused.content);
    assert.equal(refused.state.doc,state.doc);
  }
  const stale=await dispatchTool(turned,'subd',{...args,pivotVertex},neverEvaluate);
  assert.match(parse(stale.content).error,/cage revision.*changed/i);
  assert.equal(stale.state.doc,turned.doc);
});

test('one oblique quad uses its winding normal and canonical U/V axes for signed rotation', async () => {
  const basis = [[1,8,-4],[8,1,4],[4,-4,-7]].map(vector=>vector.map(value=>value/9));
  const cage: Subd['cage'] = {
    positions: [[10,11,12],[10,20,30],[12,36,22],[21,45,22],[18,21,34],[12,27,4]].flat(),
    faces: [[3,4,1,2],[2,1,0,5]], creases:[[1,2]],
  };
  const doc = withNode(emptyDoc(),{kind:'subd',name:'Oblique',cage}), initial=await evaluate(doc);
  assert.ok(initial.ok);
  const state = {doc,bodies:initial.bodies};
  const read = async (s:ChatState)=>parse((await dispatchTool(s,'subd',{action:'cage',index:0},evaluate)).content).cageRevision;
  const args={action:'rotate',index:0,cageRevision:await read(state),faces:[0]};
  const normal=basis[2];
  const owners=new Set(cage.faces[0]);
  const axes=['face-u','face-v','face'];
  for(const [index,axis] of axes.entries()){
    for(const degrees of [15,-15]){
      for(const pivotVertex of [0,undefined]){
        const result=await dispatchTool(state,'subd',{...args,axis,degrees,pivotVertex},evaluate);
        assert.ok(!result.isError&&result.changed,result.content);
        const after=cageOf(result.state), pivot=pivotVertex===0?[10,11,12]:[15.25,30.5,27];
        const radians=degrees*Math.PI/180, cosine=Math.cos(radians), sine=Math.sin(radians);
        for(let v=0;v<cage.positions.length/3;v++){
          const original=cage.positions.slice(v*3,v*3+3), actual=after.positions.slice(v*3,v*3+3);
          if(!owners.has(v)){assert.deepEqual(actual,original);continue;}
          const p=original.map((value,i)=>value-pivot[i]);
          const local=basis.map(axis=>axis.reduce((sum,value,i)=>sum+value*p[i],0));
          const j=(index+1)%3,k=(index+2)%3,[u,w]=[local[j],local[k]];
          local[j]=cosine*u-sine*w;local[k]=sine*u+cosine*w;
          const expected=pivot.map((value,i)=>value+basis.reduce((sum,axis,k)=>sum+axis[i]*local[k],0));
          assert.ok(actual.every((value,i)=>Math.abs(value-expected[i])<1e-12));
        }
        assert.deepEqual(after.faces,cage.faces);assert.deepEqual(after.creases,cage.creases);
      }
    }
  }
  const assertRefused=async(source:ChatState,changes:Record<string,unknown>,match:RegExp)=>{
    const result=await dispatchTool(source,'subd',{...args,axis:'face',degrees:15,...changes},
      async()=>{throw Error('The local frame must refuse before evaluation');});
    assert.ok(result.isError&&!result.changed);assert.match(parse(result.content).error,match);
    assert.equal(result.state.doc,source.doc);
  };
  await assertRefused(state,{faces:[0,1]},/exactly one planar convex quad/);
  await assertRefused(state,{vertices:[1]},/exactly one planar convex quad/);
  await assertRefused(state,{edges:[[1,2]]},/exactly one planar convex quad/);
  await assertRefused(state,{pivotVertex:6},/current integer cage vertex/);
  const warpedCage={...cage,positions:cage.positions.map((value,i)=>Math.floor(i/3)===4?value+normal[i%3]*.2:value)};
  const warped={...state,doc:withNode(emptyDoc(),{kind:'subd',name:'Warped',cage:warpedCage})};
  await assertRefused(warped,{},/cage revision.*changed/i);
  await assertRefused(warped,{cageRevision:await read(warped)},/quad must be planar/);
});

test('R8.2 shaping: a top face extruded up (its region walled), a loop inserted, an edge creased, vertices moved — each body valid, the result naming what is new', async () => {
  let s = await boxState(); const i = subdIndex(s), v0 = sound(s);
  const top = parse((await dispatchTool(s, 'subd_select', { index: i, what: 'faces', normal: [0, 0, 1], box: { min: [0, 0, 0] } }, evaluate)).content).faces[0].face;
  const ex = await dispatchTool(s, 'subd_extrude', { index: i, faces: [top], distance: 5 }, evaluate), r = parse(ex.content);
  assert.ok(!ex.isError, ex.content); assert.equal(r.cage.after.faces, 28); assert.deepEqual(r.cage.new.faces.length, 1);
  s = ex.state; const v1 = sound(s); assert.ok(v1 > v0, `${v1} > ${v0}`);
  assert.ok(Math.max(...cageOf(s).positions.filter((_, k) => k % 3 === 2)) > 20.9);
  // A loop across a side: more faces, the same shape near enough.
  const side = cageOf(s).faces[parse((await dispatchTool(s, 'subd_select', { index: i, what: 'faces', normal: [1, 0, 0] }, evaluate)).content).faces[0].face];
  const loop = await dispatchTool(s, 'subd_insert_loop', { index: i, edge: [side[0], side[1]] }, evaluate);
  assert.ok(!loop.isError, loop.content); assert.ok(parse(loop.content).cage.after.faces > 28); s = loop.state; sound(s);
  // A crease, and smoothing it again.
  const e = [cageOf(s).faces[0][0], cageOf(s).faces[0][1]];
  const cr = await dispatchTool(s, 'subd_crease', { index: i, edges: [e] }, evaluate);
  assert.ok(!cr.isError, cr.content); assert.equal(cageOf(cr.state).creases?.length, 1); sound(cr.state);
  const off = await dispatchTool(cr.state, 'subd_crease', { index: i, edges: [e], on: false }, evaluate);
  assert.ok(!off.isError); assert.equal(cageOf(off.state).creases?.length ?? 0, 0);
  // Moving the top face's vertices: the faces as they were, the vertices elsewhere.
  const mv = await dispatchTool(s, 'subd_move', { index: i, faces: [top], delta: [0, 0, 2] }, evaluate);
  assert.ok(!mv.isError, mv.content); assert.deepEqual(cageOf(mv.state).faces, cageOf(s).faces); assert.notDeepEqual(cageOf(mv.state).positions, cageOf(s).positions); sound(mv.state);
});

test('R8.2 mending: faces deleted leave a hole the boundary query finds, filled again closed; a weld of an edge\'s ends; refusals say why and change nothing', async () => {
  const s = await boxState(), i = subdIndex(s);
  const del = await dispatchTool(s, 'subd_delete', { index: i, faces: [0] }, evaluate);
  assert.ok(!del.isError, del.content);
  const open = parse((await dispatchTool(del.state, 'subd_select', { index: i, what: 'boundary' }, evaluate)).content);
  assert.equal(open.count, 4);
  const fill = await dispatchTool(del.state, 'subd_fill', { index: i, edges: open.open_edges }, evaluate);
  assert.ok(!fill.isError, fill.content); assert.equal(cageOf(fill.state).faces.length, 24); sound(fill.state);
  // Refused: not an edge; no SubD feature; nothing to move; an edge welded away into a non-manifold.
  const bad = await dispatchTool(s, 'subd_insert_loop', { index: i, edge: [0, 25] }, evaluate);
  assert.ok(bad.isError); assert.match(parse(bad.content).error, /Not edges of the cage/); assert.equal(bad.state, s);
  assert.ok((await dispatchTool(s, 'subd_move', { index: i, delta: [1, 0, 0] }, evaluate)).isError);
  // A weld of an edge's two ends: one vertex fewer, the cage a manifold still, the body valid.
  const f0 = cageOf(s).faces[0], weld = await dispatchTool(s, 'subd_weld', { index: i, vertices: [f0[0], f0[1]] }, evaluate);
  assert.ok(!weld.isError, weld.content); assert.equal(cageOf(weld.state).positions.length / 3, 25); sound(weld.state);
});

test('R8.2 a mirrored cage: indices of the half; an extrusion keeps the plane\'s vertices on the plane and the body whole', async () => {
  const s = await boxState(), i = subdIndex(s), node = s.doc.nodes[i] as Subd;
  // The half on the + side of X, as the editor's mirror makes it.
  const { runOp, startSession } = await import('../src/subd/cageEdit');
  const half = runOp(startSession(i, node.cage), 'mirror-x');
  const doc = { ...s.doc, nodes: s.doc.nodes.map((n, k) => k === i ? { ...node, cage: half.cage, mirror: 'x' } as ModelNode : n) };
  const r = await evaluate(doc); assert.ok(r.ok); const m: ChatState = { doc, bodies: r.bodies };
  const info = parse((await dispatchTool(m, 'subd_cage', { index: i }, evaluate)).content);
  assert.equal(info.mirror, 'x'); assert.ok(info.bounds.min[0] > -1e-9);
  const side = parse((await dispatchTool(m, 'subd_select', { index: i, what: 'faces', normal: [0, 1, 0] }, evaluate)).content).faces[0].face;
  const ex = await dispatchTool(m, 'subd_extrude', { index: i, faces: [side], distance: 3 }, evaluate);
  assert.ok(!ex.isError, ex.content);
  const out = cageOf(ex.state), P = out.positions;
  const onPlane = (c: { positions: number[] }) => c.positions.filter((x, k) => k % 3 === 0 && Math.abs(x) < 1e-9).length;
  assert.ok(onPlane(out) >= onPlane(half.cage)); assert.ok(P.filter((x, k) => k % 3 === 0).every(x => x > -1e-9));
  sound(ex.state);
});

test('R8.2 autonomy L2 (D41): moving cage vertices is a value edit of the feature and applies; an extrusion changes topology and is proposed', async () => {
  const s = await boxState(), i = subdIndex(s), turn: ChatState = { ...s, turnBase: s.doc }, was = process.env.CAD_AUTONOMY;
  try {
    process.env.CAD_AUTONOMY = '2';
    const mv = await runTool(turn, 'subd_move', { index: i, vertices: [0, 1], delta: [0, 0, 1] }, evaluate);
    assert.ok(!mv.isError, mv.content);
    const ex = await runTool(turn, 'subd_extrude', { index: i, faces: [0], distance: 2 }, evaluate), e = parse(ex.content);
    assert.ok(ex.isError); assert.equal(e.code, 'needs_proposal'); assert.match(e.error, /beyond its values/);
    const prop = await runTool(turn, 'propose', { title: 'a bump', ops: [{ tool: 'subd_extrude', args: { index: i, faces: [0], distance: 2 } }] }, evaluate);
    assert.ok(!prop.isError, prop.content); assert.equal(cageOf(prop.state).faces.length, 24, 'proposed: the part unchanged');
  } finally { if (was === undefined) delete process.env.CAD_AUTONOMY; else process.env.CAD_AUTONOMY = was; }
});
