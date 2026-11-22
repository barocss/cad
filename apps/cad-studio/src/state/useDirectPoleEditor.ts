import { useMemo, useRef, useState } from 'react';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import type { directNow } from '@barocss/cad-model/engine/directModule';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import type { PoleControls } from '../ui/DirectPoleEditor';
import type { TransformGizmo } from '../viewport/gizmo';
import { currentDirectPole, ownsDirectPole, type DirectPoleSelection } from './directPoleSelection';

interface DirectPoleEditorOptions {
  doc: StudioDoc;
  generation: number;
  selectedObjects: readonly string[];
  tools: ReturnType<typeof directNow>;
  routePreview?: StudioDoc | null;
  enabled: boolean;
  currentDocument(): StudioDoc;
  currentWorker(): boolean;
  commit(next: DirectGeometry, selected: string[]): boolean;
  onNotice(notice: FriendlyError): void;
}

function movePoint(point: Vec3, delta: Vec3): Vec3 {
  return [point[0] + delta[0], point[1] + delta[1], point[2] + delta[2]];
}

/** Keep selection, input and drag completion bound to the same Direct geometry owner. */
export function useDirectPoleEditor({ doc, generation, selectedObjects, tools, routePreview, enabled,
  currentDocument, currentWorker, commit, onNotice }: DirectPoleEditorOptions) {
  const [selection, setSelectionState] = useState<DirectPoleSelection | null>(null);
  const [drag, setDrag] = useState<Vec3 | null>(null);
  const selectionNow = useRef(selection);
  const enabledNow = useRef(enabled);
  enabledNow.current = enabled;

  const setSelection = (next: DirectPoleSelection | null) => {
    selectionNow.current = next;
    setSelectionState(next);
  };
  const clear = () => { setSelection(null); setDrag(null); };

  const { direct } = doc;
  const objectId = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const poles = useMemo(() => {
    if (!objectId || !direct || !tools) return [];
    try { return tools.polesOf(direct, objectId); } catch { return []; }
  }, [objectId, direct, tools]);
  const owner = currentDirectPole(selection, direct, generation, objectId, poles.map(pole => pole.key));
  if ((!enabled && (selection || drag)) || (selection && !owner)) clear();
  const selected = owner ? poles.find(pole => pole.key === owner.key) : undefined;
  const isCurrent = (expected: DirectPoleSelection) => {
    const live = currentDocument();
    return live === doc && ownsDirectPole(expected, selectionNow.current, live.direct, enabledNow.current);
  };
  const controls: PoleControls = {
    selected: selected?.key ?? null,
    select(key) {
      if (currentDocument() !== doc || !direct || !objectId || (key !== null && !poles.some(pole => pole.key === key))) return;
      setDrag(null);
      setSelection(key === null ? null : { direct, generation, id: objectId, key });
    },
    edit(key, patch) {
      if (!owner || owner.key !== key || !tools || !isCurrent(owner)) return;
      try {
        const [i, j] = key.split(',').map(Number);
        const next = key.includes(',')
          ? tools.directOps.editSurfacePole(owner.direct, owner.id, i, j, patch)
          : tools.directOps.editCurvePole(owner.direct, owner.id, i, patch);
        if (commit(next, [owner.id])) setSelection({ ...owner, direct: next });
      } catch (error) {
        onNotice({ title: 'The pole could not be changed', hint: error instanceof Error ? error.message : String(error), detail: '' });
      }
    },
  };
  const shown = useMemo(() => {
    if (!tools) return [];
    if (routePreview) return tools.directDisplay(routePreview.direct);
    if (drag && selected && objectId && direct) {
      try { return tools.directDisplay(tools.movePole(direct, objectId, selected.key, movePoint(selected.at, drag))); }
      catch { /* Keep showing the accepted geometry. */ }
    }
    return tools.directDisplay(direct);
  }, [tools, direct, drag, objectId, selected, routePreview]);
  const gizmo: TransformGizmo | null = enabled && tools && selected && owner ? {
    origin: drag ? movePoint(selected.at, drag) : selected.at, move: [0, 1, 2],
    onMove(delta, done) {
      if (!currentWorker() || !isCurrent(owner)) return;
      if (!done) { setDrag(delta); return; }
      setDrag(null);
      if (delta.every(value => value === 0)) return;
      try {
        const next = tools.movePole(owner.direct, owner.id, selected.key, movePoint(selected.at, delta));
        if (commit(next, [owner.id])) setSelection({ ...owner, direct: next });
      } catch (error) {
        onNotice({ title: 'The pole could not be moved', hint: error instanceof Error ? error.message : String(error), detail: '' });
      }
    },
  } : null;

  return { objectId, poles: enabled ? poles : undefined, dragging: drag !== null, controls, shown, gizmo, clear,
    pick: (key: string) => controls.select(selected?.key === key ? null : key) };
}
