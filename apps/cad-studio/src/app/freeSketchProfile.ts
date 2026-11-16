import type { SketchNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import { currentPocketSketch, resolveAssociativeSketch } from '@barocss/cad-model/engine/part';
import { profileRings } from '@barocss/cad-model/app/profiles';
import { isRefusal } from '@barocss/cad-model/engine/refusal';

type Profile = { rings: ReturnType<typeof profileRings>; outerCount: number; canPickRegion: boolean };
const resolved = new WeakMap<StudioDoc, Map<number, SketchNode | null>>();
const profiles = new WeakMap<StudioDoc, WeakMap<StudioDoc['parameters'], Map<number, Profile>>>();

/** Display and hit-testing share current canonical geometry; failed links never use saved coordinates. */
export function freeSketchProfile(doc: StudioDoc, index: number, parameters = doc.parameters): Profile {
  let byParameters = profiles.get(doc);
  if (!byParameters) profiles.set(doc, byParameters = new WeakMap());
  let byIndex = byParameters.get(parameters);
  if (!byIndex) byParameters.set(parameters, byIndex = new Map());
  const cached = byIndex.get(index);
  if (cached) return cached;
  const stored = doc.nodes[index];
  if (stored?.kind !== 'sketch' && stored?.kind !== 'driven-sketch') return { rings: [], outerCount: 1, canPickRegion: false };
  let node = stored;
  const linked = stored.kind === 'sketch' && (stored.association !== undefined || !!stored.pocketFloor);
  if (linked) {
    let sources = resolved.get(doc);
    if (!sources) resolved.set(doc, sources = new Map());
    if (!sources.has(index)) {
      try { sources.set(index, stored.association !== undefined ? resolveAssociativeSketch(doc, index) : currentPocketSketch(doc, index)); }
      catch { sources.set(index, null); }
    }
    const source = sources.get(index);
    if (!source) { const empty = { rings: [], outerCount: 1, canPickRegion: false }; byIndex.set(index, empty); return empty; }
    node = source;
  }
  let rings: Profile['rings'];
  try { rings = profileRings(node, parameters); }
  catch (error) {
    if (!linked && !isRefusal(error, 'PARAMETER_UNKNOWN') && !(node.kind === 'sketch' && node.profile === 'band' && isRefusal(error, 'VALUE'))) throw error;
    rings = [];
  }
  const sketch = node as SketchNode;
  const outerCount = (sketch.regions?.length ?? 0) + 1;
  const result = { rings, outerCount, canPickRegion: outerCount > 1 && !!sketch.sideTags?.regions && !sketch.holes?.length };
  byIndex.set(index, result);
  return result;
}
