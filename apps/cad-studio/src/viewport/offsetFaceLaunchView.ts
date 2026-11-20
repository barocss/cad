import type { Command, Ctx, Values } from '@barocss/cad-model/app/commands';
import type { Vec3 } from '@barocss/cad-model/engine/vec3';
import { dot, unit } from '@barocss/cad-model/engine/vec3';
import { OrbitCamera } from './camera';

/** Give a distance handle room on screen when a face is picked head-on. */
export function offsetFaceLaunchView(cmd: Command, ctx: Ctx, values: Values, forward: Vec3): 'iso' | 'right' | undefined {
  if (cmd.id !== 'offset-face' || values.offsetMode === 'to-plane') return;
  const handle = cmd.handles?.(ctx, values).find(candidate => candidate.key === 'd');
  if (!handle) return;
  const normal = unit(handle.dir);
  if (!(Math.abs(dot(forward, normal)) > 0.95)) return;
  // The default isometric view can also be head-on to an oblique face.
  const iso = new OrbitCamera();
  return Math.abs(dot(iso.basis().forward, normal)) > 0.95 ? 'right' : 'iso';
}
