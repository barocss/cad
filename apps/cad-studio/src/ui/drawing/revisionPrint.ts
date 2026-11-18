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
  let stamp = ids.length ? modelPrint({ source, sections: canonical(sections) }) : modelPrint(source);
  // Bearing envelopes read their catalogue row outside nodes as well. Mirror the
  // evaluator's last-row lookup, and its absent corner-radius default. Abutment
  // limits, fit deviations and citations are reports, not envelope geometry.
  const bearingIds = [...new Set(doc.nodes.flatMap(n => n.kind === 'bearing' && !n.suppressed ? [n.row] : []))].sort();
  if (bearingIds.length) {
    const rows = new Map((doc.bearings?.rows ?? []).map(row => [row.id, row]));
    const bearings = bearingIds.map(id => {
      const row = rows.get(id);
      return [id, row ? { bore: row.bore, outside: row.outside, width: row.width, chamfer: row.chamfer ?? 0 } : null];
    });
    stamp = modelPrint({ source: stamp, bearings: canonical(bearings) });
  }
  // A gland's authored groove dimensions do not change with its catalogue row.
  // Only a present, active ring consumes that row for its stretched torus geometry.
  const ringIds = [...new Set(doc.nodes.flatMap((n, i) => {
    if (n.kind !== 'oring' || n.suppressed || !Number.isInteger(n.gland) || n.gland < 0 || n.gland >= i) return [];
    const gland = doc.nodes[n.gland];
    return gland?.kind === 'oring-gland' && !gland.suppressed ? [gland.ring] : [];
  }))].sort();
  if (ringIds.length) {
    const rows = new Map((doc.orings?.rows ?? []).map(row => [row.id, row]));
    const orings = ringIds.map(id => {
      const row = rows.get(id);
      return [id, row ? { insideDiameter: row.insideDiameter, crossSection: row.crossSection } : null];
    });
    stamp = modelPrint({ source: stamp, orings: canonical(orings) });
  }
  // The panel consumes the opening profile/depth. A bought envelope consumes body
  // dimensions only when an active body node names that opening; keep-out is a report.
  const connectorBodies = new Set(doc.nodes.flatMap((n, i) => n.kind === 'connector-body' && !n.suppressed
    && Number.isInteger(n.opening) && n.opening >= 0 && n.opening < i ? [n.opening] : []));
  const connectorUses = new Map<string, boolean>();
  doc.nodes.forEach((n, i) => {
    if (n.kind === 'connector-opening' && !n.suppressed)
      connectorUses.set(n.row, (connectorUses.get(n.row) ?? false) || connectorBodies.has(i));
  });
  if (connectorUses.size) {
    const rows = new Map((doc.connectors?.rows ?? []).map(row => [row.id, row]));
    const section = (s: { shape: string; width: number; height: number; cornerRadius?: number }) => ({
      shape: s.shape, width: s.width, height: s.height, ...(s.shape === 'rect' ? { cornerRadius: s.cornerRadius ?? 0 } : {}),
    });
    const connectors = [...connectorUses.keys()].sort().map(id => {
      const usesBody = connectorUses.get(id);
      const row = rows.get(id);
      return [id, row ? { opening: { ...section(row.opening), depth: row.opening.depth },
        ...(usesBody ? { body: row.body ? { ...section(row.body), length: row.body.length } : null } : {}) } : null];
    });
    stamp = modelPrint({ source: stamp, connectors: canonical(connectors) });
  }
  // Sprocket teeth consume chain pitch; roller diameter supplies the seat only
  // when the node leaves it implicit. With an explicit seat it is a clearance report.
  const sprocketUses = new Map<string, boolean>();
  for (const n of doc.nodes) if (n.kind === 'sprocket' && !n.suppressed)
    sprocketUses.set(n.row, (sprocketUses.get(n.row) ?? false) || !n.seat);
  if (sprocketUses.size) {
    const rows = new Map((doc.drives?.rows ?? []).map(row => [row.id, row]));
    const sprockets = [...sprocketUses.keys()].sort().map(id => {
      const row = rows.get(id);
      return [id, row?.kind === 'chain' ? { pitch: row.pitch,
        ...(sprocketUses.get(id) ? { rollerDiameter: row.rollerDiameter } : {}) } : null];
    });
    stamp = modelPrint({ source: stamp, sprockets: canonical(sprockets) });
  }
  // Timing pulley geometry consumes pitch, offset and groove, not belt thickness.
  // Keep ordinary legacy stamps unchanged; older timing issues need explicit reissue.
  const driveRows = new Map((doc.drives?.rows ?? []).map(row => [row.id, row]));
  const timingIds = [...new Set(doc.nodes.flatMap(n => n.kind === 'pulley' && !n.suppressed
    && driveRows.get(n.row)?.kind === 'timing-belt' ? [n.row] : []))].sort();
  if (timingIds.length) {
    const timingPulleys = timingIds.map(id => {
      const row = driveRows.get(id)!;
      return [id, row.kind === 'timing-belt' ? { pitch: row.pitch, pitchLineOffset: row.pitchLineOffset, groove: row.groove } : null];
    });
    stamp = modelPrint({ source: stamp, timingPulleys: canonical(timingPulleys) });
  }
  // V pulley sections consume spacing only when more than one groove is made.
  const vUses = new Map<string, boolean>();
  for (const n of doc.nodes) if (n.kind === 'pulley' && !n.suppressed && driveRows.get(n.row)?.kind === 'v-belt')
    vUses.set(n.row, (vUses.get(n.row) ?? false) || (n.grooves ?? 1) > 1);
  if (vUses.size) {
    const vPulleys = [...vUses.keys()].sort().map(id => {
      const row = driveRows.get(id)!;
      return [id, row.kind === 'v-belt' ? { angle: row.angle, datumWidth: row.datumWidth,
        aboveDatum: row.aboveDatum, belowDatum: row.belowDatum, edge: row.edge,
        ...(vUses.get(id) ? { spacing: row.spacing } : {}) } : null];
    });
    stamp = modelPrint({ source: stamp, vPulleys: canonical(vPulleys) });
  }
  if (!doc.frames?.welds?.length) return stamp;
  const gone = new Set(doc.nodes.flatMap((n, i) => n.suppressed ? [i] : []));
  // Requested bead geometry, independent of kernel refusal caches. Symbol annotations
  // do not change model identity; old bead-backed issues require explicit reissue.
  const beads = beadsOf(doc, gone).map(b => b.feature);
  if (!beads.length) return stamp;
  const ownership = beads.some(b => 'member' in b.on) ? doc.frames.beadOwnership : undefined;
  return modelPrint({ source: stamp, beads: canonical(beads), ...(ownership ? { ownership: canonical(ownership) } : {}) });
}
