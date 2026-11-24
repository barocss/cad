import { useEffect, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import type { EngineClient } from '../engine/client';
import { exactBodies, planeAxis, sectionSplits, type Section } from './sectionView';
import { projectedSectionSpan } from './sectionSpan';
import type { SectionVertexPick } from './useSectionSelection';

interface Source {
  doc: StudioDoc;
  evaluated: StudioDoc;
  section: Section;
  bodies: readonly BodyResult[];
  shown: readonly BodyResult[];
  backend: 'webgl2' | 'webgpu';
  open: object;
  worker: number;
}

type Move = { owner: Source; message: string; next?: Section };

export function useSectionThroughVertex({ source, box, engine, nextRevision, live, select, setSection }: {
  source: Source | null;
  box: { min: Vec3; max: Vec3 };
  engine: EngineClient;
  nextRevision(): number;
  live(owner: Source): boolean;
  select: SectionVertexPick;
  setSection(update: (previous: Section | null) => Section | null): void;
}) {
  const [move, setMove] = useState<Move | null>(null);
  const moveNow = useRef(move), escapeHeld = useRef(false);
  const current = useRef({ source, live });
  current.current = { source, live };
  const update = (next: Move | null) => { moveNow.current = next; setMove(next); };
  const owns = (owner: Source) => {
    const latest = current.current.source;
    return !!latest && latest.doc === owner.doc && latest.evaluated === owner.evaluated
      && latest.section === owner.section && latest.bodies === owner.bodies && latest.shown === owner.shown
      && latest.backend === owner.backend && latest.open === owner.open && latest.worker === owner.worker && current.current.live(owner);
  };
  const active = move && owns(move.owner) ? move : null;
  useEffect(() => {
    if (move && !active && moveNow.current === move) update(null);
  }, [move, active]);

  const available = !!source && !!planeAxis(source.section.planes[0]);
  const start = () => {
    if (!source || !available || !owns(source)) return;
    update({ owner: source, message: 'Click an original corner.' });
  };

  const pick = (hit: { vertex?: { body: number; at: Vec3 } }) => {
    const request = moveNow.current;
    if (!request || !owns(request.owner)) return false;
    const at = hit.vertex && select(hit.vertex);
    if (!at) {
      update({ owner: request.owner, message: 'Pick a retained original corner.' });
      return true;
    }
    const { owner } = request;
    const { normal, axis } = owner.section.planes[0];
    const offset = normal.reduce((sum, value, i) => sum + value * at[i], 0);
    const span = projectedSectionSpan(box, normal);
    if (!span || !Number.isFinite(offset) || offset <= span[0] || offset >= span[1]) {
      update({ owner, message: 'The corner is outside the section range.' });
      return true;
    }
    const next: Section = { mode: 'plane', planes: [{ normal, axis, offset }] };
    const checking = { owner, message: 'Checking the section…' };
    update(checking);
    void (async () => {
      const split = sectionSplits(owner.evaluated, owner.bodies, next);
      const result = await engine.section(split.doc, nextRevision());
      if (moveNow.current !== checking || !owns(owner)) return;
      if (!result.ok || !exactBodies(result.bodies, split.kept, split.from).bodies.length) {
        update({ owner, message: 'The exact section is unavailable at this corner.' });
        return;
      }
      const coordinate = planeAxis(next.planes[0]);
      update({ owner, next, message: coordinate ? `Move to ${'XYZ'[coordinate.k]} ${coordinate.at} mm` : 'Use this corner' });
    })().catch(() => {
      if (moveNow.current === checking && owns(owner)) update({ owner, message: 'The exact section is unavailable at this corner.' });
    });
    return true;
  };

  const apply = () => {
    const request = moveNow.current;
    if (!request?.next || !owns(request.owner)) return;
    const { next, owner } = request;
    update(null);
    setSection(previous => previous === owner.section ? next : previous);
  };
  const cancel = () => update(null);
  const escape = (repeat: boolean) => {
    if (repeat && escapeHeld.current) return true;
    escapeHeld.current = !!moveNow.current && owns(moveNow.current.owner);
    if (escapeHeld.current) cancel();
    return escapeHeld.current;
  };
  return { pick, escape, controls: { available, active: !!active,
    message: active?.message, canApply: !!active?.next, start, apply, cancel } };
}

export type SectionVertexMoveControls = ReturnType<typeof useSectionThroughVertex>['controls'];
