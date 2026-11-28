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

/** Return the kept walls of distinct original openings, with one opening per axis for a corner. */
export function boxShellOpeningWalls(normal: unknown, secondNormal?: unknown, thirdNormal?: unknown) {
  const normals = thirdNormal !== undefined ? [normal, secondNormal, thirdNormal]
    : secondNormal !== undefined ? [normal, secondNormal] : [normal];
  const openings = normals.map(direction => boxShellWalls.find(side => sameWallNormal(direction, side.normal)));
  if (openings.includes(undefined) || new Set(openings).size !== openings.length) return;
  if (thirdNormal !== undefined && new Set(openings.map(side => side?.normal.findIndex(value => value !== 0))).size !== 3) return;
  return boxShellWalls.filter(side => !openings.includes(side));
}

/** Preserve the stored ownership of the kept faces and every original opening. */
export function shellWallFieldsProblem(node: Record<string, unknown>): string | null {
  const allowed = new Set(['kind', 'parent', 'opening', 'secondOpening', 'thirdOpening', 'walls', ...NODE_EXTRA_FIELDS]);
  if (Object.keys(node).some(key => !allowed.has(key))) return 'Per-face Shell has an unsupported field.';
  const { parent, opening, secondOpening, thirdOpening, walls, sigs } = node;
  if (!isObj(parent) || !Number.isInteger(parent.node) || Number(parent.node) < 0 || parent.side !== 'solid' ||
    Object.keys(parent).length !== 2 || (opening !== null && (typeof opening !== 'string' || !opening || opening.includes('+'))))
    return 'Per-face Shell needs an exact original opening on its solid.';
  if (secondOpening !== undefined && (opening === null || typeof secondOpening !== 'string' || !secondOpening || secondOpening.includes('+') || secondOpening === opening))
    return 'Per-face Shell needs a distinct second original opening.';
  if (thirdOpening !== undefined && (opening === null || secondOpening === undefined || typeof thirdOpening !== 'string'
    || !thirdOpening || thirdOpening.includes('+') || thirdOpening === opening || thirdOpening === secondOpening))
    return 'Per-face Shell needs a distinct third original opening and a second original opening.';
  const openings = [opening, secondOpening, thirdOpening].filter((name): name is string => typeof name === 'string');
  if (!isObj(walls) || Object.keys(walls).length !== 6 - openings.length || openings.some(name => Object.hasOwn(walls, name))
    || !Object.values(walls).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0))
    return opening === null ? 'Closed per-face Shell needs six positive wall thicknesses on its original solid.'
      : secondOpening === undefined ? 'Per-face Shell needs one opening and five positive wall thicknesses on its original solid.'
      : thirdOpening === undefined ? 'Per-face Shell needs one positive thickness for each of the four kept walls.'
        : 'Per-face Shell needs one positive thickness for each of the three kept walls.';
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
  const kept = opening === null ? boxShellWalls
    : boxShellOpeningWalls(signatureDirection(opening), secondOpening === undefined ? undefined : signatureDirection(secondOpening),
      thirdOpening === undefined ? undefined : signatureDirection(thirdOpening));
  if (!kept || !kept.every(side => Object.keys(walls).some(name => sameWallNormal(signatureDirection(name), side.normal))))
    return opening === null ? 'Closed per-face Shell needs six distinct cardinal walls.'
      : secondOpening === undefined ? 'Per-face Shell needs an original cardinal opening and its five cardinal walls.'
      : thirdOpening === undefined ? 'Per-face Shell needs two original cardinal openings and their four kept cardinal walls.'
        : 'The three original Shell openings must share a corner and have three kept cardinal walls.';
  return null;
}
