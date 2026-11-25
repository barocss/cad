// The drawing's DIMENSIONS (O16: split from DrawingWorkspace, on shadcn's components): each with its value, kind and view; Auto-dimension.
import { useId } from 'react';
import { dimensionLine } from '@barocss/cad-model/drawing/sheet';
import { presetFor } from '@barocss/cad-model/drawing/standard';
import { isDetailRef, isViewId, type DrawingSettings } from '@barocss/cad-model/drawing/types';
import type { useDrawingSheet } from '../useDrawingSheet';
import { Icon } from '../atoms';
import { Button } from '@/components/ui/button';

type Sheet = ReturnType<typeof useDrawingSheet>;

export interface DimensionsListProps {
  sheet: Sheet['sheet'];
  views: Sheet['views'];
  layout: Sheet['layout'];
  scope: Sheet['scope'];
  settings: DrawingSettings;
  selected: string | null;
  extensionReady?: boolean;
  onExtension?(id: string, side: 'a' | 'b' | undefined): void;
  onExtensionPreview?(side: 'a' | 'b' | null): void;
  foreshortenMovingId?: string | null;
  onForeshorten?(id: string): void;
  onForeshortenMove?(id: string): void;
  onForeshortenRemove?(id: string): void;
  occurrenceReasons: ReadonlyMap<string, string>;
  onReattach(id: string): void;
  onSelect(id: string): void;
  remove(id: string): void;
  autoDimension(): Promise<void>;
}

export function DimensionsList({
  sheet, views, layout, scope, settings, occurrenceReasons, onReattach, selected, onSelect, remove, autoDimension,
  extensionReady = false, onExtension, onExtensionPreview,
  foreshortenMovingId = null, onForeshorten, onForeshortenMove, onForeshortenRemove,
}: DimensionsListProps) {
  const unavailableReason = useId();
  const assembly = scope.kind === 'assembly';
  const lost = sheet?.dimensions.filter(r => !r.ok) ?? [];
  return <>
        <div className="card-title" style={{ marginTop: 8 }}>DIMENSIONS <span className="muted">{settings.dimensions.length}</span>
          <Button variant="ghost" disabled={!views || !layout} aria-disabled={assembly || undefined} aria-describedby={assembly ? unavailableReason : undefined} className={assembly ? 'opacity-50' : undefined} onClick={() => { if (!assembly) void autoDimension(); }} aria-label="Auto-dimension" data-tip="Auto-dimension" data-tip-desc="Views laid out with room, a scale and sheet that read cleanly, then overall sizes, steps, hole positions and callouts: keeps your dimensions and authored tolerances">Auto</Button></div>
        {assembly && <div id={unavailableReason} className="empty">Auto-dimension needs a part scope.</div>}
        <div className="dw-dims">
          {sheet?.dimensions.map(r => <div key={r.dim.id} className={'dw-dim' + (selected === r.dim.id ? ' sel' : '') + (r.ok ? '' : ' lost')} title={r.ok ? undefined : occurrenceReasons.get(r.dim.id) ?? r.reason} style={{ flexWrap: 'wrap' }}
            >
            <button type="button" className="dw-annotation-select" aria-pressed={selected === r.dim.id}
              onPointerDown={event => {
                // Defer focus/blur until click: tolerance blur can reflow this list
                // between pointerdown and pointerup and otherwise lose the target.
                if (event.button === 0) event.preventDefault();
              }} onClick={event => {
                // Commit the old field before selecting the new dimension. Keyboard
                // activation follows the same path; a cancelled pointer never selects.
                event.currentTarget.focus();
                onSelect(r.dim.id);
              }}>
              <b>{r.ok ? dimensionLine(r, presetFor(settings)) : 'lost'}</b><span>{r.dim.kind === 'linear' ? r.dim.orient : r.dim.kind} · {r.dim.view}</span>
            </button>
            {selected === r.dim.id && r.dim.kind === 'linear' && !r.dim.auto && ['front', 'top', 'right'].includes(r.dim.view) && scope.kind === 'part' && onExtension && <div role="group" aria-label={`Extension lines ${r.dim.id}`} style={{ flexBasis: '100%', order: 2, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <span className="small" style={{ flexBasis: '100%' }}>A and B identify the saved reference endpoints, not left and right.</span>
              {([undefined, 'a', 'b'] as const).map(side => <Button key={side ?? 'both'} variant="ghost" size="xs"
                aria-label={side ? `Hide extension ${side.toUpperCase()}` : 'Show both extension lines'} aria-pressed={r.dim.kind === 'linear' && r.dim.hideExtension === side}
                disabled={!r.ok || !extensionReady} onClick={() => onExtension(r.dim.id, side)}
                onMouseEnter={() => onExtensionPreview?.(side ?? null)} onMouseLeave={() => onExtensionPreview?.(null)}
                onFocus={() => onExtensionPreview?.(side ?? null)} onBlur={() => onExtensionPreview?.(null)}>{side ? `Hide ${side.toUpperCase()}` : 'Both'}</Button>)}
              {!r.ok && <span role="status" className="small">The reference is unresolved. The saved extension setting is retained.</span>}
            </div>}
            {selected === r.dim.id && r.dim.kind === 'radius' && !r.dim.auto && ['front', 'top', 'right'].includes(r.dim.view) && scope.kind === 'part' && onForeshorten && <div role="group" aria-label={`Foreshorten controls ${r.dim.id}`} style={{ flexBasis: '100%', order: 2, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {!r.dim.foreshorten ? (
                <Button variant="ghost" size="xs" aria-label={`Foreshorten radius ${r.dim.id}`} disabled={!r.ok || !extensionReady} onClick={() => onForeshorten(r.dim.id)}>Foreshorten</Button>
              ) : <>
                <Button variant="ghost" size="xs" aria-label={`Move foreshorten origin ${r.dim.id}`} aria-pressed={foreshortenMovingId === r.dim.id} disabled={!r.ok || !extensionReady} onClick={() => onForeshortenMove?.(r.dim.id)}>Move origin</Button>
                <Button variant="ghost" size="xs" aria-label={`Remove foreshorten ${r.dim.id}`} disabled={!r.ok || !extensionReady} onClick={() => onForeshortenRemove?.(r.dim.id)}>Remove foreshorten</Button>
              </>}
              {!r.ok && r.dim.foreshorten && <span role="status" className="small">The reference is unresolved. The saved foreshorten setting is retained.</span>}
            </div>}
            {!r.ok && r.dim.kind === 'diameter' && ((r.dim.view !== 'iso' && isViewId(r.dim.view) && occurrenceReasons.has(r.dim.id))
              || (scope.kind === 'part' && isDetailRef(r.dim.view) && sheet?.details?.some(d => `detail:${d.id}` === r.dim.view)))
              && <Button variant="ghost" size="xs" aria-label={`Reattach diameter ${r.dim.id}`} onClick={() => onReattach(r.dim.id)}>Reattach</Button>}
            <Button variant="ghost" size="xs" aria-label={`Remove dimension ${r.ok ? r.text : r.dim.id}`} onClick={e => { e.stopPropagation(); remove(r.dim.id); }}><Icon name="close" small /></Button>
          </div>)}
          {lost.length > 0 && <div className="empty" style={{ color: 'var(--warn)' }}>{lost.length} dimension{lost.length > 1 ? 's' : ''} lost {lost.length > 1 ? 'their' : 'its'} reference (the part changed).</div>}
        </div>
  </>;
}
