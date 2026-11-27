import { CadNumericPolicy, CadPartLimits } from '@barocss/cad';
import { withNode, type BodyRef, type Dim, type ModelNode, type SketchNode, type StudioDoc } from './doc';
import { featureId } from './ids';
import { refusal } from './refusal';
import { toWorld, xyPlane } from '../sketch/plane';

type Rectangle = Extract<SketchNode, { profile: 'rectangle' }>;
type Extrude = Extract<ModelNode, { kind: 'extrude' }>;
type Pattern = Extract<ModelNode, { kind: 'linear-pattern' }>;
type Join = Extract<ModelNode, { kind: 'union' }>;

export const isJoinedBossPatternSource = (nodes: readonly ModelNode[], index: number) =>
  nodes.some(node => node.kind === 'union' && node.bossPattern === true && node.right.node === index);

function rectangleOf(nodes: readonly ModelNode[], extrude: Extrude): Rectangle | undefined {
  const source = nodes[extrude.sketch];
  if (source?.kind === 'sketch' && source.profile === 'rectangle' && !source.suppressed && !source.held &&
    !source.regions?.length && !source.holes?.length && !source.association && !source.pocketFloor) return source;
}

function plainExtrude(node: ModelNode | undefined): node is Extrude {
  return node?.kind === 'extrude' && !node.suppressed && !node.held &&
    (node.from === undefined || node.from === 0) && !node.draft && node.cutDepth === undefined;
}

function seedOf(nodes: readonly ModelNode[], ref: BodyRef | undefined) {
  if (ref?.side !== 'solid') return;
  const node = nodes[ref.node];
  const refOfSeed = node?.kind === 'fillet' ? node.parent : ref;
  const extrude = refOfSeed && nodes[refOfSeed.node];
  if (refOfSeed?.side !== 'solid' || !plainExtrude(extrude)) return;
  const sketch = rectangleOf(nodes, extrude);
  if (!sketch || !sketch.on || sketch.on.side !== 'solid') return;
  if (node?.kind === 'fillet') {
    if (node.suppressed || node.held || node.radii || node.section || node.edges?.length !== 4 ||
      Object.keys(node.rematched ?? {}).length) return;
    const owner = featureId(nodes, refOfSeed.node);
    const sides = sketch.sideTags?.outer ?? [0, 1, 2, 3].map(String);
    if (!Array.isArray(sides) || !Array.isArray(node.edges)) return;
    const rims = sides.map(side => `${owner}.side${sketch.sideTags ? '[' + side + ']' : side}|${owner}.top`);
    if (rims.length !== 4 || new Set(rims).size !== 4 || !rims.every(rim => node.edges.includes(rim))) return;
  }
  return { extrude, sketch, support: sketch.on };
}

/** The original plate a picked rectangular pad was drawn on. */
export function bossPatternSupport(doc: StudioDoc, ref: BodyRef): BodyRef | undefined {
  const source = seedOf(doc.nodes, ref);
  const plate = source && doc.nodes[source.support.node];
  if (source && plainExtrude(plate) && rectangleOf(doc.nodes, plate)) return source.support;
}

const dim = (value: Dim, parameters: StudioDoc['parameters']) =>
  typeof value === 'number' ? value : value && Object.hasOwn(parameters, value.parameter) ? parameters[value.parameter] : NaN;

function rectangleBounds(sketch: Rectangle, parameters: StudioDoc['parameters']) {
  const plane = sketch.plane ?? xyPlane(), { origin, normal, xAxis } = plane;
  if (!Array.isArray(origin) || origin.length !== 3 || !Array.isArray(normal) || !Array.isArray(xAxis) ||
    !Array.isArray(sketch.min) || !Array.isArray(sketch.max)) return;
  if (normal[0] !== 0 || normal[1] !== 0 || normal[2] !== 1 ||
    xAxis[2] !== 0 || Math.abs(xAxis[0]) + Math.abs(xAxis[1]) !== 1 ||
    ![xAxis[0], xAxis[1]].every(value => value === -1 || value === 0 || value === 1)) return;
  const ax = dim(sketch.min[0], parameters), ay = dim(sketch.min[1], parameters);
  const bx = dim(sketch.max[0], parameters), by = dim(sketch.max[1], parameters);
  if (![...origin, ax, ay, bx, by].every(Number.isFinite) || bx <= ax || by <= ay) return;
  const a = toWorld(plane, [ax, ay]), b = toWorld(plane, [bx, by]);
  return { z: origin[2], min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] };
}

function joinedBossPatternProblem(doc: Pick<StudioDoc, 'nodes' | 'parameters'>, join: Join): string | undefined {
  const { nodes, parameters } = doc;
  const pattern = nodes[join.right?.node], plate = nodes[join.left?.node];
  if (join.bossPattern !== true || join.left?.side !== 'solid' || join.right?.side !== 'solid' ||
    pattern?.kind !== 'linear-pattern' || pattern.suppressed || pattern.held || !plainExtrude(plate)) {
    return 'The original plate and its rectangular boss pattern must both be active.';
  }
  const source = seedOf(nodes, pattern.parent), stock = rectangleOf(nodes, plate);
  if (!source) return 'Keep the original rectangular boss and its upper Fillet edges active.';
  if (!stock || source.support.node !== join.left.node) return 'The rectangular boss must use this original plate.';
  const seed = rectangleBounds(source.sketch, parameters), target = rectangleBounds(stock, parameters);
  const baseHeight = dim(plate.height, parameters), height = dim(source.extrude.height, parameters);
  if (!seed || !target || !(baseHeight > 0 && baseHeight <= CadPartLimits.length && height > 0 && height <= CadPartLimits.length) ||
    seed.z !== target.z + baseHeight) return 'The boss must start on the original upper face of the plate.';
  const k = pattern.axis === 'x' ? 0 : pattern.axis === 'y' ? 1 : -1;
  const spacing = dim(pattern.spacing, parameters), count = pattern.count;
  if (k < 0 || !Number.isFinite(spacing) || !Number.isInteger(count) || count < 2 || count > 24) {
    return 'Use X or Y, finite spacing and 2 to 24 bosses.';
  }
  const tolerance = CadNumericPolicy.linearTolerance;
  if (Math.abs(spacing) <= seed.max[k] - seed.min[k] + tolerance) return 'The bosses would overlap or touch. Increase Spacing or reduce the width along the pattern.';
  const last = spacing * (count - 1);
  if ([0, 1].some(axis => seed.min[axis] + (axis === k ? Math.min(0, last) : 0) <= target.min[axis] + tolerance
    || seed.max[axis] + (axis === k ? Math.max(0, last) : 0) >= target.max[axis] - tolerance)) {
    return 'Every boss must stay strictly inside the original plate. Adjust its position, size or Spacing.';
  }
}

/** Keep the existing geometry and retain the plate fit requirement on rebuild. */
export function joinedBossPattern(doc: StudioDoc, support: BodyRef, pattern: Pattern): StudioDoc {
  const patterned = withNode(doc, pattern);
  const join: Join = { kind: 'union', left: support, right: { node: patterned.nodes.length - 1, side: 'solid' }, bossPattern: true };
  assertJoinedBossPattern(patterned, join);
  return withNode(patterned, join);
}

export function assertJoinedBossPattern(doc: Pick<StudioDoc, 'nodes' | 'parameters'>, join: Join) {
  const problem = joinedBossPatternProblem(doc, join);
  if (problem) throw refusal('VALUE', 'Joined boss pattern: ' + problem);
}

/** A valid joined pattern identifies its original four upper rims by sketch side and cap roles. */
export function joinedBossFillets(doc: StudioDoc): ReadonlySet<number> {
  const fillets = new Set<number>();
  for (const node of doc.nodes) {
    if (node.kind !== 'union' || node.bossPattern !== true || node.suppressed || joinedBossPatternProblem(doc, node)) continue;
    const pattern = doc.nodes[node.right.node];
    if (pattern.kind === 'linear-pattern' && doc.nodes[pattern.parent.node]?.kind === 'fillet') fillets.add(pattern.parent.node);
  }
  return fillets;
}
