import { useEffect, useRef, type RefObject } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import { edgeChain } from '@barocss/cad-model/app/edgeChain';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import type { useCageEditor } from '../subd/useCageEditor';
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
