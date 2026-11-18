import { prepareCircularPatternHolePivot } from './circularPatternHolePivot';
import { CadNumericPolicy } from '@barocss/cad';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { featureLabel, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { linearSpanPatternInput } from '@barocss/cad-model/engine/linearSpanPattern';
import { featureId } from '@barocss/cad-model/engine/ids';
import { isDefaultPlane } from '@barocss/cad-model/sketch/plane';

type Result = { nodes: ModelNode[] } | { error: FriendlyError };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const numericPair = (value: readonly [unknown, unknown]): value is readonly [number, number] =>
  finite(value[0]) && finite(value[1]);

const only = (value: object, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const same = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(key => Object.hasOwn(b, key)
    && same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
};
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]);

/** Span edits move the existing last-copy bore; Count-only retargeting stays separate. */
function prepareSpanHoleEdit(doc: StudioDoc, draft: ModelNode[], index: number): Result {
  const active = (nodes: ModelNode[]) => nodes.some(n => n.kind === "hole" && !n.held && !n.suppressed
    && n.parent.node === index);
  if (!active(doc.nodes) && !active(draft)) return { nodes: draft };
  const refuse = (): Result => ({ error: { title: "Pattern span not changed",
    hint: "This numbered Hole cannot safely follow Total span. Keep the current span or edit the Hole and pattern separately.", detail: "" } });
  const [sk, ex, old, hole] = doc.nodes, next = draft[index];
  if (index !== 2 || doc.nodes.length !== 4 || draft.length !== 4
    || Object.entries(doc).some(([k,v]) => v !== undefined && !["format","schema","units","nextId","parameters","nodes","outputs"].includes(k))
    || doc.schema !== 3 || doc.units !== "mm" || doc.format !== "barocss-cad-model"
    || !same(doc.outputs, { [Object.keys(doc.outputs)[0]]: { node: 3, side: "solid" } })
    || sk.kind !== "sketch" || sk.profile !== "rectangle" || !only(sk,["id","kind","profile","min","max"])
    || !pair(sk.min) || !pair(sk.max)
    || ex.kind !== "extrude" || !only(ex,["id","kind","sketch","height","from","draft"])
    || ex.sketch !== 0 || !finite(ex.height) || ex.height <= 0 || (ex.from !== undefined && !finite(ex.from)) || (ex.draft ?? 0) !== 0
    || old.kind !== "linear-span-pattern" || next?.kind !== "linear-span-pattern"
    || !only(old,["id","kind","parent","axis","span","count"])
    || !same(old.parent,{node:1,side:"solid"}) || (old.axis !== "x" && old.axis !== "y")
    || !Number.isInteger(old.count) || old.count < 2 || old.count > 64 || !finite(old.span) || !finite(next.span) || old.span <= 0 || next.span <= 0
    || !same({...old,span:next.span},next)
    || hole.kind !== "hole" || !only(hole,["id","kind","parent","center","radius","face","axis","side"])
    || !same(hole.parent,{node:2,side:"solid"}) || !pair(hole.center) || !finite(hole.radius) || hole.radius <= 0
    || (hole.axis !== undefined && hole.axis !== "z") || (hole.side !== undefined && hole.side !== "max")
    || hole.face !== `${featureId(doc.nodes,1)}.top@${old.count-1}`
    || doc.nodes.some((n,i) => i !== index && !same(n,draft[i]))) return refuse();
  const ids = doc.nodes.map(n => n.id);
  if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== 4) return refuse();
  const oldInput = linearSpanPatternInput(old,index), newInput = linearSpanPatternInput(next,index);
  if (!("spacing" in oldInput) || !("spacing" in newInput)) return refuse();
  const spacingNode = (node: typeof old, spacing: number): ModelNode => {
    return {id:node.id,kind:"linear-pattern",parent:node.parent,axis:node.axis,count:node.count,spacing};
  };
  const before = doc.nodes.map((n,i) => i === index ? spacingNode(old,oldInput.spacing) : n);
  const after = draft.map((n,i) => i === index ? spacingNode(next,newInput.spacing) : n);
  const proof = prepareLinearPatternHoleEdit({...doc,nodes:before},after,index);
  if ("error" in proof) return proof;
  const moved = proof.nodes[3];
  if (moved.kind !== "hole" || moved === hole) return refuse();
  return {nodes:draft.map((n,i) => i === 3 ? {...hole,center:moved.center} : n)};
}

/** Check numbered Hole dependencies and preserve a proven complete bore across the pattern edit. */
export function prepareLinearPatternHoleEdit(doc: StudioDoc, draft: ModelNode[], index: number): Result {
  const pattern = doc.nodes[index], next = draft[index];
  if (pattern?.kind === 'circular-pattern') return prepareCircularPatternHolePivot(doc,draft,index);
  if (pattern?.kind === "linear-span-pattern" && next?.kind === "linear-span-pattern" && !Object.is(pattern.span,next.span)) {
    return prepareSpanHoleEdit(doc,draft,index);
  }
  if ((pattern?.kind !== 'linear-pattern' && pattern?.kind !== 'linear-span-pattern')
    || (next?.kind !== 'linear-pattern' && next?.kind !== 'linear-span-pattern')) return { nodes: draft };
  const fixedSpan = pattern.kind === 'linear-span-pattern' && next.kind === 'linear-span-pattern';
  const fixedSpacing = pattern?.kind === 'linear-pattern' && next?.kind === 'linear-pattern';
  const modeChanged = pattern.kind !== next.kind;
  const spacingChanged = fixedSpacing && pattern.spacing !== next.spacing;
  const countChanged = pattern.count !== next.count;
  if (!spacingChanged && !countChanged) return { nodes: draft };
  const refused = (hint: string): Result => ({
    error: { title: fixedSpan ? 'Pattern count not changed' : 'Pattern spacing not changed', hint, detail: '' },
  });
  const dependents = doc.nodes.flatMap((node, at) => {
    if (node.kind !== 'hole' || node.suppressed || node.held || node.parent.node !== index || !node.face) return [];
    const match = /^(.*)@(\d+)(?:#\d+)?$/.exec(node.face);
    if (!match) return [];
    const copy = Number(match[2]);
    return Number.isSafeInteger(copy) && copy > 0 ? [{ hole: node, at, seed: match[1], copy }] : [];
  });
  if (!dependents.length) return { nodes: draft };
  if (modeChanged) {
    return { error: { title: 'Pattern count not changed',
      hint: 'Apply the distance mode change first. Then change Count so the dependent Hole keeps its reference.', detail: '' } };
  }
  if (fixedSpacing && Number.isSafeInteger(next.count) && next.count > 0 && next.count < pattern.count) {
    const retiring = dependents.filter(dependent => dependent.copy >= next.count);
    if (retiring.length) {
      const minimum = Math.max(...retiring.map(dependent => dependent.copy)) + 1;
      const impacted = retiring.map(({ hole, at, copy }) =>
        `Count ${next.count} removes copy ${copy + 1}, used by ${featureLabel(hole, at, doc.nodes)} (${featureId(doc.nodes, at)}) on ${hole.face}.`);
      return { error: {
        title: 'Pattern count not changed',
        hint: `${impacted.join(' ')} Keep at least ${minimum} copies, or suppress the affected Hole before changing Count.`,
        detail: '',
      } };
    }
  }
  if (fixedSpacing && !spacingChanged) return { nodes: draft };
  const [{ hole, at, seed, copy }] = dependents;
  const holeName = `${featureLabel(hole, at, doc.nodes)} (${featureId(doc.nodes, at)})`;
  if (fixedSpan && pattern.span !== next.span) {
    return refused(`Keep Total span unchanged while changing Count for ${holeName}.`);
  }
  if (fixedSpan && copy !== pattern.count - 1) {
    return refused(`Changing Count moves or removes copy ${copy + 1}, used by ${holeName} on ${hole.face}. Keep Count or suppress the Hole first.`);
  }
  const stock = doc.nodes[pattern.parent.node];
  const sketch = stock?.kind === 'extrude' ? doc.nodes[stock.sketch] : undefined;
  if (dependents.length !== 1 || hole !== doc.nodes.at(-1) || hole.made
    || hole.pattern || hole.depth !== undefined || hole.countersink !== undefined || hole.csk !== undefined || hole.thread !== undefined
    || (hole.axis ?? 'z') !== 'z' || hole.side === 'min' || hole.parent.side !== 'solid'
    || pattern.suppressed || pattern.held || pattern.parent.side !== 'solid' || pattern.axis === 'z'
    || next.axis !== pattern.axis || (fixedSpacing && countChanged) || next.parent !== pattern.parent
    || stock?.kind !== 'extrude' || stock.suppressed || stock.held || (stock.draft ?? 0) !== 0
    || !finite(stock.height) || stock.height <= 0
    || sketch?.kind !== 'sketch' || sketch.suppressed || sketch.held || sketch.profile !== 'rectangle'
    || sketch.on || sketch.association || sketch.outline || sketch.regions?.length || sketch.holes?.length
    || (sketch.plane && !isDefaultPlane(sketch.plane))) {
    return refused(`${holeName} cannot follow this pattern edit. Keep the current pattern or edit the Hole and pattern separately.`);
  }

  const axis = pattern.axis === 'x' ? 0 : 1;
  const pitchOf = (node: typeof pattern) => {
    if (node.kind === 'linear-pattern') return node.spacing;
    const input = linearSpanPatternInput(node, index);
    return 'spacing' in input ? input.spacing : undefined;
  };
  const layouts = [
    { pitch: pitchOf(pattern), count: pattern.count, copy },
    { pitch: pitchOf(next), count: next.count, copy: fixedSpan ? next.count - 1 : copy },
  ];
  const [before, after] = layouts;
  const oldPitch = before.pitch, newPitch = after.pitch;
  const { min, max } = sketch;
  const centre = hole.center, radius = hole.radius;
  if (seed !== featureId(doc.nodes, pattern.parent.node) + '.top' || hole.face !== `${seed}@${copy}`
    || copy >= pattern.count
    || !numericPair(min) || !numericPair(max) || !numericPair(centre) || !finite(radius) || radius <= 0
    || !finite(oldPitch) || !finite(newPitch)) {
    return refused('The Hole needs a unique numbered top face and numeric dimensions to follow this edit.');
  }
  if (max[0] <= min[0] || max[1] <= min[1]) return refused('The stock rectangle needs positive dimensions.');
  const { linearTolerance, coordinateAbs } = CadNumericPolicy;
  // Keep the kernel's separation margin above rounding of translated corners and the cutter rim.
  const clearance = 4 * linearTolerance;
  const inRange = (value: number) => Math.abs(value) <= coordinateAbs;
  const offsets = [(before.count - 1) * oldPitch, (after.count - 1) * newPitch];
  if (!offsets.every(offset => [min[axis] + offset, max[axis] + offset].every(inRange))
    || ![...min, ...max].every(inRange)) {
    return refused('Keep all pattern copies within the modelling coordinate range.');
  }
  if ([oldPitch, newPitch].some(pitch => Math.abs(pitch) - (max[axis] - min[axis]) <= clearance)) {
    return refused('Keep a gap between pattern copies so the Hole stays on the selected copy.');
  }
  const containsBore = (point: readonly number[], displacement: number) => point.every((value, k) => {
    const offset = k === axis ? displacement : 0;
    return value - (min[k] + offset) > radius + clearance && (max[k] + offset) - value > radius + clearance;
  });
  if (!containsBore(centre, before.copy * oldPitch)) {
    return refused('The existing Hole crosses or touches the selected copy boundary. Move its centre inside that copy before editing spacing.');
  }
  if (fixedSpan) {
    if (!containsBore(centre, after.copy * newPitch)) {
      return refused('The end copy no longer contains the complete Hole. Keep Count or move the Hole inside the copy.');
    }
    return { nodes: draft.map((node, i) => i === at ? { ...hole, face: `${seed}@${after.copy}` } : node) };
  }
  const moved: [number, number] = [centre[0], centre[1]];
  moved[axis] = centre[axis] - before.copy * oldPitch + after.copy * newPitch;
  if (!containsBore(moved, after.copy * newPitch)) {
    return refused('The moved Hole crosses or touches the selected copy boundary. Choose a spacing that preserves the bore.');
  }
  return { nodes: draft.map((node, i) => i === at ? { ...hole, center: moved } : node) };
}
