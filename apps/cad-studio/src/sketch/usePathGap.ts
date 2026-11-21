import { pathGapPreviewDraft } from './pathGapPreviewDraft';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { nextIdOf, withIds } from '@barocss/cad-model/sketch/entityIds';
import type { P2 } from '@barocss/cad-model/sketch/profile';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { detachSketchLink, switchTool } from '../app/sketchControls';
import { preparePathGap, type PathGapPlan, type PreparedPathGap } from './pathGap';

export interface PathGapDraft {
  source: PreparedPathGap;
  length: string;
  notice?: string;
}
interface OwnedDraft extends PathGapDraft {
  doc: StudioDoc;
  sketch: SketchState;
  generation: number;
  original: SketchShape;
}

export interface PathGapInput {
  read(owner: SketchState | null): PathGapDraft | null;
  preview(owner: SketchState, draft: PathGapDraft, plan: PathGapPlan | null): PathGapDraft | null;
  apply(owner: SketchState, draft: PathGapDraft, plan: PathGapPlan | null): void;
}

function pathFragment(points: P2[], ids: string[], construction?: true, bulges = points.map(() => 0)): SketchShape {
  return { kind: 'polygon', points, bulges, closed: false, pending: false, ...(construction ? { construction } : {}), ids };
}

export function usePathGap(doc: StudioDoc, sketch: SketchState | null, docNow: RefObject<StudioDoc>,
  generation: RefObject<number>, commitDraft: (before: SketchState, after: SketchState) => void) {
  const [draft, setDraft] = useState<OwnedDraft | null>(null);
  const current = useRef<OwnedDraft | null>(null);
  const change = (next: OwnedDraft | null) => { current.current = next; setDraft(next); };
  const read = (owner: SketchState | null) => {
    const value = current.current;
    return value && value.sketch === owner && value.doc === docNow.current && value.generation === generation.current ? value : null;
  };
  const renderedGeneration = generation.current;
  const visible = draft?.sketch === sketch && draft.doc === doc && draft.generation === renderedGeneration ? draft : null;
  useEffect(() => {
    if (draft && !visible && current.current === draft) { current.current = null; setDraft(null); }
  }, [draft, visible]);
  const selection = useMemo(() => {
    if (sketch?.tool !== 'trim' || sketch.shape || sketch.hideConstruction) return null;
    const done = sketch.done ?? [];
    const references = done.filter(shape => shape.construction);
    if (references.length === 1) {
      const [original] = references;
      const source = preparePathGap(original);
      return source && { original, source };
    }
    if (references.length || done.length !== 1 || sketch.band || sketch.association || sketch.base) return null;
    const [original] = done;
    if (original.kind !== 'circle' && original.kind !== 'polygon') return null;
    if (sketch.editNode !== undefined) {
      const stored = doc.nodes[sketch.editNode];
      if (original.kind !== 'circle' || stored?.kind !== 'sketch' || stored.profile !== 'circle'
        || stored.on || stored.association || [...stored.center, stored.radius].some(value => typeof value !== 'number')) return null;
    }
    if (original.ids && original.ids.length !== (original.kind === 'circle' ? 1 : 2)) return null;
    const source = preparePathGap(withIds([original])[0], true);
    return source && { original, source };
  }, [doc.nodes, sketch]);
  const input: PathGapInput = {
    read,
    preview(owner, expected, plan) {
      const value = read(owner);
      const next = pathGapPreviewDraft(value, expected, plan);
      if (next && next !== value) change(next);
      return next;
    },
    apply(owner, expected, plan) {
      const value = read(owner);
      if (!value || value !== expected) return;
      if (!plan) {
        const kind = value.source.kind;
        const notice = kind === 'polyline' ? 'Pick one span away from a corner, or reduce Gap length.'
          : `The gap must fit inside the ${kind}. ${kind === 'circle' ? 'Reduce Gap length or pick another point on the circle.' : `Move away from the ${kind} endpoints or reduce Gap length.`}`;
        change({ ...value, notice });
        return;
      }
      const source = value.source;
      const done = owner.done ?? [], index = done.indexOf(value.original);
      if (index < 0) return;
      const next = nextIdOf([...done, source.shape]);
      const firstCutId = `e${next}`, secondCutId = `e${next + 1}`;
      let fragments: SketchShape[];
      if (source.kind === 'circle' && plan.kind === 'circle') {
        // A closed circle has no old endpoints. Retire its ID and identify both new ends.
        fragments = [pathFragment([plan.cutB, plan.cutA], [secondCutId, firstCutId], source.shape.construction, [plan.bulges[0], 0])];
      } else if (source.kind === 'polyline' && plan.kind === 'polyline') {
        const { points, ids } = source.shape, split = plan.span + 1;
        const bulges = points.map((_, i) => source.shape.bulges?.[i] ?? 0);
        fragments = [
          pathFragment([...points.slice(0, split), plan.cutA], [...ids.slice(0, split), firstCutId], true,
            [...bulges.slice(0, plan.span), plan.bulges[0], 0]),
          pathFragment([plan.cutB, ...points.slice(split)], [secondCutId, ...ids.slice(split)], true,
            [plan.bulges[1], ...bulges.slice(split, -1), 0]),
        ];
      } else if ((source.kind === 'line' || source.kind === 'arc') && plan.kind === 'segment') {
        const [a, b] = source.shape.points, [startId, endId] = source.shape.ids;
        fragments = [
          pathFragment([a, plan.cutA], [startId, firstCutId], source.shape.construction, [plan.bulges[0], 0]),
          pathFragment([plan.cutB, b], [secondCutId, endId], source.shape.construction, [plan.bulges[1], 0]),
        ];
      } else return;
      const replacement = [...done.slice(0, index), ...fragments, ...done.slice(index + 1)];
      change(null);
      commitDraft(owner, switchTool({ ...detachSketchLink(owner), done: replacement }, 'select'));
    },
  };
  return {
    input, visible, kind: selection?.source.kind ?? null,
    toggle() {
      if (read(sketch)) { change(null); return; }
      if (selection && sketch && docNow.current === doc && generation.current === renderedGeneration)
        change({ doc, sketch, generation: renderedGeneration, ...selection, length: '4' });
    },
    setLength(length: string) {
      const value = read(sketch);
      if (value) change({ ...value, length, notice: undefined });
    },
    cancel() {
      if (!current.current) return false;
      const owned = read(sketch) !== null;
      change(null);
      return owned;
    },
  };
}
