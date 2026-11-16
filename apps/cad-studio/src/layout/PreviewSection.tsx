import type { ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DockSection } from './DockSection';

/** The viewport's previews: one at a time (G12c). */
export type PreviewMode = 'none' | 'cnc' | 'print' | 'clearance' | 'analysis';
export const PREVIEW_MODES: { id: PreviewMode; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'cnc', label: 'CNC' }, { id: 'print', label: 'Print' }, { id: 'clearance', label: 'Clearance' }, { id: 'analysis', label: 'Analysis' },
];

/**
 * The dock's Preview & analysis section (G12c, G12e): the one-at-a-time switch is the previews' enable; under it the chosen
 * preview's settings alone (`panel`). The 3D annotations toggle stays at the header's right (`overlay`);
 * suspended overlay status remains visible even when the section is collapsed.
 */
export function PreviewSection({ mode, onMode, panel, overlay, overlayStatus, summary, overlaySuspended = false }: {
  mode: PreviewMode; onMode(mode: PreviewMode): void; panel: ReactNode; overlay: ReactNode; overlayStatus: ReactNode; summary?: string; overlaySuspended?: boolean;
}) {
  const label = PREVIEW_MODES.find(m => m.id === mode)?.label ?? 'None';
  return <DockSection id="preview" title="Preview & analysis" summary={summary ?? label} summaryCollapsedOnly actions={overlay} status={overlaySuspended ? overlayStatus : undefined}>
    <ToggleGroup type="single" value={mode} onValueChange={v => onMode((v || 'none') as PreviewMode)} aria-label="Preview mode" className="preview-modes">
      {PREVIEW_MODES.map(m => <ToggleGroupItem key={m.id} value={m.id} aria-label={'Preview: ' + m.label}>{m.label}</ToggleGroupItem>)}
    </ToggleGroup>
    {mode !== 'none' && panel}
    {!overlaySuspended && overlayStatus}
  </DockSection>;
}
