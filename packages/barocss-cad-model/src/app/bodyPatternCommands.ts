import { duplicateBody } from '../chat/features';
import { circularPatternCountRange, circularPatternStep } from '../engine/circularPatternSpan';
import { withNode, type Axis } from '../engine/doc';
import { bossPatternSupport, joinedBossPattern } from '../engine/joinedBossPattern';
import { linearSpanPatternInput } from '../engine/linearSpanPattern';
import { refusal } from '../engine/refusal';
import { centreOf, oneBody, refOf } from './bodyRef';
import type { Command, Ctx, Field, HandleSpec, Values } from './commands';
import { linearSpanHandles } from './linearSpanHandles';

const available: Command['available'] = ctx => oneBody(ctx)
  ? { ok: true }
  : { ok: false, reason: 'Select one body to pattern.' };

/** A pattern's copies: joined into one body (the kernel's pattern), or each a body of its own. */
const RESULT = { key: 'result', label: 'Result', kind: 'choice', options: [{ value: 'one', label: 'One body' }, { value: 'separate', label: 'Separate bodies' }] } satisfies Field;
const LINEAR_PATTERN_COUNT = { min: 2, max: 24 };
const hasLinearSpan = (values: Values) => values.result !== 'separate' && values.result !== 'join-plate';
const usesLinearSpan = (values: Values) => hasLinearSpan(values) && values.distanceMode === 'span';
const LINEAR_AXES = [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }];
const JOIN_BOSS_PATTERN: Field = { ...RESULT, options: [...RESULT.options, { value: 'join-plate', label: 'Join to plate' }] };
function selectedBossPlate(ctx: Ctx) {
  const body = oneBody(ctx), plate = body && bossPatternSupport(ctx.doc, refOf(body));
  if (plate && ctx.bodies.some(body => { const ref = refOf(body); return ref.node === plate.node && ref.side === plate.side; })) return plate;
}

export const bodyPatternCommands: Command[] = [
  {
    id: 'linear-pattern', label: 'Linear pattern', icon: 'cad-pattern-linear', hint: 'Copies of a body in a row', shortcut: 'P', group: 'pattern', keywords: 'array repeat copy',
    available,
    fields: (ctx, v) => [{ key: 'axis', label: 'Direction', kind: 'choice', options: v?.result === 'join-plate' ? LINEAR_AXES.slice(0, 2) : LINEAR_AXES },
      { key: 'distanceMode', label: 'Distance mode', kind: 'choice', options: [{ value: 'spacing', label: 'Spacing' }, { value: 'span', label: 'Total span' }], when: hasLinearSpan },
      { key: 'spacing', label: 'Spacing', kind: 'mm', min: v && !hasLinearSpan(v) ? undefined : 1, when: values => !usesLinearSpan(values) },
      { key: 'span', label: 'Total span', kind: 'mm', when: usesLinearSpan },
      { key: 'count', label: 'Count', kind: 'count', ...LINEAR_PATTERN_COUNT }, selectedBossPlate(ctx) ? JOIN_BOSS_PATTERN : RESULT],
    defaults: ctx => { const b = oneBody(ctx); return { axis: 'x', distanceMode: 'spacing', spacing: b ? Math.round(b.mesh.bounds.max[0] - b.mesh.bounds.min[0] + 8) : 20, count: 3, result: 'one' }; },
    derive: (_ctx, v, changed) => {
      const intervals = Number(v.count) - 1;
      if (changed.includes('distanceMode') && usesLinearSpan(v) && !changed.includes('span')) {
        return { ...v, span: intervals > 0 ? Number(v.spacing) * intervals : '' };
      }
      if (changed.includes('result') && v.result === 'join-plate' && v.axis === 'z') v = { ...v, axis: 'x' };
      const leavingSpan = changed.includes('result') && !hasLinearSpan(v) && v.distanceMode === 'span';
      if (leavingSpan || (changed.includes('distanceMode') && v.distanceMode === 'spacing' && v.span !== undefined)) {
        return { ...v, distanceMode: 'spacing', spacing: changed.includes('spacing') ? v.spacing : intervals > 0 ? Number(v.span) / intervals : '' };
      }
      return v;
    },
    // Spacing: an arrow at the second copy; count: one past the last (each spacing dragged adds a copy).
    handles: (ctx, v) => {
      const b = oneBody(ctx); if (!b) return [];
      if (usesLinearSpan(v)) return linearSpanHandles(b.mesh.bounds, v.axis as Axis, Number(v.span), Number(v.count), LINEAR_PATTERN_COUNT.max);
      const k = 'xyz'.indexOf(String(v.axis)), s = Number(v.spacing), n = Number(v.count), { min, max } = b.mesh.bounds, c = centreOf(b);
      const dir: [number, number, number] = [0, 0, 0]; dir[k] = 1;
      const at = (d: number): [number, number, number] => { const p = [...c] as [number, number, number]; p[k] = d; return p; };
      if (!(max[k] > min[k] - 1)) return [];
      const signed = !hasLinearSpan(v);
      const spacing: HandleSpec = { key: 'spacing', at: at(c[k] + s), dir, ...(signed ? {} : { min: 1 }) };
      if (signed && s === 0) return [spacing];
      const countDir: HandleSpec['dir'] = [...dir];
      const countEnd = signed && s < 0 ? min[k] : max[k];
      if (signed && s < 0) countDir[k] = -1;
      const interval = signed ? Math.abs(s) : Math.max(1, s);
      return [spacing, { key: 'count', at: at(countEnd + s * (n - 1)), dir: countDir,
        scale: 1 / interval, ...LINEAR_PATTERN_COUNT, unit: '' }];
    },
    build: (ctx, v) => {
      const body = refOf(oneBody(ctx)!), k = 'xyz'.indexOf(String(v.axis)), s = Number(v.spacing), n = Number(v.count);
      if (v.distanceMode === 'span') {
        if (!hasLinearSpan(v)) throw refusal('VALUE', 'Total span requires One body.');
        const node = { kind: 'linear-span-pattern', parent: body, axis: v.axis as Axis, span: Number(v.span), count: n } as const;
        const input = linearSpanPatternInput(node, ctx.doc.nodes.length, LINEAR_PATTERN_COUNT.max);
        if ('code' in input) throw refusal(input.code, input.message);
        return withNode(ctx.doc, node);
      }
      const pattern = { kind: 'linear-pattern', parent: body, axis: v.axis as Axis, spacing: s, count: n } as const;
      if (v.result === 'join-plate') {
        const plate = selectedBossPlate(ctx);
        if (!plate) throw refusal('VALUE', 'Joined boss pattern: Select a rectangular boss on its original plate.');
        return joinedBossPattern(ctx.doc, plate, pattern);
      }
      if (v.result !== 'separate') return withNode(ctx.doc, pattern);
      const { min, max } = LINEAR_PATTERN_COUNT;
      if (!Number.isInteger(n) || n < min || n > max) {
        throw refusal('VALUE', `Separate linear patterns use a whole-number Count from ${min} to ${max}, including the original.`);
      }
      if (!Number.isFinite(s) || s === 0) throw refusal('VALUE', 'Spacing must be a finite nonzero distance.');
      let doc = ctx.doc;
      for (let c = 1; c < n; c++) { const o: [number, number, number] = [0, 0, 0]; o[k] = s * c; doc = duplicateBody(doc, body, o).doc; }
      return doc;
    },
  },
  {
    id: 'circular-pattern', label: 'Circular pattern', icon: 'cad-pattern-circular', hint: 'Copies of a body round an axis', group: 'pattern', keywords: 'polar array',
    available,
    fields: (_ctx, v) => [{ key: 'axis', label: 'Axis', kind: 'choice', options: [{ value: 'z', label: 'Z' }, { value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
      { key: 'count', label: 'Count', kind: 'count', ...circularPatternCountRange(String(v?.axis ?? 'z')) },
      { key: 'span', label: 'Spread over', kind: 'deg', min: 1, max: 360, step: 5, when: v => v.axis === 'z' },
      { key: 'px', label: 'Axis at X', kind: 'mm', when: v => v.axis === 'z' }, { key: 'py', label: 'Axis at Y', kind: 'mm', when: v => v.axis === 'z' }, RESULT],
    defaults: () => ({ axis: 'z', count: 4, span: 360, px: 0, py: 0, result: 'one' }),
    // About Z: a puck moves the axis, an arc spreads the copies (a full turn shares it evenly; less, from
    // the first copy to the last). About X or Y the kernel steps by quarter turns.
    handles: (ctx, v) => {
      const b = oneBody(ctx); if (!b || v.axis !== 'z') return [];
      const c = centreOf(b), centre: [number, number, number] = [Number(v.px), Number(v.py), c[2]];
      const out: HandleSpec[] = [{ key: 'px', at: centre, dir: [1, 0, 0], pair: { key: 'py', dir: [0, 1, 0] } }];
      if (Math.hypot(c[0] - centre[0], c[1] - centre[1]) > 1) out.push({ key: 'span', at: c, dir: [0, 0, 1], min: 1, max: 360, step: 5, arc: { centre, axis: [0, 0, 1], from: c } });
      return out;
    },
    build: (ctx, v) => {
      const n = Number(v.count), z = v.axis === 'z', { min, max } = circularPatternCountRange(String(v.axis));
      if (!Number.isInteger(n) || n < min || n > max) {
        const axisRule = z ? 'Z circular patterns' : 'X/Y circular patterns with 90° steps';
        throw refusal('VALUE', `${axisRule} use a whole-number Count from ${min} to ${max}, including the original.`);
      }
      const span = Number(v.span ?? 360), pivot: [number, number, number] = [Number(v.px ?? 0), Number(v.py ?? 0), 0];
      if (v.result === 'separate') {
        // Each copy stores an independent Rotate angle: preserve the authored share without display rounding.
        // One-body span metadata keeps its separate, legacy rounded-step reader contract.
        const body = refOf(oneBody(ctx)!), step = z ? (span >= 360 ? 360 / n : span / (n - 1)) : 90;
        let doc = ctx.doc;
        for (let c = 1; c < n; c++) doc = duplicateBody(doc, body, copy => ({ kind: 'rotate', parent: copy, axis: v.axis as Axis, angle: step * c, ...(z && (pivot[0] || pivot[1]) ? { pivot } : {}) })).doc;
        return doc;
      }
      return withNode(ctx.doc, z
        ? { kind: 'circular-pattern', parent: refOf(oneBody(ctx)!), axis: 'z', angle: circularPatternStep(span, n), count: n, span: span >= 360 ? 360 : span, ...(pivot[0] || pivot[1] ? { pivot } : {}) }
        : { kind: 'circular-pattern', parent: refOf(oneBody(ctx)!), axis: v.axis as Axis, angle: 90, count: n });
    },
  },
];
