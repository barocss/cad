import { NODE_EXTRA_FIELDS } from './doc';
import { isObj, isVec3 } from '../util/guards';

export const boxShellWalls = [
  { key: 'bottomWall', label: 'Bottom wall', normal: [0, 0, -1] },
  { key: 'frontWall', label: 'Front wall', normal: [0, -1, 0] },
  { key: 'rightWall', label: 'Right wall', normal: [1, 0, 0] },
  { key: 'backWall', label: 'Back wall', normal: [0, 1, 0] },
  { key: 'leftWall', label: 'Left wall', normal: [-1, 0, 0] },
  { key: 'topWall', label: 'Top wall', normal: [0, 0, 1] },
] as const;

export function sameWallNormal(value: unknown, direction: readonly number[]): boolean {
  return isVec3(value) && direction.every((coordinate, i) => coordinate === value[i]);
}

/** A per-face box Shell opens the upper face or one lateral face. */
export function boxShellOpeningWalls(normal: unknown) {
  const opening = boxShellWalls.find(side => sameWallNormal(normal, side.normal));
  if (opening && opening.key !== 'bottomWall') return boxShellWalls.filter(side => side !== opening);
}

/** Preserve the stored ownership of all five kept faces and the opening. */
export function shellWallFieldsProblem(node: Record<string, unknown>): string | null {
  const allowed = new Set(['kind', 'parent', 'opening', 'walls', ...NODE_EXTRA_FIELDS]);
  if (Object.keys(node).some(key => !allowed.has(key))) return 'Per-face Shell has an unsupported field.';
  const { parent, opening, walls, sigs } = node;
  if (!isObj(parent) || !Number.isInteger(parent.node) || Number(parent.node) < 0 || parent.side !== 'solid' ||
    Object.keys(parent).length !== 2 || typeof opening !== 'string' || !opening || opening.includes('+') ||
    !isObj(walls) || Object.keys(walls).length !== 5 || Object.hasOwn(walls, opening) ||
    !Object.values(walls).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0))
    return 'Per-face Shell needs one opening and five positive wall thicknesses on its original solid.';
  const names = [opening, ...Object.keys(walls)];
  if (!isObj(sigs) || Object.keys(sigs).length !== 6 || names.some(name => !name || name.includes('+') || !Object.hasOwn(sigs, name)))
    return 'Per-face Shell needs all six original face signatures.';
  for (const name of names) {
    const sig = sigs[name];
    if (!isObj(sig) || sig.k !== 'plane' || !isVec3(sig.p) || typeof sig.s !== 'number' || !Number.isFinite(sig.s) || !(sig.s > 0) ||
      sig.r !== undefined || (sig.n !== undefined && sig.n !== 1) || !isVec3(sig.d))
      return 'Per-face Shell needs one exact planar signature per original face.';
  }
  const signatureDirection = (name: string) => (sigs[name] as { d: readonly number[] }).d;
  const kept = boxShellOpeningWalls(signatureDirection(opening));
  if (!kept || !kept.every(side => Object.keys(walls).some(name => sameWallNormal(signatureDirection(name), side.normal))))
    return 'Per-face Shell needs an original upper or side opening and its five cardinal walls.';
  return null;
}
