import { useLayoutEffect, useRef, useState } from 'react';
import { browserExtrudeTarget, validExtrudeDistance } from '@barocss/cad-model/chat/browserExtrude';
import { proposeBrowserExtrude, type Evaluate } from '@barocss/cad-model/chat/tools';
import { revisionOf } from '@barocss/cad-model/util/revision';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { browserToolFailure, modelContext, plainInput } from './browserModelContext';
import type { BrowserPartSummarySource } from './useBrowserPartSummary';

export interface BrowserExtrudeProposalSource {
  isIdle(): boolean;
  evaluate: Evaluate;
  stage(next: StudioDoc): boolean;
}

function proposalInput(input: unknown) {
  if (!plainInput(input) || Reflect.ownKeys(input).length !== 3 ||
    !['body', 'height', 'expectedRevision'].every(key => Object.hasOwn(input, key))) return;
  const { body, height, expectedRevision } = input;
  if (typeof body === 'string' && body.length > 0 && body.length <= 128 &&
    validExtrudeDistance(height) && typeof expectedRevision === 'string' && /^[a-f0-9]{16}$/.test(expectedRevision))
    return { body, height, expectedRevision };
}

export function useBrowserExtrudeProposal(source: BrowserPartSummarySource | undefined,
  action: BrowserExtrudeProposalSource | undefined, readShared: boolean) {
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
  const target = owner && source && browserExtrudeTarget(owner, source.bodies);
  const ready = !!source?.ready && !!action && !!target;
  const active = enabled && same && readShared && ready;
  const live = useRef({ source, action, active });
  live.current = { source, action, active };

  useLayoutEffect(() => {
    if (!active || !api || !grant) return;
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
          name: 'cad_part_propose_extrude',
          description: 'Propose a new positive Extrude distance in millimetres for the shared rectangular part. Use the body key and revision from cad_part_summary. A person decides in Studio.',
          inputSchema: { type: 'object', properties: {
            body: { type: 'string', maxLength: 128 }, height: { type: 'number' },
            expectedRevision: { type: 'string', maxLength: 16 },
          }, required: ['body', 'height', 'expectedRevision'], additionalProperties: false },
          annotations: { readOnlyHint: false },
          async execute(input, options) {
            const args = proposalInput(input);
            if (!args) return browserToolFailure('invalid_arguments', 'Give a body key, a positive numeric distance in millimetres and the expected revision.');
            const { source: snapshot, action: evaluateWith } = live.current;
            const signal = options?.signal;
            if (!snapshot || !evaluateWith || snapshot.doc !== grant.owner || snapshot.scope !== grant.scope ||
              !current(snapshot, signal) || revisionOf(snapshot.doc) !== args.expectedRevision || used) return stale;
            if (submitting) return browserToolFailure('proposal_pending', 'A browser proposal is already being evaluated.');
            const target = browserExtrudeTarget(snapshot.doc, snapshot.bodies);
            if (!target || target.body !== args.body || target.height === args.height)
              return browserToolFailure('extrude_unavailable', 'Choose the current rectangular body and a different distance.');
            submitting = true;
            try {
              const { doc, bodies } = snapshot;
              const outcome = await proposeBrowserExtrude({ doc, bodies, approvalRequired: true }, args, evaluateWith.evaluate).catch(() => null);
              if (!current(snapshot, signal)) return stale;
              const proposal = outcome?.state.doc.proposals?.at(-1);
              if (!outcome || outcome.isError || !outcome.changed || !proposal)
                return browserToolFailure('proposal_unavailable', 'The Extrude proposal could not be evaluated.');
              if (!live.current.action?.stage(outcome.state.doc)) return stale;
              used = true;
              live.current.active = false;
              setGrant(undefined);
              return { proposal: proposal.id, applied: false, revision: args.expectedRevision };
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
  }, [active, api, grant]);

  if (!api || !owner || !scope || !readShared || (!target && !enabled)) return;
  return {
    enabled, ready, failed,
    toggle() {
      if (enabled) live.current.active = false;
      setFailed(false);
      setGrant(enabled ? undefined : { owner, scope });
    },
  };
}
