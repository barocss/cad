import type { RefObject } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { useInstanceLooks } from '../state/useInstanceLooks';
import { useSectionDisplay } from './useSectionDisplay';
import type { useSectionState } from './useSectionState';
import { useSectionThroughVertex } from './useSectionThroughVertex';
import type { useViewportSelectionPresentation } from './useViewportSelectionPresentation';

type DisplayOptions = Parameters<typeof useSectionDisplay>[0];
type SectionState = ReturnType<typeof useSectionState>;
type SectionVertexOptions = Parameters<typeof useSectionThroughVertex>[0];
type SectionSelection = ReturnType<typeof useViewportSelectionPresentation>;

interface StudioSectionDisplayOptions extends Omit<DisplayOptions, 'placedHandleBounds' | 'placedDragSection'> {
  placed: {
    isolated: readonly string[] | undefined;
    looks: ReturnType<typeof useInstanceLooks>;
    currentModel: boolean;
    ready(): boolean;
    open: RefObject<object>;
    ownsModel(): boolean;
  };
}

/** A placed-only viewport uses visible occurrence bounds and rechecks the owner on every drag. */
export function useStudioSectionDisplay({ placed, ...display }: StudioSectionDisplayOptions) {
  const { bodies, section, instancesPlaced, dragSection } = display;
  const open = placed.open.current;
  const ownsHandle = () => placed.open.current === open && placed.ownsModel();
  const placedHandleBounds = !bodies.length && section?.mode === 'plane' && placed.currentModel && ownsHandle() && placed.ready()
    ? instancesPlaced.filter(instance => !placed.isolated || placed.isolated.includes(instance.id))
      .flatMap(instance => instance.bodies.filter(body => !placed.looks.get(instance.id)?.get(body.key)?.hidden).map(body => body.mesh.bounds))
    : [];
  return useSectionDisplay({
    ...display, placedHandleBounds,
    placedDragSection: (update, done) => { if (ownsHandle()) dragSection(update, done); },
  });
}

interface StudioSectionVertexOptions extends Omit<SectionVertexOptions, 'source' | 'select' | 'setSection'> {
  model: { doc: StudioDoc; evaluated: StudioDoc; worker: number };
  state: Pick<SectionState, 'section' | 'sectionExact' | 'setSection'>;
  view: {
    exactShown: boolean;
    shownBodies: DisplayOptions['shownBodies'];
    sectionBodies: DisplayOptions['sectionBodies'];
    backend: 'webgl2' | 'webgpu' | null;
  };
  selection: Pick<SectionSelection, 'sectionVertexPick' | 'sectionCornerMeshes'>;
  open: RefObject<object>;
  available(): boolean;
  projectOpening(): boolean;
}

/** Only the settled exact display and its original retained corners can start a vertex move. */
export function useStudioSectionVertex({ model, state, view, selection, open, available, projectOpening, ...move }: StudioSectionVertexOptions) {
  const { doc, evaluated, worker } = model;
  const { section, sectionExact, setSection } = state;
  const { exactShown, shownBodies, sectionBodies, backend } = view;
  const sourceOpen = open.current;
  const source = section?.mode === 'plane' && section.planes.length === 1 && exactShown && sectionExact && shownBodies === sectionBodies
    && backend && available() && !projectOpening() && selection.sectionCornerMeshes.some(corner => !!corner?.vertices.size)
    ? { doc, evaluated, section, bodies: sectionExact.sourceBodies, shown: shownBodies, backend, open: sourceOpen, worker } : null;
  return useSectionThroughVertex({ ...move, source, select: selection.sectionVertexPick, setSection });
}
