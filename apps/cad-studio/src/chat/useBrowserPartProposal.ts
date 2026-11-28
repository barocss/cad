import { useLayoutEffect, useRef, useState } from 'react';
import { CadPartLimits } from '@barocss/cad';
import { browserBoxReferenceSides, browserBoxWidthTargets, browserCylinderTarget, browserExtrudeTarget, browserProposalMinimum,
  canProposeBrowserPrimitive, isBrowserBoxReferenceSide,
  validBoxDimension, validClosedShellDimensions, validCylinderRadius, validExtrudeDistance, validHoleDiameter, validShellThickness } from '@barocss/cad-model/chat/browserProposalTargets';
import { proposeBrowserBox, proposeBrowserBoxWidth, proposeBrowserClosedShell, proposeBrowserCylinder, proposeBrowserExtrude, proposeBrowserHole, type ChatState, type Evaluate } from '@barocss/cad-model/chat/tools';
import { revisionOf } from '@barocss/cad-model/util/revision';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { browserBodyField, browserRevisionField, browserToolFailure, modelContext, plainInput,
  validBrowserBody, validBrowserRevision, type InputProperty } from './browserModelContext';
import type { BrowserPartSummarySource } from './useBrowserPartSummary';

export interface BrowserPartProposalSource {
  isIdle(): boolean;
  evaluate: Evaluate;
  stage(next: StudioDoc): boolean;
}

const distanceField = { type: 'number', maximum: CadPartLimits.length } as const;
const primitiveDimensionField = { ...distanceField, minimum: browserProposalMinimum.primitiveDimension };
const holeDiameterField = { ...distanceField, minimum: browserProposalMinimum.holeDiameter };
const shellThicknessField = { ...distanceField, minimum: browserProposalMinimum.shellThickness };
const proposalTimeoutMs = 30_000;
const proposalTools = {
  Box: {
    name: 'cad_part_propose_box',
    description: 'Propose the first Box at the origin of the shared empty part. Give its width, depth and height in millimetres and the revision from cad_part_summary. A person decides in Studio.',
    fields: { width: primitiveDimensionField, depth: primitiveDimensionField, height: primitiveDimensionField, expectedRevision: browserRevisionField },
    invalid: 'Give numeric width, depth and height of at least 1 mm and the expected revision.',
    title: 'Allow one browser proposal for the first Box',
  },
  Cylinder: {
    name: 'cad_part_propose_cylinder',
    description: 'Propose the first Cylinder at the origin of the shared empty part. Give its radius and height in millimetres and the revision from cad_part_summary. A person decides in Studio.',
    fields: { radius: { ...distanceField, minimum: browserProposalMinimum.cylinderRadius }, height: primitiveDimensionField,
      expectedRevision: browserRevisionField },
    invalid: 'Give a numeric radius of at least 0.5 mm, a numeric height of at least 1 mm and the expected revision.',
    title: 'Allow one browser proposal for the first Cylinder',
  },
  Extrude: {
    name: 'cad_part_propose_extrude',
    description: 'Propose a positive distance in millimetres for the shared rectangular or circular Extrude. A Box or Cylinder requires at least 1 mm. Use the body key and revision from cad_part_summary. A person decides in Studio.',
    fields: { body: browserBodyField, height: { ...distanceField, exclusiveMinimum: 0 }, expectedRevision: browserRevisionField },
    invalid: 'Give a body key, a positive numeric distance in millimetres and the expected revision.',
    title: 'Allow one browser proposal for this part’s Extrude distance',
  },
  Hole: {
    name: 'cad_part_propose_hole',
    description: 'Propose one centred axial through Hole on the shared standalone Cylinder. Give the body key and revision from cad_part_summary and a diameter in millimetres smaller than the outside diameter. A person decides in Studio.',
    fields: { body: browserBodyField, diameter: holeDiameterField, expectedRevision: browserRevisionField },
    invalid: 'Give a body key, a numeric diameter of at least 0.5 mm and the expected revision.',
    title: 'Allow one browser proposal for a centred through Hole',
  },
  'Box width': {
    name: 'cad_part_propose_box_width_match',
    description: 'Propose matching the first original Box’s right side to the left or right side of the second original Box. Use both body keys and the revision from cad_part_summary. A person decides in Studio.',
    fields: { body: browserBodyField, referenceBody: browserBodyField,
      referenceSide: { type: 'string' as const, enum: [...browserBoxReferenceSides] }, expectedRevision: browserRevisionField },
    invalid: 'Give the source and reference body keys, the reference side left or right, and the expected revision.',
    title: 'Allow one browser proposal to match Box width',
  },
  Shell: {
    name: 'cad_part_propose_closed_shell',
    description: 'Propose one closed Shell on the shared standalone Cylinder. Give the body key and revision from cad_part_summary and independent wall, floor and ceiling thicknesses in millimetres. A person decides in Studio.',
    fields: { body: browserBodyField, wall: shellThicknessField, floor: shellThicknessField,
      ceiling: shellThicknessField, expectedRevision: browserRevisionField },
    invalid: 'Give a body key, numeric wall, floor and ceiling thicknesses of at least 0.1 mm and the expected revision.',
    title: 'Allow one browser proposal for a closed Cylinder Shell',
  },
};
type ProposalKind = keyof typeof proposalTools;
const emptyPartKinds = ['Box', 'Cylinder'] as const;
const extrusionKinds = ['Extrude'] as const;
const boxWidthKinds = ['Box width'] as const;
const cylinderKinds = ['Extrude', 'Hole', 'Shell'] as const;
type Grant = { owner: StudioDoc; scope: object; kind: ProposalKind };

function cancellableEvaluation(evaluate: Evaluate, signal: AbortSignal): Evaluate {
  return async (doc, screwWinding) => {
    if (signal.aborted) return null;
    let cancel!: () => void;
    const stopped = new Promise<null>(resolve => { cancel = () => resolve(null); });
    signal.addEventListener('abort', cancel, { once: true });
    try {
      return await Promise.race([evaluate(doc, screwWinding), stopped]);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  };
}

function proposalInput(kind: ProposalKind, input: unknown, required: readonly string[]) {
  if (!plainInput(input) || Reflect.ownKeys(input).length !== required.length ||
    !required.every(key => Object.hasOwn(input, key))) return;
  const { body, referenceBody, referenceSide, width, depth, radius, height, diameter, wall, floor, ceiling, expectedRevision } = input;
  if (!validBrowserRevision(expectedRevision)) return;
  if (kind === 'Box') {
    if (validBoxDimension(width) && validBoxDimension(depth) && validBoxDimension(height))
      return { kind, args: { width, depth, height, expectedRevision } };
  } else if (kind === 'Cylinder') {
    if (validCylinderRadius(radius) && validBoxDimension(height))
      return { kind, args: { radius, height, expectedRevision } };
  } else if (validBrowserBody(body)) {
    if (kind === 'Box width' && validBrowserBody(referenceBody) && isBrowserBoxReferenceSide(referenceSide))
      return { kind, args: { body, referenceBody, referenceSide, expectedRevision } };
    if (kind === 'Extrude' && validExtrudeDistance(height)) return { kind, args: { body, height, expectedRevision } };
    if (kind === 'Hole' && validHoleDiameter(diameter)) return { kind, args: { body, diameter, expectedRevision } };
    if (kind === 'Shell' && validShellThickness(wall) && validShellThickness(floor) && validShellThickness(ceiling))
      return { kind, args: { body, wall, floor, ceiling, expectedRevision } };
  }
}

export function useBrowserPartProposal(source: BrowserPartSummarySource | undefined,
  action: BrowserPartProposalSource | undefined, readShared: boolean) {
  const api = modelContext();
  const owner = source?.doc, scope = source?.scope;
  const [grant, setGrant] = useState<Grant>();
  const [failedGrant, setFailedGrant] = useState<Grant>();
  const [pendingCall, setPendingCall] = useState<{ grant: Grant }>();
  const enabled = !!grant;
  const same = grant?.owner === owner && grant?.scope === scope;
  const failed = !!failedGrant && failedGrant.owner === owner && failedGrant.scope === scope && readShared;
  if (grant && (!same || !readShared)) setGrant(undefined);
  if (failedGrant && !failed) setFailedGrant(undefined);
  const kinds: readonly ProposalKind[] | undefined = source && (canProposeBrowserPrimitive(source.doc, source.bodies) ? emptyPartKinds :
    browserBoxWidthTargets(source.doc, source.bodies) ? boxWidthKinds :
      browserCylinderTarget(source.doc, source.bodies) ? cylinderKinds :
      browserExtrudeTarget(source.doc, source.bodies) ? extrusionKinds : undefined);
  const kind = grant?.kind;
  const ready = !!source?.ready && !!action;
  const active = enabled && same && readShared && ready && !!kind && !!kinds?.includes(kind);
  const live = useRef({ source, action, grant, active });
  live.current = { source, action, grant, active };

  useLayoutEffect(() => {
    if (!active || !api || !grant || !kind) return;
    const tool = proposalTools[kind];
    const fields: Record<string, InputProperty> = { ...tool.fields };
    const registrationSource = live.current.source;
    if (kind === 'Extrude' && registrationSource &&
      browserExtrudeTarget(registrationSource.doc, registrationSource.bodies)?.node.made)
      fields.height = primitiveDimensionField;
    if ((kind === 'Hole' || kind === 'Shell') && registrationSource) {
      const target = browserCylinderTarget(registrationSource.doc, registrationSource.bodies);
      if (target && kind === 'Hole') fields.diameter = { ...holeDiameterField, exclusiveMaximum: target.radius * 2 };
      if (target && kind === 'Shell') {
        fields.wall = { ...shellThicknessField, exclusiveMaximum: target.radius };
        fields.floor = fields.ceiling = { ...shellThicknessField, exclusiveMaximum: target.height };
      }
    }
    const required = Object.keys(fields);
    const controller = new AbortController();
    let submitting = false, used = false;
    const stale = browserToolFailure('stale_part', 'The proposal grant or the current part has changed.');
    const current = (snapshot: BrowserPartSummarySource, signal?: AbortSignal) =>
      !signal?.aborted && !controller.signal.aborted && live.current.active && live.current.grant === grant &&
      live.current.source?.doc === snapshot.doc && live.current.source.scope === snapshot.scope &&
      live.current.source.bodies === snapshot.bodies && snapshot.isCurrent() && !!live.current.action?.isIdle();
    const register = async () => {
      try {
        await api.registerTool({
          name: tool.name,
          description: tool.description,
          inputSchema: { type: 'object', properties: fields, required, additionalProperties: false },
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
              if (target.node.made && !validBoxDimension(request.args.height))
                return browserToolFailure('invalid_arguments', 'Give a height of at least 1 mm for a Box or Cylinder.');
            } else if (request.kind === 'Hole' || request.kind === 'Shell') {
              const target = browserCylinderTarget(snapshot.doc, snapshot.bodies);
              if (!target || target.body !== request.args.body)
                return browserToolFailure(request.kind === 'Hole' ? 'hole_unavailable' : 'shell_unavailable', 'Choose the current standalone Cylinder body.');
              if (request.kind === 'Hole' && request.args.diameter / 2 >= target.radius)
                return browserToolFailure('invalid_arguments', 'Give a hole diameter smaller than the Cylinder outside diameter.');
              if (request.kind === 'Shell' && !validClosedShellDimensions(request.args, target))
                return browserToolFailure('invalid_arguments', 'Give wall, floor and ceiling thicknesses that leave a cavity inside the Cylinder.');
            }
            submitting = true;
            const call = { grant };
            setPendingCall(call);
            try {
              const { doc, bodies } = snapshot;
              const state: ChatState = { doc, bodies, approvalRequired: true };
              const deadline = AbortSignal.timeout(proposalTimeoutMs);
              const execution = AbortSignal.any(signal ? [signal, controller.signal, deadline] : [controller.signal, deadline]);
              const evaluate = cancellableEvaluation(evaluateWith.evaluate, execution);
              const pending = request.kind === 'Box' ? proposeBrowserBox(state, request.args, evaluate)
                : request.kind === 'Cylinder' ? proposeBrowserCylinder(state, request.args, evaluate)
                : request.kind === 'Extrude' ? proposeBrowserExtrude(state, request.args, evaluate)
                : request.kind === 'Hole' ? proposeBrowserHole(state, request.args, evaluate)
                : request.kind === 'Box width' ? proposeBrowserBoxWidth(state, request.args, evaluate)
                : proposeBrowserClosedShell(state, request.args, evaluate);
              const outcome = await pending.catch(() => null);
              if (!current(snapshot, signal)) return stale;
              if (deadline.aborted)
                return browserToolFailure('proposal_timeout', 'The proposal timed out. You can try again.');
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
              setPendingCall(previous => previous === call ? undefined : previous);
            }
          },
        }, { signal: controller.signal });
      } catch {
        if (!controller.signal.aborted) {
          controller.abort();
          setFailedGrant(grant);
          setGrant(current => current === grant ? undefined : current);
        }
      }
    };
    void register();
    return () => controller.abort();
  }, [active, api, grant, kind]);

  if (!api || !owner || !scope || !readShared || !kinds) return;
  return {
    options: kinds.map(choice => ({
      kind: choice,
      title: proposalTools[choice].title,
      enabled: same && grant?.kind === choice,
      pending: active && pendingCall?.grant === grant && kind === choice,
    })),
    ready, failed,
    revoke() {
      live.current.active = false;
      setGrant(undefined);
      setFailedGrant(undefined);
    },
    toggle(choice: ProposalKind) {
      if (enabled) live.current.active = false;
      setFailedGrant(undefined);
      setGrant(same && grant?.kind === choice ? undefined : { owner, scope, kind: choice });
    },
  };
}
