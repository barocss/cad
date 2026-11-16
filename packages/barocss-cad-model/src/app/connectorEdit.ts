import { connectorKeepOut } from '@barocss/cad';
import { prefixDoc, type StudioDoc } from '../engine/doc';
import { evaluateDoc } from '../engine/evaluate';
import { bodyKeyFor } from '../engine/ids';
import { refusal } from '../engine/refusal';
import type { Keepout } from '../engine/schema/references';
import { canonical } from '../util/revision';
import type { Command } from './commands';

const reject = (text: string): never => { throw refusal('BAD_REFERENCE', `Connector: ${text}`); };
/** Placement only, on the exact saved face; no row or face reassignment. */
export function connectorHistoryEdit(doc: StudioDoc, index: number): Command | null {
  if (!Number.isInteger(index)) return null;
  const selected = doc.nodes[index];
  const openingIndex = selected?.kind === 'connector-body' ? selected.opening : index;
  const opening = doc.nodes[openingIndex], tail = doc.nodes.slice(openingIndex);
  if (opening?.kind !== 'connector-opening' || !Number.isInteger(openingIndex) || openingIndex < 0
    || !(tail.length === 1 || (tail.length === 2 && tail[1].kind === 'connector-body' && tail[1].opening === openingIndex))
    || (index !== openingIndex && index !== openingIndex + 1)) return null;
  if (tail.some(node => node.held || node.suppressed || node.rematched || ('made' in node && node.made)
    || !node.id || doc.nodes.filter(other => other.id === node.id).length !== 1)) return null;
  if (!Number.isInteger(opening.parent.node) || opening.parent.node < 0 || opening.parent.node >= openingIndex
    || !opening.face || opening.face.includes('+') || opening.center.length !== 3 || !opening.center.every(Number.isFinite)
    || !Number.isFinite(opening.rotation ?? 0)) return null;
  const rows = doc.connectors?.rows.filter(row => row.id === opening.row);
  if (rows?.length !== 1) return null;
  const row = rows[0], id = `connector-n${openingIndex}`;
  let normal: [number, number, number] | undefined;
  const keepout = (center: [number, number, number], rotation: number): Keepout | null => {
    const ko = connectorKeepOut(row, center, normal!, rotation);
    return ko ? { id, name: `${row.name ?? row.id}: the plug's space`,
      frame: { origin: ko.frame.origin, normal: ko.frame.normal, xAxis: ko.frame.xAxis },
      shape: { kind: 'box', size: [ko.size[0], ko.size[1], ko.size[2]] }, clearance: 0 } : null;
  };
  const prove = () => {
    if (!normal) {
      const prefix = prefixDoc(doc, openingIndex), result = evaluateDoc(prefix, 0);
      if (!result.ok) return reject('the original History prefix cannot be evaluated.');
      const key = bodyKeyFor(prefix.nodes, opening.parent.node, opening.parent.side);
      const bodies = result.bodies.filter(body => body.key === key && body.ref?.node === opening.parent.node && body.ref.side === opening.parent.side);
      if (bodies.length !== 1) return reject('the original parent is missing or ambiguous.');
      const faces = bodies[0].mesh.faces.filter(face => face.name === opening.face && face.exact?.kind === 'plane' && !face.facet);
      if (faces.length !== 1) return reject('the exact original face is missing or ambiguous.');
      normal = [...faces[0].normal] as [number, number, number];
    }
    const expected = keepout(opening.center, opening.rotation ?? 0);
    const saved = doc.references?.keepouts.filter(k => k.id === id) ?? [];
    if (expected ? saved.length !== 1 || canonical(saved[0]) !== canonical(expected) : saved.length !== 0)
      throw refusal('CONNECTOR_EDIT_KEEPOUT', 'the saved keep-out is missing, modified or ambiguous. Recreate the connector instead.');
    return expected;
  };
  return {
    id: 'edit', label: 'Edit connector placement', icon: 'cad-connector', group: 'modify',
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current connector in History again.' },
    defaults: () => ({ x: opening.center[0], y: opening.center[1], z: opening.center[2], rot: opening.rotation ?? 0 }),
    fields: () => [
      ...(['x', 'y', 'z'] as const).map(key => ({ key, label: `Center ${key.toUpperCase()}`, kind: 'mm' as const })),
      { key: 'rot', label: 'Rotation', kind: 'deg' },
    ],
    steps: () => [{ label: 'Saved face', text: `${opening.face}; row ${opening.row}. The opening and its exact saved keep-out move together.`, done: true }],
    build: (ctx, values) => {
      if (ctx.doc !== doc) return reject('open the current connector in History again.');
      const keys = ['x', 'y', 'z', 'rot'] as const;
      if (keys.some(key => String(values[key] ?? '').trim() === '' || !Number.isFinite(Number(values[key])))) return reject('enter finite center coordinates and rotation.');
      const center = [Number(values.x), Number(values.y), Number(values.z)] as [number, number, number], rotation = Number(values.rot);
      const expected = prove();
      if (center.every((v, i) => v === opening.center[i]) && rotation === (opening.rotation ?? 0)) return doc;
      const next: typeof opening = { ...opening, center, rotation };
      if (rotation === 0) delete next.rotation;
      return { ...doc, nodes: doc.nodes.map((node, i) => i === openingIndex ? next : node),
        ...(expected ? { references: { ...doc.references!, keepouts: doc.references!.keepouts.map(k => k.id === id ? keepout(center, rotation)! : k) } } : {}) };
    },
  };
}
