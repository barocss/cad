import { useMemo, useState } from 'react';
import { surfaceEvaluator, type Surface } from '@barocss/cad';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { DirectDisplay, DirectGeometry, DirectObject } from '@barocss/cad-model/engine/direct';
import { directNow } from '@barocss/cad-model/engine/directModule';

const NO_PREVIEW: DirectDisplay[] = [];

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

/** The native patch has a normalized domain. Draw a temporary grid so the four source curves stay visible. */
function previewOf(surface: Surface): DirectDisplay {
  const at = surfaceEvaluator(surface), positions: number[] = [], divisions = 32;
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    for (let i = 0; i < divisions; i++) {
      const from = i / divisions, to = (i + 1) / divisions;
      positions.push(...at(t, from), ...at(t, to), ...at(from, t), ...at(to, t));
    }
  }
  return { kind: 'curve', id: 'tangent-fill-preview', name: 'Tangent Fill preview', preview: true,
    positions: new Float32Array(positions), controls: new Float32Array() };
}

interface Options {
  doc: StudioDoc;
  selected: string[];
  ready: boolean;
  current(): boolean;
  commit(next: DirectGeometry, id: string): boolean;
}

export function useTangentFill({ doc, selected, ready, current, commit }: Options) {
  const key = JSON.stringify(selected);
  const [draft, setDraft] = useState<{ doc: StudioDoc; key: string; seam: string } | null>(null);
  const picks = useMemo(() => sources(doc.direct, selected, ready), [doc.direct, selected, ready]);
  const shown = draft && picks && draft.doc === doc && draft.key === key ? draft : null;
  if (draft && !shown) setDraft(null);
  const seam = shown?.seam;
  const candidate = useMemo(() => {
    const runtime = seam && picks && directNow();
    if (!runtime || !seam || !picks || !doc.direct) return null;
    try {
      const next = runtime.directOps.fillTangent(doc.direct, picks.curves.map(curve => curve.id), seam, picks.donor.id);
      const object = next.objects.at(-1)!;
      const surface = runtime.geometryOf(next, object);
      if (surface.kind === 'surface') return { next, id: object.id, preview: [previewOf(surface)] };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    return null;
  }, [doc.direct, picks, seam]);

  function begin() {
    if (picks && current()) setDraft({ doc, key, seam: '' });
  }
  function setSeam(id: string) {
    if (shown) setDraft({ ...shown, seam: id });
  }
  function cancel() { setDraft(null); }
  function apply() {
    if (shown && candidate?.next && current() && commit(candidate.next, candidate.id)) cancel();
  }
  return { picks, shown, seam, begin, setSeam, cancel, apply, error: candidate?.error, preview: candidate?.preview ?? NO_PREVIEW };
}
