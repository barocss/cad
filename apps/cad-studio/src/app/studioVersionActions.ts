import type { RefObject } from 'react';
import type { Evaluate } from '@barocss/cad-model/chat/tools';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { OpenScope } from '../state/openOwnership';
import type { AttachApprovalEvidence } from '../storage/ApprovedRequirementChecks';
import type { PrepareFaceRepair } from '../storage/SavedFaceReferenceRepair';
import type { createDocumentReplacement } from './documentReplacement';

interface StudioVersionOptions {
  bodies: BodyResult[];
  owner: { doc: RefObject<StudioDoc>; open: RefObject<OpenScope>; projectOpening(): boolean };
  review: { canPrepareFace: boolean; attach?: AttachApprovalEvidence; openChat(): void; evaluate: Evaluate };
  restore: {
    replace: ReturnType<typeof createDocumentReplacement>;
    clearComparison(): void;
    setDirty(value: boolean): void;
    fit(): void;
  };
  commit(next: StudioDoc): boolean;
}

export function createStudioVersionActions({ bodies, owner, review, restore, commit }: StudioVersionOptions) {
  const prepareFaceRepair: PrepareFaceRepair = async (working, repair) => {
    const scope = owner.open.current;
    if (owner.doc.current !== working || owner.projectOpening()) return false;
    const tools = await import('@barocss/cad-model/chat/tools');
    const result = await tools.proposeNestedFaceReferenceRepair({ doc: working, bodies }, repair, review.evaluate);
    if (owner.doc.current !== working || owner.open.current !== scope || owner.projectOpening() || result.isError || !commit(result.state.doc)) return false;
    review.openChat();
    return true;
  };

  const attach = review.attach;
  const attachApprovalEvidence: AttachApprovalEvidence | undefined = attach ? async source => {
    const attached = await attach(source);
    if (attached) review.openChat();
    return attached;
  } : undefined;
  return {
    prepareFaceRepair: review.canPrepareFace ? prepareFaceRepair : undefined,
    attachApprovalEvidence,
    openVersion(next: StudioDoc) {
      restore.replace(next, 'project');
      if (owner.doc.current !== next) return;
      restore.clearComparison();
      restore.setDirty(true);
      setTimeout(restore.fit, 300);
    },
  };
}
