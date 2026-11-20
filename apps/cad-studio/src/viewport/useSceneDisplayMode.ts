import { useCallback, useRef, useState } from 'react';
import type { DisplayMode, DisplayModeStatus } from './renderer';
import type { ViewportProps } from './Viewport';

export type SceneDisplayMode = Pick<ViewportProps, 'displayMode' | 'requestedDisplayMode' | 'displayModeReason' | 'onDisplayModeStatus'>;

interface SceneDisplayScope {
  draggingInstance: boolean;
  assemblyEdit: boolean;
  outsideModel: boolean;
  analysisOverlay: boolean;
  directOverlay: boolean;
  editorActive: boolean;
  sectionClipped: boolean;
  hasInstances: boolean;
}

function scopeReason(scope: SceneDisplayScope): string | undefined {
  if (scope.draggingInstance) return 'CAD display modes are not available while an instance is dragged.';
  if (scope.assemblyEdit) return 'CAD display modes are not available during an assembly edit.';
  if (scope.outsideModel) return 'CAD display modes are available in Model view.';
  if (scope.analysisOverlay) return 'CAD display modes are not available with analysis or mould displays.';
  if (scope.directOverlay) return 'CAD display modes are not available with direct geometry or proposal previews.';
  if (scope.editorActive) return 'CAD display modes are not available while a sketch, cage or tool is being edited.';
}

/** Keep the session request and renderer feedback in step with the current display scope. */
export function useSceneDisplayMode(scope: SceneDisplayScope) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('shaded-with-edges');
  const [displayOpen, setDisplayOpen] = useState(false);
  const [failure, setFailure] = useState<{ requested: DisplayMode; reason: string; context: string } | null>(null);
  const displayScopeReason = scopeReason(scope);
  const context = JSON.stringify([displayScopeReason ?? null, scope.sectionClipped, scope.hasInstances]);
  const currentContext = useRef(context);
  currentContext.current = context;
  const onDisplayModeStatus = useCallback(({ supported, requested, reason }: DisplayModeStatus) => {
    if (supported || requested === 'shaded-with-edges' || !reason) return;
    setFailure(previous => previous?.requested === requested && previous.reason === reason && previous.context === currentContext.current
      ? previous : { requested, reason, context: currentContext.current });
  }, []);
  const displayModeReason = displayScopeReason
    ?? (failure?.requested === displayMode && failure.context === context ? failure.reason : undefined);
  const effectiveDisplayMode: DisplayMode = displayModeReason ? 'shaded-with-edges' : displayMode;
  const viewport: SceneDisplayMode = {
    displayMode: effectiveDisplayMode, requestedDisplayMode: displayMode, displayModeReason, onDisplayModeStatus,
  };
  return {
    viewport,
    controls: {
      displayOpen, setDisplayOpen, displayMode, setDisplayMode, effectiveDisplayMode, displayScopeReason, displayModeReason,
      displayModeNotice: displayModeReason,
      clearDisplayModeFailure: () => setFailure(null),
    },
  };
}
