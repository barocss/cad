import { lookOf } from '@barocss/cad-model/app/bodies';
import { encodeStudioFile } from '@barocss/cad-model/engine/container';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { defaultViseValues, gripHeight, readViseSource, viseDocumentAt, viseOpening, viseSource, type ViseValues } from './centeringVise';
import { drawFixture, type FixtureBody, type FixturePart } from './fixtureViewport';

export { readViseSource };
type Hooks = { touch(): void; home(): void; open(): void; download(blob: Blob, name: string): void };
type Target = 'gap' | 'left' | 'right' | 'body';
const names: Record<Target,string> = { gap:'물림 간격', left:'왼쪽 조', right:'오른쪽 조', body:'베이스' };
const fields = {gap:'opening',left:'leftGrip',right:'rightGrip'} as const;
const partNames = { 'Vise base':'body', 'Left jaw':'left', 'Right jaw':'right' } as const;
const fmt = (n:number) => String(Number(n.toPrecision(10)));

function geometry(values: ViseValues) {
  const doc = viseDocumentAt(values), res = evaluateDoc(doc,0,8);
  if (!res.ok || res.bodies.length !== 3) throw new Error('Vise geometry');
  const bodies: FixtureBody[] = res.bodies.map(b=>{
    const name = lookOf(doc,b).name as keyof typeof partNames;
    if (!Object.hasOwn(partNames,name)) throw new Error('Unknown vise body');
    return {mesh:b.mesh,part:partNames[name]};
  });
  const bounds = (part: FixturePart) => bodies.find(b=>b.part===part)!.mesh.bounds;
  const l = bounds('left'), r = bounds('right');
  return { values, doc, bodies, left:l.max[0], right:r.min[0], leftTop:l.max[2], rightTop:r.max[2] };
}
type Scene = ReturnType<typeof geometry>;

export function mountVise(root: HTMLElement, hooks: Hooks, values = defaultViseValues, filename = 'centering-vise.cadrecipe') {
  let current = geometry(values), next: Scene | undefined, saved = viseSource(values), target: Target = 'gap';
  const undo: Scene[] = [], redo: Scene[] = [];
  root.innerHTML = `
  <div class="recipe-bar">
    <div class="recipe-identity"><span class="brand" aria-hidden="true">◈</span><div><div class="recipe-brand">CASUAL STUDIO</div><h1 id="vise-title" tabindex="-1">셀프센터링 바이스</h1></div></div>
    <nav aria-label="바이스 문서">
      <div class="recipe-toolgroup"><button id="vise-home" type="button">시작</button><button id="vise-open" type="button">열기</button></div>
      <div class="recipe-toolgroup"><button id="vise-undo" type="button" aria-label="실행 취소">↶</button><button id="vise-redo" type="button" aria-label="다시 실행">↷</button></div>
      <div class="recipe-toolgroup"><button id="vise-save" type="button">레시피 저장</button><button id="vise-export" type="button">CAD 내보내기</button></div>
    </nav>
  </div>
  <main class="sensor-editor">
    <div class="recipe-work-head"><div><p><strong>작업물 폭이나 한쪽 조 높이를 맞추세요</strong></p><p id="vise-state"></p></div>
      <div id="vise-targets" role="group" aria-label="선택 대상">
       ${(Object.keys(names) as Target[]).map(key=>`<button type="button" data-target="${key}">${names[key]}</button>`).join('')}
      </div></div>
    <div class="sensor-grid">
      <div class="recipe-stage sensor-stage"><svg id="vise-scene" viewBox="0 0 800 500" role="img" aria-label="베이스와 양쪽 조, 안쪽 면을 잇는 간격선"></svg></div>
      <aside class="sensor-context" aria-label="선택한 요소">
        <h2 id="vise-selection"></h2>
        <p id="vise-detail"></p>
        <form id="vise-form" novalidate><label for="vise-value" id="vise-label"></label><div class="recipe-value"><input id="vise-value" type="number" step="any" required aria-describedby="vise-range vise-error"><span>mm</span></div>
        <p id="vise-range"></p><p id="vise-error" role="alert"></p><button id="vise-preview" type="submit">미리보기</button></form>
        <div id="vise-impact" hidden><h2>치수 변화</h2><div id="vise-rows"></div>
          <div class="recipe-actions" id="vise-actions"><button id="vise-cancel" type="button">취소</button><button id="vise-apply" type="button">적용</button></div></div>
      </aside>
    </div>
    <p id="vise-status" role="status"></p>
  </main>`;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#vise-'+id)!;
  const button = (id:string) => get<HTMLButtonElement>(id);
  const field = get<HTMLInputElement>('value');
  const svg = root.querySelector<SVGSVGElement>('#vise-scene')!;
  const status = (message='') => { get('status').textContent=message; };
  const error = (message='') => {
    get('error').textContent=message;
    if (message) field.setAttribute('aria-invalid','true'); else field.removeAttribute('aria-invalid');
  };
  const draft = () => !!next || (target!=='body' && field.valueAsNumber!==current.values[fields[target]]);
  const dirty = () => saved!==viseSource(current.values);
  const updateField = () => { field.value = target==='body' ? '' : String(current.values[fields[target]]); };
  function draw() {
    const shown=next??current;
    const selected: FixturePart[] = target==='gap' ? ['left','right'] : [target];
    drawFixture(svg,shown.bodies,'assembled',new Set(selected), !!next, 'vise');
    get('state').textContent=`적용된 간격 ${fmt(current.right-current.left)} mm · 조 높이 ${fmt(current.leftTop-12)} / ${fmt(current.rightTop-12)} mm`+(next?' · 미리보기':'');
    get('selection').textContent=names[target];
    get('detail').textContent=target==='gap'?'양쪽 조를 같은 거리만큼 움직여 중심을 유지해요.':
      target==='body'?'기준 부품 · 120 × 60 × 8 mm · Ø6.6 mm 고정홀 4개. 이 예제에서는 고정합니다.':'선택한 조만 바뀌어요. 물림 간격과 반대편은 그대로예요.';
    const limits=target==='gap'?viseOpening:gripHeight;
    get('form').hidden=target==='body';
    get('label').textContent=target==='gap'?'간격':'그립 높이';
    get('range').textContent=limits.min+'–'+limits.max+' mm';
    field.min=String(limits.min); field.max=String(limits.max);
    get('impact').hidden=!next;
    button('undo').disabled=!undo.length; button('redo').disabled=!redo.length; button('apply').disabled=!next;
    root.querySelectorAll<HTMLButtonElement>('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.target===target)));
    const rows: [string,string][] = !next?[]: target==='gap'?[
      ['간격',`${fmt(current.right-current.left)} → ${fmt(next.right-next.left)} mm`],
      ['왼쪽 조 이동',fmt(next.left-current.left)+' mm'],
      ['오른쪽 조 이동',(next.right>current.right?'+':'')+fmt(next.right-current.right)+' mm'],
      ['작업 중심','0 mm 유지'],['베이스 고정홀','4개 유지'],
    ]:[
      ['선택한 조 높이',target==='left'?`${fmt(current.leftTop-12)} → ${fmt(next.leftTop-12)} mm`:`${fmt(current.rightTop-12)} → ${fmt(next.rightTop-12)} mm`],
      ['반대편 조','유지'],['간격',fmt(current.right-current.left)+' mm 유지'],
    ];
    get('rows').replaceChildren(...rows.map(([label,value])=>{
      const row=document.createElement('div'), name=document.createElement('span'), amount=document.createElement('strong');
      row.className='sensor-row'; name.textContent=label; amount.textContent=value; row.append(name,amount); return row;
    }));
  }
  function reset() { next=undefined; updateField(); error(); draw(); }
  function choose(id:Target) {
    if (id===target) return;
    hooks.touch(); status(draft()?'미적용 미리보기를 취소했어요.':''); target=id; reset();
  }
  svg.onclick=event=>{
    const part=(event.target as SVGElement).closest<SVGElement>('[data-vise-part]')?.dataset.visePart;
    if (part && part in names) choose(part as Target);
  };
  root.querySelectorAll<HTMLButtonElement>('[data-target]').forEach(b=>b.onclick=()=>choose(b.dataset.target as Target));
  field.oninput=()=>{hooks.touch();next=undefined;error();status();draw();};
  get<HTMLFormElement>('form').onsubmit=event=>{
    event.preventDefault();
    if (target==='body') return;
    hooks.touch(); next=undefined; status();
    const value=field.valueAsNumber, limits=target==='gap'?viseOpening:gripHeight;
    if (!Number.isFinite(value)||value<limits.min||value>limits.max) error(`${limits.min}–${limits.max} mm 사이의 값을 입력하세요.`);
    else if (value===current.values[fields[target]]) { error(); status('변경 없음'); }
    else {
      try { next=geometry({...current.values,[fields[target]]:value}); error(); }
      catch { error('미리보기를 계산하지 못했어요. 적용된 모델은 그대로예요.'); }
    }
    draw();
  };
  button('cancel').onclick=()=>{hooks.touch(); reset(); status('미리보기를 취소했어요.'); field.focus();};
  button('apply').onclick=()=>{
    if (!next) return;
    hooks.touch(); undo.push(current); if (undo.length>24) undo.shift(); current=next; redo.length=0;
    reset(); status('선택한 치수를 적용했어요.'); field.focus();
  };
  function history(from:Scene[],to:Scene[]) {
    const model=from.pop(); if (!model) return;
    hooks.touch(); to.push(current); current=model; reset(); status('치수 변경을 복원했어요.');
  }
  button('undo').onclick=()=>history(undo,redo); button('redo').onclick=()=>history(redo,undo);
  root.onkeydown=event=>{
    if (event.defaultPrevented) return;
    if (event.key==='Escape' && draft()) {event.preventDefault();button('cancel').click();return;}
    if (event.target instanceof HTMLInputElement) return;
    if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z') {event.preventDefault();button(event.shiftKey?'redo':'undo').click();}
  };
  button('home').onclick=hooks.home; button('open').onclick=hooks.open;
  button('save').onclick=()=>{
    const source=viseSource(current.values); hooks.download(new Blob([source], {type:'text/plain'}), filename);
    saved=source; status(draft()?'미적용 입력은 빼고 레시피를 저장했어요.':'레시피를 저장했어요.');
  };
  button('export').onclick=()=>{
    try {
      hooks.download(new Blob([new Uint8Array(encodeStudioFile(current.doc))],{type:'application/octet-stream'}),filename.replace(/\.cadrecipe$/i,'')+'.bcad');
      status(draft()?'미적용 입력은 빼고 CAD 파일을 내보냈어요.':'CAD 파일을 내보냈어요.');
    } catch {status('CAD 파일을 내보내지 못했어요.');}
  };
  reset(); get('title').focus();
  return { notice:status, hasDraft:draft, hasUnsaved:dirty };
}
