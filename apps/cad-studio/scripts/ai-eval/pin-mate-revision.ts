import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Brief } from './briefs';
import { check } from './oracle';

export function pinMateRevisionBrief(repo: string): Brief {
  const start = join(repo, 'apps/cad-studio/test/fixtures/b05-pin-holder-distance-zero.bcad');
  const bytes = readFileSync(start);
  if (createHash('sha256').update(bytes).digest('hex') !== '2b198792e9fb4850787aaf41ea2413d7b02fba4ee016059f18a66e2c605b2bb1')
    throw new Error('B05 pin mate revision: unexpected zero-gap input bytes');
  const { mates, instances, ...source }: StudioDoc = JSON.parse(bytes.toString('utf8'));
  const expectedMates = mates!.map(mate => mate.kind === 'distance' ? { ...mate, distance: 3 } : mate);
  const [pin] = instances!;
  const axisHeight = [32, 16, 8 + 3];
  const expectedVolumes = [64 * 32 * 8 - Math.PI * 4 ** 2 * 8, Math.PI * 4 ** 2 * 20];

  return {
    id: 'b05-pin-mate-revision',
    ladder: 'assembly',
    title: 'B05 pin-to-holder Distance mate revision (0 to 3 mm)',
    start,
    autonomy: 1,
    prompt: 'In the open pin-and-holder assembly, change the gap from the top of the holder to the bottom of the pin from 0 mm to 3 mm. Edit the existing Distance mate. Keep the pin concentric with the bore, leave both parts and the existing mate references intact, and show me the proposed change for approval before applying it.',
    reference: [
      { tool: 'assembly', args: { action: 'get' } },
      { tool: 'proposals', args: { action: 'propose', title: 'Set the pin-to-holder gap to 3 mm',
        ops: [{ tool: 'assembly', args: { action: 'edit_mate', id: 'm2', distance: 3 } }] } },
      { tool: '@accept', args: {} },
    ],
    async oracle({ doc, base, parts, placed }) {
      const { mates, instances, proposals, history, ...model } = doc;
      delete model.brief;
      delete model.requirements;
      const [proposal] = proposals ?? [];
      const approved = proposal?.status === 'accepted' && history?.some(event =>
        event.kind === 'accept' && event.proposal === proposal.id && event.by.agent === 'user');
      const [actual] = instances ?? [];
      const { position: originalPosition, ...part } = pin;
      const [placedPin] = placed.filter(body => body.key === 'pin/b1');
      const volumes = [base?.[0]?.volume, parts.pin?.[0]?.volume];
      return [
        check('definitions', 'original holder and pin definitions and occurrence identity', instances?.length === 1 &&
          isDeepStrictEqual(model, source) && isDeepStrictEqual(actual, { ...part, position: actual?.position })),
        check('mates', 'original concentric mate and the same Distance mate with 3 mm separation', isDeepStrictEqual(mates, expectedMates),
          mates, expectedMates),
        check('pose', 'pin remains on the original axis and moves to Z11 in the placed consumer', originalPosition[2] === 8 &&
          isDeepStrictEqual(actual?.position, axisHeight) && isDeepStrictEqual(placedPin?.pose.t, axisHeight) &&
          placed.length === 2, actual?.position, axisHeight),
        check('volume', 'the holder and the pin retain their independent native volumes', base?.length === 1 &&
          parts.pin?.length === 1 && volumes.every((volume, i) => typeof volume === 'number' &&
            Math.abs(volume - expectedVolumes[i]) <= 1e-9 * expectedVolumes[i]), volumes, expectedVolumes),
        check('approval', 'one proposal accepted by the reviewer', proposals?.length === 1 && approved === true),
      ];
    },
  };
}
