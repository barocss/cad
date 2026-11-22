import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { drawingInputs } from '@barocss/cad-model/chat/drawing';
import { issueContext } from '@barocss/cad-model/drawing/issues';
import { forSheet, sheetCount } from '@barocss/cad-model/drawing/sheets';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Brief } from './briefs';
import { check } from './oracle';

export function counterboreDrawingRevisionBrief(repo: string): Brief {
  const start = join(repo, 'apps/cad-studio/test/fixtures/b06-counterbore-two-sheets-depth-four.bcad');
  const bytes = readFileSync(start);
  if (createHash('sha256').update(bytes).digest('hex') !== '0ad88b52c61fb1d1701df7eea8f123cc6f70cfc928082cd7b2ec178b4ae49991')
    throw new Error('B06 counterbore drawing revision: unexpected two-sheet input bytes');
  const { drawing: savedDrawing, ...expected }: StudioDoc = JSON.parse(bytes.toString('utf8'));
  const bore = expected.nodes[3];
  if (bore.kind !== 'hole') throw new Error('B06 counterbore drawing revision: expected the existing secondary hole');
  expected.nodes[3] = { ...bore, depth: 2 };

  const pilot = Math.PI * 2 ** 2 * 12;
  const recess = Math.PI * (4 ** 2 - 2 ** 2) * 2;
  const block = 80 * 40 * 12;
  const volume = block - pilot - recess;
  const centroidZ = ((block - pilot) * 6 - recess * 11) / volume;
  const expectedCallouts = [[], [{ id: 'd4', view: 'top', text: 'Ø4 THRU CBORE Ø8 × 2 DEEP' }]];

  return {
    id: 'b06-counterbore-drawing-revision',
    ladder: 'outputs',
    title: 'B06 two-sheet counterbore revision (4 to 2 mm)',
    start,
    autonomy: 1,
    prompt: 'In the open two-sheet drawing, reduce the existing counterbore depth from 4 mm to 2 mm. Keep the through-hole and counterbore diameters. Keep the callout attached to the same Top view on Sheet 2, and keep Sheet 1, the view layout and the existing dimensions. Show me the proposed change for approval before applying it. Verify the updated callout after approval.',
    reference: [
      { tool: 'query', args: { action: 'edit_fields', index: 3 } },
      { tool: 'drawing', args: { action: 'issues' } },
      { tool: 'proposals', args: { action: 'propose', title: 'Set the counterbore depth to 2 mm',
        ops: [{ tool: 'features', args: { action: 'edit', index: 3, values: { depth: 2 } } }] } },
      { tool: '@accept', args: {} },
    ],
    async oracle({ doc, base }) {
      const { drawing, proposals, history, ...model } = doc;
      delete model.brief;
      delete model.requirements;
      const [proposal] = proposals ?? [];
      const approved = proposal?.status === 'accepted' && history?.some(event =>
        event.kind === 'accept' && event.proposal === proposal.id && event.by.agent === 'user');
      const [body] = base ?? [];
      const inputs = drawingInputs(doc);
      // Use the drawing producer here. The desktop case separately parses the actual exported SVG.
      const callouts = typeof inputs === 'string' ? inputs : Array.from({ length: sheetCount(inputs.settings) }, (_, index) =>
        issueContext({ ...inputs, settings: forSheet(inputs.settings, index) }).sheet.dimensions.flatMap(d =>
          d.ok && d.text.includes('CBORE') ? [{ id: d.dim.id, view: d.dim.view, text: d.text.trim().replace(/\s+/g, ' ') }] : []));
      // Native edits can fill edge signatures. The authored edge names and locations still have to match.
      const authoredDrawing = drawing && JSON.parse(JSON.stringify(drawing, (key, value) => key === 'sig' ? undefined : value));
      return [
        check('model', 'only the existing counterbore depth changes', isDeepStrictEqual(model, expected)),
        check('drawing', 'both sheet layouts and all authored drawing references remain exact', isDeepStrictEqual(authoredDrawing, savedDrawing)),
        check('label', 'only Sheet 2 contains the original Top callout at depth 2 mm', isDeepStrictEqual(callouts, expectedCallouts),
          callouts, expectedCallouts),
        check('physics', 'one native body with the expected volume and centroid', base?.length === 1 && body?.key === 'b3' &&
          typeof body.volume === 'number' && Math.abs(body.volume - volume) < 1e-8 &&
          !!body.centroid && [20, 0, centroidZ].every((value, axis) => Math.abs(value - body.centroid![axis]) < 1e-9),
        { volume: body?.volume, centroid: body?.centroid }, { volume, centroid: [20, 0, centroidZ] }),
        check('approval', 'one proposal accepted by the reviewer', proposals?.length === 1 && approved === true),
      ];
    },
  };
}
