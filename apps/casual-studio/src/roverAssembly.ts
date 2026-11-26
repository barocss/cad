import { solveDoc } from '@barocss/cad-model/assembly/edit';
import { explodeOffsets } from '@barocss/cad-model/assembly/explode';
import { stepStateOf, stepsOf } from '@barocss/cad-model/assembly/steps';
import { readStudioFile } from '@barocss/cad-model/engine/container';
import { placedDoc } from '@barocss/cad-model/engine/doc';
import { bodiesOf } from '@barocss/cad-model/api/core';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';

export type Vec3 = [number, number, number];
export const ROVER_FILENAME = 'rover-assembly.bcad';
export const ASSEMBLY_BASE = 'base';

export type ReviewPart = {
  id: string;
  key: string;
  name: string;
  color: string;
  mesh: BodyResult['mesh'];
  offset: Vec3;
};

export function roverFrame(model: Pick<RoverAssembly, 'parts' | 'doc'>, step: number | null, selected: string | null) {
  const state = step === null ? null : stepStateOf(model.doc, step);
  const waiting = new Set(state?.waiting), active = new Set(state?.active);
  const parts = model.parts.filter(part => !waiting.has(part.id));
  return { parts, active, state, selected: parts.some(part => part.id === selected) ? selected : null };
}

export async function readRoverAssembly(bytes: Uint8Array) {
  // Keep the original bytes as the only export source. Neither solved-pose
  // evaluation nor review state goes back through the document encoder.
  const native = new Uint8Array(bytes);
  const read = await readStudioFile(native);
  if ('error' in read) throw new Error(read.error);
  const doc = read.doc, steps = stepsOf(doc);
  const ids = (doc.instances ?? []).map(part => part.id);
  const assigned = steps.flatMap(step => step.add);
  if (ids.length !== 24 || doc.mates?.length !== 24 || steps.length !== 4 ||
    new Set(ids).size !== 24 || assigned.length !== 24 || new Set(assigned).size !== 24 ||
    assigned.some(id => !ids.includes(id))) throw new Error('Incomplete rover assembly');
  const solved = solveDoc(doc);
  if (solved.problems.length) throw new Error('Invalid rover placements');
  const base = bodiesOf(solved.doc);
  const placed = (solved.doc.instances ?? []).map(part => ({
    id: part.id, name: part.name, color: Object.values(part.doc.bodies ?? {})[0]?.color ?? '#8aa2b7',
    bodies: bodiesOf(placedDoc(part, solved.doc)),
  }));
  if (base.length !== 1 || placed.length !== 24 || placed.some(part => part.bodies.length !== 1)) throw new Error('Incomplete rover geometry');
  const offsets = explodeOffsets(base, placed, .95);
  const parts: ReviewPart[] = [
    { id: ASSEMBLY_BASE, name: '하부 데크', key: base[0].key, color: Object.values(doc.bodies ?? {})[0]?.color ?? '#56758e',
      mesh: base[0].mesh, offset: [0, 0, 0] },
    ...placed.map(({ id, name, color, bodies: [body] }) => ({
      id, key: body.key, name, color, mesh: body.mesh, offset: offsets.get(id) ?? [0, 0, 0],
    })),
  ];
  return { doc, steps, parts, download: () => new Blob([native], { type: 'application/octet-stream' }) };
}
export type RoverAssembly = Awaited<ReturnType<typeof readRoverAssembly>>;
