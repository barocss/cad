import { evaluateCasualSolid, type CasualSolidScene } from './casualPlate';
import { emptyDoc, type StudioDoc, type ModelNode, type Dim } from '../engine/doc';

export const RECIPE_LIMIT = 8_192;
export const RECIPE_EXT = '.cadrecipe';
const id = '[A-Za-z][A-Za-z0-9_]{0,7}';
const number = '-?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)';
const dim = '(' + id + '|' + number + ')';
const param = new RegExp('^param +(' + id + ') *= *(' + number + ')$');
const plate = new RegExp('^plate +(' + id + ') +width=' + dim + ' +depth=' + dim + ' +thickness=' + dim + '$');
const hole = new RegExp('^hole +(' + id + ') +in=(' + id + ') +at=\\( *' + dim + ' *, *' + dim + ' *\\) +diameter=' + dim + '$');
const output = new RegExp('^output +(' + id + ')$');
type Hole = { name: string; id: string; x: number; y: number; diameter: number };
type Value = { value: number; native: Dim };
export type RecipeModel = { source: string; scene: CasualSolidScene; doc: StudioDoc; holes: Hole[]; resolvedDiameters: string[] };
type Result = { ok: true; value: RecipeModel } | { ok: false; line: number; reason: string };

// Exact base-64 encoding of up to eight identifier characters; independent of statement order.
// The reserved low native serials cannot collide with the prefixed nonzero encoding.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
const stableHoleId = (name: string) => 'n' + [...name].reduce((acc, ch) => acc * 64 + alphabet.indexOf(ch) + 1, 1);
const positive = (n: number) => n >= .01 && n <= 10_000;

export function compileCasualRecipe(source: string): Result {
  const bad = (line: number, reason: string): Result => ({ ok: false, line, reason });
  if (source.length > RECIPE_LIMIT) return bad(1, '코드가 너무 길어요 (최대 8,192자).');
  const lines = source.split(/\r?\n/).flatMap((raw, i) => {
    const code = raw.split('#', 1)[0].trim().replace(/\t/g, ' ');
    return code ? [{ code, line: i + 1 }] : [];
  });
  if (lines[0]?.code !== 'recipe 1') return bad(lines[0]?.line ?? 1, '첫 줄에 recipe 1을 적어주세요.');
  if (lines[1]?.code !== 'units mm') return bad(lines[1]?.line ?? 2, '단위는 units mm만 지원해요.');
  const parameters = new Map<string, number>(), names = new Set<string>();
  const holes: Hole[] = [], nodes: ModelNode[] = [], resolvedDiameters: string[] = [];
  let base: { name: string; w: number; d: number } | undefined;
  let ended = false;
  const value = (token: string): Value | undefined =>
    parameters.has(token) ? { value: parameters.get(token)!, native: { parameter: token } } :
      Number.isFinite(Number(token)) ? { value: Number(token), native: Number(token) } : undefined;
  for (const { code, line } of lines.slice(2)) {
    if (ended) return bad(line, 'output 뒤에는 코드를 적을 수 없어요.');
    let m: RegExpExecArray | null;
    if ((m = param.exec(code))) {
      if (base || names.has(m[1])) return bad(line, '파라미터는 판 앞에 한 번만 선언하세요.');
      const v = Number(m[2]);
      if (!Number.isFinite(v) || Math.abs(v) > 10_000) return bad(line, '값 범위는 -10000부터 10000까지예요.');
      names.add(m[1]); parameters.set(m[1], v);
    } else if ((m = plate.exec(code))) {
      if (base || names.has(m[1])) return bad(line, '이 버전은 고유 이름의 판 한 개만 지원해요.');
      const [w, d, t] = m.slice(2).map(value);
      if (!w || !d || !t) return bad(line, '정의되지 않은 치수가 있어요.');
      if (![w, d, t].every(n => positive(n.value))) return bad(line, '판 치수는 0.01~10000 mm로 입력하세요.');
      names.add(m[1]); base = { name: m[1], w: w.value, d: d.value };
      nodes.push({ id:'n0', kind:'sketch', profile:'rectangle', min:[0,0], max:[w.native,d.native] });
      nodes.push({ id:'n1', kind:'extrude', sketch:0, height:t.native });
    } else if ((m = hole.exec(code))) {
      if (!base || base.name !== m[2] || names.has(m[1])) return bad(line, '고유한 구멍 이름과 앞에서 정의한 판을 사용하세요.');
      if (holes.length >= 8) return bad(line, '관통 구멍은 최대 8개까지 지원해요.');
      const [x,y,d] = m.slice(3).map(value);
      if (!x || !y || !d) return bad(line, '정의되지 않은 구멍 치수가 있어요.');
      const radius = d.value / 2;
      if (!positive(d.value) || Math.min(x.value, y.value, base.w-x.value, base.d-y.value) - radius < .001) return bad(line, '구멍 지름을 줄이거나 판 가장자리에서 안쪽으로 옮겨주세요.');
      if (holes.some(h => Math.hypot(h.x-x.value, h.y-y.value)-h.diameter/2-radius < .001)) return bad(line, '다른 구멍과 겹쳐요. 위치나 지름을 변경하세요.');
      const nativeId = stableHoleId(m[1]);
      if (typeof d.native !== 'number') resolvedDiameters.push(m[1]);
      nodes.push({ id:nativeId, kind:'hole', parent:{ node:nodes.length-1, side:'solid' }, center:[x.native,y.native], radius, axis:'z' });
      names.add(m[1]); holes.push({ name:m[1], id:nativeId, x:x.value, y:y.value, diameter:d.value });
    } else if ((m = output.exec(code))) {
      if (!base || base.name !== m[1]) return bad(line, 'output에서 위에서 정의한 판을 선택하세요.');
      ended = true;
    } else return bad(line, '이 줄의 문법을 읽지 못했어요. recipe, units, param, plate, hole, output 문법을 확인하세요.');
  }
  const last = lines.at(-1)?.line ?? 1;
  if (!base || !ended) return bad(last, '판을 정의하고 마지막 줄에 output을 적어주세요.');
  const lastNode = nodes[nodes.length - 1];
  const doc: StudioDoc = { ...emptyDoc(), parameters: Object.fromEntries(parameters), nodes,
    nextId: Math.max(...nodes.map(n => Number(n.id!.slice(1)))) + 1,
    outputs: { ['b' + lastNode.id!.slice(1)]: { node:nodes.length-1, side:'solid' } } };
  try {
    const solid = evaluateCasualSolid(doc, 'n1', holes);
    return solid.ok ? { ok:true, value:{ source, scene:solid.value, doc, holes, resolvedDiameters } } : bad(last, solid.reason);
  } catch {
    return bad(last, '닫힌 형상을 계산하지 못했어요. 구멍 위치와 판 치수를 확인하세요.');
  }
}
