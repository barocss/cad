import { digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import type { ToolDefinition } from './api';
import { measurePhotoPair } from './photoPair';
import { fail, json, type PartHandler } from './toolKit';

const layerFields = {
  name: { type: 'string', minLength: 1 }, frontLayer: { type: 'string', minLength: 1 }, sideLayer: { type: 'string', minLength: 1 },
};

export const photoPairTool: ToolDefinition = {
  name: 'measure_photo_pair',
  description: 'Estimate visible part envelopes from two attached near-orthographic views of one object with an open ring head. Use image.layers on both views, pair their layer IDs, then supply the person’s measured ring diameter in mm. Parts with no side layer have unknown depth. No geometry changes.',
  input_schema: { type: 'object', properties: {
    frontImage: { type: 'integer', minimum: 1 }, sideImage: { type: 'integer', minimum: 1 },
    reference: { type: 'object', properties: { ...layerFields, diameterMM: { type: 'number', exclusiveMinimum: 0 } },
      required: ['name', 'frontLayer', 'sideLayer', 'diameterMM'], additionalProperties: false },
    parts: { type: 'array', maxItems: 7, items: { type: 'object', properties: layerFields, required: ['name', 'frontLayer'], additionalProperties: false } },
  }, required: ['frontImage', 'sideImage', 'reference', 'parts'], additionalProperties: false },
};

function layerPair(value: unknown) {
  if (!isObj(value) || typeof value.name !== 'string' || typeof value.frontLayer !== 'string' || !value.frontLayer
    || (value.sideLayer !== undefined && (typeof value.sideLayer !== 'string' || !value.sideLayer))) return;
  return { name: value.name, frontLayer: value.frontLayer, sideLayer: value.sideLayer };
}

export const measurePhotoPairTool: PartHandler = async (state, args) => {
  const { frontImage, sideImage } = args;
  const front = typeof frontImage === 'number' && Number.isInteger(frontImage) ? state.images?.[frontImage - 1] : undefined;
  const side = typeof sideImage === 'number' && Number.isInteger(sideImage) ? state.images?.[sideImage - 1] : undefined;
  const raw = args.reference, ref = layerPair(raw), diameterMM = isObj(raw) ? raw.diameterMM : undefined;
  const parts = Array.isArray(args.parts) && args.parts.length <= 7 ? args.parts.map(layerPair) : undefined;
  if (!front || !side || !ref?.sideLayer || typeof diameterMM !== 'number' || !parts || !parts.every(part => part !== undefined))
    return fail(state, 'Choose the two attached image numbers and their layer IDs. Supply the measured ring diameter and up to seven additional part pairs.', { code: 'PHOTO_PAIR_INPUT' });
  const reference = { ...ref, sideLayer: ref.sideLayer, diameterMM };
  const report = measurePhotoPair(front, side, reference, parts);
  if (report.error !== undefined) return fail(state, report.error, { code: report.code });
  const evidence = { frontImage, sideImage, traceRevision: digestOf({ front, side, reference, parts }) };
  return { state, content: json({ ...report, evidence }), isError: false, changed: false, summary: `Estimated ${report.parts.length} part envelopes from two views` };
};
