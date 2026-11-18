import { checkBrep } from '@barocss/cad';
import type { ModelNode, StudioDoc } from '../engine/doc';
import { partSnapshot } from '../engine/part';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import type { Command } from './commands';

const only = (value: object, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const point = (value: readonly unknown[]) => value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v));
/** Test the saved copy, never regenerate it from its independently editable source. */
function rectangleCopy(node: ModelNode): boolean {
  if (node.kind !== 'sketch' || node.profile !== 'loop' || !only(node, ['id', 'kind', 'profile', 'segments'])
    || node.segments.length !== 4 || node.segments.some(s => s.kind !== 'line' || !only(s, ['kind', 'start']) || !point(s.start))) return false;
  const vertices = node.segments.map(s => s.start as [number, number]);
  if (new Set(vertices.map(v => canonical(v))).size !== 4
    || new Set(vertices.map(v => v[0])).size !== 2 || new Set(vertices.map(v => v[1])).size !== 2) return false;
  return vertices.every((v, i) => {
    const next = vertices[(i + 1) % 4];
    return (v[0] === next[0]) !== (v[1] === next[1]);
  });
}
function rectangleSource(node: ModelNode): boolean {
  if (node.kind !== 'sketch' || node.profile !== 'rectangle' || !only(node, ['id', 'kind', 'profile', 'min', 'max', 'plane'])
    || !point(node.min) || !point(node.max) || !(Number(node.max[0]) > Number(node.min[0]) && Number(node.max[1]) > Number(node.min[1]))) return false;
  const p = node.plane;
  return !p || (only(p, ['origin', 'normal', 'xAxis']) && canonical(p.normal) === '[0,0,1]' && canonical(p.xAxis) === '[1,0,0]'
    && p.origin.length === 3 && p.origin.every(Number.isFinite) && p.origin[0] === 0 && p.origin[1] === 0);
}
/** Explicit 3→2 station edit only; spare source/copy sketches and all History indexes survive. */
export function loftSectionHistoryEdit(doc: StudioDoc, index: number): Command | null {
  // Live command documents may retain an absent Direct field; actual geometry remains excluded.
  if (index !== 6 || doc.nodes.length !== 7 || doc.direct !== undefined
    || !only(doc, ['format', 'schema', 'units', 'parameters', 'nextId', 'nodes', 'outputs', 'direct'])) return null;
  const node = doc.nodes[index];
  if (node.kind !== 'loft' || !only(node, ['id', 'kind', 'sections', 'from', 'smooth']) || (node.smooth !== undefined && node.smooth !== false)
    || node.sections.length !== 3 || node.from?.length !== 3 || new Set(node.from).size !== 3
    || node.from.some(i => !Number.isInteger(i) || i < 0 || i > 2)
    || node.sections.some((s, i) => !only(s, ['sketch', 'z']) || s.sketch !== i + 3 || typeof s.z !== 'number' || !Number.isFinite(s.z)
      || (i > 0 && !(s.z > Number(node.sections[i - 1].z))))
    || doc.nodes.slice(0, 3).some(n => !rectangleSource(n)) || doc.nodes.slice(3, 6).some(n => !rectangleCopy(n))
    || doc.nodes.some(n => !n.id) || new Set(doc.nodes.map(n => n.id)).size !== 7
    || Object.values(doc.outputs).some(ref => ref.node !== index || ref.side !== 'solid')) return null;
  const revision = canonical(doc);
  const current = (d: StudioDoc) => d === doc && canonical(d) === revision;
  const prove = (d: StudioDoc) => {
    const outputs = partSnapshot(d).outputs;
    if (outputs.length !== 1 || outputs[0].id !== node.id || outputs[0].bodyCount !== 1 || !checkBrep(outputs[0].brep, { strict: true }).valid)
      throw refusal('BAD_REFERENCE', 'The saved Loft must evaluate to one valid solid.');
  };
  return {
    id: 'edit', label: 'Edit Loft sections', icon: 'cad-loft', group: 'modify',
    available: ctx => current(ctx.doc) ? { ok: true } : { ok: false, reason: 'Open the current Loft in History again.' },
    defaults: () => ({ middle: 'keep' }),
    fields: () => [{ key: 'middle', label: 'Middle section', kind: 'choice', options: [
      { value: 'keep', label: 'Keep all 3 sections' }, { value: 'remove', label: 'Remove middle section (2 sections)' },
    ] }],
    steps: () => [{ label: 'Saved sections', text: 'Removal connects the two end sections directly. Original and copied sketches stay in History. Undo restores the middle section; face and edge identities may change.', done: true }],
    build: (ctx, values) => {
      if (!current(ctx.doc)) throw refusal('BAD_REFERENCE', 'Open the current Loft in History again.');
      if (values.middle !== 'keep' && values.middle !== 'remove') throw refusal('VALUE', 'Choose whether to keep or remove the middle section.');
      prove(doc);
      if (values.middle === 'keep') return doc;
      const next = { ...node, sections: [node.sections[0], node.sections[2]], from: [node.from![0], node.from![2]] };
      const result = { ...doc, nodes: doc.nodes.map((n, i) => i === index ? next : n) };
      prove(result);
      return result;
    },
  };
}
