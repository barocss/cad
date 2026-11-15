import { verifyStoredNativeOpen } from '../src/files/documentFile';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { rectanglePart, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { canonical } from '@barocss/cad-model/util/revision';
import { makeVersions, makeVersion, makeBranch } from '@barocss/cad-model/versions/log';
import { useProject, type ProjectActions } from '../src/storage/useProject';
import { handleStore, type DirHandle, type FileHandle } from '../src/storage/handleStore';
import { writeAutosave, writePart, writeVersions } from '../src/storage/project';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
function hold() {
  const entered = deferred(), released = deferred();
  return { entered: entered.promise, release: released.resolve, async wait() { entered.resolve(); await released.promise; } };
}
const missing = () => Object.assign(new Error('Missing'), { name: 'NotFoundError' });

/** Directory-handle stand-in, not native OPFS proof. Pauses happen at real adapter await boundaries. */
function directory() {
  let clock = 1, removes = 0;
  const files = new Map<string, { bytes: Uint8Array; time: number; commits: number }>();
  const reads = new Map<string, () => Promise<void>>();
  let listing: (() => Promise<void>) | null = null;
  function dir(prefix: string): DirHandle {
    return {
      kind: 'directory', name: prefix || 'Project',
      async getDirectoryHandle(name) { return dir(`${prefix}${name}/`); },
      async getFileHandle(name, options): Promise<FileHandle> {
        const path = `${prefix}${name}`;
        if (!files.has(path)) {
          if (!options?.create) throw missing();
          files.set(path, { bytes: new Uint8Array(), time: clock++, commits: 0 });
        }
        return {
          kind: 'file', name,
          async getFile() {
            await reads.get(path)?.();
            const f = files.get(path)!;
            const bytes = f.bytes.slice();
            return { size: bytes.length, lastModified: f.time, arrayBuffer: async () => bytes.buffer };
          },
          async createWritable() {
            let bytes = new Uint8Array();
            return {
              async write(value) { bytes = value.slice(); },
              async close() { const f = files.get(path)!; files.set(path, { bytes, time: clock++, commits: f.commits + 1 }); },
              async abort() {},
            };
          },
        };
      },
      async removeEntry(name) { removes++; if (!files.delete(`${prefix}${name}`)) throw missing(); },
      async *entries() {
        if (!prefix) await listing?.();
        const children = new Map<string, boolean>();
        for (const path of files.keys()) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length), slash = rest.indexOf('/');
          children.set(slash < 0 ? rest : rest.slice(0, slash), slash >= 0);
        }
        for (const [name, folder] of children) yield [name, folder ? dir(`${prefix}${name}/`) : await this.getFileHandle(name)];
      },
    };
  }
  const root = dir('');
  return {
    root, files, reads, store: handleStore(root, 'folder'),
    removals: () => removes,
    pauseCommit(path: string) {
      const pause = hold(), before = files.get(path)?.commits ?? 0;
      reads.set(path, async () => { if ((files.get(path)?.commits ?? 0) > before) { reads.delete(path); await pause.wait(); } });
      return pause;
    },
    pauseList() { const pause = hold(); listing = async () => { listing = null; await pause.wait(); }; return pause; },
  };
}

const base=rectanglePart(20,10,12);
const stock:StudioDoc={...base,nodes:base.nodes.map(n=>n.kind==='extrude'?{...n,draft:15}:n)};
const cap='n1.top';
const offset=(distance:number)=>withNode(stock,{kind:'offset-face',parent:{node:1,side:'solid'},faces:[cap],distance,
  sigs:{[cap]:{k:'plane',p:[10,5,12],d:[0,0,1],s:48}}});
const valid=offset(2), invalid=offset(8);
async function project(run:(x:{api:ProjectActions;errors:string[];dir:ReturnType<typeof directory>;ids:{valid:string;invalid:string}; edit():void; pause():ReturnType<typeof hold>})=>Promise<void>) {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
  const dir=directory(),errors:string[]=[];let api!:ProjectActions,scope={},delay:ReturnType<typeof hold>|undefined;
  Object.defineProperty(globalThis,'window',{configurable:true,value:{showDirectoryPicker:async()=>dir.root}});
  function Probe(){api=useProject({onOpenIntent(){return scope={};},currentOpenScope(){return scope;},isOpenCurrent(owner){return owner===scope;},
    onOpened(){return scope={};},onError(title,hint){errors.push(`${title}: ${hint}`);},
    async validateRestore(doc,current){const wait=delay;delay=undefined;if(wait)await wait.wait();await verifyStoredNativeOpen(doc,async d=>evaluateDoc(d,1),async()=>assert.fail('No inset'),current);},
  });return null;}
  try{
    renderToString(createElement(Probe));
    await writePart(dir.store,'part.bcad',valid);await writePart(dir.store,'other.bcad',valid);await writeAutosave(dir.store,'part.bcad',invalid);
    const first=makeVersions(valid,{at:'2026-11-01T00:00:00Z',name:'Good'});
    const branched=makeBranch(makeBranch(first,'invalid-offset'),'valid-other');
    const bad=makeVersion({...branched,current:'invalid-offset'},invalid,{at:'2026-11-01T00:01:00Z',name:'Invalid'}).log;
    const log={...makeVersion({...bad,current:'valid-other'},stock,{at:'2026-11-01T00:02:00Z',name:'Other'}).log,current:'main'};
    await writeVersions(dir.store,'part.bcad',log);
    await api.openFolder();assert.equal(await api.openPart('part.bcad'),true);
    const ids={valid:log.versions.find(v=>v.name==='Good')!.id,invalid:log.versions.find(v=>v.name==='Invalid')!.id};
    await run({api,errors,dir,ids,edit(){scope={};},pause(){return delay=hold();}});
  }finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
}
const bytes=(dir:ReturnType<typeof directory>)=>[...dir.files].map(([path,f])=>[path,Buffer.from(f.bytes).toString('hex')]);

test('branch native Offset rejection preserves current branch and all stored bytes across reopen',async()=>{
 await project(async({api,errors,dir})=>{
  const before=bytes(dir),log=canonical(api.chat.turn().log);
  assert.equal(await api.switchBranch('invalid-offset',valid),null);
  assert.match(errors.at(-1)!,/branch invalid-offset.*part.bcad.*Offset face:.*close a wall/);
  assert.equal(canonical(api.chat.turn().log),log);assert.deepEqual(bytes(dir),before);
  await api.openPart('part.bcad');assert.equal(api.chat.turn().log!.current,'main');assert.deepEqual(bytes(dir),before);
 });
});
test('valid branch changes only version log, retains unsaved-work refusal, and permits explicit discard',async()=>{
 await project(async({api,errors,dir})=>{
  const before=bytes(dir);assert.equal(await api.switchBranch('valid-other',stock),null);
  assert.match(errors.at(-1)!,/BRANCH_UNSAVED/);assert.deepEqual(bytes(dir),before);
  const restored=await api.switchBranch('valid-other',stock,true);assert.ok(restored);assert.equal(canonical(restored),canonical(stock));
  assert.equal(api.chat.turn().log!.current,'valid-other');
  assert.deepEqual(bytes(dir).filter(([p])=>!String(p).includes('/versions/')),before.filter(([p])=>!String(p).includes('/versions/')));
 });
});
for(const target of ['invalid-offset','valid-other']) for(const action of ['edit','Open','close','Restore','new branch'] as const)
test(`pending branch ${target} cannot write/adopt/notify after ${action}`,async()=>{
 await project(async({api,errors,dir,ids,edit,pause})=>{
  const held=pause(),pending=api.switchBranch(target,valid);await held.entered;
  if(action==='edit')edit();else if(action==='Open')await api.openPart('other.bcad');else if(action==='close')api.close();
  else if(action==='Restore')assert.ok(await api.restore(ids.valid));else assert.ok(await api.switchBranch('valid-other',valid));
  const expected=bytes(dir),log=canonical(api.chat.turn().log);
  held.release();assert.equal(await pending,null);assert.deepEqual(bytes(dir),expected);assert.equal(canonical(api.chat.turn().log),log);assert.deepEqual(errors,[]);
 });
});
test('new branch supersedes a pending named Restore before adoption',async()=>{
 await project(async({api,ids,pause,errors})=>{
  const held=pause(),pending=api.restore(ids.valid);await held.entered;
  assert.ok(await api.switchBranch('valid-other',valid));held.release();assert.equal(await pending,null);assert.deepEqual(errors,[]);
 });
});
