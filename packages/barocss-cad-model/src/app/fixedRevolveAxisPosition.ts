import { featureId } from '../engine/ids';
import type { ModelNode } from '../engine/doc';

type Nodes = readonly ModelNode[];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const only = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

/** A terminal, unlinked cardinal axis in an independent plain XY rectangular profile. */
export function fixedRevolveAxisPosition(nodes: Nodes, index: number) {
  const node = nodes[index];
  if (index !== nodes.length - 1 || node?.kind !== 'revolve'
    || !only(node, ['id', 'kind', 'sketch', 'axis', 'origin', 'dir', 'angle'])
    || !Number.isInteger(node.sketch) || node.sketch < 0 || node.sketch >= index
    || (node.axis !== 'x' && node.axis !== 'y') || !finite(node.angle) || node.angle <= 0 || node.angle > 360
    || !Array.isArray(node.origin) || node.origin.length !== 2 || !node.origin.every(finite)
    || !Array.isArray(node.dir) || node.dir.length !== 2 || !node.dir.every(finite)) return;
  const coordinate = Math.abs(node.dir[0]) === 1 && node.dir[1] === 0 ? 1
    : node.dir[0] === 0 && Math.abs(node.dir[1]) === 1 ? 0 : undefined;
  if (coordinate === undefined) return;
  const sketch = nodes[node.sketch];
  if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle'
    || !only(sketch, ['id', 'kind', 'profile', 'min', 'max'])
    || !Array.isArray(sketch.min) || !Array.isArray(sketch.max) || sketch.min.length !== 2 || sketch.max.length !== 2
    || !sketch.min.every(finite) || !sketch.max.every(finite)
    || !(Number(sketch.max[0]) > Number(sketch.min[0]) && Number(sketch.max[1]) > Number(sketch.min[1]))) return;
  for (const owner of [index, node.sketch]) {
    const id = featureId(nodes, owner);
    if (nodes.filter((_, i) => featureId(nodes, i) === id).length !== 1) return;
  }
  return { node, coordinate, value: Number(node.origin[coordinate]) };
}

export function setFixedRevolveAxisPosition(nodes: Nodes, index: number, value: number): ModelNode[] {
  const current = fixedRevolveAxisPosition(nodes, index);
  if (!current || !finite(value) || value === current.value) return [...nodes];
  const origin = [...current.node.origin!] as [number, number];
  origin[current.coordinate] = value;
  return nodes.map((node, i) => i === index ? { ...current.node, origin } : node);
}
