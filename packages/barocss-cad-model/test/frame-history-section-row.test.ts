import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields } from '../src/app/editFields';
import { emptyDoc, withNode, type ModelNode, type StudioDoc, type FrameSectionRow } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
const rows: FrameSectionRow[] = [20, 30].map(width => ({ id: `R${width}`, name: `Tube ${width}`, section: { kind: 'rect-tube', width, height: 10, wall: 2, outerRadius: 0 }, estimate: true }));
const member: Extract<ModelNode, { kind: 'frame-member' }> = { kind: 'frame-member', section: { kind: 'library', id: 'R20' }, start: [0, 0, 0], end: [0, 0, 100], up: [0, 1, 0], anchor: 'bottom-left', offset: [2, 3], roll: 0 };
const frame: Extract<ModelNode, { kind: 'frame' }> = { kind: 'frame', section: member.section, points: [[0, 0, 0], [0, 0, 100], [100, 0, 0], [100, 0, 100]], segments: [[0, 1], [2, 3]], up: [0, 1, 0], overrides: [{ member: 1, section: { kind: 'library', id: 'R20' }, anchor: 'top-right' }] };
const docOf = (node: ModelNode): StudioDoc => ({ ...withNode(emptyDoc(), node), frames: { version: 1, sections: rows } });
const fields = (doc: StudioDoc) => editFields(doc.nodes, 0, doc.parameters, undefined, { doc });
const rowField = (doc: StudioDoc) => { const field = fields(doc).find(f => f.key === 'sectionRow'); assert.ok(field, 'History Section row choice exists'); assert.equal(field.kind, 'choice'); if (field.kind !== 'choice') throw new Error('choice'); return field; };
test('library History exposes a row choice, never a numeric section ID', () => {
  for (const node of [member, frame]) {
    const doc = docOf(node); assert.equal(fields(doc).some(f => f.key === 's.id'), false);
    const f = rowField(doc); assert.equal(f.label, 'Section row'); assert.equal(f.get(doc.nodes), 'R20');
    assert.deepEqual(f.options.map(o => o.value), ['R20', 'R30']);
    const next = f.set(doc.nodes, 'R30');
    if (next[0].kind === 'frame' && doc.nodes[0].kind === 'frame') assert.equal(next[0].overrides, doc.nodes[0].overrides);
    assert.deepEqual(next[0], { ...doc.nodes[0], section: { kind: 'library', id: 'R30' } });
    assert.ok(f.options.every(option => option.label.includes('(estimate)')));
    assert.match(f.options[1].label, /30/);
    assert.deepEqual(f.set(doc.nodes, 'missing'), doc.nodes);
    assert.deepEqual(f.set([{ ...member, section: rows[0].section }], 'R30'), [{ ...member, section: rows[0].section }]);
    assert.equal((doc.nodes[0] as typeof member).section, node.section);
  }
});
test('missing and duplicate current rows remain explicit, and latest catalogue changes are rechecked', () => {
  for (const sections of [[], [rows[0], rows[0], rows[1]]]) {
    const doc = { ...docOf(member), frames: { version: 1 as const, sections } }, f = rowField(doc);
    assert.ok(f.options.some(o => o.value === 'R20' && /missing|ambiguous/.test(o.label)));
    assert.deepEqual(f.set(doc.nodes, 'R20'), doc.nodes);
  }
  const doc = { ...docOf(member), frames: { version: 1 as const, sections: [...rows] } }, f = rowField(doc);
  doc.frames.sections = [rows[0]];
  assert.deepEqual(f.set(doc.nodes, 'R30'), doc.nodes);
  const inline = docOf({ ...member, section: rows[0].section });
  assert.equal(fields(inline).some(f => f.key === 'sectionRow'), false);
  assert.ok(fields(inline).some(f => f.key === 's.width'));
});
test('row replacement changes native section geometry while preserving overridden member geometry', () => {
  for (const node of [member, frame]) {
    const doc = docOf(node), snapshot = JSON.stringify(doc), next = { ...doc, nodes: rowField(doc).set(doc.nodes, 'R30') };
    const before = evaluateDoc(doc, 1), after = evaluateDoc(next, 2); assert.ok(before.ok); assert.ok(after.ok);
    assert.ok(Math.abs(before.bodies[0].volume! - (20 * 10 - 16 * 6) * 100) < 1e-8);
    assert.ok(Math.abs(after.bodies[0].volume! - (30 * 10 - 26 * 6) * 100) < 1e-8);
    if (node.kind === 'frame') { assert.deepEqual(before.bodies[1].mesh.positions, after.bodies[1].mesh.positions); assert.equal(before.bodies[1].volume, after.bodies[1].volume); }
    assert.equal(JSON.stringify(doc), snapshot);
  }
});
