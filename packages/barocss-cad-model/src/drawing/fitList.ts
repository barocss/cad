// A derived list of drawing dimensions, not a census of holes or manufactured parts.
import { isHoleClass, lookupFit, fitTableProblem } from '@barocss/cad';
import type { StudioDoc } from '../engine/doc';
import type { Resolved } from './dimensions';
import { fitCallout } from './fits';
import { drawingScopeOf } from './scope';
import { lengthFormats, presetFor, type LengthFormat } from './standard';
import type { TableContent } from './table';
import type { DrawingSettings } from './types';

export interface DrawingTableContext { resolved: readonly Resolved[]; settings: DrawingSettings }
export interface FitListContext extends DrawingTableContext { wholeSettings: DrawingSettings }

/** Same exact/base face-name convention as fitCallout, but ambiguity is not silently first-matched. */
function facesFor(doc: StudioDoc, edge: string) {
  const names = edge.split('|').flatMap(name => [name, name.replace(/#\d+$/, '')]);
  return (doc.fits?.faces ?? []).filter(face => names.includes(face.face));
}

export function fitDimensionTable(doc: StudioDoc, context?: FitListContext): TableContent | { error: string } {
  const fail = (why: string) => ({ error: `Fit dimensions: ${why}` });
  if (!context?.wholeSettings) return fail('the current resolved sheet and whole drawing settings are required');
  const { settings, wholeSettings, resolved } = context;
  try {
    for (const s of [wholeSettings, settings]) {
      const scope = drawingScopeOf(s);
      if (scope.kind !== 'part' || scope.part !== undefined) return fail('only the base part is supported, not assembly or instance-part scope');
      if (s.sheets?.length || (s.sheetContext?.of ?? 1) !== 1) return fail('only a single sheet is supported');
    }
    if (doc.instances?.length) return fail('documents with placed instances are not supported');
    if (resolved.length !== settings.dimensions.length || resolved.some((r, i) => r.dim !== settings.dimensions[i])) return fail('resolved dimensions do not belong to the current sheet');
    const ids = new Set<string>(), rows: TableContent['rows'] = [], notes: string[] = [];
    const p = presetFor(settings);
    for (const r of resolved) {
      const d = r.dim;
      if (!d.id || ids.has(d.id)) return fail('dimension IDs must be unique');
      ids.add(d.id);
      if (!r.ok) return fail(`${d.id}: ${r.reason}`);
      const edge = 'edge' in d ? d.edge : null;
      const own = edge ? facesFor(doc, edge) : [];
      if (!edge && ('a' in d && facesFor(doc, d.a.edge).length || 'b' in d && facesFor(doc, d.b.edge).length)) return fail(`${d.id}: fit references on non-diameter dimensions are unsupported`);
      if (own.length > 1) return fail(`${d.id}: its edge has ambiguous fit faces`);
      if (!own.length) {
        if (d.tol?.kind === 'fit') return fail(`${d.id}: an authored fit label has no unique source face class`);
        continue;
      }
      if (r.kind !== 'diameter' || d.kind !== 'diameter' || !['front', 'top', 'right'].includes(d.view)) return fail(`${d.id}: only ordinary-view diameter dimensions are supported`);
      if (!Number.isFinite(r.value) || r.value <= 0) return fail(`${d.id}: its current diameter is invalid`);
      if (d.count !== undefined && (!Number.isSafeInteger(d.count) || d.count <= 0)) return fail(`${d.id}: its authored multiplier is invalid`);
      if (d.tol?.kind === 'fit' && d.tol.code !== own[0].class) return fail(`${d.id}: authored fit label differs from its source face class`);
      const face = own[0], pairs = (doc.fits?.pairs ?? []).filter(pair => pair.hole === face.face || pair.shaft === face.face);
      if (pairs.length > 1) return fail(`${d.id}: its fit pair is ambiguous`);
      let members = [face];
      if (pairs.length) {
        const pair = pairs[0], otherName = pair.hole === face.face ? pair.shaft : pair.hole;
        const other = (doc.fits?.faces ?? []).filter(f => f.face === otherName);
        if (other.length !== 1 || pair.hole === pair.shaft) return fail(`${d.id}: its paired face class is missing or ambiguous`);
        const hole = pair.hole === face.face ? face : other[0], shaft = pair.shaft === face.face ? face : other[0];
        if (!isHoleClass(hole.class) || isHoleClass(shaft.class)) return fail(`${d.id}: its declared hole/shaft classes are incompatible`);
        members = [hole, shaft];
      }
      const tables = doc.fits?.tables ?? [];
      if (new Set(tables.map(t => t.id)).size !== tables.length) return fail(`${d.id}: fit table IDs are ambiguous`);
      for (const table of tables) { const why = fitTableProblem(table); if (why) return fail(`${d.id}: ${why}`); }
      const limits = members.map(m => lookupFit(tables, m.class, r.value));
      const formats = lengthFormats(presetFor({ ...settings, ...(r.shownPrecision ? { precision: r.shownPrecision } : {}) }));
      const formatted = (f: LengthFormat) => {
        const fit = fitCallout(doc, d.edge, r.value, f);
        if (!fit || fit.miss) throw new Error(fit?.miss ?? 'no current fit callout');
        const nominal = fit.digits !== undefined && f.at ? f.at(fit.digits)(r.value, 3) : f(r.value, 3);
        return { nominal, fit: fit.text };
      };
      const primary = formatted(formats.primary);
      rows.push([`${d.id} (${d.view})`, d.count === undefined ? '—' : String(d.count), primary.nominal, primary.fit, limits.map(l => `${l.class}: ${l.table} row ${l.row + 1}${l.estimate ? ' (estimate)' : ''}`).join('; ')]);
      notes.push(`${d.id}: edge ${d.edge}; face ${members.map(m => m.face).join(' / ')}`);
      for (const l of limits) {
        const note = `${l.table} row ${l.row + 1}: ${l.source ?? 'source not supplied'}${l.estimate ? ' (estimate)' : ''}`;
        if (!notes.includes(note)) notes.push(note);
      }
    }
    return { title: 'FIT DIMENSIONS', columns: [{ key: 'dimension', label: 'DIMENSION / VIEW' }, { key: 'count', label: 'MULTIPLIER' }, { key: 'nominal', label: `DIAMETER (${p.units})` }, { key: 'fit', label: `CLASS / UPPER / LOWER (${p.units})` }, { key: 'source', label: 'TABLE / ROW' }], rows, notes: ['Base part, single sheet, ordinary-view diameter dimensions. Rows are dimensions, not part or hole quantities. Table rows are 1-based; user data is not certified.', 'Primary units only (including dual-unit drawings); dimension callouts retain their dual display.', ...(!rows.length ? ['No classed diameter dimensions on this sheet.'] : []), ...notes] };
  } catch (cause) { return fail(cause instanceof Error ? cause.message : String(cause)); }
}
