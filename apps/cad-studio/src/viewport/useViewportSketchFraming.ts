import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { SketchPlane } from '@barocss/cad-model/sketch/plane';
import type { ScreenBox } from '../ui/sketchConstraintMarkLayout';
import type { OrbitCamera } from './camera';
import { modelFitArea } from './modelFitArea';
import { applySketchCameraFrame, ownsSketchCameraFrame, type SketchCameraFrame } from './sketchCameraFrame';

export function useViewportSketchFraming(
  canvas: RefObject<HTMLCanvasElement | null>,
  camera: RefObject<OrbitCamera>,
  sketching: boolean,
  plane: SketchPlane | undefined,
  readActivePlane: () => SketchPlane | undefined,
  request: RefObject<() => void>,
) {
  const sketchRail = useRef<ScreenBox | undefined>(undefined);
  useLayoutEffect(() => {
    const view = canvas.current;
    const rail = view?.closest('.stage')?.querySelector('nav.toolbar');
    if (!sketching || !view || !rail) return;
    const read = () => {
      const canvasBox = view.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();
      sketchRail.current = {
        x: railBox.left - canvasBox.left,
        y: railBox.top - canvasBox.top,
        width: railBox.width,
        height: railBox.height,
      };
      request.current();
    };
    const observer = new ResizeObserver(read);
    observer.observe(view);
    observer.observe(rail);
    read();
    return () => {
      observer.disconnect();
      sketchRail.current = undefined;
    };
  }, [canvas, request, sketching]);

  const pending = useRef<SketchCameraFrame | null>(null);
  const applyFrame = useCallback((view: HTMLCanvasElement, frame: SketchCameraFrame) => {
    applySketchCameraFrame(camera.current, frame, view.clientWidth, view.clientHeight, modelFitArea(view));
    request.current();
  }, [camera, request]);

  // Apply a queued frame after the Sketch rail replaces the Model rail.
  useLayoutEffect(() => {
    const frame = pending.current;
    const view = canvas.current;
    pending.current = null;
    if (view && ownsSketchCameraFrame(frame, plane)) applyFrame(view, frame);
  }, [applyFrame, canvas, plane]);

  return {
    sketchRail,
    frameSketch(min: SketchCameraFrame['min'], max: SketchCameraFrame['max'], plane: SketchPlane) {
      pending.current = { min, max, plane };
    },
    frameActiveSketch(min: SketchCameraFrame['min'], max: SketchCameraFrame['max'], plane: SketchPlane) {
      const frame = { min, max, plane };
      const view = canvas.current;
      if (!view || !ownsSketchCameraFrame(frame, readActivePlane())) return false;
      pending.current = null;
      applyFrame(view, frame);
      return true;
    },
    faceActiveSketch() {
      const plane = readActivePlane();
      if (!plane) return;
      camera.current.faceNormal(plane.normal);
      request.current();
    },
  };
}
