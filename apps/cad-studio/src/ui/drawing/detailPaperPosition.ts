import type { DrawingDetail } from '@barocss/cad-model/drawing/detail';
import type { DrawingSettings } from '@barocss/cad-model/drawing/types';

/** Reset only an existing detail's sheet-space override, never its model-space crop or annotations. */
export function resetDetailPaperPosition(settings: DrawingSettings, detail: DrawingDetail): DrawingSettings {
  if (!detail.at || !settings.details?.includes(detail)) return settings;
  const { at: _at, ...automatic } = detail;
  void _at;
  return { ...settings, details: settings.details.map(d => d === detail ? automatic : d) };
}
