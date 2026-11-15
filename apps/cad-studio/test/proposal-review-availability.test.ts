import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { emptyDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Proposal } from '@barocss/cad-model/engine/schema/proposals';
import { useProposalPreview } from '../src/state/useProposalPreview';
import { ProposalBrowser } from '../src/ui/ProposalBrowser';
import { Lanes } from '../src/engine/lanes';

// Actual hook via React SSR and actual card JSX. This does not qualify mounted
// App transitions or the pre-existing in-flight review/edit race.
type Controller = ReturnType<typeof useProposalPreview>;
type Model = Parameters<typeof useProposalPreview>[0]['model'];
const proposal: Proposal = { id: 'P1', title: 'Box review', status: 'open', by: { agent: 'test' }, at: '2026-11-15', base: '0', ops: [], summary: 'Review the change',
  risk: { level: 'low', features_touched: 0, references_broken: 0, hard_requirements_changed: [], approval: [] } };
function controller(flags: Partial<Pick<Model, 'active' | 'sketch' | 'marker'>> = {}) {
  const doc: StudioDoc = { ...emptyDoc(), proposals: [structuredClone(proposal)] };
  const commits: StudioDoc[] = [], previews: unknown[] = [], notices: unknown[] = [];
  let api!: Controller, workerCalls = 0;
  function Probe() {
    api = useProposalPreview({ model: { doc, bodies: [], instances: new Map(), active: false, sketch: false, marker: null, ...flags },
      worker: { engine: { part() { workerCalls++; throw new Error('Unexpected evaluation'); } } as unknown as Parameters<typeof useProposalPreview>[0]['worker']['engine'], lanes: new Lanes(), nextRevision: () => 1 },
      changes: { currentDoc: () => doc, commit(next) { commits.push(next); return true; }, setPreviewBodies: next => previews.push(next) },
      chatRowFiles: { current: undefined }, onNotice: notice => notices.push(notice) });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return { api, doc, commits, previews, notices, workerCalls: () => workerCalls };
}
type Props = { children?: unknown; [key: string]: unknown };
function elements(node: unknown): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function content(node: unknown): string {
  if (Array.isArray(node)) return node.map(content).join('');
  if (isValidElement<Props>(node)) return content(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function button(view: unknown, name: string) {
  const item = elements(view).find(element => element.type === 'button' && content(element) === name);
  assert.ok(item, name); return item.props;
}
function browser(state: ReturnType<typeof controller>, overrides: Partial<Controller> = {}, recovery = 'Apply or cancel Box to review the proposal.', decidedShown = false) {
  return ProposalBrowser({ controller: { ...state.api, isStale: () => false, ...overrides }, reviewRecovery: recovery, doc: state.doc, bodies: [], fresh: true,
    massReady: true, placedPreviewEnabled: true, decidedShown, setDecidedShown: () => {} });
}

for (const flags of [{ active: true }, { sketch: true }, { marker: 0 }]) {
  test(`review availability matches existing guards for ${JSON.stringify(flags)}`, async () => {
    const state = controller(flags), before = structuredClone(state.doc);
    assert.equal(state.api.reviewBlocked, true);
    await state.api.showProposal(proposal); await state.api.acceptIt(proposal); await state.api.rebaseIt(proposal);
    assert.equal(state.workerCalls(), 0); assert.deepEqual(state.commits, []); assert.deepEqual(state.previews, []); assert.deepEqual(state.doc, before);
    assert.equal(state.notices.length, 'marker' in flags ? 1 : 0, 'existing rollback Accept notice is unchanged');
    const view = browser(state);
    assert.equal(button(view, 'Preview').disabled, true); assert.equal(button(view, 'Accept').disabled, true);
    assert.equal(button(view, 'Reject').disabled, false);
  });
}

test('blocked Preview, Accept and stale Rebase reference nearby recovery text', () => {
  const state = controller({ active: true }), view = browser(state);
  const recovery = elements(view).find(element => element.props.role === 'status'); assert.ok(recovery);
  assert.equal(content(recovery), 'Apply or cancel Box to review the proposal.');
  for (const name of ['Preview', 'Accept']) assert.equal(button(view, name)['aria-describedby'], recovery.props.id);
  const stale = browser(state, { isStale: () => true });
  assert.equal(button(stale, 'Rebase & preview').disabled, true);
  assert.equal(button(stale, 'Rebase & preview')['aria-describedby'], recovery.props.id);
});

test('existing Hide and Reject are not blocked, and original busy/stale rules remain', async () => {
  const state = controller({ active: true });
  const ghost: NonNullable<Controller['ghost']> = { id: proposal.id, bodies: [], placed: null, after: true, full: state.doc, shown: state.doc, parts: [], leaveOut: [] };
  let hidden = 0;
  const view = browser(state, { ghost, showProposal: async () => { hidden++; } });
  assert.equal(button(view, 'Hide').disabled, false); assert.equal(button(view, 'Hide')['aria-describedby'], undefined);
  await (button(view, 'Hide').onClick as () => Promise<void>)(); assert.equal(hidden, 1);
  assert.equal(button(view, 'Reject').disabled, false);
  assert.equal(button(browser(state, { ghost, proposalBusy: true }), 'Hide').disabled, true);
  assert.equal(button(browser(state, { ghost, proposalBusy: true }), 'Reject').disabled, true);
  assert.equal(button(browser(state, { ghost, isStale: () => true }), 'Hide').disabled, true);
});

test('Reject preserves the original commit path during an edit without mutating the source', () => {
  const state = controller({ active: true }), before = structuredClone(state.doc);
  state.api.rejectIt(proposal);
  assert.equal(state.commits.length, 1); assert.equal(state.commits[0].proposals?.[0].status, 'rejected');
  assert.equal(state.workerCalls(), 0); assert.deepEqual(state.doc, before);
});

test('idle recovery enables review actions and removes recovery text; decided cards do not get it', () => {
  const state = controller(); assert.equal(state.api.reviewBlocked, false);
  const view = browser(state);
  assert.equal(button(view, 'Preview').disabled, false); assert.equal(button(view, 'Accept').disabled, false);
  assert.equal(button(browser(state, { isStale: () => true }), 'Rebase & preview').disabled, false);
  assert.equal(elements(view).some(element => element.props.role === 'status'), false);
  const blocked = controller({ sketch: true });
  assert.match(content(browser(blocked, {}, 'Finish or cancel the sketch to review the proposal.')), /Finish or cancel the sketch/);
  blocked.doc.proposals![0] = { ...proposal, status: 'rejected' };
  assert.equal(elements(browser(blocked, {}, undefined, true)).some(element => element.props.role === 'status'), false);
});
