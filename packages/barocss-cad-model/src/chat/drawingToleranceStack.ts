import type { JsonSchema } from './contract';
import type { Resolved } from '../drawing/dimensions';
import { issueContext, type SheetInputs } from '../drawing/issues';
import { drawingScopeOf } from '../drawing/scope';
import { dimensionLine } from '../drawing/sheet';
import { printableCallouts } from '../drawing/printableCallouts';
import { forSheet, sheetCount, sheetName } from '../drawing/sheets';
import { presetFor } from '../drawing/standard';
import { calculateToleranceStack, type ToleranceStackTerm } from '../drawing/toleranceStack';
import type { StudioDoc } from '../engine/doc';
import { digestOf, requirementEvidenceRevision } from '../util/digest';

const sheetArg = { type: 'integer', minimum: 1, description: 'Drawing sheet number, starting at 1. Defaults to sheet 1.' };
export const DRAWING_DIMENSIONS = 'get_drawing_dimensions';
export const DRAWING_TOLERANCE_STACK = 'calculate_drawing_tolerance_stack';
export const STACK_READ_TOOLS: { name: string; description: string; input_schema: JsonSchema }[] = [
  {
    name: DRAWING_DIMENSIONS,
    description: 'Lists linear dimensions by default on one sheet of the tool session’s drawing snapshot, with their IDs, views, model lengths in mm, authored tolerances and any unresolved references. Printed annotations are separate. With include_diameters or include_radii true, also lists the respective geometric diameters or radii in model mm, without annotations or manufacturing meaning. With include_callouts true, returns the visible diameter/radius annotation text marks separately, with the current drawing source. For a read-only comparison with an open proposal, pass review. Tolerance stacks remain linear-only. Use this revision and linear IDs to calculate a tolerance stack. Read only.',
    input_schema: { type: 'object', properties: {
      sheet: sheetArg,
      include_diameters: { type: 'boolean', description: 'Include geometric diameters, without annotations or manufacturing meaning. Defaults to false; tolerance stacks remain linear-only.' },
      include_radii: { type: 'boolean', description: 'Include geometric radii, without annotations or manufacturing meaning. Defaults to false; independent of include_diameters; tolerance stacks remain linear-only.' },
      include_callouts: { type: 'boolean', description: 'Include the visible diameter and radius annotation text marks and the drawing source. Defaults to false.' },
      review: { type: 'object',
        description: 'Compare the current and candidate drawing on this sheet. Includes printable callouts for both. Use the revision from a current read of the same sheet and the proposalRevision from proposals.list.',
        properties: {
          proposal: { type: 'string', minLength: 1 },
          expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          expectedProposalRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        }, required: ['proposal', 'expectedRevision', 'expectedProposalRevision'], additionalProperties: false },
    }, additionalProperties: false },
  },
  {
    name: DRAWING_TOLERANCE_STACK,
    description: 'Calculates a worst-case stack of independent linear dimensions on the same view axis. Use the sheet, IDs and revision from drawing.dimensions. For each term, give sign 1 to add or -1 to subtract. Returns exact decimal bounds in model mm from explicit numeric tolerances. Does not infer independence or substitute fits, notes or geometric tolerances. Read only.',
    input_schema: { type: 'object', properties: {
      sheet: sheetArg,
      expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      terms: { type: 'array', minItems: 2, items: { type: 'object', properties: { id: { type: 'string', minLength: 1 }, sign: { type: 'integer', enum: [1, -1] } }, required: ['id', 'sign'], additionalProperties: false } },
    }, required: ['expectedRevision', 'terms'], additionalProperties: false },
  },
];

export function isStackRead(name: string): boolean {
  return name === DRAWING_DIMENSIONS || name === DRAWING_TOLERANCE_STACK;
}

function readTerm(value: unknown): ToleranceStackTerm | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { id, sign, ...other } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !id.trim() || (sign !== 1 && sign !== -1) || Object.keys(other).length) return null;
  return { id, sign };
}

export function readDrawingStack(
  doc: StudioDoc, name: string, args: Record<string, unknown>,
  settings: SheetInputs['settings'], project: () => SheetInputs | string,
): { content: Record<string, unknown>; summary: string } | { error: string } {
  for (const option of ['include_diameters', 'include_radii', 'include_callouts']) {
    if (!Object.hasOwn(args, option)) continue;
    if (name === DRAWING_TOLERANCE_STACK)
      return { error: `${option} is only supported by drawing.dimensions. Tolerance stacks are linear-only.` };
    if (typeof args[option] !== 'boolean') return { error: `${option} must be a boolean.` };
  }
  const optedIn = (key: string) => Object.hasOwn(args, key) && args[key] === true;
  const includeDiameters = optedIn('include_diameters');
  const includeRadii = optedIn('include_radii');
  const sheet = args.sheet === undefined ? 1 : args.sheet;
  const count = sheetCount(settings);
  if (typeof sheet !== 'number' || !Number.isInteger(sheet) || sheet < 1 || sheet > count) {
    return { error: `Select a drawing sheet from 1 to ${count}.` };
  }
  const revision = digestOf([requirementEvidenceRevision(doc), sheet]);
  let terms: ToleranceStackTerm[] | undefined;
  if (name === DRAWING_TOLERANCE_STACK) {
    if (typeof args.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(args.expectedRevision)) {
      return { error: 'Set expectedRevision to the revision from drawing.dimensions.' };
    }
    if (args.expectedRevision !== revision) return { error: 'The drawing, model or selected sheet changed. Read drawing.dimensions again.' };
    if (!Array.isArray(args.terms) || args.terms.length < 2) return { error: 'Select at least two signed dimension terms.' };
    terms = [];
    for (const value of args.terms) {
      const term = readTerm(value);
      if (!term) return { error: 'Each term must have a dimension ID and a sign of 1 or -1.' };
      terms.push(term);
    }
  }
  const inputs = project();
  if (typeof inputs === 'string') return { error: inputs };
  const scope = drawingScopeOf(settings);
  const local = { ...forSheet(settings, sheet - 1), scope };
  const drawn = issueContext({ ...inputs, settings: local }).sheet;
  const { dimensions } = drawn;
  const preset = presetFor(local);
  const provenance = { revision, sheet, sheetName: sheetName(settings, sheet - 1), scope, unit: 'mm', printUnit: preset.units };
  const describe = (r: Resolved) => ({
    id: r.dim.id, view: r.dim.view, ...(r.dim.kind === 'linear' ? { orientation: r.dim.orient } : {}),
    ...(r.dim.basic ? { basic: true } : {}), ...(r.dim.count !== undefined ? { count: r.dim.count } : {}),
    authoredTolerance: r.dim.tol ?? null,
    ...(r.ok ? { resolved: true, value: r.value, printed: dimensionLine(r, preset) } : { resolved: false, reason: r.reason }),
  });
  if (!terms) {
    const callouts = optedIn('include_callouts') ? { source: inputs.meta.source, callouts: printableCallouts(drawn) } : {};
    if (includeDiameters || includeRadii) {
      const selected = dimensions.filter(r => r.dim.kind === 'linear'
        || includeDiameters && r.dim.kind === 'diameter' || includeRadii && r.dim.kind === 'radius').map(r =>
        r.dim.kind === 'linear' ? { ...describe(r), kind: 'linear' } : {
          id: r.dim.id, view: r.dim.view, kind: r.dim.kind,
          ...(r.ok ? { resolved: true, value: r.value } : { resolved: false, reason: r.reason }),
        });
      const kinds = includeRadii ? (includeDiameters ? 'linear, diameter and radius' : 'linear and radius') : 'linear and diameter';
      return { content: { ...provenance, dimensions: selected, ...callouts }, summary: `${selected.length} ${kinds} drawing dimensions` };
    }
    const linear = dimensions.filter(r => r.dim.kind === 'linear').map(describe);
    return { content: { ...provenance, dimensions: linear, ...callouts }, summary: `${linear.length} linear drawing dimensions` };
  }
  const result = calculateToleranceStack('mm', terms, dimensions);
  if (!result.ok) return { error: result.reason };
  const byId = new Map(dimensions.map(r => [r.dim.id, r]));
  return {
    content: { ...provenance, method: 'worst-case', nominal: result.nominal, minimum: result.minimum, maximum: result.maximum,
      terms: terms.map(term => ({ ...describe(byId.get(term.id)!), sign: term.sign })) },
    summary: `Nominal ${result.nominal} mm · worst case ${result.minimum} to ${result.maximum} mm`,
  };
}
