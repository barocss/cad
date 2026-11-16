import type { RenderLight } from '@barocss/cad-model/engine/render';

export function pointShadowConflict(lights: readonly RenderLight[], index: number): string | null {
  const points = lights.map((light, i) => ({ light, i })).filter(({ light }) => light.kind === 'point').slice(0, 8);
  if (!points.some(({ i }) => i === index)) return null;
  const active = points.find(({ light, i }) => i !== index && light.castShadow);
  return active ? `Point ${active.i + 1} already casts shadows. Turn off Shadow on Point ${active.i + 1}, then enable Shadow on Point ${index + 1}.` : null;
}
export function shadowRadiusHint(light: Exclude<RenderLight, { kind: 'directional' }>): string {
  if (light.castShadow) return '0 mm uses the default edge. A larger radius softens the shadow.';
  return light.shadowRadius === undefined ? 'Uses the default radius (0 mm) when Shadow is on.' : `Saved radius ${light.shadowRadius} mm is kept while Shadow is off.`;
}
