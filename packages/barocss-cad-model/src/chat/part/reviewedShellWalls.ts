import { boxShellSelection } from '../../app/boxShellSelection';
import type { Ctx } from '../../app/commands';
import type { NameSelection } from '../names';

const noPicks = (value: unknown) => value === undefined || (Array.isArray(value) && value.length === 0);

/** Require explicit current topology and every kept thickness before the command can use its Studio defaults. */
export function reviewedShellWallsProblem(ctx: Ctx, names: NameSelection, args: Record<string, unknown>, values: Record<string, unknown>): string | undefined {
  if (args.expectedRevision === undefined)
    return 'Per-face Shell needs expectedRevision from query.rebuild for the same part.';
  const { bodies, faces, edges } = ctx.selection;
  const closed = bodies.length > 0 || names.faces.length === 0;
  if (closed) {
    const body = ctx.bodies[bodies[0]];
    if (!Array.isArray(args.bodies) || args.bodies.length !== 1 || bodies.length !== 1
      || !body || args.bodies[0] !== body.key || !noPicks(args.faces) || !noPicks(args.edges)
      || faces.length || edges.length || args.point !== undefined)
      return 'Closed per-face Shell needs one exact original rectangular body ID, with no opening picks.';
  } else {
    const selected = faces.map(pick => ctx.bodies[pick.body]?.mesh.faces[pick.face]?.nativePlaneName);
    if (!Array.isArray(args.faces) || names.faces.length > 2 || args.faces.length !== names.faces.length
      || faces.length !== names.faces.length || edges.length || args.point !== undefined ||
      names.faces.some(name => !selected.includes(name)
        || ctx.bodies.flatMap(body => body.mesh.faces.filter(face => face.nativePlaneName === name)).length !== 1))
      return 'Per-face Shell needs exact original native face names for its openings.';
  }

  const box = boxShellSelection(ctx, closed);
  if (!box) return closed ? 'Closed per-face Shell needs one exact original rectangular body ID.'
    : 'Use one or two distinct original faces on the same box.';
  const invalid = box.walls.filter(({ key }) => !Object.hasOwn(values, key) || !Number.isFinite(values[key]));
  if (invalid.length) return `Give a finite thickness in mm for each kept wall: ${invalid.map(({ key }) => key).join(', ')}.`;
}
