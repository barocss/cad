import type { Brep } from '../brep/brep-core.js';
import { healBoredPlateIfAdmitted, healCylindricalBossIfAdmitted } from '../features/bored-cap-offset.js';
import { healAnalyticLFilletIfAdmitted } from '../features/heal-analytic-l-fillet.js';
import { healConvexLPrismaticFilletIfAdmitted, healConvexPrismaticFilletIfAdmitted,
  healHorizontalPrismaticFilletIfAdmitted, healPrismaticFilletIfAdmitted } from '../features/heal-prismatic-fillet.js';
import { healAdjacentPrismaticChamferIfAdmitted, healHorizontalChamferIfAdmitted, healOppositePrismaticChamferIfAdmitted,
  healPrismaticChamferIfAdmitted } from '../features/heal-prismatic-chamfer.js';
import type { Tools } from './part-model.js';
import type { CadPartFeature, Part, Result, Solid } from './part-types.js';

interface DeleteFaceHelpers {
  namedFaceTargetBrep(tools: Tools, target: unknown, part: Part): Brep;
  one(solid: Solid): Result;
}

/** Find the original sharp edge of the numbered bevel left by the first certified Delete face. */
function remainingPairedChamferEdge(t: Tools, target: string, brep: Brep, face: string): string | undefined {
  if (brep.source.family !== 'prismatic-solid' || brep.faces.length !== 7) return undefined;
  const numbered = [`${brep.source.id}.face#1`, `${brep.source.id}.face#2`];
  if (!numbered.includes(face)) return undefined;
  const { author: firstDelete } = t.ref(target, 'target');
  if (firstDelete?.kind !== 'delete-face' || !numbered.includes(firstDelete.face) || firstDelete.face === face) return undefined;
  const { author: chamfer, result } = t.ref(firstDelete.target, 'first Delete face target');
  if (chamfer?.kind !== 'chamfer' || chamfer.id !== brep.source.id || chamfer.edges.length !== 2
    || result.kind !== 'solid' || result.parts.length !== 1 || result.parts[0].solid.kind !== 'upright') return undefined;
  const targets = result.parts[0].chamferTargets;
  if (targets?.length !== 2 || new Set(targets).size !== 2 || !targets.every(edge => chamfer.edges.includes(edge))) return undefined;
  const restored = brep.edges.filter(edge => edge.name && targets.includes(edge.name));
  if (restored.length !== 1 || brep.faces.some(candidate => candidate.name === firstDelete.face)) return undefined;
  return targets.find(edge => edge !== restored[0].name);
}

/** Plan the repair before evaluation so the feature cache records the same dependencies as the original operation. */
export function deleteFaceOperation(f: Extract<CadPartFeature, { kind: 'delete-face' }>, t: Tools, helpers: DeleteFaceHelpers): () => Result {
  const { solids, fail, at } = t;
  const { namedFaceTargetBrep, one } = helpers;
  const target = solids(f.target, 'target'), face = f.face;
  if (target.length !== 1) return fail('REFERENCE', 'Delete face needs one closed solid.');
  if (typeof face !== 'string' || !face.trim() || face.includes('+'))
    return fail('INPUT', 'Delete face needs one exact native face name.');
  const [part] = target;
  const remainingEdge = part.solid.kind === 'brep' ? remainingPairedChamferEdge(t, f.target, part.solid.brep, face) : undefined;
  return () => {
    const brep = namedFaceTargetBrep(t, f.target, part);
    if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid')
      return fail('REFERENCE', 'Delete face needs one closed solid.');
    if (brep.faces.filter(candidate => candidate.name === face).length !== 1)
      return fail('REFERENCE', 'Delete face: the selected native face is missing or ambiguous.');
    let healed = healBoredPlateIfAdmitted(brep, face) ?? healCylindricalBossIfAdmitted(brep, face);
    if (!healed && part.filletTargets?.length === 1) {
      if (part.solid.kind === 'upright') {
        healed = healPrismaticFilletIfAdmitted(part.solid.solid, brep, face, at);
        if (!healed && (brep.faces.length === 7 || brep.faces.length === 9)) {
          const { author } = t.ref(f.target, 'target'), [sharpEdge] = part.filletTargets;
          if (author?.kind === 'fillet' && !author.radii && (!author.section || author.section.kind === 'circular')
            && author.edges.length === 1 && author.edges[0] === sharpEdge && face === `${author.id}.face`)
            healed = brep.faces.length === 7 ? healConvexPrismaticFilletIfAdmitted(brep, face, sharpEdge)
              : healConvexLPrismaticFilletIfAdmitted(part.solid.solid, brep, face, at);
        }
      } else if (part.history?.finishes.length === 1) {
        const [finish] = part.history.finishes, [sharpEdge] = part.filletTargets;
        if (finish.kind === 'fillet' && !finish.radii && finish.edges.length === 1 && finish.edges[0] === sharpEdge && face === `${finish.id}.face`) {
          healed = healAnalyticLFilletIfAdmitted(brep, face, sharpEdge, at);
          if (!healed && brep.faces.length === 7) {
            const { author } = t.ref(f.target, 'target');
            if (author?.kind === 'fillet' && author.id === finish.id && author.id === brep.source.id && !author.radii
              && (!author.section || author.section.kind === 'circular') && author.edges.length === 1 && author.edges[0] === sharpEdge)
              healed = healHorizontalPrismaticFilletIfAdmitted(brep, face, sharpEdge);
          }
        }
      }
    }
    if (!healed && part.chamferTargets?.length === 1) {
      const { author } = t.ref(f.target, 'target');
      if (author?.kind === 'chamfer' && author.edges.length === 1 && face === `${author.id}.face`) {
        const [sharpEdge] = part.chamferTargets;
        if (part.solid.kind === 'upright') healed = healPrismaticChamferIfAdmitted(brep, face, sharpEdge);
        else if (part.history?.finishes.length === 1) {
          const [finish] = part.history.finishes;
          if (finish.kind === 'chamfer' && finish.id === author.id && finish.edges.length === 1 && finish.edges[0] === sharpEdge)
            healed = healHorizontalChamferIfAdmitted(brep, face, sharpEdge);
        }
      }
    }
    if (!healed && part.solid.kind === 'upright' && part.chamferTargets?.length === 2) {
      const { author } = t.ref(f.target, 'target');
      if (author?.kind === 'chamfer' && author.edges.length === 2 && part.chamferTargets.every(edge => author.edges.includes(edge))
        && (face === `${author.id}.face#1` || face === `${author.id}.face#2`))
        healed = healOppositePrismaticChamferIfAdmitted(brep, face, part.chamferTargets)
          ?? healAdjacentPrismaticChamferIfAdmitted(brep, face, part.chamferTargets);
    }
    if (!healed && remainingEdge) healed = healPrismaticChamferIfAdmitted(brep, face, remainingEdge);
    if (!healed) return fail('CAPABILITY', 'Delete face supports one or two straight through bores in a rectangular plate with flat caps or one tilted cap. Select its cylindrical wall. It also supports one full-height concave circular fillet on an L prism or a two-plate L bracket, one full-height convex circular fillet on an upright L prism, or one full-height vertical or full-span horizontal convex circular fillet on a straight rectangular box. Select its fillet face. To remove a fully enclosed cylindrical boss from straight rectangular stock, select the top face of the boss. To heal a full-height vertical or full-span horizontal chamfer on a straight rectangular box, select the chamfer face. For one of two full-height chamfers on a straight rectangular box, select its exact numbered face.');
    return one({ kind: 'brep', brep: healed });
  };
}
