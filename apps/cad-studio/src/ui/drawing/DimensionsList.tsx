// The drawing's DIMENSIONS (O16: split from DrawingWorkspace, on shadcn's components): each with its value, kind and view; Auto-dimension.
import { useId } from 'react';
import { dimensionLine } from '@barocss/cad-model/drawing/sheet';
import { presetFor } from '@barocss/cad-model/drawing/standard';
import { isDetailRef, isViewId, type LinearArrowSide, type DrawingSettings } from '@barocss/cad-model/drawing/types';
import type { CrossingBreakCandidate } from '@barocss/cad-model/drawing/crossingBreak';
import type { useDrawingSheet } from '../useDrawingSheet';
import { Icon } from '../atoms';
import { NativeSelect } from '@/components/ui/native-select';
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
  arrowReady?: boolean;
  onArrow?(id: string, side: 'a' | 'b', placement: LinearArrowSide | 'auto'): void;
  crossingBreakReady?: boolean;
  crossingBreakCandidates?: readonly CrossingBreakCandidate[];
  onCrossingBreak?(id: string, overId: string | null, gap?: number): void;
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
  extensionReady = false, arrowReady = false, onArrow, crossingBreakReady = false, crossingBreakCandidates = [], onCrossingBreak,
  onExtension, onExtensionPreview,
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
            {selected === r.dim.id && r.dim.kind === 'linear' && !r.dim.auto && ['front', 'top', 'right'].includes(r.dim.view) && !assembly && onArrow && <div role="group" aria-label={`Arrow placement ${r.dim.id}`} style={{ flexBasis: '100%', order: 2, display: 'flex', gap: 8 }}>
              {(['a', 'b'] as const).map(side => <label key={side} className="small">
                Arrow {side.toUpperCase()}
                <NativeSelect aria-label={`Arrow ${side.toUpperCase()} placement`} value={r.dim.kind === 'linear' ? r.dim.arrowPlacement?.[side] ?? 'auto' : 'auto'}
                  disabled={!r.ok || !arrowReady} onChange={e => {
                    const value = e.currentTarget.value;
                    if (value === 'auto' || value === 'inside' || value === 'outside') onArrow(r.dim.id, side, value);
                  }} onMouseEnter={() => onExtensionPreview?.(side)} onMouseLeave={() => onExtensionPreview?.(null)}
                    onFocus={() => onExtensionPreview?.(side)} onBlur={() => onExtensionPreview?.(null)}>
                  <option value="auto">Auto</option><option value="inside">Inside</option><option value="outside">Outside</option>
                </NativeSelect>
              </label>)}
              {!r.ok && r.dim.arrowPlacement && <span role="status" className="small">The reference is unresolved. The saved arrow placement is retained.</span>}
            </div>}
            {selected === r.dim.id && r.dim.kind === 'linear' && !r.dim.auto && ['front', 'top', 'right'].includes(r.dim.view) && !assembly && onCrossingBreak && (crossingBreakCandidates.length > 0 || !!r.dim.crossingBreak) && (() => {
              const savedBreak = r.dim.crossingBreak;
              const status = sheet?.crossingBreaks?.find(cb => cb.dimId === r.dim.id);
              const candidateIds = new Set(crossingBreakCandidates.map(c => c.id));
              const dimText = (id: string) => {
                const found = sheet?.dimensions.find(x => x.dim.id === id);
                return found?.ok ? `${id} (${dimensionLine(found, presetFor(settings))})` : id;
              };
              return <div role="group" aria-label={`Crossing break ${r.dim.id}`} style={{ flexBasis: '100%', order: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <label className="small">
                  Crossing break
                  <NativeSelect aria-label="Crossing break target" value={savedBreak?.over ?? ''}
                    disabled={!r.ok || !crossingBreakReady} onChange={e => {
                      const next = e.currentTarget.value;
                      onCrossingBreak(r.dim.id, next || null);
                    }}>
                    <option value="">None</option>
                    {crossingBreakCandidates.map(c => <option key={c.id} value={c.id}>{dimText(c.id)}{c.conflict ? ' (breaks over this)' : ''}</option>)}
                    {savedBreak && !candidateIds.has(savedBreak.over) && <option value={savedBreak.over}>{savedBreak.over} (inactive)</option>}
                  </NativeSelect>
                </label>
                {savedBreak && <label className="small">
                  Gap
                  <NativeSelect aria-label="Crossing break gap" value={String(savedBreak.gap)}
                    disabled={!r.ok || !crossingBreakReady} onChange={e => {
                      const parsed = Number(e.currentTarget.value);
                      if (Number.isFinite(parsed)) onCrossingBreak(r.dim.id, savedBreak.over, parsed);
                    }}>
                    {[2, 3, 4, 5].map(mm => <option key={mm} value={String(mm)}>{mm} mm</option>)}
                    {![2, 3, 4, 5].includes(savedBreak.gap) && <option value={String(savedBreak.gap)}>{savedBreak.gap} mm</option>}
                  </NativeSelect>
                </label>}
                {savedBreak && <Button variant="ghost" size="xs" aria-label={`Remove crossing break ${r.dim.id}`} disabled={!crossingBreakReady} onClick={() => onCrossingBreak(r.dim.id, null)}>Clear</Button>}
                {status && status.status !== 'applied' && status.reason && <span role="status" className="small" style={{ flexBasis: '100%' }}>{status.reason}</span>}
              </div>;
            })()}
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
