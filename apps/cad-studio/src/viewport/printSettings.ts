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
export interface PrintSourceBody { readonly key: string; readonly name: string }
export interface PrintSourceScope {
  readonly included: readonly PrintSourceBody[];
  readonly excludedBought: readonly PrintSourceBody[];
}
/** Notice-only root scope, from the same BOM/visibility rules as actual layer inputs. */
export function printSourceScope(doc: StudioDoc, bodies: readonly BodyResult[]): PrintSourceScope {
  const made = new Set(madeBodies(doc.nodes, bodies));
  const included: PrintSourceBody[] = [], excludedBought: PrintSourceBody[] = [];
  for (const body of bodies) {
    if (lookOf(doc, body).hidden) continue;
    (made.has(body) ? included : excludedBought).push({ key: body.key, name: bodyName(doc, body) });
  }
  return { included, excludedBought };
}
export function printSourceScopeHint(doc: StudioDoc, bodies: readonly BodyResult[]): string | undefined {
  const scope = printSourceScope(doc, bodies);
  if (!scope.excludedBought.length) return undefined;
  const names = scope.excludedBought.map(body => `${body.name} (${body.key})`).join(', ');
  return `Layer sources: ${scope.included.length} made bodies${scope.included.length ? `: ${scope.included.map(body => `${body.name} (${body.key})`).join(', ')}` : ''}. Excluded purchased bodies: ${names}. These bodies may remain visible/selectable on the canvas; they are not layer results. Change bought/made in Inspect → BOM.`;
}
/** Used only at the existing no-source refusal, never ahead of edit/evaluation guards. */
export function printEmptySourceReason(doc: StudioDoc, bodies: readonly BodyResult[]): string {
  const scope = printSourceScope(doc, bodies);
  return !scope.included.length && scope.excludedBought.length
    ? 'All visible root bodies are purchased and excluded from print layers. Change bought/made in Inspect → BOM.'
    : 'No visible solid mesh to preview.';
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
