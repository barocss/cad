import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { modelHash } from '@barocss/cad-model/chat/spec';
import { versionsOf } from '@barocss/cad-model/versions/log';
import type { EngineClient, ProposalOverlay } from '../engine/client';
import type { Lanes } from '../engine/lanes';
import type { ProjectView } from './useProject';

type ComparedVersion = { id: string; doc: StudioDoc; snapshot: string };
export type VersionComparison = ComparedVersion & {
  store: NonNullable<ProjectView['store']>; path: string;
  target?: ComparedVersion;
};

/** A version belongs to the comparison only while its project source and snapshot match. */
export function currentComparisonVersion(view: ProjectView, comparing: VersionComparison | null, list?: ReturnType<typeof versionsOf>) {
  if (!comparing || !view.log || comparing.store !== view.store || comparing.path !== view.part) return undefined;
  return (list ?? versionsOf(view.log)).find(item => item.id === comparing.id && item.snapshot === comparing.snapshot);
}

export function useWorkingVersionComparison(doc: StudioDoc, view: ProjectView, engine: EngineClient, lanes: Lanes, revision: RefObject<number>) {
  const [compareBase, setCompareBase] = useState<VersionComparison | null>(null);
  const [versionDiff, setVersionDiff] = useState<{ source: VersionComparison; doc: StudioDoc; overlay: ProposalOverlay } | null>(null);
  const workingComparison = useMemo(() => compareBase && !compareBase.target && currentComparisonVersion(view, compareBase) ? compareBase : null,
    [compareBase, view]);

  useEffect(() => {
    if (!workingComparison) { setVersionDiff(null); return; }
    const at = revision.current++, key = `version:${workingComparison.id}`;
    void lanes.run('version-diff', { revision: at, source: key },
      () => engine.proposalDiff(workingComparison.doc, doc, at, { revision: modelHash(doc), proposal: key }))
      .then(reply => { if (!reply.stale) setVersionDiff('error' in reply.result ? null : { source: workingComparison, doc, overlay: reply.result }); });
    return () => lanes.cancel('version-diff');
  }, [workingComparison, doc, engine, lanes, revision]);

  const compareOverlay = versionDiff?.source === workingComparison && versionDiff.doc === doc ? versionDiff.overlay : null;
  return { compareBase, setCompareBase, workingComparison, compareOverlay };
}
