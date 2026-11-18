import { featureId } from '../engine/ids';
import type { Axis, ModelNode } from '../engine/doc';

type Nodes = readonly ModelNode[];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const only = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

/** A plain box's terminal four quarter-turn copies, about a world-origin axis. */
export function circularPatternDirection(nodes: Nodes, index: number) {
  if (index !== 2 || nodes.length !== 3) return;
  const [sk, ex, pattern] = nodes;
  if (sk.kind !== 'sketch' || sk.profile !== 'rectangle' || !only(sk, ['id','kind','profile','min','max'])
    || sk.min.length !== 2 || sk.max.length !== 2 || !sk.min.every(finite) || !sk.max.every(finite)
    || !(Number(sk.max[0]) > Number(sk.min[0]) && Number(sk.max[1]) > Number(sk.min[1]))) return;
  if (ex.kind !== 'extrude' || ex.sketch !== 0 || !only(ex, ['id','kind','sketch','height','from','draft'])
    || !finite(ex.height) || ex.height <= 0 || (ex.from !== undefined && !finite(ex.from))
    || (ex.draft !== undefined && ex.draft !== 0)) return;
  if (pattern.kind !== 'circular-pattern' || !only(pattern, ['id','kind','parent','axis','angle','count','span'])
    || !only(pattern.parent, ['node','side']) || pattern.parent.node !== 1 || pattern.parent.side !== 'solid'
    || !['x','y','z'].includes(pattern.axis) || pattern.angle !== 90 || pattern.count !== 4
    || (pattern.axis === 'z' ? pattern.span !== 360 : pattern.span !== undefined)) return;
  if (new Set(nodes.map((_, i) => featureId(nodes, i))).size !== nodes.length) return;
  return pattern;
}

export function setCircularPatternDirection(nodes: Nodes, index: number, value: string): ModelNode[] {
  const current = circularPatternDirection(nodes, index);
  if (!current || !['x','y','z'].includes(value) || current.axis === value) return [...nodes];
  const next = { ...current, axis: value as Axis };
  // The authored full-turn metadata belongs only to Z; all three axes still step by 90°.
  if (value === 'z') next.span = 360; else delete next.span;
  return nodes.map((node, i) => i === index ? next : node);
}
