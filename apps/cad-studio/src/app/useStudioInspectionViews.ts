import { useMemo, type RefObject } from 'react';
import { lookOf } from '@barocss/cad-model/app/bodies';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { RenderCamera } from '@barocss/cad-model/engine/render';
import type { ProjectStore } from '../storage/store';
import { useNamedInspection } from '../state/useNamedInspection';

interface InspectionInputs {
  model: {
    doc: StudioDoc;
    evaluated: StudioDoc;
    bodies: readonly BodyResult[];
    selected: readonly number[];
  };
  session: { generation: number; worker: number; project: ProjectStore | null };
  availability: { pending: boolean; blocked: boolean };
  live: { doc: RefObject<StudioDoc>; worker: RefObject<number>; open: RefObject<object>; opening(): boolean };
  getCamera(): RenderCamera | null;
}

/** Tie session-only inspection views to the current Model and open intent. */
export function useStudioInspectionViews({ model, session, availability, live, getCamera }: InspectionInputs) {
  const { doc, evaluated, bodies, selected } = model;
  const { generation, worker, project } = session;
  const owner = useMemo(() => ({}), [generation, worker, project, doc, evaluated]);
  const visible = useMemo(() => bodies.map(body => ({ key: body.key, mesh: body.mesh, hidden: !!lookOf(doc, body).hidden })), [bodies, doc]);
  const reason = availability.pending ? 'Wait for the current Model result.'
    : availability.blocked || doc.instances?.length || !bodies.length
      || bodies.some(body => body.topology?.kind !== 'solid' || body.ref?.side !== 'solid'
        || !doc.nodes[body.ref.node]?.id || doc.nodes[body.ref.node]?.held || doc.nodes[body.ref.node]?.suppressed)
      ? 'Inspection views require ordinary base solids in idle Model view.' : undefined;
  const openIntent = live.open.current;
  const inspection = useNamedInspection({ owner, bodies: visible, reason, getCamera,
    isCurrent: () => live.doc.current === doc && live.worker.current === worker && live.open.current === openIntent && !live.opening() });
  return { ...inspection, selectedKeys: selected.flatMap(index => bodies[index] ? [bodies[index].key] : []) };
}
