import type { ModelNode } from '../engine/doc';
import type { EditField } from './editFields';

export const smoothLoftHeightKey = 'smoothLoftHeight';

type SmoothLoft = Extract<ModelNode, { kind: 'loft' }>;

function stationsOf(loft: SmoothLoft): number[] | undefined {
  if (!loft.smooth || loft.guide || loft.guides || loft.sections.length < 3
    || loft.sections.some(section => Object.hasOwn(section, 'frame'))) return;
  const stations: number[] = [];
  for (const { z } of loft.sections) {
    if (typeof z !== 'number' || !Number.isFinite(z) || (stations.length && z <= stations.at(-1)!)) return;
    stations.push(z);
  }
  return Number.isFinite(stations.at(-1)! - stations[0]) ? stations : undefined;
}

/** Stretch the spacing of an existing smooth Loft along its sketch normal. */
export function smoothLoftHeightField(node: SmoothLoft, index: number): EditField | undefined {
  if (!stationsOf(node)) return;
  return {
    kind: 'number', key: smoothLoftHeightKey, label: 'Total height', unit: 'mm',
    get: nodes => {
      const current = nodes[index], stations = current?.kind === 'loft' && stationsOf(current);
      return stations ? stations.at(-1)! - stations[0] : NaN;
    },
    set: (nodes, height) => {
      const current = nodes[index];
      if (current?.kind !== 'loft' || !Number.isFinite(height) || height <= 0) return [...nodes];
      const stations = stationsOf(current);
      if (!stations) return [...nodes];
      const last = stations.length - 1, base = stations[0], span = stations[last] - base;
      if (height === span) return [...nodes];
      const sections = current.sections.map((section, i) => ({
        sketch: section.sketch, z: i === last ? base + height : base + height * ((stations[i] - base) / span),
      }));
      return nodes.map((node, i) => i === index ? { ...current, sections } : node);
    },
  };
}
