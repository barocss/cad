import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { runTool, dispatchTool } from '../src/chat/tools';
import { drawingInputs, runDrawingTool } from '../src/chat/drawing';
import { readDrawing } from '../src/drawing/types';
import { drawingIssues, issueContext, type DrawingIssue } from '../src/drawing/issues';
import { sheetsIssues } from '../src/drawing/sheetSet';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
const sentinel = 'SYNTHETIC_NOTE_BODY_NOT_A_TARGET';
function fixture(multi = false): StudioDoc {
  return { ...rectanglePart(40, 20, 6), drawing: readDrawing({
    views: ['front', 'top', 'right'],
    dimensions: [
      { id: 'same-id', kind: 'diameter', view: 'front', edge: 'missing-front', near: [0, 0, 0], place: [30, 30] },
      { id: 'same-id', kind: 'diameter', view: 'top', edge: 'missing-top', near: [0, 0, 0], place: [30, 40] },
    ],
    notes: [{ id: 'note1', text: sentinel, at: [-100, -100] }],
    ...(multi ? { sheets: [{ id: 'S2', name: 'Second', views: ['top'] }] } : {}),
  }) };
}
function base(issue: DrawingIssue) {
  return { code: issue.code, severity: issue.severity, message: issue.message, ...(issue.fix ? { fix: issue.fix.kind } : {}) };
}
function targets(issue: DrawingIssue) {
  return { ...(issue.dims ? { dimension_ids: [...issue.dims] } : {}), ...(issue.view !== undefined ? { view: issue.view } : {}) };
}
async function query(doc: StudioDoc, args: Record<string, unknown>) {
  const before = structuredClone(doc), state = { doc, bodies: [] };
  const publicResult = await runTool(state, 'drawing', { action: 'issues', ...args }, evaluate);
  const dispatched = await dispatchTool(state, 'drawing', { action: 'issues', ...args }, evaluate);
  const direct = runDrawingTool(doc, 'drawing_issues', args);
  assert.ok(!('error' in direct), JSON.stringify(direct));
  assert.equal(direct.doc, doc); assert.equal(direct.changed, false);
  for (const result of [publicResult, dispatched]) {
    assert.equal(result.isError, false, result.content); assert.equal(result.changed, false);
    assert.equal(result.state.doc, doc); assert.deepEqual(JSON.parse(result.content), direct.content);
  }
  assert.equal(publicResult.state.policy?.calls, 1, 'policy accounting is not a document edit');
  assert.equal(publicResult.content, dispatched.content);
  assert.deepEqual(doc, before);
  return { content: publicResult.content, value: direct.content };
}
for (const multi of [false, true]) test(`${multi ? 'multi' : 'single'} sheet opt-in targets match the engine, with unchanged legacy output`, async () => {
  const doc = fixture(multi), before = structuredClone(doc);
  const input = drawingInputs(doc); assert.notEqual(typeof input, 'string');
  if (typeof input === 'string') throw new Error(input);
  const oracle = multi ? sheetsIssues(input).map(x => ({ sheet: x.sheet, ...base(x.issue), ...targets(x.issue) }))
    : drawingIssues(issueContext(input)).map(x => ({ ...base(x), ...targets(x) }));
  const legacy = await query(doc, {}), no = await query(doc, { include_targets: false }), yes = await query(doc, { include_targets: true });
  assert.equal(no.content, legacy.content, 'false is byte-identical to omitted');
  const issues = yes.value.issues as Record<string, unknown>[];
  assert.deepEqual(issues, oracle);
  const stripped = issues.map(({ dimension_ids: _ids, view: _view, ...rest }) => rest);
  assert.deepEqual({ ...yes.value, issues: stripped }, legacy.value);
  assert.ok(issues.some(x => !Object.hasOwn(x, 'dimension_ids')));
  assert.ok(issues.some(x => !Object.hasOwn(x, 'view')));
  const lost = issues.filter(x => x.code === 'DIMENSION_LOST');
  assert.equal(lost.length, 2, 'duplicate saved IDs do not become invented unique identities');
  assert.deepEqual(lost.map(x => x.dimension_ids), [['same-id'], ['same-id']]);
  assert.deepEqual(lost.map(x => x.view).sort(), ['front', 'top']);
  if (multi) assert.deepEqual(lost.map(x => 'sheet' in x ? x.sheet : undefined).sort(), [1, 2]);
  for (const issue of issues) {
    for (const key of ['at', 'notes', 'tables', 'frames', 'datumTargets', 'welds']) assert.equal(Object.hasOwn(issue, key), false, key);
  }
  assert.equal(yes.content.includes(sentinel), false, 'note body is not exposed');
  // Returned target lists are detached from the retained settings, not writable aliases.
  (lost[0].dimension_ids as string[]).push('mutated-result-only');
  assert.deepEqual(doc, before);
});

test('malformed opt-in is rejected before even empty-document projection and does not evaluate', async () => {
  let calls = 0;
  const noEvaluate = async () => { calls++; throw new Error('Unexpected evaluation'); };
  for (const doc of [emptyDoc(), fixture()]) {
    const before = structuredClone(doc);
    for (const include_targets of [null, 'true', 0, undefined, {}, []]) {
      const args = { include_targets };
      assert.equal(Object.hasOwn(args, 'include_targets'), true);
      const direct = runDrawingTool(doc, 'drawing_issues', args);
      assert.ok('error' in direct); assert.match(direct.error, /include_targets.*boolean/);
      for (const call of [runTool, dispatchTool]) {
        const result = await call({ doc, bodies: [] }, 'drawing', { action: 'issues', ...args }, noEvaluate);
        assert.equal(result.isError, true); assert.equal(result.changed, false);
        assert.equal(result.state.doc, doc); assert.match(result.content, /include_targets|boolean/);
        assert.doesNotMatch(result.content, /no body to draw/);
      }
    }
    assert.deepEqual(doc, before);
  }
  assert.equal(calls, 0, 'the supplied evaluate callback is never invoked; empty-doc boolean precedence also checks the direct projection boundary');
});

test('public describe exposes the optional boolean without making it required', async () => {
  const doc = emptyDoc(), before = structuredClone(doc);
  const result = await runTool({ doc, bodies: [] }, 'describe', { tool: 'drawing', action: 'issues' }, evaluate);
  assert.equal(result.isError, false, result.content);
  const description = JSON.parse(result.content);
  assert.equal(description.input.properties.include_targets.type, 'boolean');
  assert.ok(!(description.input.required ?? []).includes('include_targets'));
  assert.equal(result.changed, false); assert.equal(result.state.doc, doc); assert.deepEqual(doc, before);
});

 test('public group describe advertises the target opt-in hint', async () => {
  const doc = emptyDoc();
  const result = await runTool({ doc, bodies: [] }, 'describe', { tool: 'drawing' }, evaluate);
  assert.equal(result.isError, false, result.content);
  assert.match(result.content, /include_targets/);
  assert.equal(result.changed, false); assert.equal(result.state.doc, doc);
});
