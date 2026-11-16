import { useSyncExternalStore } from 'react';
export type MeasureSecondaryUnit = 'none' | 'inch';
export const MEASURE_SECONDARY_UNIT_KEY = 'studio.measure-secondary-units';
export const parseMeasureSecondaryUnit = (raw: unknown): MeasureSecondaryUnit => raw === 'inch' ? 'inch' : 'none';
/** Raw mm/mm² only; no drawing formatting policy or conversion of an already rounded string. */
export function measureSecondaryText(raw: number, dimension: 'length' | 'area' = 'length'): string | null {
  if (!Number.isFinite(raw)) return null;
  const divisor = dimension === 'area' ? 25.4 ** 2 : 25.4, digits = dimension === 'area' ? 6 : 4;
  const value = raw / divisor;
  let text = String(Number(value.toFixed(digits)));
  if (raw !== 0 && Number(text) === 0) {
    if (value !== 0) text = value.toExponential(2);
    else {
      // A finite subnormal may underflow on division. Approximate logarithmic display only, not extra measurement precision.
      const exponent = Math.floor(Math.log10(Math.abs(raw)) - Math.log10(divisor));
      const mantissa = Math.sign(raw) * 10 ** (Math.log10(Math.abs(raw)) - Math.log10(divisor) - exponent);
      text = `${mantissa.toFixed(2)}e${exponent}`;
    }
  }
  return `${text} ${dimension === 'area' ? 'in²' : 'in'}`;
}
type Preference = { unit: MeasureSecondaryUnit; persistent: boolean };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
/** One session's memory survives Inspector unmount, even when later reads would return stale storage. */
export function createMeasureUnitPreference(storage: () => Store | null) {
  let state: Preference | undefined;
  const listeners = new Set<() => void>();
  const get = (): Preference => {
    if (state) return state;
    try { const store = storage(); state = { unit: parseMeasureSecondaryUnit(store?.getItem(MEASURE_SECONDARY_UNIT_KEY)), persistent: !!store }; }
    catch { state = { unit: 'none', persistent: false }; }
    return state;
  };
  return {
    get,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(unit: MeasureSecondaryUnit) {
      const next = parseMeasureSecondaryUnit(unit);
      let persistent = false;
      try { const store = storage(); if (store) { store.setItem(MEASURE_SECONDARY_UNIT_KEY, next); persistent = true; } } catch { /* session memory remains authoritative */ }
      state = { unit: next, persistent }; for (const listener of listeners) listener();
    },
  };
}
const preference = createMeasureUnitPreference(() => globalThis.localStorage ?? null);
export function useMeasureSecondaryUnit() {
  const state = useSyncExternalStore(preference.subscribe, preference.get, preference.get);
  return { ...state, set: preference.set };
}
