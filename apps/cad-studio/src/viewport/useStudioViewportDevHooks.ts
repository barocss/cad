import { useEffect, useRef, type RefObject } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import { edgeChain } from '@barocss/cad-model/app/edgeChain';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import { meshVolume } from '../app/bodyResults';
import type { ProposalOverlay } from '../engine/client';
import type { useCageEditor } from '../subd/useCageEditor';
import { asSection, type AxisSection, type Section } from './sectionView';
import type { useSectionDisplay } from './useSectionDisplay';
import type { useSectionState } from './useSectionState';
import type { useViewportPicking } from './useViewportPicking';
import type { ViewportHandle } from './Viewport';

type DevWindow = Window & Partial<{
  __studioDoc: StudioDoc;
  __studioBodies(): unknown;
  __studioSelection: unknown;
  __studioSelectEdge(name: string): boolean;
  __studioSelectFace(name: string): boolean;
  __studioPickFace(name: string): boolean;
  __studioPickEdge(name: string, additive?: boolean): boolean;
  __studioCage(): unknown;
  __studioScreenOf(point: Vec3): [number, number] | null;
  __studioChainTop(): number;
}>;

interface Options {
  model: { doc: StudioDoc; bodies: readonly BodyResult[]; fresh: boolean; massReady: boolean };
  view: { bodies: readonly BodyResult[]; colors: { has(index: number): boolean }; viewport: RefObject<ViewportHandle | null> };
  input: {
    selection: Selection; active: string | null; sketch: boolean; measure: boolean;
    setSelection(selection: Selection): void; setInstanceSel(selection: string[]): void; setDirectSel(selection: string[]): void;
    onPick: ReturnType<typeof useViewportPicking>['onPick'];
  };
  cage: RefObject<ReturnType<typeof useCageEditor>>;
}

function namedFace(bodies: readonly BodyResult[], name: string) {
  for (const [body, result] of bodies.entries()) {
    const face = result.mesh.faces.findIndex(candidate => candidate.name.split('+').includes(name));
    if (face >= 0) return { body, face };
  }
  return null;
}

function namedEdge(bodies: readonly BodyResult[], name: string) {
  for (const [body, result] of bodies.entries()) {
    const edge = result.mesh.edges.findIndex(candidate => candidate.names.includes(name));
    if (edge >= 0) return { body, edge };
  }
  return null;
}

/** Keep the desktop harness accessors at the viewport boundary. */
export function useStudioViewportDevHooks({ model, view, input, cage }: Options): void {
  const { doc, bodies, fresh, massReady } = model;
  const { selection, active, sketch, measure, setSelection, setInstanceSel, setDirectSel, onPick } = input;
  const { viewport } = view;
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (import.meta.env.DEV) (window as DevWindow).__studioDoc = doc;
  }, [doc]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hooks = window as DevWindow;
    hooks.__studioBodies = () => ({
      fresh,
      bodies: bodies.map(body => ({ key: body.key, volume: body.volume, centroid: body.centroid ?? null, massRef: body.massRef ?? null })),
      massReady,
      colored: view.bodies.flatMap((body, i) => view.colors.has(i) ? [body.key] : []),
    });
    hooks.__studioSelection = { selection, bodies: bodies.length, active, sketch, measure };
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hooks = window as DevWindow;
    hooks.__studioSelectEdge = name => {
      const edge = namedEdge(bodies, name);
      if (!edge) return false;
      setSelection({ faces: [], edges: [edge], bodies: [] });
      return true;
    };
    hooks.__studioSelectFace = name => {
      const face = namedFace(bodies, name);
      if (!face) return false;
      setInstanceSel([]);
      setDirectSel([]);
      setSelection({ faces: [face], edges: [], bodies: [] });
      return true;
    };
    hooks.__studioPickFace = name => {
      const face = namedFace(bodies, name);
      if (!face) return false;
      pick.current({ face, edge: null, point: null }, false);
      return true;
    };
    hooks.__studioPickEdge = (name, additive = false) => {
      const edge = namedEdge(bodies, name);
      if (!edge) return false;
      pick.current({ face: null, edge, point: null }, additive);
      return true;
    };
    hooks.__studioCage = () => {
      const session = cage.current.session;
      if (!session) return null;
      const { sel, cage: mesh, mirror, undo, mode } = session;
      const z = sel.faces.map(i => {
        const face = mesh.faces[i];
        return face.reduce((height, vertex) => height + mesh.positions[3 * vertex + 2], 0) / face.length;
      });
      return { faces: sel.faces.length, edges: sel.edges.length, vertices: sel.vertices.length, z,
        cageFaces: mesh.faces.length, creases: mesh.creases?.length ?? 0, mirror: mirror ?? null, undo: undo.length, mode, sel, cage: mesh };
    };
    hooks.__studioScreenOf = point => {
      const canvas = document.querySelector<HTMLCanvasElement>('.vp-canvas');
      const camera = viewport.current?.camera;
      if (!canvas || !camera) return null;
      const { left, top, width, height } = canvas.getBoundingClientRect();
      const [x, y] = camera.project(point, width, height);
      return [left + x, top + y];
    };
    hooks.__studioChainTop = () => {
      const mesh = bodies[0]?.mesh;
      if (!mesh) return 0;
      const top = mesh.bounds.max[2] - 1e-6;
      const first = mesh.edges.findIndex(edge => edge.straight && edge.a[2] >= top && edge.b[2] >= top);
      if (first < 0) return 0;
      const chain = edgeChain(mesh, first);
      setSelection({ faces: [], edges: chain.map(edge => ({ body: 0, edge })), bodies: [] });
      return chain.length;
    };
  }, [bodies, cage, setDirectSel, setInstanceSel, setSelection, viewport]);
}


interface SectionOverlayOptions {
  section: {
    state: Pick<ReturnType<typeof useSectionState>, 'section' | 'sectionExact' | 'setSectionDebug' | 'setSection' | 'dragSection'>;
    display: Pick<ReturnType<typeof useSectionDisplay>, 'sectionClip' | 'sectionHatchOn' | 'sectionHatchLines' | 'hatchStep'>;
    gpu: boolean;
    exactShown: boolean;
    bodies: readonly BodyResult[] | null;
    excludedInstances: readonly string[];
  };
  view: {
    viewport: RefObject<ViewportHandle | null>;
    shownBodies: readonly BodyResult[];
    alignPreviewBodies: readonly BodyResult[] | null | undefined;
    editNode: number | null;
    offsets: ReadonlyMap<number, Vec3> | null | undefined;
  };
  overlays: { proposal: ProposalOverlay | null | undefined; comparison: ProposalOverlay | null; tint: boolean };
  setBenchCloud(points: { at: Vec3; t: number }[] | null): void;
}

type SectionOverlayDevWindow = Window & Partial<{
  __studioSection(): unknown;
  __studioSectionDebug(value: { hold: boolean; cpu: boolean }): void;
  __studioSetSection(section: Section | AxisSection | null): void;
  __studioDragSection(section: Section | AxisSection | null, done: boolean): void;
  __studioOverlayLines(): Record<string, number>;
  __studioOverlayTexts(): Record<string, string[]>;
  __studioProposalOverlay(): unknown;
  __studioCompareOverlay(): unknown;
  __studioSetCloud(count: number, min: Vec3, max: Vec3): void;
}>;

/** Publish the current committed viewport state for the desktop harness. */
export function useStudioSectionOverlayDevHooks({ section, view, overlays, setBenchCloud }: SectionOverlayOptions): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hooks = window as SectionOverlayDevWindow;
    const { section: definition, sectionExact, setSectionDebug, setSection, dragSection } = section.state;
    const { sectionClip, sectionHatchOn, sectionHatchLines, hatchStep } = section.display;
    const { viewport, shownBodies, alignPreviewBodies, editNode, offsets } = view;
    const { proposal, comparison, tint } = overlays;
    hooks.__studioSection = () => ({
      gpu: section.gpu, excludedInstances: section.excludedInstances, exact: section.exactShown, clip: sectionClip,
      hatch: sectionHatchOn ? { spacing: hatchStep, lines: sectionHatchLines?.map(h => ({ body: h.body, segments: h.segments.length / 6 })) ?? null } : null,
      bodies: shownBodies.length, mode: definition?.mode ?? null, planes: definition?.planes ?? null,
      volume: section.exactShown ? sectionExact!.bodies.reduce((volume, body) => volume + meshVolume(body.mesh), 0) : null,
      shownVolume: shownBodies.reduce((volume, body) => volume + meshVolume(body.mesh), 0),
      shownKeys: shownBodies.map(body => body.key),
      sources: shownBodies.map(body => (shownBodies === section.bodies && section.exactShown ? sectionExact!.from.get(body.key) : null) ?? body.key),
      offsets: offsets ? [...offsets].map(([index, offset]) => [shownBodies[index]?.key, offset]) : null,
      historyAlignBounds: alignPreviewBodies === shownBodies && editNode !== null
        ? shownBodies.find(body => body.ref?.node === editNode)?.mesh.bounds : null,
    });
    hooks.__studioSectionDebug = setSectionDebug;
    hooks.__studioSetSection = value => setSection(value ? asSection(value) : null);
    hooks.__studioDragSection = (value, done) => dragSection(() => value ? asSection(value) : null, done);
    hooks.__studioOverlayLines = () => viewport.current?.overlayLines() ?? {};
    hooks.__studioOverlayTexts = () => viewport.current?.overlayTexts() ?? {};
    hooks.__studioProposalOverlay = () => proposal && {
      added: proposal.added?.volume ?? null, removed: proposal.removed?.volume ?? null, method: proposal.method,
      faces: proposal.changedFaces.length, tinted: tint, directSheets: proposal.directSheets?.length ?? 0,
    };
    hooks.__studioCompareOverlay = () => comparison && {
      added: comparison.added?.volume ?? null, removed: comparison.removed?.volume ?? null, method: comparison.method,
      faces: comparison.changedFaces.length, tinted: tint,
    };
    hooks.__studioSetCloud = (count, min, max) => setBenchCloud(count > 0 ? Array.from({ length: count }, (_, i) => {
      const u = (i * 0.61803398875) % 1, v = (i * 0.7548776662) % 1, w = (i * 0.5698402910) % 1;
      return { at: [min[0] + u * (max[0] - min[0]), min[1] + v * (max[1] - min[1]), min[2] + w * (max[2] - min[2])] as Vec3, t: w };
    }) : null);
  });
}
