import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { sameSheetRuleSource, type SheetRuleSource } from './sharedSheetRules';

type Node = StudioDoc['nodes'][number];
type Bend = NonNullable<BodyResult['flat']>['bends'][number];
export interface FlangeBendOwner {
  readonly bend: Bend;
  readonly index: number;
  readonly id: string;
  readonly node: Node;
  readonly rulesIndex: number;
  readonly rulesId: string;
  readonly rulesNode: Node;
  readonly radiusSource: 'own' | 'sheet';
  readonly rulesSource: 'k-factor' | 'bend-table';
}
const issued = new WeakMap<FlangeBendOwner, { source: SheetRuleSource; body: BodyResult; snapshot: string }>();
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const only = (x: object, keys: string[]) => Object.keys(x).every(k => keys.includes(k) || (x as Record<string, unknown>)[k] === undefined);
const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const pair = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && [0, 1].every(i => typeof x[i] === 'number' && Number.isFinite(x[i]));
const edge = (x: unknown) => Array.isArray(x) && x.length === 1 && typeof x[0] === 'string' && !!x[0];
const parent = (x: unknown, index: number) => object(x) && only(x, ['node', 'side']) && x.node === index && x.side === 'solid';
const faces = (x: unknown): x is string[] => Array.isArray(x) && x.length > 0 && Array.from(x).every(v => typeof v === 'string' && !!v) && new Set(x).size === x.length;
const faceKey = (x: readonly string[]) => JSON.stringify([...x].sort());
function resolve(source: SheetRuleSource, body: BodyResult): FlangeBendOwner[] {
  const { doc, evaluated } = source;
  if (!source.available || !source.bodies.includes(body) || !body.flat || !body.sheet || body.flatRefused
    || !only(doc, ['format', 'schema', 'units', 'parameters', 'nodes', 'outputs', 'nextId'])
    || !only(evaluated, ['format', 'schema', 'units', 'parameters', 'nodes', 'outputs', 'nextId'])
    || doc.nodes.length !== 5 || evaluated.nodes.length !== 5
    || !doc.nodes.every((n, i) => n === evaluated.nodes[i] && typeof n.id === 'string' && !!n.id)
    || new Set(doc.nodes.map(n => n.id)).size !== 5) return [];
  const keys = Object.keys(doc.outputs);
  if (keys.length !== 1 || keys[0] !== body.key || Object.keys(evaluated.outputs).length !== 1
    || !parent(doc.outputs[body.key], 4) || !parent(evaluated.outputs[body.key], 4) || !parent(body.ref, 4)) return [];
  const [sketch, base, relief, a, b] = doc.nodes;
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' || !only(sketch, ['id', 'kind', 'profile', 'min', 'max'])
    || !pair(sketch.min) || !pair(sketch.max) || sketch.max[0] <= sketch.min[0] || sketch.max[1] <= sketch.min[1]) return [];
  if (base.kind !== 'sheet-base' || !only(base, ['id', 'kind', 'sketch', 'thickness', 'bendRadius', 'kFactor', 'bendTable'])
    || base.sketch !== 0 || !positive(base.thickness) || !positive(base.bendRadius)) return [];
  if (base.bendTable !== undefined ? !object(base.bendTable) || !Array.isArray(base.bendTable.rows) || !base.bendTable.rows.length || base.kFactor !== undefined
    : typeof base.kFactor !== 'number' || !Number.isFinite(base.kFactor) || base.kFactor < 0 || base.kFactor > 1) return [];
  if (relief.kind !== 'sheet-corner-relief' || !only(relief, ['id', 'kind', 'parent', 'edges', 'shape', 'size', 'sig'])
    || !parent(relief.parent, 1) || !edge(relief.edges) || !['square', 'round'].includes(relief.shape) || !positive(relief.size)) return [];
  for (const [n, p] of [[a, 2], [b, 3]] as const) {
    if (n.kind !== 'sheet-flange' || !only(n, ['id', 'kind', 'parent', 'edges', 'length', 'angle', 'bendRadius', 'measure', 'position', 'sig'])
      || !parent(n.parent, p) || !edge(n.edges) || !positive(n.length)
      || (n.angle !== undefined && n.angle !== 90) || (n.bendRadius !== undefined && !positive(n.bendRadius))
      || (n.measure !== undefined && n.measure !== 'outer') || (n.position !== undefined && n.position !== 'material-inside')) return [];
  }
  // This sidecar is produced from typed native provenance, never parsed from display bend names.
  const owners = body.sheetBendOwners;
  if (!owners || owners.length !== 2 || body.flat.bends.length !== 2 || new Set(owners.map(o => o.featureId)).size !== 2
    || owners.some(o => !faces(o.faces)) || owners[0].faces.some(f => owners[1].faces.includes(f))) return [];
  const rows: FlangeBendOwner[] = [];
  for (const bend of body.flat.bends) {
    if (!faces(bend.faces)) return [];
    const matches = owners.filter(o => faceKey(o.faces) === faceKey(bend.faces));
    if (matches.length !== 1) return [];
    const index = doc.nodes.findIndex(n => n.id === matches[0].featureId);
    if (index !== 3 && index !== 4 || rows.some(r => r.index === index)) return [];
    const node = doc.nodes[index];
    if (node.kind !== 'sheet-flange' || typeof node.id !== 'string' || typeof base.id !== 'string') return [];
    rows.push(Object.freeze({ bend, index, id: node.id, node, rulesIndex: 1, rulesId: base.id, rulesNode: base,
      radiusSource: node.bendRadius === undefined ? 'sheet' : 'own', rulesSource: base.bendTable ? 'bend-table' : 'k-factor' }));
  }
  return rows;
}
const snapshot = (source: SheetRuleSource, body: BodyResult) => JSON.stringify([source.doc, source.evaluated, body.ref, body.key, body.sheet, body.flat, body.sheetBendOwners]);
/** Navigation only: does not admit or perform an edit of either History node. */
export function flangeBendOwners(source: SheetRuleSource, body: BodyResult): readonly FlangeBendOwner[] {
  try {
    const rows = resolve(source, body), saved = snapshot(source, body);
    for (const row of rows) issued.set(row, { source: { ...source }, body, snapshot: saved });
    return rows;
  } catch { return []; }
}
/** Recheck the exact issued row after any deferred History decision. */
export function canOpenFlangeBendOwner(source: SheetRuleSource, current: SheetRuleSource, body: BodyResult, row: FlangeBendOwner): boolean {
  try {
    const receipt = issued.get(row);
    if (!receipt || receipt.body !== body || !source.available || !current.available
      || !sameSheetRuleSource(receipt.source, source, body) || !sameSheetRuleSource(source, current, body)
      || snapshot(current, body) !== receipt.snapshot) return false;
    return resolve(current, body).some(r => r.bend === row.bend && r.node === row.node && r.rulesNode === row.rulesNode
      && r.index === row.index && r.id === row.id && r.radiusSource === row.radiusSource && r.rulesSource === row.rulesSource);
  } catch { return false; }
}
