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
      worker: { engine: { part() { workerCalls++; throw new Error('Unexpected evaluation'); } } as unknown as Parameters<typeof useProposalPreview>[0]['worker']['engine'], lanes: new Lanes(), session: 0, currentSession: () => 0, nextRevision: () => 1 },
      changes: { currentDoc: () => doc, commit(next) { commits.push(next); return true; }, undo: [], setPreviewBodies: next => previews.push(next) },
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
  const ghost: NonNullable<Controller['ghost']> = { id: proposal.id, session: 0, base: state.doc, proposal, bodies: [], placed: null, after: true, full: state.doc, shown: state.doc, parts: [], leaveOut: [] };
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


test('preview status names the current geometry once; switch names its next action and retains the volume delta', () => {
  const state = controller(), before = structuredClone(state.doc);
  type Body = Parameters<typeof ProposalBrowser>[0]['bodies'][number];
  const ghost: NonNullable<Controller['ghost']> = { id: proposal.id, session: 0, base: state.doc, proposal, bodies: [{ volume: 10553.21467 } as Body], placed: null, after: true,
    full: state.doc, shown: state.doc, parts: [], leaveOut: [] };
  let flips = 0;
  const flipGhost = () => { flips++; ghost.after = !ghost.after; };
  for (const after of [true, false, true]) {
    const view = ProposalBrowser({ controller: { ...state.api, ghost, isStale: () => false, flipGhost }, doc: state.doc,
      bodies: [{ volume: 10572.34446 } as Body], fresh: true, massReady: true, placedPreviewEnabled: true,
      decidedShown: false, setDecidedShown: () => {} });
    const status = elements(view).find(element => element.props.className === 'mono proposal-dv'); assert.ok(status);
    assert.equal(content(status), `${after ? 'after' : 'before'} · Volume change −19.13 mm³ (−0.18%)`);
    const action = button(view, after ? 'Show before' : 'Show after');
    assert.equal(action['aria-label'], undefined, 'visible action text supplies the accessible name');
    assert.equal(action.onClick, flipGhost, 'keep the original switch callback');
    assert.equal(button(view, 'Hide').disabled, false); assert.equal(button(view, 'Accept').disabled, false);
    assert.equal(elements(view).some(element => element.props['aria-label'] === 'Before or after'), false);
    if (flips < 2) (action.onClick as () => void)();
  }
  assert.equal(flips, 2); assert.deepEqual(state.doc, before); assert.deepEqual(state.commits, []);
});

test('preview volume-change copy retains pending and unavailable states', () => {
  const state = controller();
  const ghost: NonNullable<Controller['ghost']> = { id: proposal.id, session: 0, base: state.doc, proposal, bodies: [], placed: null, after: true,
    full: state.doc, shown: state.doc, parts: [], leaveOut: [] };
  const props: Parameters<typeof ProposalBrowser>[0] = { controller: { ...state.api, ghost, isStale: () => false }, doc: state.doc, bodies: [],
    fresh: true, massReady: false, placedPreviewEnabled: true, decidedShown: false, setDecidedShown: () => {} };
  const delta = (view: unknown) => elements(view).find(element => element.props['aria-label'] === 'Volume change');
  assert.equal(content(delta(ProposalBrowser(props))), '…');
  ghost.placed = { kind: 'ready', volumeChange: null } as unknown as NonNullable<typeof ghost.placed>;
  props.massReady = true;
  assert.equal(content(delta(ProposalBrowser(props))), 'unavailable');
});


test('partial decision identifies saved exclusions and marks the original proposal summary without guessing applied features', () => {
  const state = controller();
  state.doc.proposals![0] = { ...proposal, title: 'A Ø4 hole and a block', summary: '3 added', status: 'accepted',
    ops: [{ tool: 'obsolete_unknown_tool', args: { misleadingLabel: 'Current Extrude' } }],
    decided: { by: 'user', at: '2026-11-15', left_out: ['n4', 'n5', 'n4'] } };
  const before = structuredClone(state.doc), view = browser(state, {}, undefined, true);
  const scope = elements(view).find(element => element.props['aria-label'] === 'P1 accepted scope'); assert.ok(scope);
  assert.equal(scope.props.role, 'group');
  assert.equal(content(scope), ' · accepted the proposal except n4, n5');
  assert.match(content(view), /partially accepted by user/);
  assert.match(content(view), /Original proposal: 3 added/);
  assert.match(content(view), /A Ø4 hole and a block/);
  assert.doesNotMatch(content(view), /Current Extrude|Accept \d|1 of|2 of/);
  assert.equal(state.doc.nodes.length, 0, 'the historical IDs and labels need not exist in the current model');
  assert.equal(state.workerCalls(), 0); assert.deepEqual(state.commits, []); assert.deepEqual(state.doc, before);
});

test('full, rejected, open and legacy decisions do not invent partial acceptance scope', () => {
  for (const scenario of [
    { status: 'accepted' as const, decided: { by: 'user', at: '2026-11-15' } },
    { status: 'accepted' as const, decided: { by: 'user', at: '2026-11-15', left_out: [] } },
    { status: 'accepted' as const, decided: undefined },
    { status: 'rejected' as const, decided: { by: 'user', at: '2026-11-15', left_out: ['n4'] } },
    { status: 'open' as const, decided: { by: 'user', at: '2026-11-15', left_out: ['n4'] } },
  ]) {
    const state = controller(); state.doc.proposals![0] = { ...proposal, ...scenario };
    const before = structuredClone(state.doc), view = browser(state, {}, undefined, true);
    assert.equal(elements(view).some(element => element.props['aria-label'] === 'P1 accepted scope'), false);
    assert.doesNotMatch(content(view), /partially accepted|Original proposal:|accepted the proposal except/);
    assert.match(content(view), /Review the change/);
    if (scenario.status !== 'open') assert.match(content(view), new RegExp(`${scenario.status} by`));
    assert.deepEqual(state.doc, before); assert.equal(state.workerCalls(), 0);
  }
});

test('decision rebase note is deduplicated only when the existing rebased badge conveys it', () => {
  const state = controller();
  const rebased = { original: 'old', from: 'previous', at: '2026-11-15', risk_was: proposal.risk };
  const generated = 'rebased before it was accepted';
  for (const partial of [false, true]) {
    state.doc.proposals![0] = { ...proposal, status: 'accepted', rebased,
      decided: { by: 'user', at: '2026-11-15', note: generated, ...(partial ? { left_out: ['n4'] } : {}) } };
    const before = structuredClone(state.doc), view = browser(state, {}, undefined, true);
    assert.equal(content(view).match(/rebased/g)?.length, 1);
    assert.doesNotMatch(content(view), /rebased before it was accepted/);
    assert.deepEqual(state.doc, before, 'deduplication is presentation-only');
    assert.match(content(browser(state, { isStale: () => true }, undefined, true)), /rebased before it was accepted/, 'no badge means retain the saved note');
    state.doc.proposals![0].rebased = undefined;
    assert.match(content(browser(state, {}, undefined, true)), /rebased before it was accepted/);
    state.doc.proposals![0].rebased = rebased;
    state.doc.proposals![0].decided!.note = 'Rebased and checked Hole Ø4 with the owner';
    assert.match(content(browser(state, {}, undefined, true)), /Rebased and checked Hole Ø4 with the owner/);
    state.doc.proposals![0].decided!.note = `${generated}; checked Hole Ø4`;
    assert.match(content(browser(state, {}, undefined, true)), /rebased before it was accepted; checked Hole Ø4/);
  }
});
