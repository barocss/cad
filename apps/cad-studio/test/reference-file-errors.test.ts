import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, evaluatePart, exportStudioStep } from '@barocss/cad-model/engine/evaluate';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { readReferences, referenceLocal } from '@barocss/cad-model/chat/references';
import { useSpecificationActions } from '../src/state/useSpecificationActions';
import { ReferencesPanel } from '../src/ui/ReferencesPanel';

const obj = 'v 0 0 0\nv 10 0 0\nv 0 10 0\nv 0 0 10\nf 1 3 2\nf 1 2 4\nf 2 3 4\nf 3 1 4\n';
const vertices = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]];
const stl = 'solid tetra\n' + [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]].map(face =>
  'facet normal 0 0 0\nouter loop\n' + face.map(i => `vertex ${vertices[i].join(' ')}\n`).join('') + 'endloop\nendfacet\n').join('') + 'endsolid tetra\n';
function fixture(options: { stepRoute?: boolean; rejectCommit?: Error } = {}) {
  const doc = rectanglePart(20, 12, 8), before = structuredClone(doc), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const notices: FriendlyError[] = [], commits: StudioDoc[] = [], reads: StudioDoc[] = [];
  const actions = useSpecificationActions({ doc, bodies: evaluated.bodies, revision: { current: 1 },
    engine: { async part(input: StudioDoc, revision: number) {
      reads.push(input);
      // This test checks text routing, not native STEP geometry.
      return options.stepRoute ? evaluated : evaluateDoc(input, revision);
    } } as unknown as Parameters<typeof useSpecificationActions>[0]['engine'],
    commit(next) { if (options.rejectCommit) throw options.rejectCommit; commits.push(next); return true; },
    setToast(notice) { notices.push(notice); }, setChat() {}, setChatOutbox() {},
  });
  return { actions, doc, before, notices, commits, reads };
}

test('malformed and face-free OBJ failures resolve to concrete notices, preserve the document and support repeated attempts', async () => {
  const h = fixture();
  for (const [name, contents, cause] of [
    ['bad.obj', 'not an OBJ model\n', /no faces/], ['bad.obj', 'not an OBJ model\n', /no faces/],
    ['vertices.obj', 'v 0 0 0\nv 1 0 0\nv 0 1 0\n', /no faces/],
    ['index.obj', 'v 0 0 0\nf 1 2 9\n', /face naming a vertex/],
    ['vertex.obj', 'v not three numbers\n', /vertex that is not three numbers/],
  ] as const) {
    const count = h.notices.length;
    await assert.doesNotReject(h.actions.addReferenceFile(new File([contents], name)));
    assert.equal(h.notices.length, count + 1); const notice = h.notices.at(-1)!;
    assert.equal(notice.title, 'Reference not changed'); assert.ok(notice.hint.startsWith(`${name}: `));
    assert.match(notice.hint, cause); assert.match(notice.detail, cause);
    assert.equal(h.commits.length, 0); assert.equal(h.reads.length, 0); assert.deepEqual(h.doc, h.before);
  }
});

test('malformed STL is caught locally while empty STL retains existing reference-tool refusal; later OBJ replaces that notice', async () => {
  const h = fixture();
  await h.actions.addReferenceFile(new File(['not an STL'], 'broken.stl'));
  assert.match(h.notices.at(-1)!.hint, /^broken\.stl: .*neither a binary STL/);
  await h.actions.addReferenceFile(new File(['solid bad\nvertex x 0 0\nendsolid bad\n'], 'facet.stl'));
  assert.match(h.notices.at(-1)!.hint, /^facet\.stl: .*facet without three numeric vertices/);
  await h.actions.addReferenceFile(new File(['solid broken\nendsolid broken\n'], 'empty.stl'));
  assert.equal(h.notices.at(-1)!.title, 'Reference not changed'); assert.match(h.notices.at(-1)!.detail, /BAD_REFERENCE/);
  assert.doesNotMatch(h.notices.at(-1)!.hint, /^empty\.stl:/, 'downstream refusal remains unchanged');
  await h.actions.addReferenceFile(new File(['not an OBJ model\n'], 'new-failure.obj'));
  assert.equal(h.notices.length, 4); assert.match(h.notices.at(-1)!.hint, /^new-failure\.obj: .*no faces/);
  assert.equal(h.commits.length, 0); assert.deepEqual(h.doc, h.before);
});

test('mesh byte reads and STEP text reads report their own filename and original cause without a rejected promise', async () => {
  const h = fixture();
  for (const [name, method, error] of [
    ['unreadable.obj', 'arrayBuffer', new Error('[READ_FAILED] permission denied')],
    ['unreadable.STP', 'text', new Error('disk unavailable')],
    ['unreadable.stl', 'arrayBuffer', 'read interrupted'],
  ] as const) {
    const file = { name, [method]: async () => { throw error; } } as unknown as File;
    await assert.doesNotReject(h.actions.addReferenceFile(file)); const notice = h.notices.at(-1)!;
    const message = error instanceof Error ? error.message : error;
    assert.equal(notice.title, 'Reference not changed'); assert.equal(notice.detail, message);
    assert.equal(notice.hint, `${name}: ${message.replace(/^\[[A-Z_]+\] /, '')}`);
  }
  assert.equal(h.commits.length, 0); assert.equal(h.reads.length, 0); assert.deepEqual(h.doc, h.before);
});

test('valid OBJ and STL recover after failure through the unchanged real mesh parser and reference tool', async () => {
  for (const [name, contents] of [['tetra.obj', obj], ['tetra.stl', stl]] as const) {
    const h = fixture(); await h.actions.addReferenceFile(new File(['bad'], 'bad.obj'));
    await h.actions.addReferenceFile(new File([contents], name)); assert.equal(h.commits.length, 1);
    const refs = readReferences(h.commits[0].references).references;
    assert.equal(refs.length, 1); assert.equal(refs[0].name, 'tetra'); assert.equal(refs[0].id, 'ref1');
    assert.ok('mesh' in refs[0].source); assert.equal(refs[0].source.mesh.positions.length, 12); assert.equal(refs[0].source.mesh.indices.length, 12);
    assert.equal(h.reads.length, 1); assert.deepEqual(h.doc, h.before);
  }
});

test('STEP and STP retain text routing and downstream commit exceptions are not hidden by the preparation catch', async () => {
  const step = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;';
  for (const name of ['part.step', 'part.STP']) {
    const h = fixture({ stepRoute: true }); await h.actions.addReferenceFile(new File([step], name));
    assert.equal(h.commits.length, 1); assert.equal(h.notices.length, 0);
    assert.deepEqual(readReferences(h.commits[0].references).references[0].source, { step });
    assert.ok(h.reads.length >= 1); assert.deepEqual(h.doc, h.before);
  }
  const error = new Error('unexpected commit failure'), h = fixture({ rejectCommit: error });
  await assert.rejects(h.actions.addReferenceFile(new File([obj], 'tetra.obj')), error);
  assert.equal(h.notices.length, 0, 'unrelated downstream errors must not be relabeled as file parsing failures');
});

function elements(node: unknown): ReactElement<{ children?: unknown; [key: string]: unknown }>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: unknown; [key: string]: unknown }>(node)) return [];
  return [node, ...elements(node.props.children)];
}
test('actual Add reference input ignores canceled file selection and resets the input for same-file retries', () => {
  const files: File[] = []; let tree: unknown;
  function Probe() {
    tree = ReferencesPanel({ set: { version: 1, references: [], datums: [], keepouts: [] }, local: new Map(), verdicts: null,
      onAddFile(file) { files.push(file); }, onPlace() {}, onDatum() {}, onEnvelope() {}, onRemove() {} }); return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const input = elements(tree).find(element => element.props['aria-label'] === 'Add reference')!;
  const change = input.props.onChange as (e: unknown) => void;
  for (const selected of [undefined, []]) { const event = { target: { files: selected, value: 'prior' } }; change(event); assert.equal(event.target.value, ''); }
  assert.equal(files.length, 0);
  const file = new File([obj], 'tetra.obj');
  for (let i = 0; i < 2; i++) { const event = { target: { files: [file], value: 'selected' } }; change(event); assert.equal(event.target.value, ''); }
  assert.deepEqual(files, [file, file]);
});


test('generated STEP imports through Add reference and real native evaluation with its original source and volume', async () => {
  const step = exportStudioStep(rectanglePart(2, 3, 4), { name: 'reference STEP regression' }).text;
  const doc = rectanglePart(20, 12, 8), before = structuredClone(doc), main = evaluatePart(doc, 1000);
  assert.ok(main.ok);
  const commits: StudioDoc[] = [], notices: FriendlyError[] = [], revision = { current: 1001 };
  let nativeReads = 0;
  const actions = useSpecificationActions({ doc, bodies: main.bodies, revision,
    engine: { async part(input: StudioDoc, rev: number, slot: 'read') {
      assert.equal(slot, 'read'); nativeReads++;
      return evaluatePart(input, rev, 8, slot);
    } } as unknown as Parameters<typeof useSpecificationActions>[0]['engine'],
    commit(next) { commits.push(next); return true; }, setToast(notice) { notices.push(notice); }, setChat() {}, setChatOutbox() {},
  });
  await actions.addReferenceFile(new File([step], 'native-block.step'));
  assert.equal(commits.length, 1); assert.equal(notices.length, 0); assert.ok(nativeReads >= 1);
  const refs = readReferences(commits[0].references).references; assert.equal(refs.length, 1);
  assert.equal(refs[0].id, 'ref1'); assert.equal(refs[0].name, 'native-block'); assert.deepEqual(refs[0].source, { step });
  const local = await referenceLocal(refs[0], async input => evaluatePart(input, revision.current++, 8, 'read'));
  assert.equal(local.length, 1); assert.equal(local[0].key, 'ref1');
  assert.ok(local[0].volume !== null && Math.abs(local[0].volume - 24) <= 1e-9, `native STEP volume: ${local[0].volume}`);
  assert.ok(local[0].mesh.faces.length >= 6);
  assert.equal(commits[0].nodes, doc.nodes, 'adding a reference leaves the model feature tree unchanged');
  assert.deepEqual(doc, before);
});
