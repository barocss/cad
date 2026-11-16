import { prefixDoc, type StudioDoc, type ModelNode } from '../engine/doc';
import { refusal } from '../engine/refusal';
import { canonical } from '../util/revision';
import { primitives } from './primitives';
import { subdPrimitiveValues } from './subdPrimitiveRecipe';
import type { Command, Ctx, Values } from './commands';

/** No inverse fitting: only an untouched, terminal, explicitly saved one-node recipe. */
export function subdPrimitiveHistoryEdit(doc: StudioDoc, index: number): Command | null {
  const node = doc.nodes[index];
  if (!Number.isInteger(index) || index !== doc.nodes.length - 1 || node?.kind !== 'subd'
    || node.mirror !== undefined || node.held || node.suppressed || node.rematched || !node.id
    || doc.nodes.filter(n => n.id === node.id).length !== 1) return null;
  const made = node.made;
  if (!made || made.nodes !== 1 || !['subd-torus', 'subd-tube'].includes(made.command)
    || !made.values || typeof made.values !== 'object' || Array.isArray(made.values)) return null;
  const kind = made.command as 'subd-torus' | 'subd-tube', command = primitives.find(c => c.id === kind)!;
  const rebuild = (values: Values): Extract<ModelNode, { kind: 'subd' }> => {
    const input = prefixDoc(doc, index);
    const ctx: Ctx = { doc: input, bodies: [], selection: { bodies: [], edges: [], faces: [] } };
    const result = command.build!(ctx, values).nodes[index];
    if (result?.kind !== 'subd' || !result.cage.positions.every(Number.isFinite)) throw refusal('PRIMITIVE_SIZE', 'SubD primitive coordinates must remain finite.');
    return { ...result, id: node.id };
  };
  try {
    subdPrimitiveValues(kind, made.values, true);
    if (canonical(rebuild(made.values)) !== canonical(node)) return null;
  } catch { return null; }
  return {
    ...command, id: 'edit', label: `Edit ${command.label}`, group: 'modify', place: undefined,
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current SubD primitive in History again.' },
    defaults: () => ({ ...made.values }),
    build: (ctx, values) => {
      if (ctx.doc !== doc) throw refusal('BAD_REFERENCE', 'Open the current SubD primitive in History again.');
      const next = rebuild(values);
      return canonical(next) === canonical(node) ? doc : { ...doc, nodes: doc.nodes.map((n, i) => i === index ? next : n) };
    },
  };
}
