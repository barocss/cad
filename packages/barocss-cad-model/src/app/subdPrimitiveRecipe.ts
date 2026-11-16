import { refusal } from '../engine/refusal';
import type { Values } from './commands';
export type SubdPrimitiveKind = 'subd-torus' | 'subd-tube';
/** Bound the allocation before building a cage, including when inspecting saved recipes. */
export function subdPrimitiveValues(kind: SubdPrimitiveKind, input: Values, saved = false): Record<string, number> {
  const keys = kind === 'subd-torus' ? ['R', 'r', 'nu', 'nv', 'x', 'y', 'z'] : ['r', 'ri', 'h', 'nu', 'nh', 'x', 'y', 'z'];
  const fail = (): never => { throw refusal('PRIMITIVE_SIZE', 'SubD primitive: enter finite dimensions and bounded whole-number cage counts.'); };
  if (saved && Object.keys(input).some(key => !keys.includes(key))) return fail();
  const values: Record<string, number> = {};
  for (const key of keys) {
    const raw = input[key];
    if ((saved && typeof raw !== 'number') || (typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '' || !Number.isFinite(Number(raw))) return fail();
    values[key] = Number(raw);
  }
  const count = (key: string, min: number, max: number) => Number.isInteger(values[key]) && values[key] >= min && values[key] <= max;
  if (!count('nu', kind === 'subd-torus' ? 4 : 6, 64)
    || !(kind === 'subd-torus' ? count('nv', 4, 32) && values.R >= 1 && values.r >= .5 && values.r < values.R
      : count('nh', 1, 24) && values.r >= 1 && values.ri >= .5 && values.ri < values.r && values.h >= 1)) return fail();
  return values;
}
