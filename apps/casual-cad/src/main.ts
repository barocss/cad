import './styles.css';
import { newCasualPlate, inspectCasualPlate, previewCasualDiameter, commitCasualPreview, type PlateDocument, type DiameterPreview } from '@barocss/cad-model/app/casualPlate';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { viewport } from './viewport';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
<header><span class="brand" aria-hidden="true">◈</span><h1>케이블 가이드 어댑터</h1>
<nav aria-label="문서"><button id="undo" type="button" aria-label="실행 취소">↶</button><button id="redo" type="button" aria-label="다시 실행">↷</button>
<button id="code" type="button" aria-expanded="false">&lt;/&gt; 코드</button><button id="open" type="button">열기</button>
<input id="file" type="file" accept=".bcad" hidden><button id="save" type="button">저장</button></nav></header>
<div class="workarea"><aside id="code-panel" hidden><label for="script">코드 · 지름 편집</label>
<textarea id="script" spellcheck="false" aria-describedby="code-hint"></textarea><small id="code-hint">예: holeA.diameter = 8</small>
<button id="run-code" type="button">미리보기</button></aside>
<section class="workspace" aria-label="모델 편집">
<div class="canvas-head"><p>기존 고정 구멍으로 케이블 가이드를 옆에 달기</p><button id="view" type="button">위에서 보기</button></div>
<div class="canvas">
<svg id="scene" viewBox="0 0 750 440" role="img" aria-label="두 관통 구멍이 있는 CAD 판"></svg>
<div id="targets" class="targets" aria-label="구멍 선택"></div>
</div>
<form id="editor" class="popover" hidden><h2 id="selection"></h2><label>지름 <input id="diameter" type="number" inputmode="decimal" step="any" aria-describedby="summary"> mm</label>
<p id="summary"></p><div><button id="cancel" type="button">취소</button><button id="apply" type="submit">적용</button></div></form>
<p id="notice" role="status" aria-live="polite"></p></section></div>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const initial = inspectCasualPlate(newCasualPlate());
if (!initial.ok) throw new Error(initial.reason);
let current = initial.value;
let draft: DiameterPreview | undefined;
let active: string | null = null;
let top = false;
let fileRev = 0, editRev = 0;
const past: PlateDocument[] = [], ahead: PlateDocument[] = [];
const editor = get<HTMLFormElement>('editor'), diameter = get<HTMLInputElement>('diameter');
const codePanel = get('code-panel'), script = get<HTMLTextAreaElement>('script');
const notice = (t = '') => { get('notice').textContent = t; };
const activeHole = () => current.scene.holes.find(h => h.id === active);
const scene = document.querySelector<SVGSVGElement>('#scene')!;
function draw() {
  const shown = draft?.next ?? current;
  const anchors = viewport(scene, shown.scene, active, top, draft ? current.scene : undefined);
  const targets = get('targets');
  const keepFocus = targets.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.hole : undefined;
  const labels = shown.scene.holes.map(h => {
    const b = document.createElement('button');
    const at = anchors.get(h.id);
    b.type = 'button'; b.className = 'hole-label'; b.dataset.hole = h.id;
    b.textContent = h.label + ' Ø' + Number(h.diameter.toPrecision(8));
    b.setAttribute('aria-label', '구멍 ' + h.label + ' 지름 ' + h.diameter + ' mm');
    b.setAttribute('aria-pressed', String(active === h.id));
    if (at) { b.style.left = (at[0] / 750 * 100) + '%'; b.style.top = (at[1] / 440 * 100) + '%'; }
    b.onclick = () => select(h.id);
    return b;
  });
  targets.replaceChildren(...labels);
  if (keepFocus) labels.find(b => b.dataset.hole === keepFocus)?.focus();
  get<HTMLButtonElement>('undo').disabled = !past.length;
  get<HTMLButtonElement>('redo').disabled = !ahead.length;
  get<HTMLButtonElement>('apply').disabled = !draft;
  get('view').textContent = top ? '입체로 보기' : '위에서 보기';
}
function select(id: string | null, autofill = true) {
  ++editRev;
  const ignored = Boolean(draft);
  active = id; draft = undefined;
  const h = activeHole();
  editor.hidden = !h;
  if (h) {
    get('selection').textContent = '구멍 ' + h.label + (h.label === 'A' ? ' · 가이드 쪽' : ' · 장비 쪽');
    diameter.value = String(h.diameter);
    get('summary').textContent = '숫자를 바꾸면 적용 전에 미리 봐요.';
    if (autofill && !codePanel.hidden) script.value = 'hole' + h.label + '.diameter = ' + h.diameter;
  }
  if (ignored) notice('적용하지 않은 미리보기를 취소했어요.');
  else notice();
  draw();
}
function size(value: number) {
  const h = activeHole();
  if (!h) return;
  ++editRev;
  draft = undefined;
  if (value === h.diameter) { get('summary').textContent = '변경 없음'; draw(); return; }
  const result = previewCasualDiameter(current, h.id, value);
  if (result.ok) {
    draft = result.value;
    const other = current.scene.holes.find(p => p.id !== h.id)!;
    get('summary').textContent = '미리보기 · Ø' + h.diameter + ' → Ø' + value + ' · ' + other.label + ' 유지';
    notice();
  } else {
    get('summary').textContent = result.reason;
    notice(result.reason);
  }
  draw();
}
scene.addEventListener('click', event => {
  const target = (event.target as SVGElement).closest<SVGElement>('[data-hole]');
  select(target?.dataset.hole ?? null);
});
diameter.addEventListener('input', () => size(diameter.valueAsNumber));
editor.addEventListener('submit', event => {
  event.preventDefault();
  if (!draft || !active) return;
  const next = commitCasualPreview(current, draft, active);
  if (!next) { select(null); notice('모델이 바뀌었어요. 구멍을 다시 선택해주세요.'); return; }
  const id = active;
  past.push(current); if (past.length > 16) past.shift();
  ahead.length = 0;
  current = next; draft = undefined;
  select(id); notice('지름을 적용했어요.');
});
get('cancel').onclick = () => select(null);
get('view').onclick = () => { top = !top; draw(); };
function go(from: PlateDocument[], to: PlateDocument[]) {
  const prev = from.pop();
  if (!prev) return;
  to.push(current); current = prev; draft = undefined; select(null);
}
get('undo').onclick = () => go(past, ahead);
get('redo').onclick = () => go(ahead, past);
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') select(null);
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  e.preventDefault(); if (e.shiftKey) go(ahead, past); else go(past, ahead);
});
get('open').onclick = () => get<HTMLInputElement>('file').click();
get<HTMLInputElement>('file').onchange = async event => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  const token = ++fileRev, observed = editRev;
  try {
    if (file.size > 16 * 1024 * 1024) { notice('이 파일은 Casual에서 열 수 있는 크기를 넘었어요. Studio에서 열어주세요.'); return; }
    const result = await readStudioFile(new Uint8Array(await file.arrayBuffer()));
    if (token !== fileRev || observed !== editRev) return;
    if ('error' in result) { notice(result.error); return; }
    const admitted = inspectCasualPlate(result.doc);
    if (!admitted.ok) { notice(admitted.reason); return; }
    current = admitted.value; past.length = 0; ahead.length = 0; draft = undefined;
    select(null); notice('파일을 열었어요.');
  } catch {
    if (token === fileRev && observed === editRev) notice('파일을 열지 못했어요. 현재 모델은 그대로예요.');
  }
};
get('save').onclick = () => {
  try {
    const contents = encodeStudioFile(current.doc);
    const url = URL.createObjectURL(new Blob([new Uint8Array(contents)], { type: 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = 'cable-guide-adapter.bcad'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
    notice(draft ? '아직 적용하지 않은 미리보기를 제외하고 저장했어요.' : 'CAD 파일을 저장했어요.');
  } catch { notice('저장하지 못했어요. 현재 모델은 그대로예요.'); }
};
let loadCode: typeof import('./code') | undefined;
let codeRev = 0;
get('code').onclick = async () => {
  const token = ++codeRev;
  codePanel.hidden = !codePanel.hidden;
  get('code').setAttribute('aria-expanded', String(!codePanel.hidden));
  if (codePanel.hidden) return;
  get<HTMLButtonElement>('run-code').disabled = !loadCode;
  try { loadCode ??= await import('./code'); }
  catch { if (token === codeRev) notice('코드 패널을 불러오지 못했어요.'); return; }
  if (codePanel.hidden || token !== codeRev) return;
  const h = activeHole();
  if (h) script.value = 'hole' + h.label + '.diameter = ' + (draft?.next.scene.holes.find(x => x.id === h.id)?.diameter ?? h.diameter);
  get<HTMLButtonElement>('run-code').disabled = false;
};
get('run-code').onclick = () => {
  const command = loadCode?.parseDiameterCode(script.value);
  if (!command) { select(active, false); notice('holeA.diameter = 8 형식으로 구멍 하나의 지름만 입력해주세요.'); return; }
  const h = current.scene.holes.find(x => x.label === command.label);
  if (!h) { notice('이 문서에서 구멍을 찾을 수 없어요.'); return; }
  select(h.id, false); diameter.value = String(command.diameter); size(command.diameter);
};
draw();
