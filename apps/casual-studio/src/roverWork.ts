import fixtureUrl from '../examples/rover-assembly/rover-assembly.bcad?url';
import { ASSEMBLY_BASE, readRoverAssembly, ROVER_FILENAME, roverFrame, type RoverAssembly } from './roverAssembly';
import { roverViewport } from './roverViewport';

const captions: Record<string,{ title: string; note: string }> = {
  drive: { title:'구동 모듈', note:'모터 축이 바퀴의 관통 구멍을 지나요.' },
  decks: { title:'상판과 지지대', note:'지지대 네 개가 하판과 상판의 고정 위치를 연결해요.' },
  controller: { title:'전원과 제어 보드', note:'배터리와 제어 보드를 상판 위에 배치해요.' },
  sensor: { title:'전방 거리 센서', note:'센서 보드를 브래킷에 고정하고 송수신기를 정면으로 배치해요.' },
};
const partNames: Record<string,string> = {
  [ASSEMBLY_BASE]:'하부 데크', upper:'상판', battery:'배터리', board:'제어 보드', chip:'제어 칩',
  bracket:'센서 브래킷', sensor:'거리 센서 보드', 'left-eye':'왼쪽 송수신기', 'right-eye':'오른쪽 송수신기',
};
const corners: Record<string,string> = { fl:'왼쪽 앞', fr:'오른쪽 앞', rl:'왼쪽 뒤', rr:'오른쪽 뒤' };
const modules: Record<string,string> = { motor:'모터', axle:'구동축', wheel:'바퀴' };
const partName = ({ id, name }: { id: string; name: string }) => {
  const [group, unit] = id.split('-');
  return partNames[id] ?? (group==='spacer' ? '지지대 '+unit : modules[group] && corners[unit] ? corners[unit]+' '+modules[group] : name);
};

export async function loadRover() {
  const res=await fetch(fixtureUrl);
  if (!res.ok) throw new Error('Rover fixture unavailable');
  return readRoverAssembly(new Uint8Array(await res.arrayBuffer()));
}

export function mountRover(host: HTMLElement, model: RoverAssembly, hooks: { home: () => void; download: (blob: Blob, name: string) => void }) {
  host.innerHTML=`
    <div class="recipe-bar rover-bar">
      <div class="recipe-identity"><div><p class="recipe-brand">CASUAL STUDIO / 조립 보기</p><h1 id="rover-title" tabindex="-1">4륜 로버</h1></div></div>
      <nav aria-label="로버 파일"><button id="rover-home" type="button">시작 화면</button><button id="rover-export" type="button">원본 CAD 받기</button></nav>
    </div>
    <div class="rover-work">
      <section class="rover-stage" aria-label="로버 모델">
        <div class="rover-stage-bar">
          <div><strong id="rover-count">25 / 25개 부품</strong><span id="rover-legend">읽기 전용</span></div>
          <div class="rover-views" aria-label="조립 표시"><button id="rover-assembled" type="button" aria-pressed="true">조립</button><button id="rover-exploded" type="button" aria-pressed="false">분해</button></div>
        </div>
        <canvas id="rover-scene" tabindex="0" width="840" height="510" aria-label="로버 3D 모델" aria-describedby="rover-controls"></canvas>
        <p id="rover-no-3d" role="status" hidden>이 브라우저에서 3D 화면을 열 수 없어요. 단계 목록과 원본 CAD는 계속 사용할 수 있어요.</p>
        <div class="rover-stage-foot"><p id="rover-controls">드래그 또는 방향키로 회전 · 클릭하여 부품 선택</p><button id="rover-reset" type="button">시점 초기화</button></div>
      </section>
      <aside class="rover-steps" aria-label="조립 순서">
        <div class="rover-steps-head"><h2>조립 순서</h2><button id="rover-overview" type="button" aria-pressed="true">전체 보기</button></div>
        <ol id="rover-steps"></ol>
        <p id="rover-note"></p>
        <ul id="rover-parts" aria-label="이 단계의 부품"></ul>
        <p id="rover-selection" role="status" aria-live="polite"></p>
      </aside>
    </div>
    <div class="rover-footer"><p id="rover-status" role="status"></p><span>분해·순서 보기는 표시만 바꿔요. 원본 위치와 치수는 그대로예요.</span></div>`;
  const find = <T extends HTMLElement = HTMLElement>(id: string) => host.querySelector<T>('#rover-'+id)!;
  const canvas=find<HTMLCanvasElement>('scene');
  const list = find('parts'), note = find('note');
  let step: number | null = null, exploded = false, selected: string | null = null;
  let view: ReturnType<typeof roverViewport> = null;
  try { view=roverViewport(canvas,model.parts,id => { selected=id; render(); }); }
  catch { /* The native download and step list remain available without a GPU. */ }
  if (!view) {
    canvas.hidden=true; find('no-3d').hidden=false;
    for (const id of ['assembled','exploded','reset']) find<HTMLButtonElement>(id).disabled=true;
    find('controls').hidden=true;
  }
  const steps=model.steps.map((entry,i) => {
    const li=document.createElement('li'), b=document.createElement('button'), n=document.createElement('span');
    b.type='button'; b.dataset.step=entry.id;
    n.className='rover-step-number'; n.textContent=String(i+1).padStart(2,'0');
    b.append(n,document.createTextNode(captions[entry.id]?.title ?? entry.name));
    b.onclick=()=>{ step=i; render(); };
    li.append(b); return { li,b };
  });
  find('steps').append(...steps.map(({li})=>li));
  function render() {
    const frame=roverFrame(model,step,selected);
    selected=frame.selected;
    find('overview').setAttribute('aria-pressed',String(step===null));
    steps.forEach(({b},i)=>b.setAttribute('aria-pressed',String(step===i)));
    find('assembled').setAttribute('aria-pressed',String(!exploded));
    find('exploded').setAttribute('aria-pressed',String(exploded));
    find('count').textContent=`${frame.parts.length} / ${model.parts.length}개 부품`;
    find('legend').textContent=step === null ? '읽기 전용' : '파란색 · 이번 단계';
    note.textContent=frame.state ? (captions[frame.state.step.id]?.note ?? frame.state.step.note ?? '') : '단계를 고르면 이번에 추가하는 부품에 색이 들어와요.';
    // Keep the clicked/focused button focused after re-rendering a selection.
    const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.part : undefined;
    list.replaceChildren(...frame.parts.filter(part=>frame.active.has(part.id)).map(part=>{
      const li=document.createElement('li'), b=document.createElement('button');
      b.type='button'; b.dataset.part=part.id; b.textContent=partName(part);
      b.setAttribute('aria-pressed',String(part.id===selected));
      b.onclick=()=>{selected=part.id;render();};
      li.append(b);return li;
    }));
    if (focused) [...list.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.dataset.part===focused)?.focus();
    const part=frame.parts.find(part=>part.id===selected);
    find('selection').textContent=part ? '선택 · '+partName(part) : '';
    canvas.dataset.visible=String(frame.parts.length);
    canvas.dataset.active=String(frame.active.size);
    canvas.dataset.selected=selected ?? '';
    view?.show(frame.parts,frame.active,selected,exploded);
  }
  find('home').onclick=hooks.home;
  find('export').onclick=()=>{hooks.download(model.download(),ROVER_FILENAME);find('status').textContent='원본 CAD 다운로드를 시작했어요.';};
  find('overview').onclick=()=>{step=null;render();};
  find('assembled').onclick=()=>{exploded=false;render();};
  find('exploded').onclick=()=>{exploded=true;render();};
  find('reset').onclick=()=>view?.reset();
  canvas.addEventListener('webglcontextlost',()=>{
    canvas.hidden=true; find('no-3d').hidden=false; find('controls').hidden=true;
    for (const id of ['assembled','exploded','reset']) find<HTMLButtonElement>(id).disabled=true;
  });
  render(); find('title').focus();
  return () => view?.dispose();
}
