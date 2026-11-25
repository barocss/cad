// The drawing's EXPORT (O16: split from DrawingWorkspace, on shadcn's components): SVG, PDF, DXF (2000 or R12), a section's DXF alone.
import { useEffect, useRef } from 'react';
import type { DxfVersion } from '@barocss/cad';
import { VIEWS, scaleLabel } from '@barocss/cad-model/drawing/views';
import { VIEW_IDS, type DrawingSettings } from '@barocss/cad-model/drawing/types';
import type { useDrawingSheet } from '../useDrawingSheet';
import { Icon } from '../atoms';
import { CONTROL } from './sheetShared';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

type Sheet = ReturnType<typeof useDrawingSheet>;
export function ExportActions({ canExportDimensionCsv, exportDimensionCsv, sheets = 1, sheet, canExportPdf, layout, views, cuts, settings, dxfVersion, setDxfVersion, dxfCut, setDxfSection, exportSvg, exportPdf, exportDxf, exportSectionDxf, confirmation }: {
  /** 11 ④: how many sheets the drawing has (the PDF has them all; the SVG and the DXF are of the sheet shown). */ sheets?: number;
  canExportDimensionCsv: boolean; exportDimensionCsv(): void;
  sheet: Sheet['sheet']; canExportPdf: boolean; layout: Sheet['layout']; views: Sheet['views']; cuts: Sheet['cuts']; settings: DrawingSettings;
  dxfVersion: DxfVersion; setDxfVersion(v: DxfVersion): void; dxfCut: Sheet['cuts'][number] | undefined; setDxfSection(id: string): void;
  confirmation: { format: string; messages: string[]; onCancel(): void; onConfirm(): void } | null;
  exportSvg(): void; exportPdf(): void; exportDxf(): void; exportSectionDxf(): void;
}) {
  const hasShortenedRadius = sheet?.dimensions.some(r => r.ok && r.dim.kind === 'radius' && r.dim.foreshorten
    && sheet.groups.some(group => group.id === r.dim.id && group.marks.some(mark => mark.kind === 'polyline')));
  const hasManualArrows = sheet?.dimensions.some(r => r.ok && r.dim.kind === 'linear' && r.dim.arrowPlacement);
  const hasCrossingBreak = sheet?.crossingBreaks?.some(cb => cb.status === 'applied');
  const hasExtensionJog = sheet?.dimensions.some(r => r.ok && r.dim.kind === 'linear' && r.dim.extensionJog && r.dim.hideExtension !== r.dim.extensionJog.side);
  const hasArcLength = sheet?.dimensions.some(r => r.ok && r.dim.kind === 'arc-length');
  const hasChamfer = sheet?.dimensions.some(r => r.ok && r.dim.kind === 'chamfer');
  const hasRadialThickness = sheet?.dimensions.some(r => r.ok && r.dim.kind === 'radial-thickness');
  const hasCylinderDiameter = sheet?.dimensions.some(r => r.ok && r.dim.kind === 'cylinder-diameter');
  const hasCircleSeparation = sheet?.dimensions.some(r => r.ok && r.dim.kind === 'circle-separation');
  const confirmPanel = useRef<HTMLDivElement>(null);
  const pendingFormat = confirmation?.format;
  useEffect(() => {
    if (pendingFormat) confirmPanel.current?.focus();
  }, [pendingFormat]);
  return <>
        <div className="card-title" style={{ marginTop: 8 }}>EXPORT</div>
        <div className="dw-actions">
          <Button variant="default" disabled={!sheet} onClick={exportSvg} aria-label="Export SVG"><Icon name="download" small /> SVG</Button>
          <Button variant="ghost" disabled={!canExportDimensionCsv} onClick={exportDimensionCsv} aria-label="Export dimension CSV" title="Current-sheet dimension list only, not an issued inspection register">Dimension CSV</Button>
          <Button variant="ghost" disabled={!canExportPdf} onClick={exportPdf} aria-label="Export PDF" title={sheets > 1 ? `All ${sheets} sheets, one page each` : undefined}>PDF</Button>
          <Button variant="ghost" disabled={!sheet} onClick={exportDxf} aria-label="Export DXF" title="The sheet as DXF, at true size in mm, layers by line kind">DXF</Button>
          <NativeSelect className={CONTROL} aria-label="DXF version" value={dxfVersion} onChange={e => setDxfVersion(e.target.value as DxfVersion)} title="DXF 2000, or R12 for older programs (curves as polylines)">
            <option value="AC1015">2000</option><option value="AC1009">R12</option>
          </NativeSelect>
          {cuts.length > 1 && <NativeSelect className={CONTROL} aria-label="Section for DXF" value={dxfCut?.id} onChange={e => setDxfSection(e.target.value)} title="The section to export alone">{cuts.map(c => <option key={c.id} value={c.id}>{c.id}–{c.id}</option>)}</NativeSelect>}
          {dxfCut && <Button variant="ghost" onClick={exportSectionDxf} aria-label="Export section DXF" title={`Section ${dxfCut.id}–${dxfCut.id} alone, 1:1 in model mm`}>{dxfCut.id}–{dxfCut.id} DXF</Button>}
        </div>
        <div className="empty" role="note">Dimension CSV: current base-part sheet only, linear/diameter dimensions in unbroken front/top/right views. Unresolved rows are retained with blank values; unsupported dimensions refuse the whole export. Model values are mm, separate from printed units/text. Not an issued snapshot, inspection register, measurement or acceptance record. Spreadsheet-safe text may include a protective apostrophe.</div>
        {sheet?.groups.some(group => group.marks.some(mark => mark.kind === 'hatch' && !!mark.svgTextExclusions?.length)) && <div className="empty" role="note">Screen/SVG only: dimension-text hatch clearance. PDF and DXF retain the original hatching; section DXF retains the original cut geometry.</div>}
        {hasShortenedRadius && <div className="empty" role="note" aria-label="DXF radius display compatibility">DXF stores the shortened leader in the dimension’s display block. If another CAD redraws the dimension, it may show an ordinary radius. Use SVG for the drawn appearance.</div>}
        {hasManualArrows && <div className="empty" role="note" aria-label="DXF arrow display compatibility">DXF stores manual arrow placement in the dimension’s display block. Another CAD may use automatic placement when it redraws the dimension. Use SVG for the drawn appearance.</div>}
        {hasCrossingBreak && <div className="empty" role="note" aria-label="DXF crossing break compatibility">DXF stores crossing breaks in the dimension’s display block while preserving the measured linear geometry. Another CAD may redraw an unbroken line. Use SVG for the drawn appearance.</div>}
        {hasExtensionJog && <div className="empty" role="note" aria-label="DXF extension jog compatibility">DXF stores jogged extension lines in the dimension’s display block while preserving the measured linear geometry. Another CAD may redraw straight extension lines. Use SVG for the drawn appearance.</div>}
        {hasArcLength && <div className="empty" role="note" aria-label="DXF arc length compatibility">DXF exports arc length dimensions as drawn arc, extension lines, arrowheads, and text rather than a native DXF dimension entity. Use SVG for the drawn appearance.</div>}
        {hasChamfer && <div className="empty" role="note" aria-label="DXF chamfer compatibility">DXF exports 45° chamfer dimensions as drawn leader lines, arrowhead, and text rather than a native DXF dimension entity. Use SVG for the drawn appearance.</div>}
        {hasRadialThickness && <div className="empty" role="note" aria-label="DXF radial thickness compatibility">DXF exports concentric radial thickness dimensions as drawn lines, arrowheads, and text rather than a native DXF dimension entity. Use SVG for the drawn appearance.</div>}
        {hasCylinderDiameter && <div className="empty" role="note" aria-label="DXF cylinder diameter compatibility">DXF exports cylinder side diameter dimensions as drawn lines, arrowheads, and text rather than a native DXF dimension entity. Use SVG for the drawn appearance.</div>}
        {hasCircleSeparation && <div className="empty" role="note" aria-label="DXF circle separation compatibility">DXF exports circle separation dimensions as drawn extension lines, arrowheads, and text rather than a native DXF dimension entity. Use SVG for the drawn appearance.</div>}
        {confirmation && <div ref={confirmPanel} tabIndex={-1} className="dw-export-confirm" role="group" aria-label="Confirm drawing export">
          <ul>{confirmation.messages.map((message, i) => <li key={i}>{message}</li>)}</ul>
          <div className="dw-actions">
            <Button variant="ghost" onClick={confirmation.onCancel}>Cancel</Button>
            <Button variant="default" onClick={confirmation.onConfirm}>Export {confirmation.format} without the listed dimensions</Button>
          </div>
        </div>}
        {sheet && <div className="empty">{scaleLabel(layout!.scale)} · {settings.sheet} · {VIEW_IDS.map(id => `${VIEWS[id].label.toLowerCase()} ${views![id].edges.length}`).join(', ')} edges</div>}
  </>;
}
