import type { ModelNode, StudioDoc } from '../engine/doc';
import type { Op } from '../engine/schema/proposals';
import { addPart, type AddPartOptions } from '../assembly/edit';
import { photoLayerBounds, type measurePhotoPair } from './photoPair';
import type { ImageTrace } from './trace';

type Report = Extract<ReturnType<typeof measurePhotoPair>, { calibration: unknown }>;

/** Compile the measured envelopes to ordinary, replayable assembly and feature operations. */
export function photoDraftOperations(doc: StudioDoc, front: ImageTrace, side: ImageTrace, report: Report, traceRevision: string) {
  const [head, ...parts] = report.parts;
  if (parts.length !== 3 || !head.sideLayer || head.depthMM === null || parts.some(p => !p.sideLayer || p.depthMM === null))
    return { error: 'Supply both views for the ring head, handle, filter cap and button.' };
  const { diameterMM, frontMMPerPixel, sideMMPerPixel } = report.calibration;
  const frontRing = photoLayerBounds(front, head.frontLayer)!, sideRing = photoLayerBounds(side, head.sideLayer)!;
  const opening = frontRing.openings[0];
  const xs = opening.map(([x]) => x), ys = opening.map(([, y]) => y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const width = right - left, height = bottom - top, radius = width * frontMMPerPixel / 2;
  const outer = diameterMM / 2;
  if (opening.length < 3 || !Number.isFinite(radius) || radius <= 0 || radius >= outer || Math.abs(width - height) > 0.06 * width
    || Math.abs((left + right) / 2 - frontRing.centerX) > 2
    || Math.abs((top + bottom) / 2 - (frontRing.top + frontRing.bottom) / 2) > 2)
    return { error: 'The front opening needs a visible concentric circular outline for this draft.' };

  const ops: Op[] = [];
  let allocation = doc;
  const place = (placement: AddPartOptions, sketch: ModelNode, height: number) => {
    const { doc, id } = addPart(allocation, placement);
    allocation = doc;
    const { name, position, rotation, grounded } = placement;
    ops.push({ tool: 'add_part', args: { name, position, rotation, expectedId: id, ...(grounded ? { grounded } : {}) } },
      { tool: 'add_features', args: { part: id, features: [sketch, { kind: 'extrude', sketch: 0, height }] } });
  };
  place({ name: head.name, position: [0, head.depthMM / 2, -outer], rotation: [90, 0, 0], grounded: true },
    { kind: 'sketch', profile: 'circle', center: [0, 0], radius: outer,
      holes: [[{ kind: 'arc', center: [0, 0], start: [radius, 0], direction: 'cw' },
        { kind: 'arc', center: [0, 0], start: [-radius, 0], direction: 'cw' }]] }, head.depthMM);
  for (const part of parts) {
    const { widthMM, heightMM, depthMM } = part;
    if (depthMM === null || part.sideLayer === null) return { error: 'One of the side envelopes is missing.' };
    const a = photoLayerBounds(front, part.frontLayer)!, b = photoLayerBounds(side, part.sideLayer)!;
    place({ name: part.name, position: [(a.centerX - frontRing.centerX) * frontMMPerPixel,
      (b.centerX - sideRing.centerX) * sideMMPerPixel, -part.topFromReferenceMM - heightMM], rotation: [0, 0, 0] },
    { kind: 'sketch', profile: 'rectangle', min: [-widthMM / 2, -depthMM / 2], max: [widthMM / 2, depthMM / 2] }, heightMM);
  }
  const fmt = (value: number) => value.toFixed(2);
  const dimensions = report.parts.map(p => `${p.name.slice(0, 24)} ${fmt(p.widthMM)} × ${fmt(p.depthMM!)} × ${fmt(p.heightMM)}`).join(', ');
  const plan = `Supplied outside diameter ${diameterMM} mm. Draft X × Y × Z in mm: ${dimensions}. Outline estimates, including aperture ${fmt(radius * 2)} mm. Hidden geometry and tolerances unknown. Trace ${traceRevision}.`;
  return { ops, plan };
}
