import type { Brep } from '../brep/brep-core.js';
import { offsetExactSemicylinderOuterAfterPairedEditsIfAdmitted } from '../features/exact-cylinder-cap-offset.js';
import { certifyExactCylinderBore, preservesExactCylinderBoreOnOffset } from '../features/heal-exact-cylinder-bore.js';
import type { Surface } from '../types.js';
import type { Tools } from './part-model.js';
import type { Result } from './part-types.js';

function singleBrep(result: Result): Brep | undefined {
  if (result.kind !== 'solid' || result.parts.length !== 1) return;
  const { solid } = result.parts[0];
  if (solid.kind === 'brep') return solid.brep;
}

/** Bind the direct authored operands before the feature cache captures its inputs. */
export function exactCylinderBorePlan(t: Tools, target: string, invalidSketch: string) {
  const { author: difference } = t.ref(target, 'target');
  if (difference?.kind !== 'difference') return;
  const { author: last, result: stockResult } = t.ref(difference.target, 'difference stock');
  if (last?.kind !== 'offset-face' && last?.kind !== 'replace-face') return;
  const { author: first, result: firstResult } = t.ref(last.target, 'first stock edit');
  const offset = last.kind === 'offset-face' ? last : first?.kind === 'offset-face' ? first : undefined;
  const replace = last.kind === 'replace-face' ? last : first?.kind === 'replace-face' ? first : undefined;
  if (!first || !offset || !replace || (first.kind !== 'offset-face' && first.kind !== 'replace-face')) return;
  const { author: source, result: originResult } = t.ref(first.target, 'original stock');
  if (source?.kind !== 'thicken' || source.mode !== 'exact-cylinder') return;
  const stock = singleBrep(stockResult), original = singleBrep(originResult), firstStock = singleBrep(firstResult);
  if (!stock || stock.source.id !== source.id || !original || !firstStock) return;
  const { author: extrude, result: toolResult } = t.ref(difference.tool, 'difference tool');
  if (extrude?.kind !== 'extrude' || extrude.draft) return;
  const tool = singleBrep(toolResult);
  if (!tool) return;
  const { author: circle } = t.ref(extrude.sketch, 'tool sketch');
  // A sketch loop can share the same cached geometry as a circle. Check its authored profile before reuse.
  if (circle?.kind !== 'sketch' || circle.profile !== 'circle' || !circle.plane || circle.holes !== undefined || circle.regions !== undefined)
    return t.fail('CAPABILITY', invalidSketch);
  return { stock, tool, original, firstStock, source, offset, replace, wallFirst: first.kind === 'offset-face', difference: difference.id };
}

export const exactBoreOffsetRefusal = 'Offset face needs the original outer wall of a complete central radial bore after the signed outer Offset and linked upper Replace.';

type BoreOffsetPlan = NonNullable<ReturnType<typeof exactCylinderBorePlan>> & { thickness: number };

export function offsetBoredExactCylinder(t: Tools, brep: Brep, face: string, distance: number, plan: BoreOffsetPlan,
  recut: (stock: Brep, tool: Brep, id: string) => Brep): Brep {
  if (brep.faces.filter(candidate => candidate.name === face).length !== 1)
    return t.fail('REFERENCE', 'Offset face: the selected native face is missing or ambiguous.');
  const { offset, replace, stock, tool, original, firstStock, source, wallFirst, difference } = plan;
  if (face !== offset.face || brep.source.family !== 'analytic-boolean' || brep.source.id !== difference)
    return t.fail('CAPABILITY', exactBoreOffsetRefusal);
  const before = certifyExactCylinderBore(brep, stock, tool, face, replace.face);
  if (!before) return t.fail('CAPABILITY', exactBoreOffsetRefusal);
  const authored = { id: source.id, surface: { ...structuredClone(source.surface), kind: 'surface', id: 'surface' } as Surface,
    thickness: plan.thickness, side: source.side };
  const moved = offsetExactSemicylinderOuterAfterPairedEditsIfAdmitted(stock, firstStock, original, authored,
    { face, distance: offset.distance }, { face: replace.face, plane: replace.plane }, wallFirst, distance);
  if (!moved) return t.fail('CAPABILITY', exactBoreOffsetRefusal);
  // The feature has a new author ID. The native Difference ID keeps its persistent face and edge identities.
  const result = recut(moved, tool, difference);
  const after = certifyExactCylinderBore(result, moved, tool, face, replace.face);
  if (!after || !preservesExactCylinderBoreOnOffset(brep, result, before, after, face, distance))
    return t.fail('GEOMETRY', 'Offset face: this distance does not preserve both openings of the original radial bore.');
  return result;
}
