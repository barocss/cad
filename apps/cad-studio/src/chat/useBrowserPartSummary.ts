import { useLayoutEffect, useRef, useState } from 'react';
import { runTool } from '@barocss/cad-model/chat/tools';
import { matchesFaceName } from '@barocss/cad-model/chat/names';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { revisionOf } from '@barocss/cad-model/util/revision';
import { browserBodyField, browserRevisionField, browserToolFailure as readFailure, modelContext, plainInput,
  validBrowserBody, validBrowserRevision } from './browserModelContext';

export interface BrowserPartSummarySource {
  doc: StudioDoc;
  scope: object;
  bodies: BodyResult[];
  ready: boolean;
  isCurrent(): boolean;
}

interface PartSummary {
  feature_count: number;
  bodies: { key: string; volume: number | null; bounds: { min: number[]; max: number[] }; face_count: number; edge_count: number }[];
}

const directions = {
  left: ['x', -1], right: ['x', 1], front: ['y', -1],
  back: ['y', 1], bottom: ['z', -1], top: ['z', 1],
} as const;
type Direction = keyof typeof directions;
type PlaneMeasurement = { body: string; first: Direction; second: Direction; expectedRevision: string };

function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && Object.hasOwn(directions, value);
}

function planeMeasurement(input: unknown): PlaneMeasurement | undefined {
  if (!plainInput(input) || Reflect.ownKeys(input).length !== 4 ||
    !['body', 'first', 'second', 'expectedRevision'].every(key => Object.hasOwn(input, key))) return;
  const { body, first, second, expectedRevision } = input;
  if (validBrowserBody(body) && isDirection(first) && isDirection(second) && first !== second &&
    validBrowserRevision(expectedRevision))
    return { body, first, second, expectedRevision };
}

function planeName(body: BodyResult, direction: Direction) {
  const [axis, sign] = directions[direction];
  const faces = body.mesh.faces.filter(face => face.nativePlaneName && face.nativeAlignFace?.axis === axis && face.nativeAlignFace.sign === sign);
  const name = faces.length === 1 ? faces[0].nativePlaneName : undefined;
  if (name && body.mesh.faces.filter(face => matchesFaceName(face, name)).length === 1) return name;
}

async function readPart(doc: StudioDoc, bodies: BodyResult[], query: Record<string, unknown>) {
  const outcome = await runTool({ doc, bodies, approvalRequired: true }, 'query', query, async () => null).catch(() => null);
  if (!outcome || outcome.isError || outcome.changed || outcome.state.doc !== doc ||
    outcome.content.length > 65_536 || new TextEncoder().encode(outcome.content).byteLength > 65_536) return;
  return outcome.content;
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
    const stale = readFailure('stale_part', 'The shared CAD part is no longer current.');
    const startRead = (signal?: AbortSignal) => {
      const snapshot = live.current.source;
      if (snapshot && snapshot.doc === owner && snapshot.scope === scope && current(snapshot, signal)) return snapshot;
    };
    const register = async () => {
      try {
        await api.registerTool({
          name: 'cad_part_summary',
          description: 'Read the active CAD part revision, body IDs, volumes, bounds and topology counts in millimetres.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true },
          async execute(input, options) {
            if (!plainInput(input) || Reflect.ownKeys(input).length)
              return readFailure('invalid_arguments', 'The CAD part summary takes no arguments.');
            const snapshot = startRead(options?.signal);
            if (!snapshot) return stale;
            const { doc, bodies } = snapshot;
            const content = await readPart(doc, bodies, QUERY);
            if (!current(snapshot, options?.signal)) return stale;
            if (!content) return readFailure('summary_unavailable', 'The current CAD part summary is unavailable.');
            const summary = JSON.parse(content) as PartSummary;
            return { revision: revisionOf(doc), units: 'mm', featureCount: summary.feature_count,
              bodies: summary.bodies.map(({ key, volume, bounds, face_count, edge_count }) => ({
                key, volume, bounds, faceCount: face_count, edgeCount: edge_count,
              })) };
          },
        }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        await api.registerTool({
          name: 'cad_part_measure_planes',
          description: 'Measure two unique original cardinal faces on one body of the shared part. Get the body key and revision from cad_part_summary.',
          inputSchema: { type: 'object', properties: {
            body: browserBodyField,
            first: { type: 'string', enum: Object.keys(directions) },
            second: { type: 'string', enum: Object.keys(directions) },
            expectedRevision: browserRevisionField,
          }, required: ['body', 'first', 'second', 'expectedRevision'], additionalProperties: false },
          annotations: { readOnlyHint: true },
          async execute(input, options) {
            const args = planeMeasurement(input);
            if (!args) return readFailure('invalid_arguments', 'Give a body key, two distinct face directions and the expected part revision.');
            const snapshot = startRead(options?.signal);
            if (!snapshot) return stale;
            const revision = revisionOf(snapshot.doc);
            if (args.expectedRevision !== revision) return stale;
            const body = snapshot.bodies.find(body => body.key === args.body);
            const a = body && planeName(body, args.first), b = body && planeName(body, args.second);
            if (!body || !a || !b || a === b)
              return readFailure('planes_unavailable', 'Both directions must identify one original planar face on the chosen body.');
            const content = await readPart(snapshot.doc, [body], { action: 'measure', a, b });
            if (!current(snapshot, options?.signal)) return stale;
            if (!content) return readFailure('measure_unavailable', 'The current planar faces could not be measured.');
            const measurement = JSON.parse(content) as { distance: number; angle?: number; normalDistance?: number };
            if (!Number.isFinite(measurement.distance))
              return readFailure('measure_unavailable', 'The current planar faces could not be measured.');
            return { revision, body: body.key, faces: [a, b], units: 'mm', distance: measurement.distance,
              normalDistance: measurement.normalDistance ?? null, angleDegrees: measurement.angle ?? null };
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
