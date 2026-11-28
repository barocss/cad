import { useCallback, useRef, useState } from 'react';
import { collectRecoveryBlobs, loadRecoveryBlobs } from '@barocss/cad-model/engine/blobs';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { OpenIntentBridge, OpenScope } from '../state/openOwnership';
import { scheduleProjectOpenFit } from './projectOpenFit';
import { clearRecovery, offerRecovery, settleRecovery, type Recovery } from './recovery';

interface RecoveryActionsOptions {
  offer: Recovery | null;
  pending: { current: OpenScope | null };
  owner: Required<OpenIntentBridge>;
  blocked(action: string): boolean;
  replace(doc: StudioDoc): boolean;
  dirtyDocument(): StudioDoc | null;
  setFileName(name: string): void;
  dismiss(): void;
  fit(): void;
  notice(error: FriendlyError): void;
}

export function useStudioRecoveryOffer() {
  const [offer, setOffer] = useState(offerRecovery);
  const pending = useRef<OpenScope | null>(null);
  const dismiss = useCallback(() => { pending.current = null; setOffer(null); }, []);
  return { offer, pending, dismiss };
}

/** A recovery read owns its result only while both the offer and document intent are current. */
export function createStudioRecoveryActions(options: RecoveryActionsOptions) {
  const { offer, pending, owner } = options;
  return {
    restore: async () => {
      if (!offer || options.blocked('restoring unsaved work')) return;
      const scope = owner.onOpenIntent();
      pending.current = scope;
      const missing = await loadRecoveryBlobs(offer.doc);
      if (pending.current !== scope) return;
      pending.current = null;
      if (!owner.isOpenCurrent(scope)) return;
      if (missing.length) {
        options.notice({ title: 'Could not restore',
          hint: `The copy's mesh data is gone from this browser (${missing.length} array${missing.length > 1 ? 's' : ''}). Open the mesh file again.`, detail: '' });
        clearRecovery();
        options.dismiss();
        return;
      }
      if (!options.replace(offer.doc)) return;
      options.setFileName(offer.fileName);
      settleRecovery();
      options.dismiss();
      scheduleProjectOpenFit(owner.currentOpenScope(), owner.isOpenCurrent, options.fit);
    },
    discard: () => {
      settleRecovery();
      options.dismiss();
      void collectRecoveryBlobs(options.dirtyDocument());
    },
  };
}
