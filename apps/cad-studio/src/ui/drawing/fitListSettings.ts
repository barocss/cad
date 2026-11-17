import type { DrawingSettings } from '@barocss/cad-model/drawing/types';
import { drawingScopeOf } from '@barocss/cad-model/drawing/scope';

export function fitListScopeProblem(whole: DrawingSettings): string | null {
  try {
    const scope = drawingScopeOf(whole);
    if (scope.kind !== 'part' || scope.part !== undefined) return 'Fit dimension lists support the base part only.';
    if ((whole.sheets?.length ?? 0) > 0) return 'Fit dimension lists support a single sheet only.';
    return null;
  } catch { return 'Fit dimension lists require a valid base-part drawing scope.'; }
}
export function addFitList(settings: DrawingSettings): DrawingSettings {
  if (settings.tables?.some(t => t.from === 'fits')) return settings;
  const ids = new Set(settings.tables?.map(t => t.id));
  let id = 'fits'; for (let n = 2; ids.has(id); n++) id = `fits${n}`;
  return { ...settings, tables: [...(settings.tables ?? []), { id, from: 'fits' }] };
}
export function removeFitList(settings: DrawingSettings, id: string): DrawingSettings {
  const tables = settings.tables?.filter(t => !(t.from === 'fits' && t.id === id));
  if (!tables || tables.length === settings.tables?.length) return settings;
  const { tables: _tables, ...rest } = settings; void _tables;
  return tables.length ? { ...rest, tables } : rest;
}
/** Explicit paper position only; rows remain derived, never stored by this UI. */
export function moveFitList(settings: DrawingSettings, id: string, x: string, y: string): DrawingSettings | null {
  if (!x.trim() || !y.trim()) return null;
  const at: [number, number] = [Number(x), Number(y)];
  if (!at.every(Number.isFinite)) return null;
  const table = settings.tables?.find(t => t.from === 'fits' && t.id === id);
  if (!table) return null;
  if (table.at?.[0] === at[0] && table.at[1] === at[1]) return settings;
  return { ...settings, tables: settings.tables!.map(t => t === table ? { ...t, at } : t) };
}
