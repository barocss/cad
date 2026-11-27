import { useMemo, useState } from 'react';
import { surfaceEvaluator, type Surface } from '@barocss/cad';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DirectDisplay, DirectGeometry, DirectObject } from '@barocss/cad-model/engine/direct';
import { directNow } from '@barocss/cad-model/engine/directModule';

const NO_PREVIEW: DirectDisplay[] = [];
export type DirectFillMode = 'tangent' | 'guided';

function sources(direct: DirectGeometry | undefined, selected: string[], ready: boolean) {
  if (!direct || !ready || selected.length !== 5 || new Set(selected).size !== 5) return null;
  const runtime = directNow();
  if (!runtime) return null;
  const curves: DirectObject[] = [], surfaces: DirectObject[] = [];
  for (const id of selected) {
    const matches = direct.objects.filter(item => item.id === id && !item.hidden);
    if (matches.length !== 1) return null;
    const object = matches[0];
    try {
      const kind = runtime.geometryOf(direct, object).kind;
      (kind === 'curve' ? curves : surfaces).push(object);
    } catch { return null; }
  }
  return curves.length === 4 && surfaces.length === 1 ? { donor: surfaces[0], curves } : null;
}

/** Draw the normalized patch domain without a selectable object. Guided Fill keeps the UV triangle. */
function previewOf(surface: Surface, mode: DirectFillMode): DirectDisplay {
  const at = surfaceEvaluator(surface), positions: number[] = [], divisions = 32;
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    const reach = mode === 'guided' ? 1 - t : 1;
    if (reach === 0) continue;
    for (let i = 0; i < divisions; i++) {
      const from = reach * i / divisions, to = reach * (i + 1) / divisions;
      positions.push(...at(t, from), ...at(t, to), ...at(from, t), ...at(to, t));
    }
  }
  if (mode === 'guided') for (let i = 0; i < divisions; i++) {
    const from = i / divisions, to = (i + 1) / divisions;
    positions.push(...at(1 - from, from), ...at(1 - to, to));
  }
  return { kind: 'curve', id: 'direct-fill-preview', name: 'Fill preview', preview: true,
    positions: new Float32Array(positions), controls: new Float32Array() };
}

interface Options {
  doc: StudioDoc;
  selected: string[];
  ready: boolean;
  current(): boolean;
  commit(next: DirectGeometry, id: string): boolean;
}

export function useDirectFill({ doc, selected, ready, current, commit }: Options) {
  const key = JSON.stringify(selected);
  const [draft, setDraft] = useState<{ doc: StudioDoc; key: string; mode: DirectFillMode; seam: string; guide: string } | null>(null);
  const picks = useMemo(() => sources(doc.direct, selected, ready), [doc.direct, selected, ready]);
  const shown = draft && picks && draft.doc === doc && draft.key === key ? draft : null;
  if (draft && !shown) setDraft(null);
  const { mode, seam = '', guide = '' } = shown ?? {};
  const candidate = useMemo(() => {
    if (!mode || !seam || (mode === 'guided' && !guide) || !picks || !doc.direct) return null;
    const runtime = directNow();
    if (!runtime) return null;
    try {
      const ids = picks.curves.map(curve => curve.id);
      const next = mode === 'guided'
        ? runtime.directOps.fillGuidedJunction(doc.direct, ids, seam, guide, picks.donor.id)
        : runtime.directOps.fillTangent(doc.direct, ids, seam, picks.donor.id);
      const object = next.objects.at(-1)!;
      const surface = runtime.geometryOf(next, object);
      if (surface.kind === 'surface') return { next, id: object.id, preview: [previewOf(surface, mode)] };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    return null;
  }, [doc.direct, picks, mode, seam, guide]);

  function begin(mode: DirectFillMode) {
    if (picks && current()) setDraft({ doc, key, mode, seam: '', guide: '' });
  }
  function setSeam(id: string) {
    if (shown) setDraft({ ...shown, seam: id, guide: shown.guide === id ? '' : shown.guide });
  }
  function setGuide(id: string) { if (shown) setDraft({ ...shown, guide: id }); }
  function cancel() { setDraft(null); }
  function apply() {
    if (shown && candidate?.next && current() && commit(candidate.next, candidate.id)) cancel();
  }
  return { picks, shown, mode, seam, guide, begin, setSeam, setGuide, cancel, apply, error: candidate?.error,
    preview: candidate?.preview ?? NO_PREVIEW };
}
