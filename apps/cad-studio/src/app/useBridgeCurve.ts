import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Curve } from '@barocss/cad';
import { buildBridgeCurve, type BridgeContinuity, type BridgeEnd } from '@barocss/cad-model/engine/bridgeCurve';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { DirectDisplay, DirectGeometry } from '@barocss/cad-model/engine/direct';
import { directNow, loadDirect } from '@barocss/cad-model/engine/directModule';
import type { DisplayEdge, Vec3 } from '@barocss/cad-model/engine/mesh';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { EngineClient } from '../engine/client';
import type { ViewportPointerProps } from '../viewport/viewportPointerInput';
import { bridgeCurveDisplay } from './bridgeCurveDisplay';
import { nativeEdgeCurveSource } from './nativeEdgeCurveSource';

type Pair<T> = [T, T];
type Input = { id: string; name: string; curve: Curve };
type ViewportPick = Parameters<ViewportPointerProps['onPick']>[0];
type Source = { kind: 'direct'; id: string } | { kind: 'edge'; id: string; body: string; joint: DisplayEdge['nativeJoint'] };
type Scope = { doc: StudioDoc; evaluated: StudioDoc; key: string };
type Draft = { scope: Scope; ticket: number } & (
  { status: 'loading' } | { status: 'refused'; error: string } |
  { status: 'ready'; inputs: Pair<Input>; ends: Pair<BridgeEnd>; continuity: BridgeContinuity }
);
const NO_PREVIEW: DirectDisplay[] = [];

interface BridgeCurveOptions {
  model: { doc: StudioDoc; evaluated: StudioDoc; bodies: BodyResult[]; selection: Selection; directSelection: string[]; ready: boolean };
  engine: Pick<EngineClient, 'nativeEdgeCurve'>;
  current(): boolean;
  commit(next: DirectGeometry, id: string): boolean;
}

function selectedSources({ bodies, selection, directSelection }: BridgeCurveOptions['model']): Source[] {
  if (directSelection.length === 2) return directSelection.map(id => ({ kind: 'direct', id }));
  if (directSelection.length || selection.edges.length !== 2 || selection.faces.length || selection.bodies.length) return [];
  return selection.edges.flatMap(({ body, edge }) => {
    const part = bodies[body], view = part?.mesh.edges[edge];
    return part && view ? [{ kind: 'edge', id: 'edge:' + part.key + ':' + (view.nativeJoint?.edgeId ?? edge),
      body: part.key, joint: view.nativeJoint }] : [];
  });
}

function nearest(curve: Curve, hint: Vec3 | undefined, fallback: BridgeEnd): BridgeEnd {
  if (!hint) return fallback;
  const distance = (point: Vec3) => Math.hypot(point[0] - hint[0], point[1] - hint[1], point[2] - hint[2]);
  return distance(curve.controlPoints[0]) <= distance(curve.controlPoints.at(-1)!) ? 'start' : 'end';
}

export function useBridgeCurve({ model, engine, current, commit }: BridgeCurveOptions) {
  const { doc, evaluated, ready, bodies } = model;
  const sources = selectedSources(model), key = JSON.stringify(sources.map(source => [source.kind, source.id]));
  const owner = useRef({ doc, evaluated, key, ready, current });
  owner.current = { doc, evaluated, key, ready, current };
  const hints = useRef<{ doc: StudioDoc; points: Map<string, Vec3> }>({ doc, points: new Map() });
  const request = useRef(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  useLayoutEffect(() => () => { request.current++; }, [doc, evaluated, key, ready]);
  const matches = (source: Scope) => owner.current.ready && owner.current.doc === source.doc
    && owner.current.evaluated === source.evaluated && owner.current.key === source.key;
  const shown = draft && matches(draft.scope) ? draft : null;
  if (draft && !shown) setDraft(null);
  const owns = (source: Scope, ticket: number) => request.current === ticket && matches(source) && owner.current.current();

  const candidate = useMemo(() => {
    if (shown?.status !== 'ready') return null;
    try {
      const [a, b] = shown.inputs, [first, second] = shown.ends;
      const result = buildBridgeCurve({ ...a, end: first }, { ...b, end: second }, shown.continuity);
      return { result, preview: [bridgeCurveDisplay(result)] };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [shown]);

  function rememberPick(hit: ViewportPick, additive: boolean) {
    if (hints.current.doc !== doc || !additive) hints.current = { doc, points: new Map() };
    if (!hit.endpointHint) return;
    const part = hit.edge && bodies[hit.edge.body], joint = part && hit.edge ? part.mesh.edges[hit.edge.edge]?.nativeJoint : undefined;
    const id = hit.direct ?? (part && joint && hit.edgeMesh === part.mesh ? 'edge:' + part.key + ':' + joint.edgeId : null);
    if (id) hints.current.points.set(id, hit.endpointHint);
  }

  async function begin() {
    if (sources.length !== 2 || !ready || !current()) return;
    const scope = { doc, evaluated, key }, ticket = ++request.current;
    const captured = hints.current.doc === doc ? new Map(hints.current.points) : new Map<string, Vec3>();
    setDraft({ scope, ticket, status: 'loading' });
    try {
      const directTools = await loadDirect();
      if (!owns(scope, ticket)) return;
      const read = async (source: Source): Promise<Input> => {
        if (source.kind === 'direct') {
          const direct = doc.direct;
          const objects = direct?.objects.filter(item => item.id === source.id && !item.hidden);
          if (!direct || objects?.length !== 1) throw new Error('Select two visible native curves.');
          const object = objects[0], curve = directTools.geometryOf(direct, object);
          if (curve.kind !== 'curve') throw new Error('Bridge Curve needs two open straight curves.');
          return { id: 'direct:' + source.id, name: object.name, curve };
        }
        if (!source.joint) throw new Error('Select two unmerged native edges on root bodies.');
        const reply = await engine.nativeEdgeCurve(evaluated, source.body, source.joint);
        if ('error' in reply) throw new Error(reply.error);
        const { degree, knots, points, weights } = reply.curve;
        return { id: source.id, name: reply.edgeName, curve: { kind: 'curve', id: reply.edgeId, degree, knots, controlPoints: points, weights } };
      };
      const first = await read(sources[0]);
      if (!owns(scope, ticket)) return;
      const second = await read(sources[1]);
      if (!owns(scope, ticket)) return;
      const ends: Pair<BridgeEnd> = [nearest(first.curve, captured.get(sources[0].id), 'end'),
        nearest(second.curve, captured.get(sources[1].id), 'start')];
      setDraft({ scope, ticket, status: 'ready', inputs: [first, second], ends, continuity: 'G0' });
    } catch (error) {
      if (owns(scope, ticket)) setDraft({ scope, ticket, status: 'refused', error: error instanceof Error ? error.message : String(error) });
    }
  }

  function cancel() {
    request.current++;
    setDraft(null);
  }

  function apply() {
    if (shown?.status !== 'ready' || !candidate?.result || !owns(shown.scope, shown.ticket)) return;
    const runtime = directNow();
    if (!runtime) return;
    try {
      // The exact native source writer retains endpoints and handle values at full binary64 precision.
      const { degree, knots, controlPoints, weights } = candidate.result.curve;
      const direct = doc.direct ?? runtime.emptyDirect();
      const next = runtime.importSource(direct, nativeEdgeCurveSource([{ degree, knots, points: controlPoints, weights }]), 'Bridge curve');
      if (commit(next, next.objects.at(-1)!.id)) cancel();
    } catch (error) {
      if (owns(shown.scope, shown.ticket)) setDraft({ ...shown, status: 'refused', error: error instanceof Error ? error.message : String(error) });
    }
  }

  function changeEnd(index: 0 | 1, value: BridgeEnd) {
    setDraft(previous => {
      if (previous?.status !== 'ready') return previous;
      const ends: Pair<BridgeEnd> = [...previous.ends];
      ends[index] = value;
      return { ...previous, ends };
    });
  }
  function changeContinuity(value: BridgeContinuity) {
    setDraft(previous => previous?.status === 'ready' ? { ...previous, continuity: value } : previous);
  }

  return { available: ready && sources.length === 2, shown, error: candidate?.error, ends: candidate?.result?.ends,
    preview: candidate?.preview ?? NO_PREVIEW, begin, rememberPick, cancel, apply, changeEnd, changeContinuity };
}
