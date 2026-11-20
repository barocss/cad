import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import { prefixDoc as radiusPrefix } from "@barocss/cad-model/engine/doc";
import type { EditField } from '@barocss/cad-model/app/editFields';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { canonical } from '@barocss/cad-model/util/revision';

type Flange = Extract<ModelNode, { kind: 'sheet-flange' }>;
type Bend = NonNullable<BodyResult['flat']>['bends'][number];
const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const point = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && Array.from(x).every(Number.isFinite);
const only = (x: object, keys: readonly string[]) => Object.entries(x).every(([k, v]) => v === undefined || keys.includes(k));
const solid = (x: { node: number; side: string } | undefined, node: number) =>
  !!x && only(x, ['node', 'side']) && x.node === node && x.side === 'solid';
const singleton = (a: readonly unknown[], x: unknown) => a.length === 1 && a[0] === x;
const near = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 1e-9;

function scope(doc: StudioDoc) {
  if (!only(doc, ['format', 'schema', 'units', 'nodes', 'outputs', 'parameters', 'nextId'])
      || doc.format !== 'barocss-cad-model' || doc.schema !== 3 || doc.units !== 'mm'
      || typeof doc.nextId !== 'number' || !Number.isInteger(doc.nextId) || doc.nextId < 4 || Object.keys(doc.parameters).length || doc.nodes.length !== 4
      || Array.from(doc.nodes).some(n => typeof n?.id !== 'string' || !n.id)
      || new Set(doc.nodes.map(n => n.id)).size !== 4) return null;
  const [sketch, base, first, last] = doc.nodes;
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' || !only(sketch, ['id', 'kind', 'profile', 'min', 'max'])
      || !point(sketch.min) || !point(sketch.max) || sketch.min[0] >= sketch.max[0] || sketch.min[1] >= sketch.max[1]
      || base.kind !== 'sheet-base' || !only(base, ['id', 'kind', 'sketch', 'thickness', 'bendRadius', 'kFactor'])
      || base.sketch !== 0 || !positive(base.thickness) || !positive(base.bendRadius)
      || typeof base.kFactor !== 'number' || !Number.isFinite(base.kFactor) || base.kFactor < 0 || base.kFactor > 1) return null;
  function isFlange(n: ModelNode, parent: number, edge: string): n is Flange {
    return n.kind === 'sheet-flange' && only(n, ['id', 'kind', 'parent', 'edges', 'length', 'angle', 'bendRadius', 'measure', 'position', 'sigs'])
      && solid(n.parent, parent) && Array.isArray(n.edges) && singleton(n.edges, edge)
      && positive(n.length) && (n.bendRadius === undefined || positive(n.bendRadius))
      && (n.angle === undefined || n.angle === 90)
      && (n.measure === undefined || n.measure === 'outer') && (n.position === undefined || n.position === 'material-inside');
  }
  const edge = `${base.id}.side2|${base.id}.top`;
  if (!isFlange(first, 1, `${base.id}.side0|${base.id}.top`) || !isFlange(last, 2, edge)
      || !positive(last.bendRadius)) return null;
  const key = bodyKeyFor(doc.nodes, 3, 'solid');
  if (!singleton(Object.keys(doc.outputs), key) || !solid(doc.outputs[key], 3)) return null;
  return { min: sketch.min, max: sketch.max, baseId: base.id, thickness: base.thickness, ruleRadius: base.bendRadius,
    kFactor: base.kFactor, first, last, edge, key, own: last.bendRadius };
}

/** This envelope alone does not admit the editor field or a commit. */
export function isOppositeFlangeRadiusMutation(before: StudioDoc, after: StudioDoc, index: number): boolean {
  try {
    const a = scope(before), b = scope(after);
    return index === 3 && !!a && !!b && a.own !== b.own
      && before.nodes.slice(0, 3).every((n, i) => n === after.nodes[i])
      && canonical({ ...before, nodes: [...before.nodes.slice(0, 3), { ...a.last, bendRadius: 0 }] })
        === canonical({ ...after, nodes: [...after.nodes.slice(0, 3), { ...b.last, bendRadius: 0 }] });
  } catch { return false; }
}

function proveParent(doc: StudioDoc, s: NonNullable<ReturnType<typeof scope>>, p: BodyResult): boolean {
  const top = `${s.baseId}.top`, side = `${s.baseId}.side2`;
  if (p.key !== bodyKeyFor(doc.nodes, 2, 'solid') || !solid(p.ref, 2)) return false;
  const matches = p.mesh.edges.filter(e => e.names.includes(s.edge));
  if (matches.length !== 1) return false;
  const e = matches[0];
  if (!singleton(e.names, s.edge) || !e.straight || e.axis !== 'x'
      || !e.nativeJoint?.edgeId || new Set(e.nativeJoint.faces).size !== 2
      || Array.from(e.nativeJoint.faces).some(x => typeof x !== 'string' || !x)) return false;
  const planes = e.faces.map(i => p.mesh.faces[i]);
  if (planes.length !== 2 || ![side, top].every((name, i) => {
    const hits = planes.filter(x => x?.name === name && x.nativePlaneName === name);
    return hits.length === 1 && canonical(hits[0].normal) === canonical(i === 0 ? [0, 1, 0] : [0, 0, 1]);
  })) return false;
  const [lo, hi] = e.a[0] < e.b[0] ? [e.a, e.b] : [e.b, e.a];
  if (lo[0] !== s.min[0] || hi[0] !== s.max[0]
      || [lo, hi].some(pt => pt[1] !== s.max[1] || pt[2] !== s.thickness)) return false;
  const sigs = s.last.sigs;
  if (sigs === undefined) return true;
  const native = signaturesOf(p).edges.get(s.edge);
  return !!native && native.kind === 'line' && native.shared === undefined
    && singleton(Object.keys(sigs), s.edge) && canonical(sigs[s.edge]) === canonical(toSig(native));
}

function bendRows(s: NonNullable<ReturnType<typeof scope>>, bodies: readonly BodyResult[]): [Bend, Bend] | null {
  if (bodies.length !== 1) return null;
  const b = bodies[0];
  const owners = b.sheetBendOwners, bends = b.flat?.bends;
  if (b.key !== s.key || !solid(b.ref, 3) || !b.sheet || b.flatRefused || owners?.length !== 2 || bends?.length !== 2) return null;
  const selected: Bend[] = [];
  const firstRadius = s.first.bendRadius ?? s.ruleRadius;
  if (!positive(firstRadius)) return null;
  for (const [node, radius] of [[s.first, firstRadius], [s.last, s.own]] as const) {
    const native = owners.filter(o => o.featureId === node.id);
    if (native.length !== 1 || native[0].faces.length !== 1 || !native[0].faces[0]) return null;
    const rows = bends.filter(r => singleton(r.faces, native[0].faces[0]));
    if (rows.length !== 1 || selected.includes(rows[0])) return null;
    const r = rows[0];
    if (!near(r.radius, radius) || !near(r.angle, 90) || !near(r.kFactor, s.kFactor)
        || !near(r.allowance, Math.PI / 2 * (radius + s.kFactor * s.thickness))) return null;
    selected.push(r);
  }
  return [selected[0], selected[1]];
}

/** Read-only proof for the specific original prefix and terminal packets; callers must own their exact revisions. */
export function proveOppositeFlangeRadiusMutation(before: StudioDoc, after: StudioDoc, index: number,
  parent: readonly BodyResult[], original: readonly BodyResult[], candidate: readonly BodyResult[]): boolean {
  try {
    if (!isOppositeFlangeRadiusMutation(before, after, index)) return false;
    const a = scope(before)!, b = scope(after)!;
    if (parent.length !== 1 || !proveParent(before, a, parent[0])) return false;
    const old = bendRows(a, original), next = bendRows(b, candidate);
    return !!old && !!next && canonical(old[0]) === canonical(next[0])
      && canonical(old[1].faces) === canonical(next[1].faces);
  } catch { return false; }
}

type EvalResult = Awaited<ReturnType<typeof import('@barocss/cad-model/engine/evaluate').evaluatePart>>;
type EvaluateAt = (doc: StudioDoc, revision: number) => Promise<EvalResult | null>;
/** Run fresh, ordered packet reads; never install a result or publish an editor field here. */
export async function checkOppositeFlangeRadiusApply(before: StudioDoc, after: StudioDoc, index: number, io: {
  current(): boolean;
  nextRevision(): number;
  refs: EvaluateAt;
  evaluate: EvaluateAt;
  onProved?(bodies: BodyResult[]): void;
}): Promise<'proved' | 'refused' | 'stale'> {
  if (!io.current()) return 'stale';
  if (!isOppositeFlangeRadiusMutation(before, after, index)) return 'refused';
  const oldSource = canonical(before), nextSource = canonical(after);
  const owned = () => io.current() && canonical(before) === oldSource && canonical(after) === nextSource;
  async function exactRead(doc: StudioDoc, read: EvaluateAt) {
    const requested = io.nextRevision();
    const reply = await read(doc, requested);
    return reply?.ok && reply.revision === requested ? reply.bodies : null;
  }
  try {
    const parent = await exactRead(radiusPrefix(before, 3), io.refs);
    if (!owned()) return 'stale';
    if (!parent || parent.length !== 1 || !proveParent(before, scope(before)!, parent[0])) return 'refused';
    const old = await exactRead(radiusPrefix(before, 4), io.refs);
    if (!owned()) return 'stale';
    if (!old || !bendRows(scope(before)!, old)) return 'refused';
    const candidate = await exactRead(after, io.evaluate);
    if (!owned()) return 'stale';
    if (!candidate || !proveOppositeFlangeRadiusMutation(before, after, index, parent, old, candidate)) return 'refused';
    io.onProved?.(candidate);
    return owned() ? 'proved' : 'stale';
  } catch { return owned() ? 'refused' : 'stale'; }
}

/** Editor projection only; preview and Apply must each prove native ownership. */
export function oppositeFlangeOwnRadiusField(doc: StudioDoc | undefined, nodes: ModelNode[], index: number): EditField | null {
  if (!doc || !scope(doc) || index !== 3) return null;
  const stamp = canonical(doc);
  const field: EditField = { kind: 'number', key: 'ownBendRadius', label: 'Bend radius', unit: 'mm',
    get: current => current[index]?.kind === 'sheet-flange' && positive(current[index].bendRadius) ? current[index].bendRadius : NaN,
    set: (current, value) => {
      if (current !== nodes || canonical(doc) !== stamp || !positive(value) || current[index]?.kind !== 'sheet-flange') return [...current];
      const old = current[index];
      const next = current.map((n, i) => i === index ? { ...old, bendRadius: value } : n);
      return canonical(next) === canonical(doc.nodes) || isOppositeFlangeRadiusMutation(doc, { ...doc, nodes: next }, index) ? next : [...current];
    } };
  if (nodes !== doc.nodes && canonical(nodes) !== canonical(doc.nodes)
      && !isOppositeFlangeRadiusMutation(doc, { ...doc, nodes }, index)) return null;
  return field;
}
