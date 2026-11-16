import type { Command, Ctx, Field, Values } from '@barocss/cad-model/app/commands';
import { holePatternEditProblem } from '@barocss/cad-model/app/holePatternInput';
import { dropStaleMade, type HolePattern, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { refusal } from '@barocss/cad-model/engine/refusal';

export const SHARED_HOLE_LAYOUT_EDIT = 'edit-shared-hole-layout';

type Hole = Extract<ModelNode, { kind: 'hole' }>;
export type SharedHoleLayoutPair = { through: number; counterbore: number; first: Hole; second: Hole };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const samePattern = (a?: HolePattern, b?: HolePattern) => !a || !b ? a === b : a.count === b.count
  && ('step' in a && 'step' in b ? a.step.every((v,k) => v === b.step[k]) : 'about' in a && 'about' in b && a.about.every((v,k) => v === b.about[k]));
const validPattern = (p?: HolePattern) => !p || (Number.isInteger(p.count) && p.count >= 1 && p.count <= 64
  && ('step' in p ? p.step : p.about).every(finite));
const plain = (h: Hole) => !h.held && !h.suppressed && !h.made && !h.thread && h.countersink === undefined && h.csk === undefined
  && !('routeBundleMember' in h) && validPattern(h.pattern) && h.center.every(finite) && finite(h.radius) && h.radius > 0;

/** A compatible pair is only an offer for an explicit one-time edit, never evidence of creation provenance. */
export function sharedHoleLayoutPair(nodes: readonly ModelNode[], index: number): SharedHoleLayoutPair | null {
  for (const through of [index, index - 1]) {
    const first = nodes[through], second = nodes[through + 1];
    if (first?.kind !== 'hole' || second?.kind !== 'hole' || !plain(first) || !plain(second)
      || first.depth !== undefined || !finite(second.depth) || second.depth <= 0
      || !finite(first.radius) || !finite(second.radius) || second.radius <= first.radius
      || second.parent.node !== through || second.parent.side !== 'solid'
      || (first.axis ?? 'z') !== (second.axis ?? 'z') || (first.side ?? 'max') !== (second.side ?? 'max') || first.face !== second.face
      || !first.center.every((v,k) => v === second.center[k]) || !samePattern(first.pattern, second.pattern)) continue;
    return { through, counterbore: through + 1, first, second };
  }
  return null;
}

const axes = { z: ['X','Y'], x: ['Y','Z'], y: ['X','Z'] } as const;
export function sharedHoleLayoutCommand(owner: StudioDoc, pair: SharedHoleLayoutPair, isCurrent: () => boolean = () => true): Command {
  const ids = `${pair.first.id ?? pair.through} + ${pair.second.id ?? pair.counterbore}`;
  const plane = axes[pair.first.axis ?? 'z'], pattern = pair.first.pattern;
  const fields: Field[] = [{key:'c0',label:'Centre '+plane[0],kind:'mm'}, {key:'c1',label:'Centre '+plane[1],kind:'mm'}];
  if (pattern) fields.push({key:'count',label:'Copies',kind:'count',min:1,max:64}, ...plane.map((axis,k): Field => ({key:('step' in pattern?'step':'about')+k,label:('step' in pattern?'Step ':'Circle centre ')+axis,kind:'mm'})));
  const current = (ctx: Ctx) => isCurrent() && ctx.doc.nodes.length === owner.nodes.length
    && ctx.doc.nodes.every((n,i) => n === owner.nodes[i]) && ctx.doc.parameters === owner.parameters
    && sharedHoleLayoutPair(owner.nodes, pair.through)?.first === pair.first && owner.nodes[pair.counterbore] === pair.second;
  const defaults: Values = { c0: pair.first.center[0] as number, c1: pair.first.center[1] as number,
    ...(pattern ? { count: pattern.count, ...('step' in pattern ? {step0:pattern.step[0],step1:pattern.step[1]} : {about0:pattern.about[0],about1:pattern.about[1]}) } : {}) };
  return { id:SHARED_HOLE_LAYOUT_EDIT,label:`Shared hole layout ${ids}`,icon:'edit',group:'modify',
    hint:'One-time edit of both named features. Creation provenance is unavailable; no persistent link is created. Diameters and depths stay independent.',
    available: ctx => current(ctx) ? {ok:true} : {ok:false,reason:'The source features changed. Reopen their shared layout.'},
    fields:()=>fields, defaults:()=>({...defaults}),
    steps:()=>[{label:'One-time paired edit',text:'No creation provenance or persistent link. Only shared positions and copies change.',done:true},{label:'Through hole',text:`${pair.first.id ?? pair.through} · Ø${Number(pair.first.radius)*2} · through`,done:true},{label:'Counterbore',text:`${pair.second.id ?? pair.counterbore} · Ø${Number(pair.second.radius)*2} · depth ${pair.second.depth}`,done:true}],
    build:(ctx,values)=>{
      if (!current(ctx)) throw refusal('BAD_REFERENCE','The source features changed. Reopen their shared layout.');
      const value = (key:string) => { const raw=values[key]; const n=Number(raw); if((typeof raw==='string' && !raw.trim()) || !Number.isFinite(n)) throw refusal('VALUE','Enter finite shared-layout coordinates.'); return n; };
      const center: [number,number]=[value('c0'),value('c1')];
      let nextPattern: HolePattern | undefined;
      if(pattern){const count=value('count');if(!Number.isInteger(count)||count<1||count>64)throw refusal('HOLE_PATTERN','Copies must be a whole number from 1 to 64.');nextPattern='step'in pattern?{count,step:[value('step0'),value('step1')]}:{count,about:[value('about0'),value('about1')]};}
      const update=(hole:Hole):Hole=>({...hole,center:[...center],...(nextPattern?{pattern:structuredClone(nextPattern)}:{})});
      const first=update(pair.first),second=update(pair.second);
      for(const [before,after] of [[pair.first,first],[pair.second,second]]){const problem=holePatternEditProblem(before,after,owner.parameters);if(problem)throw refusal('HOLE_PATTERN',problem);}
      const same=first.center.every((v,k)=>v===pair.first.center[k])&&samePattern(first.pattern,pair.first.pattern);
      if(same)return owner;
      return {...owner,nodes:dropStaleMade(owner.nodes,owner.nodes.map((node,i)=>i===pair.through?first:i===pair.counterbore?second:node))};
    },
  };
}
