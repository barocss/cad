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
const triple = (x: unknown): x is [number, number, number] => Array.isArray(x) && x.length === 3 && [0, 1, 2].every(i => typeof x[i] === 'number' && Number.isFinite(x[i]));
function planarFrame(x: unknown): boolean {
  if (!object(x) || !only(x, ['origin', 'normal', 'xAxis']) || !triple(x.origin) || !triple(x.normal) || !triple(x.xAxis)) return false;
  const normal = x.normal, axis = x.xAxis;
  const n = Math.hypot(...normal), u = Math.hypot(...axis);
  if (!Number.isFinite(n) || !Number.isFinite(u) || n <= 1e-12 || u <= 1e-12) return false;
  const dot = normal.reduce((sum, v, i) => sum + (v / n) * (axis[i] / u), 0);
  return Number.isFinite(dot) && Math.abs(dot) <= 1e-9;
}
const edge = (x: unknown) => Array.isArray(x) && x.length === 1 && typeof x[0] === 'string' && !!x[0];
const parent = (x: unknown, index: number) => object(x) && only(x, ['node', 'side']) && x.node === index && x.side === 'solid';
const faces = (x: unknown): x is string[] => Array.isArray(x) && x.length > 0 && Array.from(x).every(v => typeof v === 'string' && !!v) && new Set(x).size === x.length;
const faceKey = (x: readonly string[]) => JSON.stringify([...x].sort());
function resolve(source: SheetRuleSource, body: BodyResult): FlangeBendOwner[] {
  const { doc, evaluated } = source;
  if (!source.available || !source.bodies.includes(body) || !body.flat || !body.sheet || body.flatRefused
    || !only(doc, ['format', 'schema', 'units', 'parameters', 'nodes', 'outputs', 'nextId'])
    || !only(evaluated, ['format', 'schema', 'units', 'parameters', 'nodes', 'outputs', 'nextId'])
    || doc.nodes.length < 4 || evaluated.nodes.length !== doc.nodes.length
    || !Array.from(doc.nodes).every((n, i) => n && n === evaluated.nodes[i] && typeof n.id === 'string' && !!n.id)
    || new Set(doc.nodes.map(n => n.id)).size !== doc.nodes.length) return [];
  const terminal = doc.nodes.length - 1;
  const keys = Object.keys(doc.outputs);
  if (keys.length !== 1 || keys[0] !== body.key || Object.keys(evaluated.outputs).length !== 1
    || !parent(doc.outputs[body.key], terminal) || !parent(evaluated.outputs[body.key], terminal) || !parent(body.ref, terminal)) return [];
  const [sketch, base] = doc.nodes;
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' || !only(sketch, ['id', 'kind', 'profile', 'min', 'max'])
    || !pair(sketch.min) || !pair(sketch.max) || sketch.max[0] <= sketch.min[0] || sketch.max[1] <= sketch.min[1]) return [];
  if (base.kind !== 'sheet-base' || !only(base, ['id', 'kind', 'sketch', 'thickness', 'bendRadius', 'kFactor', 'bendTable'])
    || base.sketch !== 0 || !positive(base.thickness) || !positive(base.bendRadius)) return [];
  if (base.bendTable !== undefined ? !object(base.bendTable) || !Array.isArray(base.bendTable.rows) || !base.bendTable.rows.length || base.kFactor !== undefined
    : typeof base.kFactor !== 'number' || !Number.isFinite(base.kFactor) || base.kFactor < 0 || base.kFactor > 1) return [];
  // A terminal explicit tool belongs only to this Difference. The preceding sheet chain
  // is still validated in full; no geometry or face ownership is inferred from this recipe.
  let chainEnd = doc.nodes.length;
  const cut = doc.nodes[terminal];
  if (cut.kind === 'difference') {
    const toolSketchIndex = terminal - 2, toolSketch = doc.nodes[toolSketchIndex], tool = doc.nodes[terminal - 1];
    if (toolSketchIndex < 4 || toolSketch.kind !== 'sketch' || toolSketch.profile !== 'rectangle'
      || !only(toolSketch, ['id', 'kind', 'profile', 'min', 'max', 'plane'])
      || !pair(toolSketch.min) || !pair(toolSketch.max)
      || !positive(toolSketch.max[0] - toolSketch.min[0]) || !positive(toolSketch.max[1] - toolSketch.min[1])
      || !planarFrame(toolSketch.plane)
      || tool.kind !== 'extrude' || !only(tool, ['id', 'kind', 'sketch', 'height'])
      || tool.sketch !== toolSketchIndex || !positive(tool.height)
      || !only(cut, ['id', 'kind', 'parent', 'tool'])
      || !parent(cut.parent, toolSketchIndex - 1) || !parent(cut.tool, terminal - 1)) return [];
    chainEnd = toolSketchIndex;
  }
  // Consume every prefix node: reliefs first, then flanges, then optional through holes.
  const flangeIndices = new Map<string, number>();
  let flangePhase = false, holePhase = false;
  for (let index = 2; index < chainEnd; index++) {
    const n = doc.nodes[index];
    if (n.kind === 'sheet-corner-relief' && !flangePhase) {
      if (!only(n, ['id', 'kind', 'parent', 'edges', 'shape', 'size', 'sig'])
        || !parent(n.parent, index - 1) || !edge(n.edges) || !['square', 'round'].includes(n.shape) || !positive(n.size)) return [];
      continue;
    }
    if (n.kind === 'hole') {
      if (flangeIndices.size < 2 || !only(n, ['id', 'kind', 'parent', 'center', 'radius', 'axis'])
        || !parent(n.parent, index - 1) || !pair(n.center) || !positive(n.radius)
        || (n.axis !== undefined && n.axis !== 'z')) return [];
      holePhase = true;
      continue;
    }
    if (holePhase || n.kind !== 'sheet-flange' || typeof n.id !== 'string'
      || !only(n, ['id', 'kind', 'parent', 'edges', 'length', 'angle', 'bendRadius', 'measure', 'position', 'sig'])
      || !parent(n.parent, index - 1) || !edge(n.edges) || !positive(n.length)
      || (n.angle !== undefined && n.angle !== 90) || (n.bendRadius !== undefined && !positive(n.bendRadius))
      || (n.measure !== undefined && n.measure !== 'outer') || (n.position !== undefined && n.position !== 'material-inside')) return [];
    flangePhase = true;
    flangeIndices.set(n.id, index);
  }
  if (flangeIndices.size < 2) return [];
  // This sidecar is produced from typed native provenance, never parsed from display bend names.
  const owners = body.sheetBendOwners;
  if (!owners || owners.length !== flangeIndices.size || body.flat.bends.length !== flangeIndices.size) return [];
  const byFaces = new Map<string, number>(), ownerIds = new Set<string>(), allFaces = new Set<string>();
  for (const owner of owners) {
    const index = flangeIndices.get(owner.featureId);
    if (index === undefined || ownerIds.has(owner.featureId) || !faces(owner.faces)) return [];
    ownerIds.add(owner.featureId);
    for (const face of owner.faces) {
      if (allFaces.has(face)) return [];
      allFaces.add(face);
    }
    byFaces.set(faceKey(owner.faces), index);
  }
  const rows: FlangeBendOwner[] = [], consumed = new Set<number>();
  for (const bend of body.flat.bends) {
    if (!faces(bend.faces)) return [];
    const index = byFaces.get(faceKey(bend.faces));
    if (index === undefined || consumed.has(index)) return [];
    consumed.add(index);
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
