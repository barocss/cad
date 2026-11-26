import { lookOf } from '@barocss/cad-model/app/bodies';
import { encodeStudioFile } from '@barocss/cad-model/engine/container';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { drawFixture, type FixtureBody, type FixturePart, type FixtureView } from './fixtureViewport';
import { readSensorSource, sensorDocumentAt, sensorSource } from './sensorEnclosure';
import { isSensorWidth, sensorWidth, sensorWidthRange } from './sensorWidth';

export { readSensorSource } from './sensorEnclosure';
const name = '센서 보드 케이스';
const fmt = (n: number) => String(Number(n.toPrecision(10)));
const roles: Record<string, FixturePart> = {
  'Lid':'lid', 'Case body':'body', 'Sensor board':'board',
  'Left front support':'left', 'Left rear support':'left', 'Right front support':'right', 'Right rear support':'right',
};

function buildScene(width: number) {
  const doc = sensorDocumentAt(width), result = evaluateDoc(doc, 0, 8);
  if (!result.ok || result.bodies.length !== 7) throw new Error('케이스 형상을 계산하지 못했어요.');
  const bodies: FixtureBody[] = result.bodies.map(b => {
    const part = roles[lookOf(doc, b).name ?? ''];
    if (!part) throw new Error('Unknown sensor part');
    return { mesh:b.mesh, part };
  });
  const boards = (part: FixturePart) => bodies.filter(b => b.part === part).map(b => b.mesh.bounds);
  const span = (part: FixturePart) => { const b = boards(part)[0]; return b.max[0] - b.min[0]; };
  const anchors = (part: 'left' | 'right') => boards(part).map(b => (b.min[0] + b.max[0]) / 2);
  const body = span('body'), lid = span('lid'), left = anchors('left'), right = anchors('right');
  if (body !== lid || left.length !== 2 || right.length !== 2 || left[0] !== left[1] || right[0] !== right[1]) {
    throw new Error('Sensor part dimensions do not agree');
  }
  return { width, doc, bodies, board: span('board'), body, left, right };
}
type Scene = ReturnType<typeof buildScene>;
type Hooks = { touch(): void; home(): void; open(): void; download(blob: Blob, name: string): void };

export function mountSensor(root: HTMLElement, hooks: Hooks, width: number = sensorWidth.default, filename = 'sensor-enclosure.cadrecipe') {
  let current = buildScene(width), saved = width, next: Scene | undefined;
  let view: FixtureView = 'exploded', focused: FixturePart[] = [], code = false, codeDirty = false;
  const past: Scene[] = [], future: Scene[] = [];
  root.innerHTML = `
  <div class="recipe-bar">
    <div class="recipe-identity"><span class="brand" aria-hidden="true">◈</span><div><div class="recipe-brand">CASUAL STUDIO</div><h1 id="sensor-title" tabindex="-1">${name}</h1></div></div>
    <nav aria-label="센서 레시피">
      <div class="recipe-toolgroup"><button id="sensor-home" type="button">시작</button><button id="sensor-open" type="button">열기</button></div>
      <div class="recipe-toolgroup"><button id="sensor-undo" type="button" aria-label="실행 취소">↶</button><button id="sensor-redo" type="button" aria-label="다시 실행">↷</button><button id="sensor-code" type="button" aria-expanded="false" aria-controls="sensor-code-panel">코드</button></div>
      <div class="recipe-toolgroup"><button id="sensor-save" type="button">레시피 저장</button><button id="sensor-export" type="button">CAD 내보내기</button></div>
    </nav>
  </div>
  <div class="sensor-desk">
    <aside id="sensor-code-panel" hidden><label for="sensor-source">센서 케이스 코드</label>
    <textarea id="sensor-source" spellcheck="false" aria-describedby="sensor-code-note"></textarea><small id="sensor-code-note">boardWidth에 ${sensorWidthRange}를 입력하세요. 케이스와 고정점이 함께 바뀝니다.</small>
    <button id="sensor-code-preview" type="button">코드 미리보기</button></aside>
    <main class="sensor-editor">
      <div class="recipe-work-head"><div><p><strong>보드에 맞게 케이스를 넓혀 보세요</strong></p><p id="sensor-state">적용된 폭</p></div>
        <div id="sensor-views" role="group" aria-label="모델 보기">
        <button type="button" data-view="exploded">분해</button><button type="button" data-view="inside">내부</button><button type="button" data-view="assembled">조립</button></div></div>
      <div class="sensor-grid">
        <div class="recipe-stage sensor-stage"><svg id="sensor-scene" viewBox="0 0 800 500" role="img" aria-label="본체, 뚜껑, 보드와 고정점 네 개"></svg></div>
        <aside class="sensor-context" aria-label="보드 폭과 영향">
          <form id="sensor-form"><label for="sensor-width">보드 폭</label><div class="recipe-value"><input id="sensor-width" type="number" min="${sensorWidth.min}" max="${sensorWidth.max}" step="any" required aria-describedby="sensor-range sensor-error"><span>mm</span></div>
          <p id="sensor-range">${sensorWidthRange} · 왼쪽 기준</p><p id="sensor-error" role="alert"></p>
          <div class="recipe-actions"><button id="sensor-preview" type="submit">미리보기</button>
          <button id="sensor-reset" type="button" hidden>기본값 ${sensorWidth.default} mm로</button></div></form>
          <div id="sensor-impact" hidden><h2>치수 변화</h2><div id="sensor-rows"></div>
          <small>고정점 위치는 케이스 왼쪽에서 잰 X값입니다.</small></div>
          <div class="recipe-actions" id="sensor-actions" hidden><button id="sensor-cancel" type="button">취소</button><button id="sensor-apply" type="button">적용</button></div>
        </aside>
      </div>
      <p id="sensor-status" role="status"></p>
    </main>
  </div>`;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#sensor-' + id)!;
  const button = (id: string) => get<HTMLButtonElement>(id);
  const field = get<HTMLInputElement>('width'), source = get<HTMLTextAreaElement>('source');
  const svg = root.querySelector<SVGSVGElement>('#sensor-scene')!;
  const status = (message = '') => { get('status').textContent = message; };
  const error = (message = '') => { get('error').textContent = message; field.toggleAttribute('aria-invalid', !!message); };
  const renderCanvas = () => drawFixture(svg, (next ?? current).bodies, view, new Set(focused.length ? focused : next ? ['board','body','lid','right'] : []), !!focused.length);
  const rows = [
    { label:'보드 폭', parts:['board'], value:(s: Scene) => fmt(s.board) + ' mm' },
    { label:'본체 · 뚜껑 폭', parts:['body','lid'], value:(s: Scene) => fmt(s.body) + ' mm' },
    { label:'오른쪽 고정점 2개', parts:['right'], value:(s: Scene) => fmt(s.right[0]) + ' mm' },
    { label:'왼쪽 고정점 2개', parts:['left'], value:(s: Scene) => fmt(s.left[0]) + ' mm' },
    { label:'포트 크기', parts:[], value:() => '10 × 6 mm' },
  ] as const;
  function render() {
    button('undo').disabled = !past.length; button('redo').disabled = !future.length;
    get('impact').hidden = get('actions').hidden = !next;
    button('apply').disabled = !next;
    button('reset').hidden = current.width === sensorWidth.default;
    button('reset').disabled = draftExists();
    get('state').textContent = `적용된 폭 ${fmt(current.width)} mm` + (next ? ` · ${fmt(next.width)} mm 미리보기` : '');
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    const display = next;
    get('rows').replaceChildren(...(display ? rows.map(row => {
      const item = document.createElement(row.parts.length ? 'button' : 'div');
      if (item instanceof HTMLButtonElement) item.type = 'button';
      item.className = 'sensor-row';
      const before = row.value(current), after = row.value(display);
      const label = document.createElement('span'), value = document.createElement('strong');
      label.textContent = row.label; value.textContent = before === after ? `${before} 유지` : `${before} → ${after}`;
      item.append(label, value);
      if (row.parts.length) {
        const emphasize = () => { focused = [...row.parts]; renderCanvas(); };
        const restore = () => { focused = []; renderCanvas(); };
        item.onpointerenter = item.onfocus = emphasize;
        item.onpointerleave = item.onblur = restore;
        item.onclick = emphasize;
      }
      return item;
    }) : []));
    renderCanvas();
  }
  const resetInput = () => { field.value = String(current.width); source.value = sensorSource(current.width); codeDirty = false; };
  function clear() { next = undefined; focused = []; resetInput(); error(); render(); }
  function preview(value: number | null) {
    next = undefined; focused = []; status();
    if (!isSensorWidth(value)) {
      error(`${sensorWidthRange} 사이의 보드 폭을 입력하세요.`); render(); return;
    }
    if (value === current.width) { error(); status('변경 없음'); render(); return; }
    try { next = buildScene(value); error(); }
    catch { error('케이스 형상을 계산하지 못했어요. 현재 모델은 그대로예요.'); }
    render();
  }
  const draftExists = () => !!next || field.valueAsNumber !== current.width || codeDirty;
  button('home').onclick = hooks.home; button('open').onclick = hooks.open;
  field.oninput = () => { hooks.touch(); next = undefined; focused = []; error(); status(); render(); };
  get<HTMLFormElement>('form').noValidate = true;
  get<HTMLFormElement>('form').onsubmit = event => { event.preventDefault(); hooks.touch(); preview(field.valueAsNumber); };
  button('reset').onclick = () => {
    if (current.width === sensorWidth.default || draftExists()) return;
    hooks.touch();
    field.value = String(sensorWidth.default);
    preview(sensorWidth.default);
    if (next) button('apply').focus();
    else field.focus();
  };
  button('cancel').onclick = () => { hooks.touch(); clear(); status('미리보기를 취소했어요.'); field.focus(); };
  button('apply').onclick = () => {
    if (!next) return;
    hooks.touch(); past.push(current); if (past.length > 24) past.shift();
    current = next; future.length = 0; clear(); status('보드 폭을 적용했어요.'); field.focus();
  };
  function move(from: Scene[], to: Scene[]) {
    const model = from.pop(); if (!model) return;
    hooks.touch(); to.push(current); current = model; clear(); status('보드 폭을 복원했어요.');
  }
  button('undo').onclick = () => move(past, future);
  button('redo').onclick = () => move(future, past);
  root.onkeydown = event => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && draftExists()) { event.preventDefault(); button('cancel').click(); return; }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? button('redo') : button('undo')).click(); }
  };
  button('code').onclick = () => {
    hooks.touch(); code = !code; get('code-panel').hidden = !code; button('code').setAttribute('aria-expanded', String(code));
    if (code) source.focus();
  };
  source.oninput = () => { hooks.touch(); codeDirty = source.value !== sensorSource(current.width); next = undefined; focused = []; error(); render(); };
  button('code-preview').onclick = () => {
    hooks.touch();
    const value = readSensorSource(source.value);
    field.value = value === null ? String(current.width) : String(value);
    preview(value);
    if (value === null) status('예제 형식에 맞춰 boardWidth만 바꿀 수 있어요.');
  };
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view as FixtureView; focused = []; render(); });
  button('save').onclick = () => {
    hooks.download(new Blob([sensorSource(current.width)], {type:'text/plain'}), filename);
    saved = current.width; status(draftExists() ? '미적용 입력은 빼고 레시피를 저장했어요.' : '레시피를 저장했어요.');
  };
  button('export').onclick = () => {
    try {
      hooks.download(new Blob([new Uint8Array(encodeStudioFile(current.doc))], {type:'application/octet-stream'}), filename.replace(/\.cadrecipe$/i, '') + '.bcad');
      status(draftExists() ? '미적용 입력은 빼고 CAD 파일을 내보냈어요.' : 'CAD 파일을 내보냈어요.');
    } catch { status('CAD 파일을 내보내지 못했어요.'); }
  };
  resetInput(); render(); get('title').focus();
  return { notice:status, hasDraft:draftExists, hasUnsaved:() => current.width !== saved };
}
