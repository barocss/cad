import { isObj } from '../util/guards';
import { NODE_EXTRA_FIELDS } from './doc';

const fields = new Set(['kind', 'parent', 'center', 'radius', 'depth', 'face']);
const parameter = (value: unknown): boolean =>
  isObj(value) && Object.keys(value).length === 1 && typeof value.parameter === 'string' && value.parameter.length > 0;
const dimension = (value: unknown) => typeof value === 'number' && Number.isFinite(value) || parameter(value);
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 || parameter(value);

export function blindDrillHoleFieldsProblem(node: Record<string, unknown>): string | null {
  const extra = Object.keys(node).find(key => !fields.has(key) && !NODE_EXTRA_FIELDS.some(extra => extra === key));
  if (extra) return `Blind drill hole: unsupported field "${extra}".`;
  const parent = node.parent;
  if (!isObj(parent) || !Number.isInteger(parent.node) || Number(parent.node) < 0 || parent.side !== 'solid'
    || Object.keys(parent).some(key => key !== 'node' && key !== 'side')) return 'Blind drill hole: select one original solid.';
  if (!Array.isArray(node.center) || node.center.length !== 2 || !node.center.every(dimension)) return 'Blind drill hole: enter a finite XY centre.';
  if (!positive(node.radius) || !positive(node.depth)) return 'Blind drill hole: diameter and cylindrical depth must be positive.';
  if (typeof node.face !== 'string' || !node.face || node.face.includes('+')) return 'Blind drill hole: select the original top face.';
  return null;
}
