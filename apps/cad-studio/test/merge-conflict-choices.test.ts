import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { MergeConflictChoices } from '../src/storage/MergeConflictChoices';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { mergeDocs, type Conflict, type Side } from '@barocss/cad-model/versions/merge';

type Props = { children?: unknown; [key: string]: unknown };
function elements(node: unknown): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const conflict = (ours: unknown, theirs: unknown): Conflict => ({ code: 'FIELD_BOTH', where: 'bodies:b1', message: '[FIELD_BOTH] bodies “b1” was changed on both branches', ours, theirs });
function view(c: Conflict, answer?: Side, onAnswer: (side: Side) => void = () => {}) {
  return MergeConflictChoices({ conflict: c, ours: 'main', theirs: 'name-side', answer, onAnswer });
}
test('body names are visible beside their branch, key and whole-object selection scope', () => {
  const c = conflict({ name: 'Alpha', hidden: true }, { name: 'Beta', color: '#ff0000' });
  const html = renderToStaticMarkup(view(c));
  for (const name of ['bodies:b1', 'main', 'name-side', 'Alpha', 'Beta', 'Choose all body settings, not only the name.', 'hidden', 'color']) assert.ok(html.includes(name), name);
  const choices = elements(view(c)).filter(e => e.type === 'input');
  assert.equal(choices.length, 2); assert.ok(choices.every(e => e.props.checked === false));
  assert.deepEqual(choices.map(e => e.props['aria-label']), ['bodies:b1 ours', 'bodies:b1 theirs']);
  const answers: Side[] = [];
  for (const e of elements(view(c, undefined, side => answers.push(side))).filter(e => e.type === 'input')) (e.props.onChange as () => void)();
  assert.deepEqual(answers, ['ours', 'theirs']);
});
test('empty name, missing name and deleted metadata have distinct labels', () => {
  const html = renderToStaticMarkup(view(conflict({ name: '' }, {})));
  assert.match(html, /Name: &quot;&quot; \(empty\)/); assert.match(html, /Name: \(not set\)/);
  const deleted = renderToStaticMarkup(view(conflict(undefined, { hidden: true })));
  assert.match(deleted, /Body metadata deleted/); assert.equal(elements(view(conflict(undefined, {}))).filter(e => e.type === 'details').length, 1);
});
test('long and HTML-like names stay complete inert text; settings details show same-name differences', () => {
  const name = '<img src=x onerror="alert(1)"> &\n' + 'long body '.repeat(40);
  const html = renderToStaticMarkup(view(conflict({ name }, { name: 'Same', hidden: true })));
  assert.ok(html.includes('long body '.repeat(40))); assert.ok(html.includes('&lt;img')); assert.doesNotMatch(html, /<img|<script/);
  const same = renderToStaticMarkup(view(conflict({ name: 'Same', hidden: true }, { name: 'Same', hidden: false, color: '#ff0000' })));
  assert.match(same, /Choose all body settings/); assert.match(same, /hidden/); assert.match(same, /true/); assert.match(same, /false/); assert.match(same, /color/);
});
test('existing scalar/deleted conflict summaries and explicit radio selection remain intact', () => {
  const c = { ...conflict(12, 24), where: 'parameter:width' };
  const html = renderToStaticMarkup(view(c, 'theirs'));
  assert.match(html, /main<!-- --> \(12\)|main \(12\)/); assert.ok(html.includes('(24)')); assert.doesNotMatch(html, /Body settings|Choose all body settings/);
  const choices = elements(view(c, 'theirs')).filter(e => e.type === 'input'); assert.deepEqual(choices.map(e => e.props.checked), [false, true]);
  assert.match(renderToStaticMarkup(view({ ...c, theirs: undefined })), /\(deleted\)/);
});
test('displayed body sides resolve as whole objects, preserving sibling metadata and automatic independent merges', () => {
  const base = { ...emptyDoc(), bodies: { b1: { name: 'Base' }, b3: { name: 'Sibling' } } };
  const ours = { ...base, bodies: { ...base.bodies, b1: { name: 'Alpha', hidden: true }, b3: { name: 'Sibling', hidden: true } } };
  const theirs = { ...base, bodies: { ...base.bodies, b1: { name: 'Beta', color: '#ff0000' } } };
  const before = JSON.stringify([base, ours, theirs]), result = mergeDocs(base, ours, theirs);
  assert.ok('conflicts' in result); assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0].ours, ours.bodies.b1); assert.deepEqual(result.conflicts[0].theirs, theirs.bodies.b1);
  for (const side of ['ours', 'theirs'] as const) {
    renderToStaticMarkup(createElement(MergeConflictChoices, { conflict: result.conflicts[0], ours: 'main', theirs: 'name-side', answer: side, onAnswer() {} }));
    const merged = mergeDocs(base, ours, theirs, { resolve: { 'bodies:b1': side } }); assert.ok('doc' in merged);
    assert.deepEqual(merged.doc.bodies?.b1, side === 'ours' ? ours.bodies.b1 : theirs.bodies.b1);
    assert.deepEqual(merged.doc.bodies?.b3, ours.bodies.b3);
  }
  const independent = mergeDocs(base, { ...base, bodies: { ...base.bodies, b1: { name: 'Base', hidden: true } } }, { ...base, bodies: { ...base.bodies, b3: { name: 'Sibling', hidden: true } } });
  assert.ok('doc' in independent); assert.equal(independent.doc.bodies?.b1.hidden, true); assert.equal(independent.doc.bodies?.b3.hidden, true);
  assert.equal(JSON.stringify([base, ours, theirs]), before);
});
