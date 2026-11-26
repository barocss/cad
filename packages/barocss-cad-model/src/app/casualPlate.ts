import { tessellateBrep } from '@barocss/cad';
import { emptyDoc, type Dim, type ModelNode, type StudioDoc } from '../engine/doc';
import { brepsFor } from '../engine/evaluate';
import { featureId } from '../engine/ids';

type HoleNode = Extract<ModelNode, { kind: 'hole' }>;
export type CasualHole = { id: string; index: number; label: 'A' | 'B'; diameter: number; x: number; y: number };
export type PlateScene = {
  holes: readonly [CasualHole, CasualHole];
  mesh: ReturnType<typeof tessellateBrep>;
  wallOwners: ReadonlyMap<string, string>;
  rimOwners: ReadonlyMap<string, string>;
};
export type PlateDocument = { doc: StudioDoc; scene: PlateScene };
type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
const bad = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const allowed = (obj: object, keys: string[]) => Object.keys(obj).every(key => keys.includes(key));
const plain = (n: ModelNode | undefined, parent: number): n is HoleNode =>
  n?.kind === 'hole' && allowed(n, ['id', 'kind', 'parent', 'axis', 'side', 'center', 'radius']) &&
  n.parent.node === parent && n.parent.side === 'solid' && (n.axis ?? 'z') === 'z' && typeof n.radius === 'number';

export function newCasualPlate(): StudioDoc {
  return {
    ...emptyDoc(),
    nodes: [
      { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [60, 40] },
      { kind: 'extrude', id: 'n1', sketch: 0, height: 5 },
      { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [15, 20], radius: 3, axis: 'z' },
      { kind: 'hole', id: 'n3', parent: { node: 2, side: 'solid' }, center: [45, 20], radius: 3, axis: 'z' },
    ],
    outputs: { b3: { node: 3, side: 'solid' } },
    nextId: 4,
  };
}

const dimValue = (v: Dim, d: StudioDoc) => typeof v === 'number' ? v : d.parameters[v.parameter];

export function inspectCasualPlate(doc: StudioDoc): Result<PlateDocument> {
  const [sketch, plate, a, b] = doc.nodes;
  const out = Object.values(doc.outputs);
  if (doc.nodes.length !== 4 || sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' ||
      !allowed(sketch, ['id', 'kind', 'profile', 'min', 'max']) ||
      plate?.kind !== 'extrude' || plate.sketch !== 0 || !allowed(plate, ['id', 'kind', 'sketch', 'height']) ||
      !plain(a, 1) || !plain(b, 2) || out.length !== 1 || out[0].node !== 3 || out[0].side !== 'solid') {
    return bad('이 파일의 형상은 여기서 편집할 수 없어요. 원본을 CAD Studio에서 열어주세요.');
  }
  const holes = ([a, b] as const).map((n, i): CasualHole => ({
    id: featureId(doc.nodes, i + 2), index: i + 2, label: i === 0 ? 'A' : 'B', diameter: (n.radius as number) * 2,
    x: dimValue(n.center[0], doc), y: dimValue(n.center[1], doc),
  })) as unknown as PlateScene['holes'];
  if (new Set(doc.nodes.map((_, i) => featureId(doc.nodes, i))).size !== doc.nodes.length) return bad('두 구멍의 피처를 구분할 수 없어요.');
  const [minX, minY] = sketch.min.map(v => dimValue(v, doc));
  const [maxX, maxY] = sketch.max.map(v => dimValue(v, doc));
  if (![minX, minY, maxX, maxY, dimValue(plate.height, doc)].every(Number.isFinite) ||
      dimValue(plate.height, doc) <= 0 ||
      holes.some(h => ![h.x, h.y, h.diameter].every(Number.isFinite) || h.diameter <= 0 ||
        2 * Math.min(h.x - minX, maxX - h.x, h.y - minY, maxY - h.y) - h.diameter < 1e-4) ||
      Math.hypot(holes[0].x - holes[1].x, holes[0].y - holes[1].y) - (holes[0].diameter + holes[1].diameter) / 2 < 1e-4) {
    return bad('구멍이 다른 구멍이나 판의 가장자리와 겹쳐요. 더 작은 지름을 입력해주세요.');
  }
  const rebuilt = brepsFor(doc);
  if ('error' in rebuilt) return bad(rebuilt.error);
  const [brep] = rebuilt.breps;
  if (rebuilt.breps.length !== 1 || !brep || brep.bodies.length !== 1 ||
      brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed) {
    return bad('닫힌 판 형상을 확인하지 못했어요.');
  }

  // The bounded plain-hole recipe produces persistent split wall names (including #1/#2).
  // Attest both through-rims by adjacency to a cap loop and a unique wall owner. No center search,
  // nearest-feature remapping or last-node fallback. Face/edge IDs are for this evaluation only.
  const wallOwners = new Map<string, string>();
  const wallEdges = new Map<string, Set<string>>();
  const capLoops = new Map<string, string[]>();
  const loops = new Map(brep.loops.map(l => [l.id, l]));
  const coedges = new Map(brep.coedges.map(c => [c.id, c.edge]));
  const edgesOf = (id: string) => (loops.get(id)?.coedges ?? []).map(c => coedges.get(c)!);
  const source = featureId(doc.nodes, 1);
  for (const f of brep.faces) {
    const id = holes.find(h => f.name === h.id + '.side0' || f.name === h.id + '.side0#1' || f.name === h.id + '.side0#2')?.id;
    if (id) {
      wallOwners.set(f.id, id);
      for (const e of f.loops.flatMap(edgesOf)) {
        const owners = wallEdges.get(e) ?? new Set<string>();
        owners.add(id); wallEdges.set(e, owners);
      }
    }
    if (f.name === source + '.top' || f.name === source + '.bottom') {
      for (const id of f.loops) if (loops.get(id)?.kind === 'inner') capLoops.set(id, edgesOf(id));
    }
  }
  const topLoops = new Set(brep.faces.filter(f => f.name === source + '.top').flatMap(f => f.loops));
  const rimOwners = new Map<string, string>();
  const rimCount = new Map(holes.map(h => [h.id, 0]));
  for (const [loop, edges] of capLoops) {
    const ids = edges.map(edge => wallEdges.get(edge));
    const owner = ids[0]?.size === 1 ? [...ids[0]][0] : undefined;
    if (!owner || !ids.every(set => set?.size === 1 && set.has(owner))) continue;
    rimCount.set(owner, (rimCount.get(owner) ?? 0) + 1);
    // The visible upper rim is selectable and highlighted. Lower rims are not overlay hit targets.
    if (topLoops.has(loop)) for (const e of edges) rimOwners.set(e, owner);
  }
  if (holes.some(h => rimCount.get(h.id) !== 2 || ![...rimOwners.values()].includes(h.id))) {
    return bad('각 구멍의 관통 형상과 편집 대상을 확인할 수 없어요.');
  }
  return { ok: true, value: { doc, scene: { holes, mesh: tessellateBrep(brep, { segmentsPerQuarter: 12 }), wallOwners, rimOwners } } };
}

export type DiameterPreview = { base: PlateDocument; target: string; next: PlateDocument };

export function previewCasualDiameter(base: PlateDocument, target: string, diameter: number): Result<DiameterPreview> {
  const hole = base.scene.holes.find(h => h.id === target);
  if (!hole) return bad('모델에서 수정할 구멍을 다시 선택해주세요.');
  if (!Number.isFinite(diameter) || diameter <= 0) return bad('0보다 큰 지름을 숫자로 입력해주세요.');
  const node = base.doc.nodes[hole.index];
  if (!plain(node, hole.index - 1) || featureId(base.doc.nodes, hole.index) !== target) return bad('이 구멍은 여기서 수정할 수 없어요.');
  const nodes = base.doc.nodes.map((n, i) => i === hole.index ? { ...node, radius: diameter / 2 } : n);
  const result = inspectCasualPlate({ ...base.doc, nodes });
  return result.ok ? { ok: true, value: { base, target, next: result.value } } : result;
}

export function commitCasualPreview(current: PlateDocument, preview: DiameterPreview, target: string): PlateDocument | null {
  return preview.base === current && preview.target === target ? preview.next : null;
}
