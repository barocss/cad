import './styles.css';
import { inspectCasualPlate, previewCasualDiameter, commitCasualPreview, type PlateDocument, type DiameterPreview } from '@barocss/cad-model/app/casualPlate';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { viewport } from './viewport';
import { sensorWidthRange } from './sensorWidth';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
<header><span class="brand" aria-hidden="true">◈</span><strong>Casual Studio</strong>
<input id="file" type="file" accept=".bcad,.cadrecipe" hidden>
<nav id="tools" aria-label="문서" hidden><button id="home" type="button">시작 화면</button><button id="undo" type="button" aria-label="실행 취소">↶</button><button id="redo" type="button" aria-label="다시 실행">↷</button>
<button id="code" type="button" aria-expanded="false">&lt;/&gt; 코드</button><button id="open" type="button">열기</button>
<button id="save" type="button">저장</button></nav></header>
<main id="start" class="start">
<div class="start-intro"><p class="eyebrow">CASUAL STUDIO</p>
<h1 id="start-title" tabindex="-1">있는 설계를 내 부품에 맞추세요</h1>
<p>용도에 맞는 예제를 고르고, 필요한 치수만 바꿔 CAD 파일로 가져가세요.</p></div>
<div class="examples">
<article class="example" aria-labelledby="example-name">
<div class="example-art" aria-hidden="true">
<svg viewBox="0 0 280 152" focusable="false">
<path d="M33 54 157 23 249 68 126 107Z" fill="#cfdef2" stroke="#688ab0" stroke-width="1.5"/>
<path d="M33 54 126 107 249 68v15l-123 40L33 69Z" fill="#8ca6c1" stroke="#688ab0" stroke-width="1.5"/>
<path d="M126 107 249 68v15l-123 40Z" fill="#a6bed8"/>
<ellipse cx="107" cy="61" rx="11" ry="6" fill="#58738f" stroke="#6d94bb"/>
<ellipse cx="178" cy="67" rx="11" ry="6" fill="#58738f" stroke="#6d94bb"/>
</svg>
</div>
<div class="example-copy"><p class="eyebrow">시작 예제</p><h2 id="example-name">케이블 가이드 어댑터</h2>
<p>장비에 새 구멍을 뚫지 않고 기존 구멍으로 케이블 가이드를 옆에 달아요.</p>
<p class="editable-values">바꿀 수 있는 값: 구멍 A · B 지름</p>
<button id="starter" type="button">이 예제로 시작</button></div>
</article>
<article class="example" aria-labelledby="sensor-example-name">
<div class="example-art sensor-example-art" aria-hidden="true"><svg viewBox="0 0 280 152" focusable="false">
<path fill="#9bb2c8" stroke="#557894" d="M47 99 147 67 234 103 134 135Z M47 99v13l87 33v-10Z M134 135v10l100-32v-10Z"/>
<path fill="#80b3a3" stroke="#56877c" d="m64 76 84-26 70 27-84 27Z"/>
<path fill="#bccfe2" stroke="#557894" d="m47 49 100-32 87 36-100 32Z M47 49v7l87 36v-7Z M134 85v7l100-32v-7Z"/>
</svg></div>
<div class="example-copy"><p class="eyebrow">조립 예제</p><h2 id="sensor-example-name">센서 보드 케이스</h2>
<p>더 넓은 센서 보드를 넣어도 포트와 왼쪽 고정점은 그대로 유지해요.</p>
<p class="editable-values">바꿀 수 있는 값: 보드 폭 ${sensorWidthRange}</p>
<button id="start-sensor" type="button">센서 케이스 열기</button></div>
</article>
<article class="example" aria-labelledby="vise-example-name">
<div class="example-art vise-example-art" aria-hidden="true"><svg viewBox="0 0 280 152" focusable="false">
<path fill="#abc2d4" stroke="#65839e" d="M41 83 117 51 237 98 161 130Z M41 83v13l120 47v-13Z M161 130v13l76-32V98Z"/>
<path fill="#d5e2ec" stroke="#65839e" d="m67 52 44-21 38 15-44 21Z m0 0v34l38 15V67Z m38 15v34l44-21V46Z M162 86l44-21 24 10-44 21Z m0 0v23l24 10V96Z m24 10v23l44-21V75Z"/>
</svg></div>
<div class="example-copy"><p class="eyebrow">조립 예제</p><h2 id="vise-example-name">셀프센터링 바이스</h2>
<p>작업물 폭에 맞춰 양쪽 조를 벌리고, 한쪽 높이만 따로 바꿔요.</p>
<p class="editable-values">바꿀 수 있는 값: 물림 간격 · 조 높이</p>
<button id="start-vise" type="button">바이스 열기</button></div>
</article>
</div>
<div class="start-file"><button id="start-rover" type="button">로버 조립 보기</button>
<small>25개 부품을 조립·분해하고 4단계로 살펴봐요. 치수 편집은 하지 않아요.</small></div>
<div class="start-file"><button id="start-code" type="button">코드로 만들기</button>
<small>빈 캔버스에서 판과 관통 구멍을 코드로 정의해요.</small></div>
<div class="start-file"><button id="open-start" type="button">내 CAD 파일 열기</button>
<small>레시피(.cadrecipe) 또는 지원하는 .bcad(두 관통 구멍이 있는 직사각 판)</small></div>
<p id="start-notice" role="status"></p></main>
<div id="workarea" class="workarea" hidden><aside id="code-panel" hidden><label for="script">코드 · 지름 편집</label>
<textarea id="script" spellcheck="false" aria-describedby="code-hint"></textarea><small id="code-hint">예: holeA.diameter = 8</small>
<button id="run-code" type="button">미리보기</button></aside>
<section class="workspace" aria-label="모델 편집">
<h1 id="model-title" tabindex="-1">케이블 가이드 어댑터</h1>
<div class="canvas-head"><p id="model-purpose">기존 고정 구멍으로 케이블 가이드를 옆에 달기</p><button id="view" type="button">위에서 보기</button></div>
<div class="canvas">
<svg id="scene" viewBox="0 0 750 440" role="img" aria-label="두 관통 구멍이 있는 CAD 판"></svg>
<div id="targets" class="targets" aria-label="구멍 선택"></div>
</div>
<form id="editor" class="popover" hidden><h2 id="selection"></h2><label>지름 <input id="diameter" type="number" inputmode="decimal" step="any" aria-describedby="summary"> mm</label>
<p id="summary"></p><div><button id="cancel" type="button">취소</button><button id="apply" type="submit">적용</button></div></form>
<p id="notice" role="status" aria-live="polite"></p></section></div>
<section id="recipe-workspace" hidden aria-label="코드 모델링"></section>
<section id="sensor-workspace" hidden aria-label="센서 케이스 모델링"></section>
<section id="vise-workspace" hidden aria-label="바이스 모델링"></section>
<section id="rover-workspace" hidden aria-label="로버 조립 보기"></section>
<dialog id="switch-dialog" aria-labelledby="switch-title" aria-describedby="switch-detail">
<h2 id="switch-title">현재 편집을 버리고 이동할까요?</h2><p id="switch-detail"></p>
<div><button id="keep" type="button" autofocus>계속 편집</button><button id="discard" type="button">버리고 이동</button></div></dialog>`;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let current: PlateDocument, saved: PlateDocument;
let editing = false;
let recipe: ReturnType<typeof import('./recipeWork')['mountRecipe']> | undefined;
let sensor: ReturnType<typeof import('./sensorWork')['mountSensor']> | undefined;
let vise: ReturnType<typeof import('./viseWork')['mountVise']> | undefined;
let disposeRover: (() => void) | undefined;
let fileName = 'cable-guide-adapter.bcad';
let numberDraft = false, codeDraft = false;
let pendingSwitch: (() => void) | undefined;
let draft: DiameterPreview | undefined;
let active: string | null = null;
let top = false;
let fileRev = 0, editRev = 0;
const past: PlateDocument[] = [], ahead: PlateDocument[] = [];
const editor = get<HTMLFormElement>('editor'), diameter = get<HTMLInputElement>('diameter');
const codePanel = get('code-panel'), script = get<HTMLTextAreaElement>('script');
const notice = (t = '') => { if (vise) vise.notice(t); else if (sensor) sensor.notice(t); else if (recipe) recipe.notice(t); else get(editing ? 'notice' : 'start-notice').textContent = t; };
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
  active = id; draft = undefined; numberDraft = false;
  const h = activeHole();
  editor.hidden = !h;
  if (h) {
    get('selection').textContent = '구멍 ' + h.label;
    diameter.value = String(h.diameter);
    get('summary').textContent = '숫자를 바꾸면 적용 전에 미리 봐요.';
    if (autofill && !codePanel.hidden) {
      script.value = 'hole' + h.label + '.diameter = ' + h.diameter;
      codeDraft = false;
    }
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
  numberDraft = value !== h.diameter;
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
  if (!editing || dialog.open) return;
  if (e.key === 'Escape') select(null);
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  e.preventDefault(); if (e.shiftKey) go(ahead, past); else go(past, ahead);
});
const dialog = get<HTMLDialogElement>('switch-dialog');
function confirmSwitch(action: () => void) {
  const activeRecipe = vise ?? sensor ?? recipe;
  const dirty = activeRecipe ? activeRecipe.hasUnsaved() : editing && current !== saved;
  const pending = activeRecipe ? activeRecipe.hasDraft() : editing && (draft || numberDraft || codeDraft);
  if (!dirty && !pending) { action(); return; }
  const changes = [];
  if (pending) changes.push('아직 적용하지 않은 입력이 있어요.');
  if (dirty) changes.push(activeRecipe ? '적용했지만 레시피로 저장하지 않은 변경이 있어요.' : '적용했지만 CAD 파일로 저장하지 않은 변경이 있어요.');
  get('switch-detail').textContent = changes.join(' ');
  pendingSwitch = action;
  dialog.showModal();
}
dialog.addEventListener('cancel', event => {
  event.preventDefault(); pendingSwitch = undefined; dialog.close();
});
get('keep').onclick = () => { pendingSwitch = undefined; dialog.close(); };
get('discard').onclick = () => {
  const action = pendingSwitch;
  pendingSwitch = undefined; dialog.close(); action?.();
};
function clearWorkspaces() {
  recipe = undefined; sensor = undefined; vise = undefined;
  disposeRover?.(); disposeRover=undefined;
  for (const id of ['recipe-workspace','sensor-workspace','vise-workspace','rover-workspace']) {
    const host = get(id);
    host.hidden = true; host.onkeydown = null; host.replaceChildren();
  }
}
function setEditing(value: boolean) {
  clearWorkspaces();
  editing = value;
  get('start').hidden = value;
  get('workarea').hidden = get('tools').hidden = !value;
  get(value ? 'model-title' : 'start-title').focus();
}
function openModel(model: PlateDocument, name: string) {
  current = saved = model; fileName = name;
  past.length = 0; ahead.length = 0; top = false;
  draft = undefined; codeDraft = false; script.value = '';
  ++codeRev; codePanel.hidden = true; get('code').setAttribute('aria-expanded', 'false');
  get('model-title').textContent = name;
  get('model-purpose').textContent = '캔버스에서 지름을 바꿀 구멍을 선택하세요.';
  setEditing(true); select(null);
}
get('starter').onclick = async () => {
  const token = ++fileRev;
  try {
    const module = await import('./recipeWork');
    if (token === fileRev) showRecipe(module, module.cableGuideStarter());
  } catch { if (token === fileRev) notice('예제를 열지 못했어요. 다시 시도해주세요.'); }
};
const goHome = () => confirmSwitch(() => {
  ++fileRev; setEditing(false); notice();
});
const pickFile = () => get<HTMLInputElement>('file').click();
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
};
const hooks = { touch: () => { ++editRev; }, download, home: goHome, open: pickFile };
function showSensor(module: typeof import('./sensorWork'), width?: number, name?: string) {
  clearWorkspaces();
  ++editRev;
  editing = false;
  get('start').hidden = get('workarea').hidden = get('tools').hidden = true;
  const host = get('sensor-workspace'); host.hidden = false;
  sensor = module.mountSensor(host, hooks, width, name);
}
function showVise(module: typeof import('./viseWork'), values?: Parameters<typeof module.mountVise>[2], name?: string) {
  clearWorkspaces();
  ++editRev;
  editing = false;
  get('start').hidden = get('workarea').hidden = get('tools').hidden = true;
  const host = get('vise-workspace'); host.hidden = false;
  vise = module.mountVise(host,hooks,values,name);
}
get('start-vise').onclick = async () => {
  const token=++fileRev;
  try {
    const module=await import('./viseWork');
    if (token===fileRev) showVise(module);
  } catch { if (token===fileRev) { setEditing(false); notice('바이스를 열지 못했어요.'); } }
};
get('start-rover').onclick = async () => {
  const token=++fileRev, button=get<HTMLButtonElement>('start-rover');
  button.disabled=true; notice('로버를 여는 중이에요.');
  try {
    const module=await import('./roverWork');
    const model=await module.loadRover();
    if (token!==fileRev) return;
    setEditing(false);
    ++editRev;
    get('start').hidden=true; notice();
    const host=get('rover-workspace');
    host.hidden=false;
    disposeRover=module.mountRover(host,model,hooks);
  } catch {
    if (token===fileRev) {setEditing(false);notice('로버를 열지 못했어요. 다시 시도해주세요.');}
  } finally {button.disabled=false;}
};
get('start-sensor').onclick = async () => {
  const token = ++fileRev;
  try {
    const module = await import('./sensorWork');
    if (token === fileRev) showSensor(module);
  } catch { if (token === fileRev) { setEditing(false); notice('센서 케이스를 열지 못했어요.'); } }
};
function showRecipe(module: typeof import('./recipeWork'), loaded?: Parameters<typeof module.mountRecipe>[2]) {
  clearWorkspaces();
  ++editRev;
  editing = false;
  get('start').hidden = get('workarea').hidden = get('tools').hidden = true;
  const host = get('recipe-workspace'); host.hidden = false;
  recipe = module.mountRecipe(host, hooks, loaded);
}
get('start-code').onclick = async () => {
  const token = ++fileRev;
  try {
    const module = await import('./recipeWork');
    if (token === fileRev) showRecipe(module);
  } catch { if (token === fileRev) notice('코드 편집기를 열지 못했어요.'); }
};
get('home').onclick = goHome;
get('open').onclick = get('open-start').onclick = pickFile;
get<HTMLInputElement>('file').onchange = async event => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  const token = ++fileRev, observed = editRev;
  try {
    if (/\.cadrecipe$/i.test(file.name)) {
      const module = await import('./recipeWork');
      if (file.size > module.RECIPE_LIMIT * 4) { if (token === fileRev && observed === editRev) notice('레시피 파일이 너무 커요.'); return; }
      const source = await file.text();
      if (token !== fileRev || observed !== editRev) return;
      if (/^\s*sensor-enclosure\b/m.test(source)) {
        const sensorModule = await import('./sensorWork');
        if (token !== fileRev || observed !== editRev) return;
        const width = sensorModule.readSensorSource(source);
        if (width === null) { notice(`센서 케이스 레시피는 보드 폭 ${sensorWidthRange}를 사용해요.`); return; }
        confirmSwitch(() => {
          if (token !== fileRev || observed !== editRev) return;
          showSensor(sensorModule, width, file.name); notice('센서 케이스 레시피를 열었어요.');
        });
        return;
      }
      if (/^\s*centering-vise\b/m.test(source)) {
        const viseModule=await import('./viseWork');
        if (token!==fileRev || observed!==editRev) return;
        const values=viseModule.readViseSource(source);
        if (!values) {notice('바이스 레시피의 간격과 조 높이 범위를 확인해주세요.');return;}
        confirmSwitch(()=>{
          if (token!==fileRev || observed!==editRev) return;
          showVise(viseModule,values,file.name); notice('바이스 레시피를 열었어요.');
        });
        return;
      }
      const result = module.compileCasualRecipe(source);
      if (!result.ok) { notice(result.line + '행: ' + result.reason); return; }
      confirmSwitch(() => {
        if (token !== fileRev || observed !== editRev) return;
        showRecipe(module, { model:result.value, filename:file.name }); notice('레시피를 열었어요.');
      });
      return;
    }
    if (file.size > 16 * 1024 * 1024) { notice('이 파일은 Casual에서 열 수 있는 크기를 넘었어요. Studio에서 열어주세요.'); return; }
    const result = await readStudioFile(new Uint8Array(await file.arrayBuffer()));
    if (token !== fileRev || observed !== editRev) return;
    if ('error' in result) { notice(result.error); return; }
    const admitted = inspectCasualPlate(result.doc);
    if (!admitted.ok) { notice(admitted.reason); return; }
    confirmSwitch(() => {
      if (token !== fileRev || observed !== editRev) return;
      openModel(admitted.value, file.name); notice('파일을 열었어요.');
    });
  } catch {
    if (token === fileRev && observed === editRev) notice('파일을 열지 못했어요. 현재 모델은 그대로예요.');
  }
};
get('save').onclick = () => {
  try {
    const contents = encodeStudioFile(current.doc);
    download(new Blob([new Uint8Array(contents)], { type: 'application/octet-stream' }), fileName);
    saved = current;
    notice(draft ? '아직 적용하지 않은 미리보기를 제외하고 저장했어요.' : 'CAD 파일을 저장했어요.');
  } catch { notice('저장하지 못했어요. 현재 모델은 그대로예요.'); }
};
let loadCode: typeof import('./code') | undefined;
let codeRev = 0;
get('code').onclick = async () => {
  ++editRev;
  const token = ++codeRev;
  codePanel.hidden = !codePanel.hidden;
  get('code').setAttribute('aria-expanded', String(!codePanel.hidden));
  if (codePanel.hidden) return;
  get<HTMLButtonElement>('run-code').disabled = !loadCode;
  try { loadCode ??= await import('./code'); }
  catch { if (token === codeRev) notice('코드 패널을 불러오지 못했어요.'); return; }
  if (codePanel.hidden || token !== codeRev) return;
  const h = activeHole();
  if (h && !codeDraft) script.value = 'hole' + h.label + '.diameter = ' + (draft?.next.scene.holes.find(x => x.id === h.id)?.diameter ?? h.diameter);
  get<HTMLButtonElement>('run-code').disabled = false;
};
script.addEventListener('input', () => { ++editRev; codeDraft = true; });
get('run-code').onclick = () => {
  const command = loadCode?.parseDiameterCode(script.value);
  if (!command) { select(active, false); notice('holeA.diameter = 8 형식으로 구멍 하나의 지름만 입력해주세요.'); return; }
  const h = current.scene.holes.find(x => x.label === command.label);
  if (!h) { notice('이 문서에서 구멍을 찾을 수 없어요.'); return; }
  codeDraft = false;
  select(h.id, false); diameter.value = String(command.diameter); size(command.diameter);
};
