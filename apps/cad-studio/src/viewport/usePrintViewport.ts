import { useMemo } from 'react';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import type { FaceRef, EdgeRef } from './renderer';
import type { FeatureHandle } from './gizmo';
import type { ViewportProps as Props } from './Viewport';
import { printPointToModel, projectPrintBodies } from './printProjection';

// Stable empty display inputs must not retrigger renderer uploads on unrelated renders.
const NO_BODIES: BodyResult[] = [], NO_HANDLES: FeatureHandle[] = [], NO_PROFILES: NonNullable<Props['profiles']> = [];
const NO_SELECTION: Props['selection'] = { faces: [], edges: [], bodies: [] };

/** The selection as the print view's bodies number their faces and edges. */
export function printSelection(selection: Props['selection'], projection: ReturnType<typeof projectPrintBodies>): Props['selection'] {
  const faces = selection.faces.flatMap(ref => { const index = projection.faceSources[ref.body]?.indexOf(ref.face) ?? -1; return index >= 0 ? [{ body: ref.body, face: index }] : []; });
  const edges = selection.edges.flatMap(ref => { const index = projection.edgeSources[ref.body]?.indexOf(ref.edge) ?? -1; return index >= 0 ? [{ body: ref.body, edge: index }] : []; });
  return { ...selection, faces, edges };
}
/** The face colours as the print view's bodies number their faces. */
export function printFaceColors(faceColors: Props['faceColors'], projection: ReturnType<typeof projectPrintBodies>): Props['faceColors'] {
  return faceColors && new Map([...faceColors].map(([body, colors]) => [body, new Map((projection.faceSources[body] ?? []).flatMap((native, shown) => colors.has(native) ? [[shown, colors.get(native)!] as const] : []))]));
}
export function printViewportProps(source: Props, projection: ReturnType<typeof projectPrintBodies>, selection: Props['selection'], faceColors: Props['faceColors']): Props {
  const face = (ref: FaceRef | null): FaceRef | null => { const index = ref && projection.faceSources[ref.body]?.[ref.face]; return ref && index !== undefined && index !== null && index >= 0 ? { body: ref.body, face: index } : null; };
  const edge = (ref: EdgeRef | null): EdgeRef | null => { const index = ref && projection.edgeSources[ref.body]?.[ref.edge]; return ref && index !== undefined && index !== null && index >= 0 ? { body: ref.body, edge: index } : null; };
  const point = (p: Vec3 | null) => p ? printPointToModel(p, source.printDisplay!.summary.modelToBed) : null;
  return { ...source, bodies: projection.bodies, selection, faceColors,
    gizmo: null, handles: NO_HANDLES, offsets: undefined, transforms: null, pickedVertices: undefined, measureLine: null, boundsBox: null, profiles: NO_PROFILES,
    clip: null, sectionHatch: null, clearance: null, threads: undefined, underlays: undefined, cloud: null, poles: undefined,
    onPick: (hit, additive) => {
      const nativeFace = face(hit.face), nativeEdge = edge(hit.edge);
      if (hit.face && !nativeFace) { source.onPickBody?.(hit.face.body); return; }
      if (hit.edge && !nativeEdge) { source.onPickBody?.(hit.edge.body); return; }
      source.onPick({ ...hit, face: nativeFace, edge: nativeEdge, point: point(hit.point), ...(hit.vertex ? { vertex: { ...hit.vertex, at: point(hit.vertex.at)! } } : {}) }, additive);
    },
    onPickChain: (body, shown) => { const ref = edge({ body, edge: shown }); if (ref) source.onPickChain?.(ref.body, ref.edge); },
    onCursor: p => source.onCursor(point(p)),
    onContextMenu: (at, hit) => {
      const nativeFace = face(hit.face);
      source.onContextMenu(at, { face: nativeFace, edge: edge(hit.edge), point: nativeFace ? point(hit.point) : null });
    },
  };
}

/** Adapts display-only print geometry and picks without giving it document ownership.
 * Native names/indices and model-space points leave this boundary; synthetic caps select bodies. */
export function usePrintViewport(sourceProps: Props): Props {
  const projection = useMemo(() => sourceProps.printDisplay ? projectPrintBodies(sourceProps.bodies, sourceProps.printDisplay) : null,
    [sourceProps.bodies, sourceProps.printDisplay?.summaryKey, sourceProps.printDisplay?.top, sourceProps.printDisplay?.printed]);
  const printSel = useMemo(() => projection ? printSelection(sourceProps.selection, projection) : null, [sourceProps.selection, projection]);
  const printColors = useMemo(() => projection ? printFaceColors(sourceProps.faceColors, projection) : undefined, [sourceProps.faceColors, projection]);
  return useMemo(() => projection ? printViewportProps(sourceProps, projection, printSel!, printColors) : sourceProps.printActive ? { ...sourceProps, bodies: NO_BODIES, selection: NO_SELECTION, gizmo: null, handles: NO_HANDLES, profiles: NO_PROFILES, threads: undefined, underlays: undefined, cloud: null, poles: undefined } : sourceProps, [sourceProps, projection, printSel, printColors]);
}
