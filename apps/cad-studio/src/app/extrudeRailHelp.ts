import type { Ctx } from '@barocss/cad-model/app/commands';
import { extrudeCommand, extrudeProfile } from '@barocss/cad-model/app/profileCommands';
import { featureId } from '@barocss/cad-model/engine/ids';

/** Describe the same profile resolver used by Extrude, without selecting or building anything. */
export function extrudeRailHelp(ctx: Ctx, current: boolean): { ok: boolean; reason: string; description: string } {
  const guidance = 'Choose a sketch in the Browser to use it explicitly, or select a flat face.';
  if (!current) return { ok: false, reason: 'Return to the current Model and wait for evaluation to finish.', description: guidance };
  const available = extrudeCommand.available(ctx);
  if (!available.ok) return { ok: false, reason: available.reason, description: guidance };
  const profile = extrudeProfile(ctx);
  if (!profile) return { ok: false, reason: 'Select one finished sketch or a flat face.', description: guidance };
  if (profile.fresh) {
    const face = ctx.selection.faces[0];
    return { ok: true, reason: '', description: `Target: selected planar face ${face.face + 1} on body ${ctx.bodies[face.body].key}. ${guidance}` };
  }
  const selected = !!ctx.selection.sketches?.length;
  const region = ctx.selection.profileRegions?.indices.length === 1 ? 'selected region of ' : '';
  return { ok: true, reason: '', description: `${selected ? 'Target' : 'Default target'}: ${region}Sketch ${profile.index + 1} (${featureId(ctx.doc.nodes, profile.index)})${selected ? ' (selected)' : ', the latest unused sketch'}. ${guidance}` };
}
