import type { ReactNode } from 'react';
import { ToolIconButton } from '@/components/ui/tool-button';
import type { Recovery } from '../app/recovery';
import type { StudioNotice } from '../app/studioNotice';
import { Icon } from './atoms';

interface StudioNoticeStackProps {
  recovery: Pick<Recovery, 'savedAt' | 'fileName'> | null;
  notice: StudioNotice | null;
  restoreRecovery(): void;
  discardRecovery(): void;
  dismissNotice?(): void;
  children: ReactNode;
}

export function StudioNoticeStack({ recovery, notice, restoreRecovery, discardRecovery, dismissNotice, children }: StudioNoticeStackProps) {
  return <div className="toast-stack">
    {recovery && <div className="toast card recovery" role="dialog" aria-label="Recover unsaved work">
      <Icon name="history" className="accent" />
      <div>
        <div className="toast-title">Unsaved work from {new Date(recovery.savedAt).toLocaleString()}</div>
        <div className="toast-hint">“{recovery.fileName}” was not saved. Restore it, or discard the copy.</div>
        <div className="row-actions">
          <button className="primary" onClick={restoreRecovery}>Restore</button>
          <button className="ghost" onClick={discardRecovery}>Discard</button>
        </div>
      </div>
    </div>}
    {children}
    {notice && <div className="toast card" role="alert">
      <Icon name="info" className="accent" />
      <div>
        <div className="toast-title">{notice.title}</div>
        <div className="toast-hint">{notice.hint}</div>
        {notice.detail && <details><summary>Details</summary><code>{notice.detail}</code></details>}
        {notice.action && <div className="row-actions"><button className="ghost" onClick={notice.action.run}>{notice.action.label}</button></div>}
      </div>
      {dismissNotice && <ToolIconButton aria-label="Dismiss" onClick={dismissNotice}><Icon name="close" small /></ToolIconButton>}
    </div>}
  </div>;
}
