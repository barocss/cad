import { CadNumericPolicy } from '@barocss/cad';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
type Polygon = Extract<SketchShape, {kind:'polygon'}>;
const point = (p:unknown):p is [number,number] => Array.isArray(p) && p.length === 2 && [p[0],p[1]].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= CadNumericPolicy.coordinateAbs);
const emptyRecord = (v:unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;
/** History admission only: the existing panel remains responsible for radius geometry. */
function completedLineArc(shape:SketchShape|null):shape is Polygon {
 if (!shape || shape.kind !== 'polygon' || shape.closed !== false || (shape.pending !== undefined && shape.pending !== false)
  || !Array.isArray(shape.points) || (shape.points.length < 3 || shape.points.length > 5) || Array.from(shape.points).some(p => !point(p))) return false;
 const allowed = ['kind','points','closed','pending','ids','construction','bulges','lengths','radii','rules','tangents','equalRadii','concentric','circles','circleIds','hv'];
 if (Object.entries(shape).some(([k,v]) => v !== undefined && !allowed.includes(k))) return false;
 if (shape.construction !== undefined && shape.construction !== true) return false;
 if (shape.ids !== undefined && (!Array.isArray(shape.ids) || Array.from(shape.ids).some(id => typeof id !== 'string' || !id) || new Set(shape.ids).size !== shape.ids.length)) return false;
 const count = shape.points.length, b = shape.bulges;
 // One arc in the second slot of a three-point chain or any real slot of a four-point chain,
 // or exactly Line+Arc+Line+Arc with five points.
 // Array.from visits sparse entries: missing bulges are not authored zeros.
 if (!Array.isArray(b) || b.length !== count || Array.from(b).some(v => typeof v !== 'number' || !Number.isFinite(v))) return false;
 const arcSlots = b.flatMap((v, i) => v !== 0 ? [i] : []);
 if (count === 5 ? arcSlots.length !== 2 || arcSlots[0] !== 1 || arcSlots[1] !== 3
   : arcSlots.length !== 1 || (count === 3 ? arcSlots[0] !== 1 : arcSlots[0] >= count - 1)) return false;
 for (const k of ['lengths','radii'] as const) if (shape[k] !== undefined && !emptyRecord(shape[k])) return false;
 for (const k of ['rules','tangents','equalRadii','concentric','circles','circleIds'] as const) if (shape[k] !== undefined && (!Array.isArray(shape[k]) || shape[k]!.length !== 0)) return false;
 if (shape.hv !== undefined && (!shape.hv || Object.keys(shape.hv).some(k => k !== 'h' && k !== 'v') || !Array.isArray(shape.hv.h) || !Array.isArray(shape.hv.v) || shape.hv.h.length || shape.hv.v.length)) return false;
 for (let i=1;i<count;i++) if (Math.hypot(shape.points[i][0]-shape.points[i-1][0],shape.points[i][1]-shape.points[i-1][1]) <= CadNumericPolicy.linearTolerance) return false;
 return Math.hypot(shape.points[count-1][0]-shape.points[0][0],shape.points[count-1][1]-shape.points[0][1]) > 1e-4;
}
export function canRecordOpenArcRadiusDraft(sketch:SketchState|null):boolean {
 return !!sketch && completedLineArc(sketch.shape) && (sketch.done?.length ?? 0) === 0 && sketch.editNode === undefined
  && !sketch.association && !sketch.band && !sketch.anchor?.face?.linkSource;
}
/** Exact authored owner/metadata preservation; no geometric history matching. */
export function isOpenArcRadiusChange(before:SketchShape|null, after:SketchShape|null):boolean {
 if (!completedLineArc(before) || !completedLineArc(after)) return false;
 if (before.points.length !== after.points.length) return false;
 let changed = false;
 for (let i=0;i<before.points.length;i++) {
  const a=before.bulges![i], b=after.bulges![i];
  if (Object.is(a,b)) continue;
  if (changed || a === 0 || b === 0 || Math.sign(a) !== Math.sign(b)) return false;
  // Both branches meet at the exact half-chord radius. The panel can shrink a
  // major arc to that semicircle without flipping its direction or endpoints.
  if ((Math.abs(a)>1) !== (Math.abs(b)>1) && Math.abs(b) !== 1) return false;
  changed = true;
 }
 if (!changed) return false;
 const keys = new Set([...Object.keys(before),...Object.keys(after)]);
 for (const key of keys) if (key !== 'bulges' && !Object.is(Reflect.get(before,key),Reflect.get(after,key))) return false;
 return true;
}
