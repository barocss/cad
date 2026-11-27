import { checkBrep, type Brep, type BrepEdge } from '../brep/brep-core.js';
import { cardinalBoxOf } from './part-box-shell.js';
import { assertEvaluatedSnapshot, CadPartError, CadPartLimits, outputOf, reevaluate } from './part-model.js';
import type { CadPartAxis, CadPartOutput, CadPartSnapshot } from './part-types.js';

export type SplitTopologyKind = 'face' | 'edge';
export type SplitTopologySide = 'negative' | 'positive';
export interface SplitTopologySource { readonly kind: SplitTopologyKind; readonly id: string; readonly name?: string }
export interface SplitTopologyImage extends SplitTopologySource {
  readonly side: SplitTopologySide; readonly outputId: string; readonly bodyId: string;
}
export interface SplitTopologyMapping {
  readonly source: SplitTopologySource;
  /** Retained identifies an output with the same complete geometry as the source. */
  readonly relation: 'retained' | 'modified' | 'deleted';
  readonly images: readonly SplitTopologyImage[];
}
export interface SplitTopologySideReceipt {
  readonly side: SplitTopologySide;
  readonly output: { readonly outputId: string; readonly bodyId: string };
  readonly mappings: readonly SplitTopologyMapping[];
  readonly generated: readonly SplitTopologyImage[];
}
export interface SplitTopologyEvolutionReceipt {
  readonly schema: 'barocss-split-topology-evolution'; readonly version: 0;
  readonly featureId: string;
  readonly parent: { readonly outputId: string; readonly bodyId: string };
  readonly plane: { readonly axis: CadPartAxis; readonly at: number };
  readonly sources: readonly SplitTopologySource[];
  readonly sides: readonly [SplitTopologySideReceipt, SplitTopologySideReceipt];
  readonly scope: 'original-cardinal-rectangle-axis-split';
  readonly authority: 'actual-native-snapshots-and-exact-support-grid';
  readonly persistentNamingCertified: false;
}
export type SplitTopologyResolution =
  | { readonly status: 'unique'; readonly image: SplitTopologyImage }
  | { readonly status: 'ambiguous'; readonly images: readonly SplitTopologyImage[] }
  | { readonly status: 'deleted' | 'unmatched' };

type Box = NonNullable<ReturnType<typeof cardinalBoxOf>>;
type Qualified = { output: CadPartOutput; brep: Brep; box: Box; faces: Map<string, Brep['faces'][number]>; edges: Map<string, BrepEdge> };
const axes = ['x', 'y', 'z'] as const;
const receipts = new WeakSet<object>();
const role = (axis: number, side: number) => `${axis}:${side}`;
const refuse = (code: 'INPUT' | 'CAPABILITY' | 'REFERENCE' | 'GEOMETRY', feature: string | null, detail: string): never => {
  throw new CadPartError(code, feature, `Split topology evolution: ${detail}`);
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** The exact line's varying axis and its two fixed support coordinates. */
function edgeKey(edge: BrepEdge): string {
  const [a, b] = edge.curve.controlPoints, axis = a.findIndex((value, i) => value !== b[i]);
  return JSON.stringify([axis, ...a.filter((_, i) => i !== axis)]);
}

function qualify(output: CadPartOutput, featureId: string): Qualified {
  const brep = output.brep, box = cardinalBoxOf(brep);
  if (!box || !checkBrep(brep, { strict: true }).valid
    || brep.vertices.some(vertex => vertex.point.some(value => !Number.isFinite(value) || Math.abs(value) > CadPartLimits.length)))
    return refuse('CAPABILITY', featureId, 'one strict closed cardinal native box per input and result is required.');
  for (const records of [brep.faces, brep.edges]) {
    const names = records.map(record => record.name);
    if (names.some(name => typeof name !== 'string' || !name) || new Set(names).size !== records.length)
      return refuse('CAPABILITY', featureId, 'every native face and edge needs one unique original name.');
  }
  const faces = new Map(brep.faces.map(face => { const side = box.sides.get(face.id)!; return [role(side.axis, side.side), face]; }));
  const edges = new Map(brep.edges.map(edge => [edgeKey(edge), edge]));
  if (faces.size !== 6 || edges.size !== 12) return refuse('CAPABILITY', featureId, 'native support roles must be unique.');
  return { output, brep, box, faces, edges };
}

function inputs(snapshot: CadPartSnapshot, featureId: string) {
  assertEvaluatedSnapshot(snapshot);
  const doc = snapshot.document, index = doc.features.findIndex(feature => feature.id === featureId), split = doc.features[index];
  if (index < 0 || split.kind !== 'split') return refuse('REFERENCE', featureId, 'choose an existing Split feature.');
  if (split.normal !== undefined || !axes.includes(split.axis!)) return refuse('CAPABILITY', featureId, 'only an authored coordinate-axis Split is admitted.');
  const parentIndex = doc.features.findIndex(feature => feature.id === split.target), parent = doc.features[parentIndex];
  if (parentIndex < 0 || parentIndex >= index || parent.kind !== 'extrude' || (parent.draft !== undefined && parent.draft !== 0))
    return refuse('CAPABILITY', featureId, 'the target must be one original zero-draft rectangular extrusion.');
  const sketchIndex = doc.features.findIndex(feature => feature.id === parent.sketch), sketch = doc.features[sketchIndex];
  if (sketchIndex < 0 || sketchIndex >= parentIndex || sketch.kind !== 'sketch' || sketch.profile !== 'rectangle'
    || sketch.holes?.length || sketch.regions?.length)
    return refuse('CAPABILITY', featureId, 'one original rectangular sketch without holes or regions is required.');
  const at = typeof split.at === 'number' ? split.at : doc.parameters[split.at.parameter], axis = axes.indexOf(split.axis!);
  const sourceSnapshot = reevaluate(snapshot, { document: { ...doc, features: doc.features.slice(0, parentIndex + 1) } });
  const operation = reevaluate(snapshot, { document: { ...doc, features: doc.features.slice(0, index + 1) } });
  const source = qualify(outputOf(sourceSnapshot, parent.id), featureId), outputIds = [`${featureId}/0`, `${featureId}/1`];
  if (operation.outputs.filter(output => output.feature === featureId).length !== 2)
    return refuse('CAPABILITY', featureId, 'both original Split results must be present.');
  const results = outputIds.map(id => qualify(outputOf(operation, id), featureId));
  if (!Number.isFinite(at) || !(source.box.ranges[axis][0] < at && at < source.box.ranges[axis][1]))
    return refuse('CAPABILITY', featureId, 'the plane must cross the strict interior of the original box.');
  for (const [side, result] of results.entries()) for (let k = 0; k < 3; k++) {
    const expected = k === axis ? side === 0 ? [source.box.ranges[k][0], at] : [at, source.box.ranges[k][1]] : source.box.ranges[k];
    if (!result.box.ranges[k].every((value, end) => value === expected[end]))
      return refuse('GEOMETRY', featureId, 'the actual native results do not exactly partition the original support grid.');
  }
  return { source, results, at, axis };
}

function sideReceipt(source: Qualified, result: Qualified, side: SplitTopologySide, axis: number, at: number,
  sources: readonly SplitTopologySource[], featureId: string): SplitTopologySideReceipt {
  const image = (kind: SplitTopologyKind, entity: { id: string; name?: string }): SplitTopologyImage => ({ kind, id: entity.id,
    ...(entity.name === undefined ? {} : { name: entity.name }), side, outputId: result.output.id, bodyId: result.brep.bodies[0].id });
  const bySource = new Map<string, { relation: 'retained' | 'modified'; image: SplitTopologyImage }>();
  const generated: SplitTopologyImage[] = [], originalNames = new Set(sources.map(source => source.name));
  let capId: string | undefined;
  for (const face of result.brep.faces) {
    const position = result.box.sides.get(face.id)!, boundary = result.box.ranges[position.axis][position.side];
    if (position.axis === axis && boundary === at) {
      if (originalNames.has(face.name)) return refuse('GEOMETRY', featureId, 'the generated cap cannot reuse an original entity name.');
      capId = face.id; generated.push(image('face', face)); continue;
    }
    const original = source.faces.get(role(position.axis, position.side))!;
    if (face.name !== original.name) return refuse('GEOMETRY', featureId, 'a retained support lost its original native face name.');
    bySource.set(`face:${original.id}`, { relation: position.axis === axis ? 'retained' : 'modified', image: image('face', face) });
  }
  const loopFaces = new Map(result.brep.loops.map(loop => [loop.id, loop.face]));
  const edgeFaces = new Map<string, string[]>();
  for (const use of result.brep.coedges) {
    const incident = edgeFaces.get(use.edge) ?? [];
    incident.push(loopFaces.get(use.loop)!); edgeFaces.set(use.edge, incident);
  }
  for (const edge of result.brep.edges) {
    const poles = edge.curve.controlPoints;
    if (poles.every(point => point[axis] === at)) {
      const incident = edgeFaces.get(edge.id)!;
      if (!capId || incident.length !== 2 || !incident.includes(capId) || originalNames.has(edge.name))
        return refuse('GEOMETRY', featureId, 'a generated boundary edge must belong to the actual new cap.');
      generated.push(image('edge', edge)); continue;
    }
    const original = source.edges.get(edgeKey(edge));
    if (!original || edge.name !== original.name) return refuse('GEOMETRY', featureId, 'an output edge has no exact original support-grid owner.');
    const changed = poles[0][axis] !== poles[1][axis];
    bySource.set(`edge:${original.id}`, { relation: changed ? 'modified' : 'retained', image: image('edge', edge) });
  }
  if (generated.filter(entity => entity.kind === 'face').length !== 1 || generated.filter(entity => entity.kind === 'edge').length !== 4
    || bySource.size !== 13) return refuse('GEOMETRY', featureId, 'the actual cap and original face/edge images are incomplete.');
  return { side, output: { outputId: result.output.id, bodyId: result.brep.bodies[0].id },
    mappings: sources.map(source => {
      const match = bySource.get(`${source.kind}:${source.id}`);
      return { source, relation: match?.relation ?? 'deleted', images: match ? [match.image] : [] };
    }), generated };
}

/** Opt-in read only. Uses actual cached source/operation prefixes without changing the Split producer or saved document. */
export function splitTopologyEvolutionOf(snapshot: CadPartSnapshot, featureId: string): SplitTopologyEvolutionReceipt {
  const { source, results, at, axis } = inputs(snapshot, featureId);
  const sources: SplitTopologySource[] = [
    ...source.brep.faces.map(face => ({ kind: 'face' as const, id: face.id, name: face.name! })),
    ...source.brep.edges.map(edge => ({ kind: 'edge' as const, id: edge.id, name: edge.name! })),
  ];
  const receipt: SplitTopologyEvolutionReceipt = freeze({ schema: 'barocss-split-topology-evolution', version: 0, featureId,
    parent: { outputId: source.output.id, bodyId: source.brep.bodies[0].id }, plane: { axis: axes[axis], at }, sources,
    sides: [sideReceipt(source, results[0], 'negative', axis, at, sources, featureId), sideReceipt(source, results[1], 'positive', axis, at, sources, featureId)],
    scope: 'original-cardinal-rectangle-axis-split', authority: 'actual-native-snapshots-and-exact-support-grid', persistentNamingCertified: false });
  receipts.add(receipt);
  return receipt;
}

/** Resolve only a genuine immutable read receipt; unknown, deleted and multiple images never select a fallback. */
export function resolveSplitTopologySource(receipt: SplitTopologyEvolutionReceipt, source: Pick<SplitTopologySource, 'kind' | 'id'>,
  side?: SplitTopologySide): SplitTopologyResolution {
  if (!receipts.has(receipt) || !source || (source.kind !== 'face' && source.kind !== 'edge') || typeof source.id !== 'string'
    || (side !== undefined && side !== 'negative' && side !== 'positive'))
    return refuse('INPUT', null, 'use an unchanged receipt from splitTopologyEvolutionOf and a face or edge source.');
  const original = receipt.sources.find(entity => entity.kind === source.kind && entity.id === source.id);
  if (!original) return { status: 'unmatched' };
  const images = receipt.sides.filter(result => side === undefined || result.side === side)
    .flatMap(result => result.mappings.find(mapping => mapping.source === original)!.images);
  if (images.length === 0) return { status: 'deleted' };
  if (images.length > 1) return { status: 'ambiguous', images: Object.freeze(images) };
  return { status: 'unique', image: images[0] };
}
