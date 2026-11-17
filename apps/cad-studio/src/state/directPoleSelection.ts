import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
export type DirectPoleSelection = { direct: DirectGeometry; generation: number; id: string; key: string };
/** Exact owner and live token prevent stale drag/input completion after any selection change. */
export function currentDirectPole(pole: DirectPoleSelection | null, direct: DirectGeometry | undefined, generation: number, id: string | null, keys: readonly string[]): DirectPoleSelection | null {
  return pole && pole.direct === direct && pole.generation === generation && pole.id === id && keys.includes(pole.key) ? pole : null;
}
export function ownsDirectPole(expected: DirectPoleSelection, live: DirectPoleSelection | null, direct: DirectGeometry | undefined, available = true): boolean {
  return available && expected === live && expected.direct === direct;
}
