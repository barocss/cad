import assert from 'node:assert/strict';
import test from 'node:test';
import { sceneSelection } from '../src/viewport/sceneSelection';

const hit = { face: null, edge: null, point: null };

function fixture() {
  const calls: string[] = [];
  const actions = {
    onPick: () => { calls.push('ordinary'); },
    onPickBody: () => { calls.push('body'); },
    onPickChain: () => { calls.push('edge chain'); },
    onBoxSelect: () => { calls.push('window'); },
    onContextMenu: () => { calls.push('context'); },
    onPickProfile: () => { calls.push('profile'); },
  };
  const inputs: Parameters<typeof sceneSelection>[0] = {
    display: { selection: { faces: [], edges: [], bodies: [2] }, instanceSelection: ['part'] },
    actions, historyPreview: false, draftFace: null, finishEdge: undefined, proposedInstances: undefined,
    filter: 'body', command: { active: false, edgeFillet: false }, bandRailsAvailable: true, meshBoxCrossing: true,
  };
  return { calls, inputs, actions };
}

test('history preview blocks competing editors and preserves each profile-pick rule', () => {
  const { calls, inputs } = fixture();
  const held = sceneSelection({
    ...inputs, historyPreview: true, draftFace: { kind: 'ready' }, finishEdge: () => { calls.push('replacement'); },
  });
  held.actions.onPick(hit, false);
  held.actions.onPickBody?.(2);
  held.actions.onPickChain?.(2, 0);
  held.actions.onBoxSelect([2], true);
  held.actions.onContextMenu({ x: 1, y: 2 }, hit);
  held.actions.onPickProfile?.(3, false);
  assert.deepEqual(calls, []);
  assert.equal(held.bandRailPicking, false);
  const prefix = sceneSelection({ ...inputs, historyPreview: true });
  prefix.actions.onPickProfile?.(3, false);
  assert.deepEqual(calls, ['profile']);
});

test('replacement editors retain their own filter, with a draft face taking precedence', () => {
  const { calls, inputs } = fixture();
  const finishEdge = () => { calls.push('finish edge'); };
  const face = sceneSelection({ ...inputs, finishEdge, draftFace: { kind: 'picking', pick: () => { calls.push('draft face'); } } });
  assert.equal(face.pickFilter, 'face');
  face.actions.onPick(hit, false);
  face.actions.onPickProfile?.(3, false);
  const edge = sceneSelection({ ...inputs, finishEdge });
  assert.equal(edge.pickFilter, 'edge');
  edge.actions.onPick(hit, false);
  edge.actions.onPickProfile?.(3, false);
  assert.deepEqual(calls, ['draft face', 'finish edge', 'profile']);
});

test('proposal hits stay blocked while ordinary model routes, display and filters remain available', () => {
  const { calls, inputs, actions } = fixture();
  const ordinary = sceneSelection(inputs);
  assert.equal(ordinary.actions, actions);
  assert.equal(ordinary.selection, inputs.display.selection);
  assert.equal(ordinary.instanceSelection, inputs.display.instanceSelection);
  assert.equal(ordinary.pickFilter, 'body');
  assert.equal(ordinary.bandRailPicking, true);
  assert.equal(ordinary.meshBoxCrossing, true);

  const proposal = sceneSelection({ ...inputs, proposedInstances: new Map([['candidate', []]]) });
  proposal.actions.onPick({ ...hit, instance: 'candidate' }, false);
  proposal.actions.onPick({ ...hit, instance: 'part' }, true);
  proposal.actions.onPick(hit, false);
  assert.deepEqual(calls, ['ordinary', 'ordinary']);
  assert.equal(sceneSelection({ ...inputs, command: { active: true, edgeFillet: false } }).pickFilter, 'all');
  assert.equal(sceneSelection({ ...inputs, filter: 'edge', command: { active: true, edgeFillet: true } }).pickFilter, 'edge');
});
