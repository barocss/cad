import type { ComponentProps } from 'react';
import { annotationCounts, printPreviewSummary } from '../app/previewStatus';
import { AnalysisPanel } from '../viewport/AnalysisPanel';
import { CamPanel } from '../viewport/CamPanel';
import { ClearancePanel } from '../viewport/ClearancePanel';
import { PrintPanel } from '../viewport/PrintPanel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DockSection } from './DockSection';

/** The viewport's previews: one at a time (G12c). */
export type PreviewMode = 'none' | 'cnc' | 'print' | 'clearance' | 'analysis';
export const PREVIEW_MODES: { id: PreviewMode; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'cnc', label: 'CNC' }, { id: 'print', label: 'Print' }, { id: 'clearance', label: 'Clearance' }, { id: 'analysis', label: 'Analysis' },
];

interface AnnotationPreview {
  enabled: boolean;
  onEnabledChange(enabled: boolean): void;
  reason?: string;
  error: string | null;
  busy: boolean;
  items: readonly { id: string; text: readonly string[] }[] | null;
  sheetOnly?: number;
  selected: string | null;
}

interface PreviewSectionProps {
  mode: PreviewMode;
  onMode(mode: PreviewMode): void;
  print: ComponentProps<typeof PrintPanel>;
  cam: ComponentProps<typeof CamPanel>;
  clearance: ComponentProps<typeof ClearancePanel>;
  analysis: ComponentProps<typeof AnalysisPanel>;
  annotations: AnnotationPreview;
}

/** The selected preview owns the contents. Suspended annotations remain visible when collapsed. */
export function PreviewSection({ mode, onMode, print, cam, clearance, analysis, annotations }: PreviewSectionProps) {
  const label = PREVIEW_MODES.find(m => m.id === mode)?.label ?? 'None';
  const summary = mode === 'print' ? printPreviewSummary(print.reason, print.state.stage, print.state.error) : label;
  const panel = mode === 'print' ? <PrintPanel {...print} />
    : mode === 'cnc' ? <CamPanel {...cam} />
    : mode === 'clearance' ? <ClearancePanel {...clearance} />
    : mode === 'analysis' ? <AnalysisPanel {...analysis} />
    : null;
  const overlay = <label className="overlay-toggle" title="Drawing annotations in Model view; hidden while editing or showing Print/CNC">
    <input type="checkbox" checked={annotations.enabled} aria-label="3D annotations" onChange={event => annotations.onEnabledChange(event.target.checked)} /> 3D annotations
  </label>;
  const overlayStatus = annotations.enabled && <div role="status" className="overlay-status">
    {annotations.reason ?? annotations.error ?? (annotations.busy || annotations.sheetOnly === undefined
      ? "Pending · building the drawing's sheet"
      : `${annotationCounts(annotations.items?.length ?? 0, annotations.sheetOnly)}${annotations.selected ? ` · ${annotations.items?.find(item => item.id === annotations.selected)?.text.join(' ') ?? ''}` : ''}`)}
  </div>;
  return <DockSection id="preview" title="Preview & analysis" summary={summary} summaryCollapsedOnly actions={overlay} status={annotations.reason ? overlayStatus : undefined}>
    <ToggleGroup type="single" value={mode} onValueChange={v => onMode((v || 'none') as PreviewMode)} aria-label="Preview mode" className="preview-modes">
      {PREVIEW_MODES.map(m => <ToggleGroupItem key={m.id} value={m.id} aria-label={'Preview: ' + m.label}>{m.label}</ToggleGroupItem>)}
    </ToggleGroup>
    {mode !== 'none' && panel}
    {!annotations.reason && overlayStatus}
  </DockSection>;
}
