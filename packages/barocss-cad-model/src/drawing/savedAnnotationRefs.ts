/**
 * Raw saved drawing annotation reference admission (D2019, #242).
 *
 * Rejects malformed `sig` or `near` vectors on persisted drawing annotation references
 * (`arcCenterlines`, `centerMarkGroups`, `bisectorCenterlines`, `virtualSharps`, `ordinateGroups`)
 * with an explicit `DRAWING_OPTIONS` problem before `readDrawing` runs, preventing runtime
 * crashes such as `sig.p is not iterable` while preserving the currently open document.
 */
import { problem, type Problem } from '../engine/refusal';
import { isVec3 } from '../util/guards';
import { sigOk } from './types';

const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

function checkRef(raw: unknown, label: string): Problem | null {
  if (!isRecord(raw)) return null;
  if (Object.hasOwn(raw, 'near') && raw.near !== undefined && !isVec3(raw.near)) {
    return problem('DRAWING_OPTIONS', `Drawing annotation ${label} has an invalid near point (expected three finite coordinates). The original drawing is unchanged.`);
  }
  if (Object.hasOwn(raw, 'sig') && raw.sig !== undefined && !sigOk(raw.sig)) {
    return problem('DRAWING_OPTIONS', `Drawing annotation ${label} has an invalid reference signature (sig requires k, finite 3D p, finite s, and optional finite 3D d). The original drawing is unchanged.`);
  }
  if (Object.hasOwn(raw, 'second') && raw.second !== undefined) {
    const nested = checkRef(raw.second, `${label}.second`);
    if (nested) return nested;
  }
  if (Array.isArray(raw.ring)) {
    for (let i = 0; i < raw.ring.length; i++) {
      const nested = checkRef(raw.ring[i], `${label}.ring[${i}]`);
      if (nested) return nested;
    }
  }
  return null;
}

export function checkSavedAnnotationRefs(raw: unknown): Problem[] {
  if (!isRecord(raw)) return [];
  const pairLists = ['arcCenterlines', 'bisectorCenterlines', 'virtualSharps'] as const;
  for (const key of pairLists) {
    const list = raw[key];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!isRecord(item)) continue;
      for (const side of ['first', 'second'] as const) {
        const issue = checkRef(item[side], `${key}[${i}].${side}`);
        if (issue) return [issue];
      }
    }
  }
  if (Array.isArray(raw.centerMarkGroups)) {
    for (let i = 0; i < raw.centerMarkGroups.length; i++) {
      const item = raw.centerMarkGroups[i];
      if (!isRecord(item) || !Array.isArray(item.members)) continue;
      for (let j = 0; j < item.members.length; j++) {
        const issue = checkRef(item.members[j], `centerMarkGroups[${i}].members[${j}]`);
        if (issue) return [issue];
      }
    }
  }
  if (Array.isArray(raw.ordinateGroups)) {
    for (let i = 0; i < raw.ordinateGroups.length; i++) {
      const item = raw.ordinateGroups[i];
      if (!isRecord(item)) continue;
      const originIssue = checkRef(item.origin, `ordinateGroups[${i}].origin`);
      if (originIssue) return [originIssue];
      if (!Array.isArray(item.members)) continue;
      for (let j = 0; j < item.members.length; j++) {
        const m = item.members[j];
        if (!isRecord(m)) continue;
        const memberIssue = checkRef(m.point, `ordinateGroups[${i}].members[${j}].point`);
        if (memberIssue) return [memberIssue];
      }
    }
  }
  if (Array.isArray(raw.holeTables)) {
    for (let i = 0; i < raw.holeTables.length; i++) {
      const item = raw.holeTables[i];
      if (!isRecord(item)) continue;
      const originIssue = checkRef(item.origin, `holeTables[${i}].origin`);
      if (originIssue) return [originIssue];
      if (!Array.isArray(item.members)) continue;
      for (let j = 0; j < item.members.length; j++) {
        const m = item.members[j];
        if (!isRecord(m)) continue;
        const rimIssue = checkRef(m.rim, `holeTables[${i}].members[${j}].rim`);
        if (rimIssue) return [rimIssue];
      }
    }
  }
  if (Object.hasOwn(raw, 'revisionMarkers') && raw.revisionMarkers !== undefined) {
    if (!Array.isArray(raw.revisionMarkers)) {
      return [problem('DRAWING_OPTIONS', 'Drawing revisionMarkers must be an array. The original drawing is unchanged.')];
    }
    const seenIds = new Set<string>();
    for (let i = 0; i < raw.revisionMarkers.length; i++) {
      const item = raw.revisionMarkers[i];
      if (!isRecord(item)) {
        return [problem('DRAWING_OPTIONS', `Drawing revisionMarkers[${i}] must be an object. The original drawing is unchanged.`)];
      }
      if (typeof item.id !== 'string' || !item.id.trim() || seenIds.has(item.id)) {
        return [problem('DRAWING_OPTIONS', `Drawing revisionMarkers[${i}] needs a unique non-empty id. The original drawing is unchanged.`)];
      }
      seenIds.add(item.id);
      if (typeof item.revision !== 'string' || !item.revision.trim() || item.revision.length > 6 || /[\r\n\t]/.test(item.revision)) {
        return [problem('DRAWING_OPTIONS', `Drawing revisionMarkers[${i}] needs a valid revision label (1–6 single-line characters). The original drawing is unchanged.`)];
      }
      if (typeof item.sheet !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(item.sheet)) {
        return [problem('DRAWING_OPTIONS', `Drawing revisionMarkers[${i}] needs a valid sheet id. The original drawing is unchanged.`)];
      }
      if (!Array.isArray(item.at) || item.at.length !== 2 || typeof item.at[0] !== 'number' || !Number.isFinite(item.at[0]) || typeof item.at[1] !== 'number' || !Number.isFinite(item.at[1])) {
        return [problem('DRAWING_OPTIONS', `Drawing revisionMarkers[${i}] needs finite [x, y] sheet mm coordinates. The original drawing is unchanged.`)];
      }
      if (item.hidden !== undefined && item.hidden !== true) {
        return [problem('DRAWING_OPTIONS', `Drawing revisionMarkers[${i}].hidden must be true when present. The original drawing is unchanged.`)];
      }
    }
  }
  return [];
}
