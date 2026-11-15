import { captureSignatures } from '@barocss/cad-model/engine/references';
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
let common=stock;
for(const distance of [2,2]){const result=evaluateDoc(common,1);assert.ok(result.ok);
 common=captureSignatures(withNode(common,{kind:'offset-face',parent:{node:common.nodes.length-1,side:'solid'},faces:['n1.top'],distance}),result.bodies);}
const pair=(first:number,second:number):StudioDoc=>({...common,nodes:common.nodes.map((n,i)=>{ if(n.kind!=='offset-face')return n; const {target,...distanceNode}=n; void target; return {...distanceNode,distance:i===2?first:second}; })});
const valid=pair(4,2), invalid=pair(4,4), theirs=pair(2,4),good=pair(2,2.5),conflicted=pair(1,4);
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
    let log=makeVersions(common,{at:'2026-11-01T00:00:00Z',name:'Common'});
    for(const name of ['bad','good','conflict'])log=makeBranch(log,name);
    for(const [index,[name,doc]] of ([['main',valid],['bad',theirs],['good',good],['conflict',conflicted]] as const).entries()) {
      assert.ok(evaluateDoc(doc,index).ok, `${name} input must independently evaluate`);
      log=makeVersion({...log,current:name},doc,{at:`2026-11-01T00:0${index+1}:00Z`,name:name==='main'?'Good':name==='bad'?'Invalid':name}).log;
    }
    log={...log,current:'main'};
    await writeVersions(dir.store,'part.bcad',log);
    await api.openFolder();assert.equal(await api.openPart('part.bcad'),true);
    const ids={valid:log.versions.find(v=>v.name==='Good')!.id,invalid:log.versions.find(v=>v.name==='Invalid')!.id};
    await run({api,errors,dir,ids,edit(){scope={};},pause(){return delay=hold();}});
  }finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
}
const bytes=(dir:ReturnType<typeof directory>)=>[...dir.files].map(([path,f])=>[path,Buffer.from(f.bytes).toString('hex')]);


test('genuine individually valid offset branches refuse invalid merged geometry before snapshots/head writes',async()=>{
 await project(async({api,dir,errors})=>{
  assert.equal(evaluateDoc(invalid,0).ok,false);const before=bytes(dir),log=canonical(api.chat.turn().log);
  assert.equal(await api.merge('bad',valid),null);assert.match(errors.at(-1)!,/merge from bad.*Offset face: n3:.*close a wall.*retry the merge/);
  assert.deepEqual(bytes(dir),before);assert.equal(canonical(api.chat.turn().log),log);
  await api.openPart('part.bcad');assert.equal(canonical(api.chat.turn().log),log);
 });
});
test('valid +4/+2.5 merge persists and returns evaluated geometry',async()=>{
 await project(async({api,dir})=>{
  const before=bytes(dir),r=await api.merge('good',valid);assert.ok(r&&'doc'in r);assert.ok(evaluateDoc(r.doc,0).ok);
  assert.equal((r.doc.nodes[2] as {distance:number}).distance,4);assert.equal((r.doc.nodes[3] as {distance:number}).distance,2.5);
  assert.equal(api.chat.turn().log!.versions.length,r.log.versions.length);
  assert.equal(bytes(dir).filter(([p])=>String(p).includes('/snapshots/')).length,before.filter(([p])=>String(p).includes('/snapshots/')).length+1);
  const after=new Map(bytes(dir) as [string,string][]);
  for(const [path,content] of before)if(!String(path).includes('/versions/'))assert.equal(after.get(String(path)),content,'existing file/snapshot retained');
 });
});
test('conflict is returned without writes; resolving into invalid geometry still refuses before log',async()=>{
 await project(async({api,dir,errors})=>{
  const before=bytes(dir),conflict=await api.merge('conflict',valid);assert.ok(conflict&&'conflicts'in conflict);
  assert.deepEqual(bytes(dir),before);assert.equal(errors.length,0);
  assert.equal(await api.merge('conflict',valid,{'feature:n2':'ours'}),null);assert.match(errors.at(-1)!,/Offset face:/);assert.deepEqual(bytes(dir),before);
  const good=await api.merge('conflict',valid,{'feature:n2':'theirs'});assert.ok(good&&'doc'in good);assert.ok(evaluateDoc(good.doc,0).ok);
 });
});
for(const target of ['bad','good'])for(const action of ['edit','Open','close','new merge','Restore','branch'] as const)
test(`pending merge ${target} is stale after ${action}`,async()=>{
 await project(async({api,dir,errors,ids,pause,edit})=>{
  const held=pause(),pending=api.merge(target,valid);await held.entered;
  if(action==='edit')edit();else if(action==='Open')await api.openPart('other.bcad');else if(action==='close')api.close();
  else if(action==='new merge')assert.ok(await api.merge('good',valid));else if(action==='Restore')assert.ok(await api.restore(ids.valid));else assert.ok(await api.switchBranch('good',valid));
  const expected=bytes(dir),log=canonical(api.chat.turn().log);held.release();assert.equal(await pending,null);
  assert.deepEqual(bytes(dir),expected);assert.equal(canonical(api.chat.turn().log),log);assert.deepEqual(errors,[]);
 });
});

test('unsaved merge retains its actionable refusal without geometry repair advice',async()=>{
 await project(async({api,dir,errors})=>{const before=bytes(dir);assert.equal(await api.merge('good',common),null);
  assert.match(errors.at(-1)!,/BRANCH_UNSAVED/);assert.doesNotMatch(errors.at(-1)!,/Adjust the source branch geometry/);assert.deepEqual(bytes(dir),before);
 });
});
