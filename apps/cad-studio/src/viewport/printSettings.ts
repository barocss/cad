import type { PrintPreviewSettings, StudioDoc } from '@barocss/cad-model/engine/doc';
import { checkDocumentPrintPreview, checkPrintPreview } from '@barocss/cad-model/engine/printPreview';
import { refused } from '@barocss/cad-model/engine/refusal';
import type { PrintOptions } from './usePrintLayers';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { DisplayMesh } from '@barocss/cad-model/engine/mesh';
import { madeBodies } from '@barocss/cad-model/engine/elements';
import { bodyName, lookOf } from '@barocss/cad-model/app/bodies';

/** What print layers slice: the bodies the part's own process makes (O160: a bought element — an O-ring, a bearing — is not printed), less those hidden. */
export function printSourceBodies(doc: StudioDoc, bodies: readonly BodyResult[]): BodyResult[] {
  return madeBodies(doc.nodes, bodies).filter(b => !lookOf(doc, b).hidden);
}
export function printSourceMeshes(doc: StudioDoc, bodies: readonly BodyResult[]): DisplayMesh[] {
  return printSourceBodies(doc, bodies).map(b => b.mesh);
}
/** Notice-only metadata for exactly the root bodies sliced; this does not block or change layers. */
export function printOpenSurfaceWarnings(doc: StudioDoc, bodies: readonly BodyResult[]): readonly string[] {
  return printSourceBodies(doc, bodies).flatMap(body => {
    const topology = body.topology;
    if (!topology || topology.kind === 'unknown' || !((topology.openShells ?? 0) > 0 || (topology.boundaryEdges ?? 0) > 0)) return [];
    const boundary = topology.boundaryEdges === null ? 'native boundary edge count unavailable'
      : `${topology.boundaryEdges} native boundary edge${topology.boundaryEdges === 1 ? '' : 's'}`;
    return [`Open surface included: ${bodyName(doc, body)} (${body.key}), ${boundary}. Layer contours may be incomplete; open chains are omitted. Native edge counts are not layer contour counts.`];
  });
}

export type PrintPreviewPatch = Partial<Omit<PrintPreviewSettings, 'version'>>;

/** Display defaults do not author settings, the estimated layer height, or a build direction. */
export function printOptionsOf(doc: StudioDoc, overhangLimit?: number): PrintOptions {
  const [problem] = checkDocumentPrintPreview(doc);
  if (problem) throw refused(problem);
  const saved = doc.printPreview;
  const direction: PrintOptions['direction'] = doc.print ? [...doc.print.direction] : undefined;
  return {
    layer: saved?.layer ?? 0,
    supports: saved?.supports ?? true,
    printed: saved?.printed ?? true,
    ...(saved?.layerHeight !== undefined ? { layerHeight: saved.layerHeight } : {}),
    ...(direction ? { direction } : {}),
    ...(overhangLimit !== undefined ? { overhangLimit } : {}),
  };
}

/** Apply one immutable document edit. Explicit undefined removes a saved optional control. */
export function withPrintPreviewSettings(doc: StudioDoc, patch: PrintPreviewPatch): StudioDoc {
  const [documentProblem] = checkDocumentPrintPreview(doc);
  if (documentProblem) throw refused(documentProblem);
  const saved: PrintPreviewSettings = { version: 1, ...doc.printPreview, ...patch };
  const [problem] = checkPrintPreview(saved);
  if (problem) throw refused(problem);
  if ('layer' in patch && patch.layer === undefined) delete saved.layer;
  if ('layerHeight' in patch && patch.layerHeight === undefined) delete saved.layerHeight;
  if ('supports' in patch && patch.supports === undefined) delete saved.supports;
  if ('printed' in patch && patch.printed === undefined) delete saved.printed;
  return { ...doc, printPreview: saved };
}
