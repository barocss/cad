import type { FaceSel, Selection } from '@barocss/cad-model/app/commands';
import { isExtrudeToFace } from '@barocss/cad-model/app/extrudeEndFacePick';
import { isReferencePlaneEdit } from '@barocss/cad-model/app/offsetPlanePick';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { activeBandHighlight } from '../app/bandHighlight';
import type { CommandPickScope } from '../app/commandReferencePicking';
import type { Active } from '../app/commandState';
import { shownExtrudeEndFace } from '../app/extrudeEndFace';
import { emptySel } from '../app/studioConstants';
import { useSectionSelection } from './useSectionSelection';

interface Inputs {
  scene: {
    current: boolean;
    unavailable: boolean;
    shown: readonly BodyResult[];
    drawn: readonly BodyResult[];
    preview: readonly BodyResult[] | null;
    hidden: ReadonlySet<number>;
  };
  command: { active: Active | null; doc: StudioDoc; canPick: boolean };
  section: Omit<Parameters<typeof useSectionSelection>[0], 'shownBodies' | 'canPick'>;
  highlights: {
    replacement?: { mesh: BodyResult['mesh']; edges: readonly { index: number }[] };
    hideSource: boolean;
    mateFaces: FaceSel[] | null;
    source: Selection;
  };
}

export function useViewportSelectionPresentation({ scene, command, section, highlights }: Inputs) {
  const { shown, drawn, preview, current, hidden, unavailable } = scene;
  const { active, doc, canPick } = command;
  const currentCommandMesh = current && (shown === drawn || shown === preview);
  const band = currentCommandMesh ? activeBandHighlight(active, doc, shown) : null;
  const commandScope: CommandPickScope | null = currentCommandMesh && canPick
    ? { bodies: shown, hidden, preview: shown === preview } : null;
  const endFace = active && commandScope && active.preview === 'ok' &&
    (isExtrudeToFace(active.cmd.id, active.values) || isReferencePlaneEdit(active.cmd.id, active.values))
    ? shownExtrudeEndFace(active, shown) : null;
  const cut = useSectionSelection({ ...section, shownBodies: shown, canPick: current });

  const { replacement, hideSource, mateFaces, source } = highlights;
  const replacementBody = replacement ? shown.findIndex(body => body.mesh === replacement.mesh) : -1;
  const selection = unavailable ? emptySel : cut.selection ?? (
    replacement && replacementBody >= 0 ? { ...emptySel, edges: replacement.edges.map(edge => ({ body: replacementBody, edge: edge.index })) }
      : endFace ? { ...emptySel, faces: [endFace] }
      : band ? band
      : hideSource ? emptySel
      : mateFaces ? { faces: mateFaces, edges: [], bodies: [] }
      : source);
  return { commandScope, selection, sectionPick: cut.pick, sectionVertexPick: cut.pickVertex };
}
