import { useMemo, type RefObject } from 'react';
import { lookOf } from '@barocss/cad-model/app/bodies';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { ContinuityRequest } from '@barocss/cad-model/engine/edgeContinuity';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { EngineClient } from '../engine/client';
import { EdgeContinuity } from '../ui/EdgeContinuity';
import { EdgeCurvature } from '../ui/EdgeCurvature';
import { continuitySelection } from './edgeContinuitySelection';
import { useContinuityLocation } from './useContinuityLocation';
import { useEdgeCurvature } from './useEdgeCurvature';

interface Inputs {
  source: {
    doc: StudioDoc;
    evaluated: StudioDoc;
    docGeneration: number;
    workerSession: number;
    bodies: readonly BodyResult[];
    selection: Selection;
  };
  enabled: boolean;
  overlaysEnabled: boolean;
  engine: Pick<EngineClient, 'edgeContinuity'>;
  openIntent: RefObject<object>;
  shownDocNow: RefObject<StudioDoc>;
  ownsEvaluatedSource(): boolean;
}

/** Keep the inspection controls and their transient overlays bound to the same native source. */
export function useNativeEdgeInspection({ source, enabled, overlaysEnabled, engine, openIntent, shownDocNow, ownsEvaluatedSource }: Inputs) {
  const { doc, evaluated, docGeneration, workerSession, bodies, selection } = source;
  const picked = enabled ? continuitySelection(selection, bodies) : null;
  const visible = picked && !lookOf(doc, picked.body).hidden ? picked : null;
  const open = openIntent.current, key = picked?.body.key;

  async function read(input: ContinuityRequest) {
    const current = () => open === openIntent.current && ownsEvaluatedSource() && shownDocNow.current === doc;
    const unavailable = { error: 'The source changed. Select the edge again.' };
    if (!key || !current()) return unavailable;
    const reply = await engine.edgeContinuity(evaluated, key, input);
    return current() ? reply : unavailable;
  }

  const curvaturePick = overlaysEnabled ? visible?.picked : undefined;
  const curvatureOwner = useMemo(() => curvaturePick ? {} : null,
    [evaluated, docGeneration, workerSession, curvaturePick, key, open]);
  const curvature = useEdgeCurvature(curvatureOwner, curvaturePick, read);
  const showLocation = !!visible && overlaysEnabled;
  const locationOwner = useMemo(() => showLocation ? {} : null,
    [showLocation, evaluated, docGeneration, workerSession, key, picked?.edge, open]);
  const location = useContinuityLocation(locationOwner, read);

  return {
    panel: visible && <EdgeContinuity
      key={JSON.stringify([docGeneration, workerSession, visible.body.key, visible.edge, visible.picked])}
      picked={visible.picked} selectedDisplayEdge={visible.edge !== undefined} source={evaluated} location={location}
      read={read} />,
    combControls: curvaturePick && <EdgeCurvature {...curvature} />,
    comb: curvature.overlay,
    location: location.curve,
  };
}
