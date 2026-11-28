import { withNode } from '../engine/doc';
import { refusal } from '../engine/refusal';
import { oneBody, refOf, selectedBodies } from './bodyRef';
import { boxShellSelection, buildBoxWallShell } from './boxShellSelection';
import type { Command, Field, Values } from './commands';
import { canSetClosedShellCaps, canSetClosedShellCorner, canSetShellCorner, separateShellCap, shellCornerOptions, shellOpenFaces } from './shellCorner';

const floorField: Field = { key: 'floorThickness', label: 'Floor thickness', kind: 'mm', min: 0.1 };
const ceilingField: Field = { key: 'ceilingThickness', label: 'Ceiling thickness', kind: 'mm', min: 0.1 };

export const shellCommand: Command = {
  id: 'shell', label: 'Shell', icon: 'cad-shell', hint: 'Hollow a body, leaving the picked faces open', group: 'modify', keywords: 'hollow wall thickness case enclosure',
  available: ctx => selectedBodies(ctx.selection).length === 1 ? { ok: true }
    : { ok: false, reason: 'Select the faces to open (Shift-click for more), or a body to hollow closed.' },
  fields: (ctx, values) => {
    const wall: Field = { key: 't', label: 'Wall', kind: 'mm', min: 0.1 };
    const target = boxShellSelection(ctx, 'shell');
    if (!target) {
      const body = oneBody(ctx);
      if (!body) return [wall];
      const parent = refOf(body), open = shellOpenFaces(ctx, body);
      const hasCorner = canSetShellCorner(ctx.doc.nodes, parent, open);
      if (!hasCorner && (open.length || !canSetClosedShellCaps(ctx.doc.nodes, parent))) return [wall];
      const corner: Field = { key: 'join', label: 'Inner corner', kind: 'choice', options: shellCornerOptions };
      const cap = separateShellCap(ctx.doc.nodes, parent, open);
      const separate = cap ? `separate-${cap}` : 'separate-caps';
      const mode: Field = { key: 'wallMode', label: 'Wall thickness', kind: 'choice',
        options: [{ value: 'uniform', label: 'Uniform' }, { value: separate, label: cap ? `Separate ${cap}` : 'Separate floor and ceiling' }] };
      const caps = cap === 'floor' ? [floorField] : cap === 'ceiling' ? [ceilingField] : [floorField, ceilingField];
      return [mode, wall, ...(hasCorner ? [corner] : []), ...(values?.wallMode === separate ? caps : [])];
    }
    const mode: Field = { key: 'wallMode', label: 'Wall thickness', kind: 'choice',
      options: [{ value: 'uniform', label: 'Uniform' }, { value: 'per-face', label: 'Per face' }] };
    return [mode, ...(values?.wallMode === 'per-face' ? target.walls.map(side =>
      ({ key: side.key, label: side.label, kind: 'mm' as const, min: 0.1 })) : [wall])];
  },
  defaults: (ctx): Values => {
    const target = boxShellSelection(ctx, 'shell');
    if (target) return { t: 2, wallMode: 'uniform', ...Object.fromEntries(target.walls.map(side => [side.key, 2])) };
    const body = oneBody(ctx);
    if (!body) return { t: 2 };
    const parent = refOf(body), open = shellOpenFaces(ctx, body);
    const cap = separateShellCap(ctx.doc.nodes, parent, open);
    if (cap) return { t: 2, join: 'default', wallMode: 'uniform', [`${cap}Thickness`]: 2 };
    if (open.length || !canSetClosedShellCaps(ctx.doc.nodes, parent)) return { t: 2 };
    return { t: 2, wallMode: 'uniform', floorThickness: 2, ceilingThickness: 2,
      ...(canSetClosedShellCorner(ctx.doc.nodes, parent) ? { join: 'default' } : {}) };
  },
  // The wall: an arrow into the body from the (first) open face; deeper is thicker.
  handles: (ctx, v) => {
    if (v.wallMode === 'per-face') return [];
    const f = ctx.selection.faces[0], face = f && ctx.bodies[f.body]?.mesh.faces[f.face]; if (!face || face.kind !== 'plane') return [];
    const n = face.normal, t = Number(v.t);
    return [{ key: 't', at: [face.centroid[0] - n[0] * t, face.centroid[1] - n[1] * t, face.centroid[2] - n[2] * t], dir: [-n[0], -n[1], -n[2]], min: 0.1, step: 0.5 }];
  },
  build: (ctx, v) => {
    const join = v.join === 'default' ? undefined : v.join;
    if (join !== undefined && join !== 'sharp' && join !== 'arc') throw refusal('VALUE', 'Choose Default, Sharp, or Round for the Shell inner corner.');
    if (v.wallMode === 'per-face') {
      if (join !== undefined) throw refusal('BAD_REFERENCE', 'An explicit Shell inner corner requires uniform wall thickness.');
      return buildBoxWallShell(ctx, v);
    }
    const body = ctx.bodies[selectedBodies(ctx.selection)[0]];
    const open = shellOpenFaces(ctx, body);
    const parent = refOf(body);
    if (v.wallMode === 'separate-caps') {
      if (open.length || !canSetClosedShellCaps(ctx.doc.nodes, parent))
        throw refusal('BAD_REFERENCE', 'Select one original upright L or cylindrical body with no open faces for a separate Shell floor and ceiling.');
      if (join !== undefined && !canSetClosedShellCorner(ctx.doc.nodes, parent))
        throw refusal('BAD_REFERENCE', 'An explicit Shell inner corner needs an original upright L-shaped extrusion.');
      return withNode(ctx.doc, { kind: 'shell', parent, thickness: Number(v.t), open,
        floorThickness: Number(v.floorThickness), ceilingThickness: Number(v.ceilingThickness), ...(join === undefined ? {} : { join }) });
    }
    if (v.wallMode === 'separate-floor' || v.wallMode === 'separate-ceiling') {
      const cap = v.wallMode === 'separate-floor' ? 'floor' : 'ceiling';
      if (separateShellCap(ctx.doc.nodes, parent, open) !== cap) {
        const opening = cap === 'floor' ? 'top' : 'bottom';
        throw refusal('BAD_REFERENCE', `Select the original ${opening} cap of one upright L extrusion for a separate Shell ${cap}.`);
      }
      const capThickness = cap === 'floor' ? { floorThickness: Number(v.floorThickness) } : { ceilingThickness: Number(v.ceilingThickness) };
      return withNode(ctx.doc, { kind: 'shell', parent, thickness: Number(v.t), open, ...capThickness,
        ...(join === undefined ? {} : { join }) });
    }
    if (join !== undefined && !canSetShellCorner(ctx.doc.nodes, parent, open))
      throw refusal('BAD_REFERENCE', 'Choose an inner corner on an original upright L-shaped extrusion, closed or with one end cap open.');
    return withNode(ctx.doc, { kind: 'shell', parent, thickness: Number(v.t), open, ...(join === undefined ? {} : { join }) });
  },
};
