import { useMemo } from 'react';
import { lookOf } from '@barocss/cad-model/app/bodies';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { MeasurePick } from '@barocss/cad-model/app/measure';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { cutAfter } from '@barocss/cad-model/engine/ids';
import type { EdgeRef, FaceRef } from './renderer';
import { retainedSectionEdges } from './sectionEdgePick';
import type { Section } from './sectionView';

export type SectionPick = (hit: { face: FaceRef | null; edge: EdgeRef | null }) =>
  { face: FaceRef | null; edge: EdgeRef | null; cap: boolean };

interface Inputs {
  doc: StudioDoc;
  section: Section | null;
  cutFrom: number;
  sourceBodies: readonly BodyResult[];
  shownBodies: readonly BodyResult[];
  sourceKeys: ReadonlyMap<string, string> | undefined;
  exactView: boolean;
  canPick: boolean;
  showSelection: boolean;
  sourceEdges: readonly Pick<MeasurePick, 'body' | 'edge'>[];
}

/** The section draws its own cap but edits and measures only retained original geometry. */
export function useSectionSelection({
  doc, section, cutFrom, sourceBodies, shownBodies, sourceKeys, exactView, canPick, showSelection, sourceEdges,
}: Inputs) {
  const edgesBySectionBody = useMemo(() => {
    if (!exactView || section?.mode !== 'plane' || section.planes.length !== 1) return [];
    return shownBodies.map(shown => {
      const key = sourceKeys?.get(shown.key);
      const body = sourceBodies.findIndex(source => source.key === key);
      return body < 0 ? null : { body, edges: retainedSectionEdges(sourceBodies[body].mesh, shown.mesh, section.planes[0], cutFrom) };
    });
  }, [exactView, section, shownBodies, sourceKeys, sourceBodies, cutFrom]);

  const selection: Selection | null = showSelection ? {
    faces: shownBodies.flatMap((body, index) => body.mesh.faces.filter(face => cutAfter(face.name, cutFrom))
      .map(face => ({ body: index, face: face.index }))),
    edges: sourceEdges.flatMap(pick => edgesBySectionBody.flatMap((source, body) => {
      if (!source || source.body !== pick.body || pick.edge === undefined) return [];
      return [...source.edges].flatMap(([shown, original]) => original === pick.edge ? [{ body, edge: shown }] : []);
    })),
    bodies: [],
  } : null;

  const pick: SectionPick = hit => {
    const none = { face: null, edge: null, cap: false };
    if (!canPick || !exactView) return none;
    if (hit.edge) {
      const shown = shownBodies[hit.edge.body]?.mesh, edge = shown?.edges[hit.edge.edge];
      if (edge?.faces.some(index => cutAfter(shown?.faces[index]?.name ?? '', cutFrom))) return { ...none, cap: true };
      const source = edgesBySectionBody[hit.edge.body], original = source?.edges.get(hit.edge.edge);
      return source && original !== undefined && !lookOf(doc, sourceBodies[source.body]).hidden
        ? { ...none, edge: { body: source.body, edge: original } } : none;
    }
    if (!hit.face) return none;
    const shown = shownBodies[hit.face.body], face = shown?.mesh.faces[hit.face.face];
    if (!face) return none;
    if (cutAfter(face.name, cutFrom)) return { ...none, cap: true };
    const source = sourceKeys?.get(shown.key);
    const body = sourceBodies.findIndex(candidate => candidate.key === source);
    if (body < 0 || lookOf(doc, sourceBodies[body]).hidden) return none;
    const matches = sourceBodies[body].mesh.faces.filter(candidate => candidate.name === face.name);
    return matches.length === 1 ? { ...none, face: { body, face: matches[0].index } } : none;
  };
  return { selection, pick };
}
