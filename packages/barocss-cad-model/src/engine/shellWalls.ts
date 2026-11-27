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

/** Return the kept walls of one cardinal opening or two distinct cardinal openings. */
export function boxShellOpeningWalls(normal: unknown, secondNormal?: unknown) {
  const opening = boxShellWalls.find(side => sameWallNormal(normal, side.normal));
  if (!opening) return;
  if (secondNormal === undefined) return boxShellWalls.filter(side => side !== opening);
  const second = boxShellWalls.find(side => sameWallNormal(secondNormal, side.normal));
  if (!second || second === opening) return;
  return boxShellWalls.filter(side => side !== opening && side !== second);
}

/** Preserve the stored ownership of the kept faces and every original opening. */
export function shellWallFieldsProblem(node: Record<string, unknown>): string | null {
  const allowed = new Set(['kind', 'parent', 'opening', 'secondOpening', 'walls', ...NODE_EXTRA_FIELDS]);
  if (Object.keys(node).some(key => !allowed.has(key))) return 'Per-face Shell has an unsupported field.';
  const { parent, opening, secondOpening, walls, sigs } = node;
  if (!isObj(parent) || !Number.isInteger(parent.node) || Number(parent.node) < 0 || parent.side !== 'solid' ||
    Object.keys(parent).length !== 2 || typeof opening !== 'string' || !opening || opening.includes('+'))
    return 'Per-face Shell needs an exact original opening on its solid.';
  if (secondOpening !== undefined && (typeof secondOpening !== 'string' || !secondOpening || secondOpening.includes('+') || secondOpening === opening))
    return 'Per-face Shell needs a distinct second original opening.';
  const openings = secondOpening === undefined ? [opening] : [opening, secondOpening];
  if (!isObj(walls) || Object.keys(walls).length !== 6 - openings.length || openings.some(name => Object.hasOwn(walls, name))
    || !Object.values(walls).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0))
    return secondOpening === undefined ? 'Per-face Shell needs one opening and five positive wall thicknesses on its original solid.'
      : 'Per-face Shell needs one positive thickness for each of the four kept walls.';
  const names = [...openings, ...Object.keys(walls)];
  if (!isObj(sigs) || Object.keys(sigs).length !== 6 || names.some(name => !name || name.includes('+') || !Object.hasOwn(sigs, name)))
    return 'Per-face Shell needs all six original face signatures.';
  for (const name of names) {
    const sig = sigs[name];
    if (!isObj(sig) || sig.k !== 'plane' || !isVec3(sig.p) || typeof sig.s !== 'number' || !Number.isFinite(sig.s) || !(sig.s > 0) ||
      sig.r !== undefined || (sig.n !== undefined && sig.n !== 1) || !isVec3(sig.d))
      return 'Per-face Shell needs one exact planar signature per original face.';
  }
  const signatureDirection = (name: string) => (sigs[name] as { d: readonly number[] }).d;
  const kept = boxShellOpeningWalls(signatureDirection(opening), secondOpening === undefined ? undefined : signatureDirection(secondOpening));
  if (!kept || !kept.every(side => Object.keys(walls).some(name => sameWallNormal(signatureDirection(name), side.normal))))
    return secondOpening === undefined ? 'Per-face Shell needs an original cardinal opening and its five cardinal walls.'
      : 'Per-face Shell needs two original cardinal openings and their four kept cardinal walls.';
  return null;
}
