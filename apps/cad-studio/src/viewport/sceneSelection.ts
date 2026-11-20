import type { ViewportProps } from './Viewport';

export type ScenePickingActions = Pick<ViewportProps,
  'onPick' | 'onPickBody' | 'onPickChain' | 'onBoxSelect' | 'onContextMenu' | 'onPickProfile'>;

type SelectionDisplay = Pick<ViewportProps,
  'selection' | 'pickedVertices' | 'hoverBody' | 'instanceSelection' | 'instanceFaces'>;
type PickFilter = NonNullable<ViewportProps['pickFilter']>;
type PickAction = ScenePickingActions['onPick'];

export interface SceneSelection extends SelectionDisplay {
  actions: ScenePickingActions;
  pickFilter: PickFilter;
  bandRailPicking: boolean;
  meshBoxCrossing: boolean;
}

interface SceneSelectionInputs {
  display: SelectionDisplay;
  actions: ScenePickingActions;
  historyPreview: boolean;
  draftFace: { kind: 'ready' } | { kind: 'picking'; pick: PickAction } | null;
  finishEdge: PickAction | undefined;
  proposedInstances: ReadonlyMap<string, unknown> | undefined;
  filter: PickFilter;
  command: { active: boolean; edgeFillet: boolean };
  bandRailsAvailable: boolean;
  meshBoxCrossing: boolean;
}

const ignore = () => {};
const ignoreBodyActions = { onPickBody: ignore, onPickChain: ignore, onBoxSelect: ignore, onContextMenu: ignore };

/** Route picks to the editor that owns the displayed geometry. */
export function sceneSelection({
  display, actions, historyPreview, draftFace, finishEdge, proposedInstances, filter, command, bandRailsAvailable, meshBoxCrossing,
}: SceneSelectionInputs): SceneSelection {
  const draftPick = draftFace?.kind === 'picking' ? draftFace.pick : undefined;
  let routed = actions;
  if (historyPreview) {
    routed = { ...actions, ...ignoreBodyActions, onPick: ignore,
      ...(draftFace?.kind === 'ready' ? { onPickProfile: ignore } : {}) };
  } else if (draftPick) {
    routed = { ...actions, ...ignoreBodyActions, onPick: draftPick, onPickProfile: ignore };
  } else if (finishEdge) {
    routed = { ...actions, ...ignoreBodyActions, onPick: finishEdge };
  } else if (proposedInstances) {
    routed = { ...actions, onPick: (hit, additive) => {
      if (!hit.instance || !proposedInstances.has(hit.instance)) actions.onPick(hit, additive);
    } };
  }
  return {
    ...display,
    actions: routed,
    pickFilter: draftPick ? 'face' : finishEdge || (command.edgeFillet && filter === 'edge') ? 'edge' : command.active ? 'all' : filter,
    bandRailPicking: bandRailsAvailable && !command.active && !finishEdge && !draftFace,
    meshBoxCrossing,
  };
}
