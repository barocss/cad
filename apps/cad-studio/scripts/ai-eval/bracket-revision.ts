import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve } from '@barocss/cad';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import type { Brief } from './briefs';
import { check } from './oracle';

export function bracketRevisionBrief(repo: string): Brief {
  const start = join(repo, 'apps/cad-studio/test/fixtures/b01-bracket-w60.bcad');
  const bytes = readFileSync(start);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== '2727e7d3d726a58030657720ebc7a8d09a4dab574887dd7d2001cc42305ed16f')
    throw new Error('B01 bracket revision: unexpected W60 input bytes');
  const expected = JSON.parse(bytes.toString('utf8'));
  // The left edge is anchored at x=-20. The same edit drives the compact
  // rectangle, its two right corners and the first locked length.
  const sketch = expected.nodes[0];
  sketch.max[0] = 60;
  sketch.outline.points[1][0] = 60;
  sketch.outline.points[2][0] = 60;
  sketch.outline.lengths[0] = 80;
  // D538: the rounded plate and the bored portion of the boss above it.
  const volume = 400 * 80 - 160 + 1315 * Math.PI;
  const edgeName = 'n1.bottom|n1.side[e1]';

  return {
    id: 'b01-bracket-revision',
    ladder: 'single part',
    title: 'B01 support bracket width revision (W60 to W80)',
    start,
    autonomy: 1,
    prompt: 'Widen the base of the open support bracket from 60 mm to 80 mm by moving its right end. Keep the left end, depth, thickness, boss, through-hole, and corner fillets as they are. Keep the existing sketch dimension editable and preserve the downstream feature references. Show me the change for approval before applying it.',
    reference: [
      { tool: 'query', args: { action: 'edit_fields', index: 0 } },
      { tool: 'proposals', args: { action: 'propose', title: 'Widen the support bracket to 80 mm',
        ops: [{ tool: 'features', args: { action: 'edit', index: 0, values: { olen0: 80 } } }] } },
      { tool: '@accept', args: {} },
    ],
    async oracle({ doc }) {
      const { proposals, history, ...model }: StudioDoc = doc;
      delete model.brief;
      delete model.requirements;
      const [proposal] = proposals ?? [];
      const userAccepted = proposal?.status === 'accepted' && history?.some(entry =>
        entry.kind === 'accept' && entry.proposal === proposal.id && entry.by.agent === 'user');
      const bodies = partBreps(doc);
      const body = bodies.length === 1 ? bodies[0] : undefined;
      const result = body && checkBrep(body.brep, { strict: true });
      const actualVolume = body && brepMassProperties(body.brep, 1).volume;
      const [edge, repeated] = body?.brep.edges.filter(candidate => candidate.name === edgeName) ?? [];
      const length = edge && !repeated && edge.curve.degree === 1 ? (() => {
        const [start, end] = curveDomain(edge.curve);
        const a = evaluateCurve(edge.curve, start), b = evaluateCurve(edge.curve, end);
        return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      })() : undefined;
      return [
        check('edit', 'existing W80 dimension, original anchor, feature chain and references', isDeepStrictEqual(model, expected)),
        check('review', 'one proposal accepted by the reviewer', proposals?.length === 1 && userAccepted === true),
        check('solid', 'one valid native support bracket with a through bore', body?.key === 'b6' && result?.valid === true &&
          result.topology.length === 1 && result.topology[0].genus === 1),
        check('volume', 'native volume matches the independent closed form', actualVolume !== undefined &&
          Math.abs(actualVolume - volume) <= volume * 1e-9, actualVolume, volume),
        check('edge', 'the original named native edge is 76 mm long', length !== undefined &&
          Math.abs(length - 76) <= 1e-9, length, 76),
      ];
    },
  };
}
