import type { ModelAnnotation } from '@barocss/cad-model/drawing/annotations3d';
import type { OrbitCamera } from './camera';
import type { PmiTextBounds } from './pmiGeometry';

/** Consumer-owned committed SVG, not a renderer metric API. Bounds are text boxes, not glyph ink or occlusion. */
export type PmiSvgOwner = {
  items: readonly ModelAnnotation[]; renderer: object; canvas: HTMLCanvasElement; cameraKey: string;
};
export type PmiSvgCommit = PmiSvgOwner & { element: SVGSVGElement };
export function pmiSvgCameraKey(camera: OrbitCamera, canvas: HTMLCanvasElement): string {
  return [...camera.target, camera.distance, camera.yaw, camera.pitch, camera.fovY, camera.ortho ? 1 : 0,
    camera.aspect, canvas.clientWidth, canvas.clientHeight].join(',');
}
/** Finite projection alone does not reject perspective points behind the eye. */
export function pmiSvgAnchorVisible(at: readonly number[], camera: OrbitCamera): boolean {
  if (!at.every(Number.isFinite)) return false;
  const { eye, forward } = camera.basis();
  const depth = (at[0] - eye[0]) * forward[0] + (at[1] - eye[1]) * forward[1] + (at[2] - eye[2]) * forward[2];
  return Number.isFinite(depth) && depth > 0;
}
/** Read current layout on demand; a stale/missing SVG deliberately supplies NO text fallback. */
export function pmiSvgTextBounds(commit: PmiSvgCommit | null, current: PmiSvgOwner, camera: OrbitCamera): PmiTextBounds {
  const result: PmiTextBounds = new Map();
  if (!commit || commit.items !== current.items || commit.renderer !== current.renderer || commit.canvas !== current.canvas
    || commit.cameraKey !== current.cameraKey || !commit.element.isConnected || !current.canvas.isConnected) return result;
  const viewport = current.canvas.getBoundingClientRect();
  if (!(viewport.width > 0 && viewport.height > 0)) return result;
  for (const text of commit.element.querySelectorAll<SVGTextElement>('text[data-pmi-item][data-pmi-text]')) {
    const ai = Number(text.dataset.pmiItem), ti = Number(text.dataset.pmiText);
    if (!Number.isInteger(ai) || !Number.isInteger(ti)) continue;
    const annotation = current.items[ai], source = annotation?.texts[ti];
    if (!source || !source.text.trim() || text.textContent !== source.text || !pmiSvgAnchorVisible(source.at, camera)) continue;
    // DOM bounds reflect actual SVG font metrics/alignment and current CSS pixel size, including font-load changes.
    const box = text.getBoundingClientRect();
    if (![box.left, box.top, box.right, box.bottom].every(Number.isFinite) || !(box.width > 0 && box.height > 0)) continue;
    const left = Math.max(box.left, viewport.left), top = Math.max(box.top, viewport.top);
    const right = Math.min(box.right, viewport.right), bottom = Math.min(box.bottom, viewport.bottom);
    if (!(right > left && bottom > top)) continue;
    const boxes = result.get(annotation.id) ?? [];
    boxes.push({ left: left - viewport.left, top: top - viewport.top, right: right - viewport.left, bottom: bottom - viewport.top });
    result.set(annotation.id, boxes);
  }
  return result;
}
