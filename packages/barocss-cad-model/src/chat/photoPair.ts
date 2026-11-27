import { CadNumericPolicy } from '@barocss/cad';
import type { ImageTrace } from './trace';

interface PhotoLayerPair {
  name: string;
  frontLayer: string;
  sideLayer?: string;
}

interface PhotoReference extends Omit<PhotoLayerPair, 'sideLayer'> {
  sideLayer: string;
  diameterMM: number;
}

function layerBounds(trace: ImageTrace, id: string) {
  const matches = trace.layers.filter(layer => layer.id === id);
  if (matches.length !== 1 || matches[0].regions.length !== 1 || id === 'silhouette') return;
  const [region] = matches[0].regions;
  const points = region.outer;
  if (points.length < 3 || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return;
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  if (left <= 0 || right >= trace.width || top <= 0 || bottom >= trace.height || !(left < right && top < bottom)) return;
  return { width: right - left, height: bottom - top, top, bottom, holes: region.holes.length };
}

/** Estimate part envelopes from a near-orthographic front ring and its side view. */
export function measurePhotoPair(front: ImageTrace, side: ImageTrace, reference: PhotoReference, parts: readonly PhotoLayerPair[]) {
  if (front === side || !Number.isFinite(reference.diameterMM) || reference.diameterMM <= 0 || reference.diameterMM > CadNumericPolicy.coordinateAbs)
    return { error: 'Supply two distinct views and a positive measured front ring diameter in mm.', code: 'PHOTO_PAIR_INPUT' } as const;
  const frontRing = layerBounds(front, reference.frontLayer), sideRing = layerBounds(side, reference.sideLayer);
  // The ring must be visible as an annulus from the front and a band from the side.
  if (!frontRing || !sideRing || frontRing.holes !== 1 || sideRing.holes !== 0 || frontRing.width < 20 || sideRing.height < 20
    || Math.abs(frontRing.height - frontRing.width) > 0.06 * frontRing.width || sideRing.width >= sideRing.height)
    return { error: 'Select an uncropped ring in the front view and its narrower side band. Check the view directions and perspective.', code: 'PHOTO_PAIR_REFERENCE' } as const;
  const { diameterMM } = reference, frontMMPerPixel = diameterMM / frontRing.width, sideMMPerPixel = diameterMM / sideRing.height;
  const pairs = [reference, ...parts];
  const names = pairs.map(part => part.name.trim()), frontLayers = pairs.map(part => part.frontLayer);
  const sideLayers = pairs.flatMap(part => part.sideLayer === undefined ? [] : [part.sideLayer]);
  if (names.some(name => !name) || new Set(names).size !== names.length || new Set(frontLayers).size !== frontLayers.length
    || new Set(sideLayers).size !== sideLayers.length)
    return { error: 'Use distinct names and distinct layer assignments for each part.', code: 'PHOTO_PAIR_INPUT' } as const;

  // A trace quantizes both registered edge positions. This interval allows two trace pixels in each view.
  const registrationToleranceMM = 2 * (frontMMPerPixel + sideMMPerPixel);
  const envelopes = [];
  for (const [index, part] of pairs.entries()) {
    const a = layerBounds(front, part.frontLayer), b = part.sideLayer === undefined ? undefined : layerBounds(side, part.sideLayer);
    if (!a || (part.sideLayer !== undefined && !b))
      return { error: `${names[index]} needs a unique single-region layer in each assigned view.`, code: 'PHOTO_PAIR_LAYER' } as const;
    const top = (a.top - frontRing.top) * frontMMPerPixel, bottom = (a.bottom - frontRing.top) * frontMMPerPixel;
    if (index !== 0 && b && (Math.abs(top - (b.top - sideRing.top) * sideMMPerPixel) > registrationToleranceMM
      || Math.abs(bottom - (b.bottom - sideRing.top) * sideMMPerPixel) > registrationToleranceMM))
      return { error: `${names[index]} has inconsistent vertical positions in the two views. Check the layer match and image perspective.`, code: 'PHOTO_PAIR_ALIGNMENT' } as const;
    envelopes.push({ name: names[index], frontLayer: part.frontLayer, sideLayer: part.sideLayer ?? null,
      widthMM: index === 0 ? diameterMM : a.width * frontMMPerPixel,
      heightMM: index === 0 ? diameterMM : a.height * frontMMPerPixel, depthMM: b ? b.width * sideMMPerPixel : null,
      topFromReferenceMM: top, widthEvidence: index === 0 ? 'supplied-diameter' : 'front-outline',
      heightEvidence: index === 0 ? 'front-ring-diameter' : 'front-outline', depthEvidence: b ? 'side-outline' : 'unknown' });
  }
  return { calibration: { name: names[0], diameterMM, frontMMPerPixel, sideMMPerPixel, registrationToleranceMM },
    parts: envelopes, unknown: ['internal geometry', 'hidden surfaces', 'manufacturing tolerances'] };
}
