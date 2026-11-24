import { usesOf, type ModelNode, type SketchNode } from '../engine/doc';
import { featureId } from '../engine/ids';
import { refusal } from '../engine/refusal';
import type { EditField } from './editFields';
import { copyLoftSection, planeOf } from './profiles';
import { xyPlane, yAxisOf } from '../sketch/plane';
import { resolveSketchDims } from '../sketch/reopen';

type Loft = Extract<ModelNode, { kind: 'loft' }>;
type Nodes = readonly ModelNode[];

function plainRectangle(node: SketchNode): node is Extract<SketchNode, { profile: 'rectangle' }> {
  return node.profile === 'rectangle' && !node.on && !node.outline && !node.sideTags
    && !node.regions?.length && !node.holes?.length && !node.construction?.length;
}

function matchesFrame(node: SketchNode, frame: NonNullable<Loft['sections'][number]['frame']>): boolean {
  const plane = planeOf(node), y = yAxisOf(plane);
  return plane.origin.every((value, axis) => value === frame.origin[axis]
    && plane.xAxis[axis] === frame.xAxis[axis] && y[axis] === frame.yAxis[axis]);
}

function sectionOption(nodes: Nodes, loft: Loft, slot: number, source: number, parameters: Record<string, number>) {
  const section = loft.sections[slot], previous = nodes[section.sketch], sketch = nodes[source];
  if (previous?.kind !== 'sketch' || sketch?.kind !== 'sketch' || sketch.suppressed
    || sketch.profile === 'band' || sketch.association || sketch.pocketFloor) return;
  try {
    if (section.frame) {
      if (!plainRectangle(previous) || !plainRectangle(sketch)
        || !matchesFrame(previous, section.frame) || !matchesFrame(sketch, section.frame)) return;
      const resolved = resolveSketchDims(sketch, parameters);
      if (resolved.profile !== 'rectangle' || ![...resolved.min, ...resolved.max].every(Number.isFinite)
        || resolved.min.some((value, axis) => Number(value) >= Number(resolved.max[axis]))) return;
      return { ...previous, min: resolved.min, max: resolved.max };
    }
    if (typeof section.z !== 'number' || !Number.isFinite(section.z) || previous.profile !== 'loop') return;
    const exact = !!loft.guides;
    if (exact) {
      const normal = xyPlane().normal;
      if (!planeOf(sketch).normal.every((value, axis) => value === normal[axis])) return;
    }
    const result = copyLoftSection(sketch, source, planeOf(previous), parameters, exact);
    if ('segments' in result && result.z === section.z) return { ...previous, segments: result.segments };
  } catch { return; }
}

/** Change only a uniquely owned plain section copy at its existing plane and History station. */
export function loftSectionSourceFields(nodes: Nodes, index: number, loft: Loft, parameters: Record<string, number>): EditField[] {
  const sources = loft.from;
  const guidedMiddle = !!loft.guides && loft.sections.length === 3;
  const framed = loft.sections.some(section => section.frame !== undefined);
  if (!sources || sources.length !== loft.sections.length || loft.suppressed || (loft.guides && !guidedMiddle)
    || (framed && (!guidedMiddle || loft.sections.some(section => !section.frame || section.z !== undefined)))) return [];
  const copies = new Set(loft.sections.map(section => section.sketch));
  if (copies.size !== sources.length || sources.some(source => copies.has(source))) return [];
  return loft.sections.flatMap((section, slot): EditField[] => {
    if (guidedMiddle && slot !== 1) return [];
    const source = sources[slot], copy = nodes[section.sketch];
    const uniqueId = (candidate: number) => nodes.filter((_, i) => featureId(nodes, i) === featureId(nodes, candidate)).length === 1;
    if (copy?.kind !== 'sketch' || (framed ? !plainRectangle(copy) : copy.profile !== 'loop') || copy.sideTags || copy.outline || copy.association || copy.pocketFloor
      || copy.regions?.length || copy.holes?.length || copy.construction?.length || copy.suppressed
      || source >= section.sketch || nodes[source]?.kind !== 'sketch' || section.sketch >= index
      || !uniqueId(source) || !uniqueId(section.sketch)
      || nodes.some((node, i) => i !== index && usesOf(node, nodes).includes(section.sketch))) return [];
    const options = nodes.flatMap((_, candidate) => {
      if (candidate >= section.sketch || !uniqueId(candidate) || copies.has(candidate) || sources.includes(candidate)
        || !sectionOption(nodes, loft, slot, candidate, parameters)) return [];
      return [{ value: featureId(nodes, candidate), label: `Copy Sketch ${candidate + 1}` }];
    });
    return [{
      kind: 'choice', key: `loftSource${slot}`, label: `Section ${slot + 1} source`,
      options: [{ value: featureId(nodes, source), label: `Sketch ${source + 1}` }, ...options],
      get: current => {
        const node = current[index];
        return node?.kind === 'loft' && node.from ? featureId(current, node.from[slot]) : '';
      },
      set: (current, value) => {
        const node = current[index];
        const candidate = current.findIndex((_, i) => featureId(current, i) === value);
        if (node?.kind !== 'loft' || !node.from || node.sections[slot]?.sketch !== section.sketch
          || node.from[slot] === candidate || !options.some(option => option.value === value)) return [...current];
        const replacement = sectionOption(current, node, slot, candidate, parameters);
        if (!replacement) throw refusal('BAD_REFERENCE', 'Choose a closed profile on the existing section plane.');
        const from = node.from.map((source, i) => i === slot ? candidate : source);
        return current.map((item, i) => i === index ? { ...node, from } : i === section.sketch ? replacement : item);
      },
    }];
  });
}
