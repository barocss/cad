import { useLayoutEffect, useRef, useState } from 'react';
import { browserExtrudeTarget, canProposeBrowserBox, validBoxDimension, validExtrudeDistance } from '@barocss/cad-model/chat/browserProposalTargets';
import { proposeBrowserBox, proposeBrowserExtrude, type ChatState, type Evaluate } from '@barocss/cad-model/chat/tools';
import { revisionOf } from '@barocss/cad-model/util/revision';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { browserToolFailure, modelContext, plainInput } from './browserModelContext';
import type { BrowserPartSummarySource } from './useBrowserPartSummary';

export interface BrowserPartProposalSource {
  isIdle(): boolean;
  evaluate: Evaluate;
  stage(next: StudioDoc): boolean;
}

const revisionField = { type: 'string', maxLength: 16 } as const;
const distanceField = { type: 'number' } as const;
const proposalTools = {
  Box: {
    name: 'cad_part_propose_box',
    description: 'Propose the first Box at the origin of the shared empty part. Give its width, depth and height in millimetres and the revision from cad_part_summary. A person decides in Studio.',
    fields: { width: distanceField, depth: distanceField, height: distanceField, expectedRevision: revisionField },
    invalid: 'Give numeric width, depth and height of at least 1 mm and the expected revision.',
    title: 'Allow one browser proposal for the first Box',
  },
  Extrude: {
    name: 'cad_part_propose_extrude',
    description: 'Propose a positive distance in millimetres for the shared rectangular or circular Extrude. A Box or Cylinder requires at least 1 mm. Use the body key and revision from cad_part_summary. A person decides in Studio.',
    fields: { body: { type: 'string', maxLength: 128 } as const, height: distanceField, expectedRevision: revisionField },
    invalid: 'Give a body key, a positive numeric distance in millimetres and the expected revision.',
    title: 'Allow one browser proposal for this part’s Extrude distance',
  },
};
type ProposalKind = keyof typeof proposalTools;

function proposalInput(kind: ProposalKind, input: unknown, required: readonly string[]) {
  if (!plainInput(input) || Reflect.ownKeys(input).length !== required.length ||
    !required.every(key => Object.hasOwn(input, key))) return;
  const { body, width, depth, height, expectedRevision } = input;
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(expectedRevision)) return;
  if (kind === 'Box') {
    if (validBoxDimension(width) && validBoxDimension(depth) && validBoxDimension(height))
      return { kind, args: { width, depth, height, expectedRevision } };
  } else if (typeof body === 'string' && body.length > 0 && body.length <= 128 && validExtrudeDistance(height)) {
    return { kind, args: { body, height, expectedRevision } };
  }
}

export function useBrowserPartProposal(source: BrowserPartSummarySource | undefined,
  action: BrowserPartProposalSource | undefined, readShared: boolean) {
  const api = modelContext();
  const owner = source?.doc, scope = source?.scope;
  const [grant, setGrant] = useState<{ owner: StudioDoc; scope: object }>();
  const [failed, setFailed] = useState(false);
  const enabled = !!grant;
  const same = grant?.owner === owner && grant?.scope === scope;
  if (grant && (!same || !readShared)) {
    setGrant(undefined);
    setFailed(false);
  }
  const kind = source && (canProposeBrowserBox(source.doc, source.bodies) ? 'Box' :
    browserExtrudeTarget(source.doc, source.bodies) ? 'Extrude' : undefined);
  const ready = !!source?.ready && !!action && !!kind;
  const active = enabled && same && readShared && ready;
  const live = useRef({ source, action, active });
  live.current = { source, action, active };

  useLayoutEffect(() => {
    if (!active || !api || !grant || !kind) return;
    const tool = proposalTools[kind];
    const required = Object.keys(tool.fields);
    const controller = new AbortController();
    let submitting = false, used = false;
    const stale = browserToolFailure('stale_part', 'The proposal grant or the current part has changed.');
    const current = (snapshot: BrowserPartSummarySource, signal?: AbortSignal) =>
      !signal?.aborted && !controller.signal.aborted && live.current.active &&
      live.current.source?.doc === snapshot.doc && live.current.source.scope === snapshot.scope &&
      live.current.source.bodies === snapshot.bodies && snapshot.isCurrent() && !!live.current.action?.isIdle();
    const register = async () => {
      try {
        await api.registerTool({
          name: tool.name,
          description: tool.description,
          inputSchema: { type: 'object', properties: { ...tool.fields }, required, additionalProperties: false },
          annotations: { readOnlyHint: false },
          async execute(input, options) {
            const request = proposalInput(kind, input, required);
            if (!request) return browserToolFailure('invalid_arguments', tool.invalid);
            const { expectedRevision } = request.args;
            const { source: snapshot, action: evaluateWith } = live.current;
            const signal = options?.signal;
            if (!snapshot || !evaluateWith || snapshot.doc !== grant.owner || snapshot.scope !== grant.scope ||
              !current(snapshot, signal) || revisionOf(snapshot.doc) !== expectedRevision || used) return stale;
            if (submitting) return browserToolFailure('proposal_pending', 'A browser proposal is already being evaluated.');
            if (request.kind === 'Extrude') {
              const target = browserExtrudeTarget(snapshot.doc, snapshot.bodies);
              if (!target || target.body !== request.args.body || target.height === request.args.height)
                return browserToolFailure('extrude_unavailable', 'Choose the current Extrude body and a different distance.');
              if (target.node.made && request.args.height < 1)
                return browserToolFailure('invalid_arguments', 'Give a height of at least 1 mm for a Box or Cylinder.');
            }
            submitting = true;
            try {
              const { doc, bodies } = snapshot;
              const state: ChatState = { doc, bodies, approvalRequired: true };
              const outcome = await (request.kind === 'Box'
                ? proposeBrowserBox(state, request.args, evaluateWith.evaluate)
                : proposeBrowserExtrude(state, request.args, evaluateWith.evaluate)).catch(() => null);
              if (!current(snapshot, signal)) return stale;
              const proposal = outcome?.state.doc.proposals?.at(-1);
              if (!outcome || outcome.isError || !outcome.changed || !proposal)
                return browserToolFailure('proposal_unavailable', `The ${kind} proposal could not be evaluated.`);
              if (!live.current.action?.stage(outcome.state.doc)) return stale;
              used = true;
              live.current.active = false;
              setGrant(undefined);
              return { proposal: proposal.id, applied: false, revision: expectedRevision };
            } finally {
              submitting = false;
            }
          },
        }, { signal: controller.signal });
      } catch {
        if (!controller.signal.aborted) {
          controller.abort();
          setFailed(true);
          setGrant(current => current === grant ? undefined : current);
        }
      }
    };
    void register();
    return () => controller.abort();
  }, [active, api, grant, kind]);

  if (!api || !owner || !scope || !readShared || !kind) return;
  return {
    kind, title: proposalTools[kind].title, enabled, ready, failed,
    toggle() {
      if (enabled) live.current.active = false;
      setFailed(false);
      setGrant(enabled ? undefined : { owner, scope });
    },
  };
}
