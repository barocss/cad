import { problem, type Problem } from '../engine/refusal';
import { noteTargetValid } from './noteTargets';
import { checkDrawingScope } from './scope';
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const xy=(x:unknown)=>Array.isArray(x)&&x.length===2&&[0,1].every(k=>Object.hasOwn(x,k)&&typeof x[k]==='number'&&Number.isFinite(x[k]));
/** Inspect raw new fields before the legacy reader can discard a note or its leader. No source auto-repair. */
export function checkSavedNoteTargets(raw: unknown): Problem[] {
  if (!record(raw)) return [];
  const fail=(why:string)=>[problem('DRAWING_OPTIONS',`Source-bound Note: ${why}. The original drawing is unchanged.`)];
  if (Object.hasOwn(raw,'target')) return fail('target belongs inside a note leader');
  if (!Array.isArray(raw.notes)) return record(raw.notes)&&Object.hasOwn(raw.notes,'target') ? fail('notes must be an array') : [];
  for (const note of raw.notes) {
    if (!record(note)) continue;
    if (Object.hasOwn(note,'target')) return fail('target belongs inside the leader, not the note');
    if (!record(note.leader)||!Object.hasOwn(note.leader,'target')) continue;
    if (typeof note.id!=='string'||!note.id.trim()||raw.notes.filter(n=>record(n)&&n.id===note.id).length!==1||typeof note.text!=='string'||!xy(note.at)) return fail('a target needs a unique valid note with text and a finite paper position');
    if (!['front','top','right'].includes(String(note.leader.view))||!xy(note.leader.at)||!noteTargetValid(note.leader.target)) return fail('a signed straight-edge endpoint and ordinary orthographic view are required');
    if (raw.scope!==undefined) {
      if (checkDrawingScope(raw.scope).length||!record(raw.scope)||raw.scope.kind!=='part'||raw.scope.part!==undefined||raw.scope.body!==undefined) return fail('only base-part scope is supported');
    } else if (raw.balloons||(Array.isArray(raw.tables)&&raw.tables.some(t=>record(t)&&t.from==='bom'))) return fail('implicit assembly scope is unsupported');
  }
  return [];
}
