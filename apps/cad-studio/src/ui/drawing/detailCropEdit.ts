import { checkManufacturingDrawing, withManufacturingDrawing } from '@barocss/cad-model/drawing/options';
import type { DrawingDetail } from '@barocss/cad-model/drawing/detail';
import type { DrawingSettings } from '@barocss/cad-model/drawing/types';

export type DetailCropFields = { x: string; y: string; radius: string };
export function editDetailCrop(settings: DrawingSettings, original: DrawingDetail, fields: DetailCropFields,
  owner: object, currentOwner: object, ready: boolean): { settings: DrawingSettings } | { error: string } {
  if (owner !== currentOwner || !ready) return { error: 'The drawing changed or is updating. Reopen the crop editor when it is current.' };
  const matches = settings.details?.filter(d => d.id === original.id) ?? [];
  if (matches.length !== 1 || matches[0] !== original) return { error: 'The detail changed. Reopen its crop editor.' };
  if ([fields.x, fields.y, fields.radius].some(value => !value.trim() || !Number.isFinite(Number(value)))) {
    return { error: 'Enter a finite number in every field. Values are in model mm.' };
  }
  const center: [number, number] = [Number(fields.x), Number(fields.y)], radius = Number(fields.radius);
  if (radius <= 0) return { error: 'Radius must be greater than zero model mm.' };
  const details = settings.details!.map(d => d === original ? { ...d, center, radius } : d);
  const problems = checkManufacturingDrawing({ details });
  if (problems.length) return { error: problems[0].message };
  try {
    const next = withManufacturingDrawing(settings, { details });
    return { settings: center[0] === original.center[0] && center[1] === original.center[1] && radius === original.radius ? settings : next };
  } catch (error) { return { error: error instanceof Error ? error.message : 'The detail crop could not be changed.' }; }
}
