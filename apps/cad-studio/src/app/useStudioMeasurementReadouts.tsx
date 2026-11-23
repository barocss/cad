import { useMemo, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { ProjectStore } from '../storage/store';
import { measurementLineFor, type useLiveMeasurement } from '../state/useLiveMeasurement';
import { usePinnedFaceReadout, usePinnedFaceSession } from '../state/usePinnedFaceMeasurement';
import { usePinnedMass } from '../state/usePinnedMass';
import { MeasurementInspector, PinnedMeasurement } from '../ui/MeasurementInspector';
import { MeshCircleInspector } from '../ui/MeshCircleInspector';
import { PinnedMassControls } from '../ui/PinnedMassControls';
import type { MeasurePickFilter } from '../ui/measurePickHint';
import type { MeasureTarget } from './measureTargets';
import { useMeshCircleMeasurement, type MeshCircleHit } from './useMeshCircleMeasurement';

export function useStudioMeasurementSession(generation: number, worker: number, project: ProjectStore | null) {
  // A null target list means the measurement tool is closed.
  const [measure, setMeasure] = useState<MeasureTarget[] | null>(null);
  const meshCirclePick = useRef<((hit: MeshCircleHit) => boolean) | null>(null);
  const [measurementFocus, setMeasurementFocus] = useState(false);
  const measureNativeReady = useRef(false);
  const pinnedFaces = usePinnedFaceSession(generation, worker, project);
  return {
    generation, worker, project, measure, setMeasure, meshCirclePick, measurementFocus, setMeasurementFocus,
    measureNativeReady, pinnedFaces, clearPinnedFaces: pinnedFaces.clear,
  };
}

interface MeasurementReadouts {
  session: ReturnType<typeof useStudioMeasurementSession>;
  model: { doc: StudioDoc; bodies: readonly BodyResult[]; isCurrent(): boolean };
  live: ReturnType<typeof useLiveMeasurement>;
  view: { showActive: boolean; showPin: boolean; nativeReady: boolean; meshCircleReady: boolean; pickFilter: MeasurePickFilter };
  mass: { show: boolean; idle: boolean; current: boolean; canPin: boolean; selected: readonly number[]; material: string };
}

/** Keep session-owned measurement tools and overlays bound to the displayed model. */
export function useStudioMeasurementReadouts({ session, model, live, view, mass }: MeasurementReadouts) {
  const { generation, worker, project, measure, setMeasure, pinnedFaces, meshCirclePick, measureNativeReady } = session;
  const { doc, bodies, isCurrent } = model;
  const massSession = useMemo(() => ({}), [generation, worker, project]);
  const massPin = usePinnedMass({ session: massSession, doc, bodies, current: mass.current,
    canPin: mass.canPin, selected: mass.selected, material: mass.material });

  const meshSession = useMemo(() => ({}), [worker, generation, project]);
  const meshCircle = useMeshCircleMeasurement(doc, bodies, meshSession, measure !== null, view.meshCircleReady);
  meshCirclePick.current = meshCircle.pick;
  measureNativeReady.current = view.nativeReady;
  const pinnedReadout = usePinnedFaceReadout({ session: pinnedFaces, doc, bodies, ready: view.nativeReady,
    picks: live.picks, targetCount: measure?.length,
    isCurrent: () => measureNativeReady.current && isCurrent(), stopMeasuring: () => setMeasure(null) });

  const close = () => setMeasure(null);
  const changeCircle = (circle: boolean, targets: MeasureTarget[] | null) => {
    meshCircle.choose(circle);
    setMeasure(targets);
  };
  const panel = <>
    {view.showActive && measure && meshCircle.mode && <MeshCircleInspector state={meshCircle.state} ready={meshCircle.ready}
      onReset={meshCircle.reset} onBack={() => changeCircle(false, [])} onClose={() => changeCircle(false, null)} />}
    {view.showActive && measure && !meshCircle.mode && <MeasurementInspector onMeshCircle={() => changeCircle(true, [])}
      pickFilter={view.pickFilter} targets={measure} items={live.items ?? []} measured={live.result}
      approximateDistance={live.approximateDistance} onClose={close} onPin={pinnedReadout.pin} />}
    {mass.show && (massPin.pinned || mass.idle) && <PinnedMassControls pinned={massPin.pinned} result={massPin.result}
      canPin={massPin.canPin} onPin={massPin.pin} onClear={massPin.clear} />}
    {view.showPin && pinnedFaces.pair && !measure && <PinnedMeasurement distance={pinnedReadout.result?.normalDistance ?? null}
      onClear={pinnedFaces.clear} />}
  </>;
  return {
    panel,
    measurementLine: measurementLineFor(measure ? live.result : pinnedReadout.result, measure !== null && live.approximateDistance),
    centreOfMass: mass.show && massPin.result?.ok ? massPin.result.centroid : null,
  };
}
