import { refusal } from './refusal';

/** Matches the writer's exact-solid versus faceted/AP242 paths; not strict topology validation. */
export function requireStepGeometry(brep: { readonly bodies: readonly { readonly kind: string }[]; readonly faces: readonly { readonly surface: { readonly kind: string } }[] }, label: string, scale = false): void {
  if (!brep.bodies.length || !brep.faces.length)
    throw refusal('NO_BODY', `${label} has no native body or faces for STEP. The whole STEP export was stopped; no output was silently omitted. ${scale ? 'Open History → Scale and increase Factor, then evaluate and export again.' : 'Repair or remove this empty output, then evaluate and export again.'}`);
  // Any facet face takes the writer's facet-only or mixed-face AP242 route. Exact sheets have no
  // supported representation in solidsOf, even when the same output also contains a closed solid.
  if (brep.bodies.some(b => b.kind === 'sheet') && !brep.faces.some(f => f.surface.kind === 'facets'))
    throw refusal('NO_BODY', `${label} contains an exact surface that STEP export does not support. The whole STEP export was stopped; no surface was silently omitted. Close or remove this surface, or export it in a supported mesh format.`);
}
