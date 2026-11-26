import { compileCasualRecipe, previewRecipeDiameter, RECIPE_LIMIT, type RecipeModel } from '@barocss/cad-model/app/casualRecipe';
import { encodeStudioFile } from '@barocss/cad-model/engine/container';
import { viewport } from './viewport';

export { compileCasualRecipe, RECIPE_LIMIT };
const sample = `recipe 1
units mm

param guideDia = 6

plate base width=60 depth=40 thickness=5
hole guide in=base at=(12, 13) diameter=guideDia
hole mount in=base at=(43, 15) diameter=8
hole cable in=base at=(28, 30) diameter=4
output base
`;

type Hooks = { touch(): void; home(): void; open(): void; download(blob: Blob, name: string): void };
export function mountRecipe(root: HTMLElement, hooks: Hooks, loaded?: { model: RecipeModel; filename: string }) {
  root.innerHTML = `
  <div class="recipe-bar">
    <h1>코드로 만드는 모델</h1>
    <nav aria-label="레시피">
      <button id="recipe-home" type="button">시작 화면</button><button id="recipe-open" type="button">열기</button>
      <button id="recipe-undo" type="button">실행 취소</button><button id="recipe-redo" type="button">다시 실행</button>
      <button id="recipe-toggle" type="button" aria-controls="recipe-panel" aria-expanded="true">코드</button>
      <button id="recipe-save" type="button">레시피 저장</button><button id="recipe-export" type="button">CAD 내보내기</button>
    </nav>
  </div>
  <div class="workarea recipe-work">
    <aside id="recipe-panel">
      <label for="recipe-source">CAD 레시피</label>
      <textarea id="recipe-source" maxlength="${RECIPE_LIMIT}" spellcheck="false" placeholder="recipe 1&#10;units mm"></textarea>
      <div class="recipe-actions"><button id="recipe-run" type="button">미리보기</button><button id="recipe-insert" type="button">샘플 코드 삽입</button></div>
      <p id="recipe-error" role="alert"></p>
    </aside>
    <section class="workspace" aria-label="레시피 모델">
      <div class="canvas-head"><p id="recipe-state"></p><button id="recipe-view" type="button">위에서 보기</button></div>
      <div class="canvas recipe-canvas">
        <svg id="recipe-scene" viewBox="0 0 750 440" role="img" aria-label="레시피로 만든 판"></svg>
        <p id="recipe-empty">코드를 입력하고 미리보기를 누르면 여기에 모델이 나와요.</p>
      </div>
      <div id="recipe-targets" class="recipe-actions" aria-label="구멍 선택"></div>
      <p id="recipe-selection"></p>
      <form id="recipe-dimensions" hidden>
        <label>지름 <input id="recipe-diameter" type="number" step="any" min="0.01" max="10000" required inputmode="decimal"> mm</label>
        <button id="recipe-size" type="submit">치수 미리보기</button>
        <p id="recipe-binding"></p><p id="recipe-dimension-error" role="alert"></p>
      </form>
      <div class="recipe-actions"><button id="recipe-cancel" type="button">초안 취소</button><button id="recipe-apply" type="button">적용</button></div>
      <p id="recipe-status" role="status"></p>
    </section>
  </div>`;
  const query = <E extends Element>(id: string) => root.querySelector<E>('#' + id)!;
  const input = query<HTMLTextAreaElement>('recipe-source'), svg = query<SVGSVGElement>('recipe-scene');
  const panel = query<HTMLElement>('recipe-panel');
  const dimensions = query<HTMLFormElement>('recipe-dimensions'), diameter = query<HTMLInputElement>('recipe-diameter');
  const dimensionError = query('recipe-dimension-error'), targetList = query('recipe-targets');
  const button = (id: string) => query<HTMLButtonElement>('recipe-' + id);
  const error = query('recipe-error'), status = query('recipe-status');
  let committed = loaded?.model, preview: RecipeModel | undefined;
  let saved = committed?.source ?? '', top = false, selected: string | null = null;
  const file = loaded?.filename ?? 'plate.cadrecipe';
  const past: (RecipeModel | undefined)[] = [], next: (RecipeModel | undefined)[] = [];
  input.value = saved;
  let rawDiameter: string | undefined, diameterImpact: string | undefined;
  const textareaValue = (source = '') => source.replace(/\r\n?/g,'\n');
  const hasCodeDraft = () => input.value !== textareaValue(committed?.source);
  const hasDraft = () => rawDiameter !== undefined || hasCodeDraft();
  const notice = (message: string) => { status.textContent = message; };
  function render() {
    const showing = preview ?? committed;
    if (!showing?.holes.some(h => h.id === selected)) selected = null;
    const uses = diameterImpact ? preview?.declarations.get(diameterImpact)?.uses : undefined;
    const impact = uses && preview ? {
      holes: new Set(preview.holes.filter(h => uses.has(h.name)).map(h => h.id)),
      plate: uses.has(preview.plateName),
    } : undefined;
    if (showing) viewport(svg, showing.scene, selected, top, preview ? committed?.scene : undefined, impact);
    else svg.replaceChildren();
    query<HTMLElement>('recipe-empty').hidden = Boolean(showing);
    const picked = showing?.holes.find(h => h.id === selected);
    query('recipe-selection').textContent = picked ? picked.name + ' · Ø' + picked.diameter + ' mm' +
      (picked.diameterParam ? '' : ' · 지름은 코드에 직접 입력돼 있어요.') : '';
    const targets = showing?.holes ?? [];
    const focused = (document.activeElement as HTMLElement | null)?.dataset.recipeHole;
    if (targetList.children.length !== targets.length || targets.some((h,i) => (targetList.children[i] as HTMLElement).dataset.recipeHole !== h.id)) {
      targetList.replaceChildren(...targets.map(h => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.recipeHole = h.id; b.textContent = h.name;
        b.onclick = () => choose(h.id);
        return b;
      }));
      if (focused) targetList.querySelector<HTMLButtonElement>('[data-recipe-hole="' + focused + '"]')?.focus();
    }
    for (const b of targetList.children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.recipeHole === selected));
    const binding = picked?.diameterParam;
    dimensions.hidden = !binding;
    if (binding && picked) {
      const value = rawDiameter ?? String(picked.diameter);
      if (diameter.value !== value) diameter.value = value;
      diameter.disabled = button('size').disabled = hasCodeDraft();
      const consumers = showing?.declarations.get(binding)?.uses;
      query('recipe-binding').textContent = '코드의 ' + binding + ' 수정 · 연결된 피처: ' +
        [...(consumers ?? [])].join(', ') + (hasCodeDraft() ? ' · 현재 초안을 먼저 적용하거나 취소하세요.' : '');
    }
    query('recipe-state').textContent = preview ? '미리보기 · 관통 구멍 ' + preview.holes.length + '개'
      : committed ? '마지막 적용 모델 · 관통 구멍 ' + committed.holes.length + '개' : '빈 프로젝트';
    input.readOnly = rawDiameter !== undefined;
    button('run').disabled = !hasCodeDraft() || rawDiameter !== undefined;
    button('insert').disabled = input.value.length > 0;
    button('apply').disabled = !preview;
    button('cancel').disabled = !hasDraft();
    button('save').disabled = button('export').disabled = !committed;
    button('undo').disabled = past.length === 0 || hasDraft();
    button('redo').disabled = next.length === 0 || hasDraft();
    button('view').disabled = !showing;
    button('view').textContent = top ? '입체로 보기' : '위에서 보기';
  }
  function revised() {
    hooks.touch(); preview = undefined; diameterImpact = undefined; error.textContent = ''; dimensionError.textContent = ''; notice(''); render();
  }
  input.oninput = revised;
  button('insert').onclick = () => { if (!input.value) { input.value = sample; revised(); input.focus(); } };
  button('run').onclick = () => {
    if (!hasCodeDraft() || rawDiameter !== undefined) return;
    const result = compileCasualRecipe(input.value);
    if (result.ok) { error.textContent = ''; preview = result.value; notice('형상을 확인한 뒤 적용하세요.'); }
    else { preview = undefined; error.textContent = result.line + '행: ' + result.reason; notice('적용된 모델은 그대로예요.'); }
    render();
  };
  function load(value: RecipeModel | undefined) {
    rawDiameter = undefined; committed = value; input.value = committed?.source ?? ''; revised();
  }
  button('cancel').onclick = () => load(committed);
  button('apply').onclick = () => {
    if (!preview || textareaValue(preview.source) !== input.value) return;
    past.push(committed); if (past.length > 16) past.shift(); next.length = 0;
    load(preview); notice('레시피를 적용했어요.');
  };
  const history = (from: typeof past, to: typeof past) => {
    if (!from.length) return;
    to.push(committed); load(from.pop());
  };
  button('undo').onclick = () => history(past, next);
  button('redo').onclick = () => history(next, past);
  button('view').onclick = () => { top = !top; render(); };
  function choose(id: string | null) {
    if (rawDiameter !== undefined && id !== selected) {
      notice('입력한 지름을 미리 보거나 초안을 취소한 뒤 다른 구멍을 고르세요.');
      return;
    }
    selected = id; dimensionError.textContent = ''; render();
  }
  diameter.oninput = () => {
    const picked = committed?.holes.find(h => h.id === selected);
    if (!picked || hasCodeDraft()) return;
    rawDiameter = diameter.value === String(picked.diameter) ? undefined : diameter.value;
    hooks.touch(); dimensionError.textContent = ''; render();
  };
  svg.addEventListener('click', event => choose((event.target as SVGElement).closest<SVGElement>('[data-hole]')?.dataset.hole ?? null));
  dimensions.onsubmit = event => {
    event.preventDefault();
    if (!committed || !selected || hasCodeDraft()) return;
    const result = previewRecipeDiameter(committed, selected, diameter.valueAsNumber);
    if (!result.ok) { dimensionError.textContent = result.reason; return; }
    rawDiameter = undefined; hooks.touch();
    if (result.value === committed) { render(); dimensionError.textContent = '변경 없음'; return; }
    diameterImpact = committed.holes.find(h => h.id === selected)?.diameterParam;
    dimensionError.textContent = ''; error.textContent = '';
    input.value = result.value.source; preview = result.value;
    notice('연결된 곳을 확인한 뒤 적용하세요.'); render();
  };
  button('toggle').onclick = () => {
    panel.hidden = !panel.hidden;
    button('toggle').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) input.focus();
  };
  button('save').onclick = () => {
    if (!committed) return;
    hooks.download(new Blob([committed.source], { type:'text/plain;charset=utf-8' }), file);
    saved = committed.source;
    notice(hasDraft() ? '적용된 레시피만 저장했어요.' : '레시피 다운로드를 시작했어요.');
  };
  button('export').onclick = () => {
    if (!committed) return;
    try {
      hooks.download(new Blob([new Uint8Array(encodeStudioFile(committed.doc))], { type:'application/octet-stream' }), file.replace(/\.cadrecipe$/i, '') + '.bcad');
      notice((hasDraft() ? '미적용 입력은 제외했어요. ' : '') + (committed.resolvedDiameters.length
        ? '지름 연결은 현재 값으로 내보냈어요. 원본 연결을 보존하려면 레시피를 저장하세요.'
        : 'CAD 파일 다운로드를 시작했어요. 원문은 레시피 저장으로 보관하세요.'));
    } catch { notice('CAD 파일을 만들지 못했어요. 레시피는 그대로예요.'); }
  };
  button('home').onclick = hooks.home;
  button('open').onclick = hooks.open;
  render();
  input.focus();
  return { hasDraft, hasUnsaved: () => (committed?.source ?? '') !== saved, notice };
}
