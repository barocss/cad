import { useLayoutEffect, useRef, useState } from 'react';
import { runTool } from '@barocss/cad-model/chat/tools';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { revisionOf } from '@barocss/cad-model/util/revision';

export interface BrowserPartSummarySource {
  doc: StudioDoc;
  scope: object;
  bodies: BodyResult[];
  ready: boolean;
  isCurrent(): boolean;
}

interface ModelContext {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, never>; additionalProperties: false };
    annotations: { readOnlyHint: true };
    execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  }, options: { signal: AbortSignal }): Promise<void>;
}

interface PartSummary {
  feature_count: number;
  bodies: { key: string; volume: number | null; bounds: { min: number[]; max: number[] }; face_count: number; edge_count: number }[];
}

function modelContext() {
  if (!window.isSecureContext) return;
  try {
    const api = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (typeof api?.registerTool === 'function') return api;
  } catch {
    // A browser or its Permissions Policy can deny access to the API.
  }
}

function emptyInput(input: unknown) {
  if (typeof input !== 'object' || input === null || Reflect.ownKeys(input).length) return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

const QUERY = { action: 'summary', response_format: 'concise' };

export function useBrowserPartSummary(source: BrowserPartSummarySource | undefined) {
  const api = modelContext();
  const owner = source?.doc, scope = source?.scope;
  const [grant, setGrant] = useState({ owner, scope, enabled: false });
  const [failedOwner, setFailedOwner] = useState<StudioDoc>();
  const sameGrant = grant.owner === owner && grant.scope === scope;
  if (!sameGrant) {
    setGrant({ owner, scope, enabled: false });
    if (failedOwner) setFailedOwner(undefined);
  }
  const enabled = !!owner && sameGrant && grant.enabled;
  const active = !!api && enabled && !!source?.ready;
  const live = useRef({ source, active });
  live.current = { source, active };

  useLayoutEffect(() => {
    if (!active || !api || !owner) return;
    const controller = new AbortController();
    const current = (snapshot: BrowserPartSummarySource, signal?: AbortSignal) =>
      !signal?.aborted && !controller.signal.aborted && live.current.active &&
      live.current.source?.doc === snapshot.doc && live.current.source.scope === snapshot.scope &&
      live.current.source.bodies === snapshot.bodies && snapshot.isCurrent();
    const register = async () => {
      try {
        await api.registerTool({
          name: 'cad_part_summary',
          description: 'Read the active CAD part revision, body IDs, volumes, bounds and topology counts in millimetres.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true },
          async execute(input, options) {
            if (!emptyInput(input)) return { error: { code: 'invalid_arguments', message: 'The CAD part summary takes no arguments.' } };
            const stale = { error: { code: 'stale_part', message: 'The shared CAD part is no longer current.' } };
            const snapshot = live.current.source;
            if (!snapshot || snapshot.doc !== owner || snapshot.scope !== scope || !current(snapshot, options?.signal)) return stale;
            const { doc, bodies } = snapshot;
            const outcome = await runTool({ doc, bodies, approvalRequired: true }, 'query', QUERY, async () => null).catch(() => null);
            if (!current(snapshot, options?.signal)) return stale;
            if (!outcome || outcome.isError || outcome.changed || outcome.state.doc !== doc ||
              outcome.content.length > 65_536 || new TextEncoder().encode(outcome.content).byteLength > 65_536)
              return { error: { code: 'summary_unavailable', message: 'The current CAD part summary is unavailable.' } };
            const summary = JSON.parse(outcome.content) as PartSummary;
            return { revision: revisionOf(doc), units: 'mm', featureCount: summary.feature_count,
              bodies: summary.bodies.map(({ key, volume, bounds, face_count, edge_count }) => ({
                key, volume, bounds, faceCount: face_count, edgeCount: edge_count,
              })) };
          },
        }, { signal: controller.signal });
      } catch {
        if (!controller.signal.aborted) {
          controller.abort();
          setFailedOwner(owner);
          setGrant(current => current.owner === owner && current.scope === scope ? { owner, scope, enabled: false } : current);
        }
      }
    };
    void register();
    return () => controller.abort();
  }, [active, api, owner, scope]);

  if (!api || !source) return;
  return {
    enabled,
    failed: sameGrant && !!owner && failedOwner === owner,
    ready: source.ready,
    toggle: () => {
      if (enabled) live.current.active = false;
      setFailedOwner(undefined);
      setGrant({ owner, scope, enabled: !enabled });
    },
  };
}
