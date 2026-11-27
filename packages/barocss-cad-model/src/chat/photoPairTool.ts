import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import type { ToolDefinition } from './api';
import { measurePhotoPair } from './photoPair';
import { photoDraftOperations } from './photoPairDraft';
import { fail, json, type PartHandler } from './toolKit';

const layerFields = {
  name: { type: 'string', minLength: 1 }, frontLayer: { type: 'string', minLength: 1 }, sideLayer: { type: 'string', minLength: 1 },
};
const photoFields = {
  frontImage: { type: 'integer', minimum: 1 }, sideImage: { type: 'integer', minimum: 1 },
  reference: { type: 'object', properties: { ...layerFields, diameterMM: { type: 'number', exclusiveMinimum: 0 } },
    required: ['name', 'frontLayer', 'sideLayer', 'diameterMM'], additionalProperties: false },
  parts: { type: 'array', maxItems: 7, items: { type: 'object', properties: layerFields, required: ['name', 'frontLayer'], additionalProperties: false } },
};
const photoRequired = Object.keys(photoFields);

export const photoPairTool: ToolDefinition = {
  name: 'measure_photo_pair',
  description: 'Estimate visible part envelopes from two attached near-orthographic views of one object with an open ring head. Use image.layers on both views, pair their layer IDs, then supply the person’s measured ring diameter in mm. Parts with no side layer have unknown depth. No geometry changes.',
  input_schema: { type: 'object', properties: photoFields, required: photoRequired, additionalProperties: false },
};

export const proposePhotoPairTool: ToolDefinition = {
  name: 'propose_photo_pair',
  description: 'Stage one ring-head assembly with three rectangular part envelopes for explicit Studio approval. Use the same layer assignments and diameter as image.measure_pair, in handle, filter cap, button order. Pass traceRevision from the measurement. All four parts need both views.',
  input_schema: { ...photoPairTool.input_schema, properties: { ...photoFields,
    traceRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  }, required: [...photoRequired, 'traceRevision'] },
};

function layerPair(value: unknown) {
  if (!isObj(value) || typeof value.name !== 'string' || typeof value.frontLayer !== 'string' || !value.frontLayer
    || (value.sideLayer !== undefined && (typeof value.sideLayer !== 'string' || !value.sideLayer))) return;
  return { name: value.name, frontLayer: value.frontLayer, sideLayer: value.sideLayer };
}

function photoPairInput(state: Parameters<PartHandler>[0], args: Record<string, unknown>) {
  const { frontImage, sideImage } = args;
  const front = typeof frontImage === 'number' && Number.isInteger(frontImage) ? state.images?.[frontImage - 1] : undefined;
  const side = typeof sideImage === 'number' && Number.isInteger(sideImage) ? state.images?.[sideImage - 1] : undefined;
  const raw = args.reference, ref = layerPair(raw), diameterMM = isObj(raw) ? raw.diameterMM : undefined;
  const parts = Array.isArray(args.parts) && args.parts.length <= 7 ? args.parts.map(layerPair) : undefined;
  if (!front || !side || !ref?.sideLayer || typeof diameterMM !== 'number' || !parts || !parts.every(part => part !== undefined))
    return { error: 'Choose the two attached image numbers and their layer IDs. Supply the measured ring diameter and up to seven additional part pairs.', code: 'PHOTO_PAIR_INPUT' } as const;
  const reference = { ...ref, sideLayer: ref.sideLayer, diameterMM };
  const report = measurePhotoPair(front, side, reference, parts);
  if (report.error !== undefined) return { error: report.error, code: report.code };
  const evidence = { frontImage, sideImage, traceRevision: digestOf({ front, side, reference, parts }) };
  return { front, side, report, evidence };
}

export const measurePhotoPairTool: PartHandler = async (state, args) => {
  const input = photoPairInput(state, args);
  if (input.error !== undefined) return fail(state, input.error, { code: input.code });
  const { report, evidence } = input;
  return { state, content: json({ ...report, evidence }), isError: false, changed: false, summary: `Estimated ${report.parts.length} part envelopes from two views` };
};

export const draftPhotoPairTool: PartHandler = async (state, args, evaluate, _options, run) => {
  if (state.partOf) return fail(state, 'Propose the photo assembly from the root document.', { code: 'PHOTO_DRAFT_SCOPE' });
  const input = photoPairInput(state, args);
  if (input.error !== undefined) return fail(state, input.error, { code: input.code });
  const { front, side, report, evidence } = input;
  if (args.traceRevision !== evidence.traceRevision)
    return fail(state, 'Measure the current pair and pass its traceRevision.', { code: 'PHOTO_DRAFT_STALE' });
  const draft = photoDraftOperations(state.doc, front, side, report, evidence.traceRevision);
  if (draft.error !== undefined) return fail(state, draft.error, { code: 'PHOTO_DRAFT_PROFILE' });
  return run(state, 'propose', { title: 'Editable assembly from two reference views', ...draft }, evaluate);
};
