import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { modelPrint } from '@barocss/cad-model/drawing/types';
import { beadsOf } from '@barocss/cad-model/engine/part';
import { sectionUses } from '@barocss/cad-model/frames/sections';
import { canonical } from '@barocss/cad-model/util/revision';

const ignoredDocumentFields = ['drawing', 'render', 'history', 'proposals', 'baselines', 'ecrs', 'questions', 'pendingParts', 'assemblySteps', 'underlays', 'nextId'] as const;

// Match evaluatedPart's direct-source condition without evaluating or changing the document.
function readsDirect(doc: StudioDoc): boolean {
  if (doc.schema === 4 || Object.prototype.hasOwnProperty.call(doc, 'routeBundles')) return true;
  for (const node of doc.nodes) if (node.kind === 'curve-feature-pattern' && 'objectId' in node.path) return true;
  return false;
}

function assemblySource(doc: StudioDoc): Record<string, unknown> {
  const source: Record<string, unknown> = { ...doc };
  for (const field of ignoredDocumentFields) delete source[field];
  if (!readsDirect(doc)) delete source.direct;
  if (doc.instances !== undefined) {
    const instances: Record<string, unknown>[] = [];
    for (const instance of doc.instances) instances.push({ ...instance, doc: assemblySource(instance.doc) });
    source.instances = instances;
  }
  return source;
}

/** Keep legacy node-only stamps for ordinary parameter-free parts; include authored parameter values otherwise.
 * Ordinary parts retain their existing JSON key-order policy. Assemblies include conservative semantic source
 * recursively, without paper or workflow records. This issue marker is not a geometry or integrity certificate.
 */
export function drawingRevisionPrint(doc: StudioDoc): string {
  if (doc.instances !== undefined) return modelPrint(canonical(assemblySource(doc)));
  const source = Object.keys(doc.parameters).length ? { nodes: doc.nodes, parameters: doc.parameters } : doc.nodes;
  // A Library section lives outside nodes. Include only referenced row geometry, not
  // catalogue labels or unused rows. Old node-only issues cannot certify these inputs;
  // keep their saved stamp unchanged until the user explicitly issues the drawing again.
  const ids = [...sectionUses({ ...doc, nodes: doc.nodes.filter(n => !n.suppressed) }).keys()].sort();
  const sections = ids.map(id => [id, doc.frames?.sections?.find(row => row.id === id)?.section ?? null]);
  const stamp = ids.length ? modelPrint({ source, sections: canonical(sections) }) : modelPrint(source);
  if (!doc.frames?.welds?.length) return stamp;
  const gone = new Set(doc.nodes.flatMap((n, i) => n.suppressed ? [i] : []));
  // Requested bead geometry, independent of kernel refusal caches. Symbol annotations
  // do not change model identity; old bead-backed issues require explicit reissue.
  const beads = beadsOf(doc, gone).map(b => b.feature);
  if (!beads.length) return stamp;
  const ownership = beads.some(b => 'member' in b.on) ? doc.frames.beadOwnership : undefined;
  return modelPrint({ source: stamp, beads: canonical(beads), ...(ownership ? { ownership: canonical(ownership) } : {}) });
}
