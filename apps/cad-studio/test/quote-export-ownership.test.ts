import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { emptyDoc, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { EngineClient } from '../src/engine/client';
import { useModelExports, type ModelExportContext, type ModelExportController } from '../src/files/useModelExports';

function hold() {
  let enter!: () => void, release!: () => void, reject!: (error: Error) => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const released = new Promise<void>((resolve, fail) => { release = resolve; reject = fail; });
  return { entered, release, reject, async wait() { enter(); await released; } };
}
function fixture() {
 const doc:StudioDoc={...withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[60,40]}),{kind:'extrude',sketch:0,height:10}),process:'injection',mould:{version:1,pull:[0,0,1],finish:'pm-t1'}};
 const result=evaluateDoc(doc,1);assert.ok(result.ok);
 const model:ModelExportContext={doc,evaluated:doc,shown:doc,bodies:result.bodies,fresh:true,busy:false,massReady:true,instancesFresh:true,instanceBodies:new Map()};
 const current={doc:{current:doc},evaluated:{current:doc},shown:{current:doc},name:{current:'part'}};
 return {model,current};
}
/** Actual hook, writer and ZIP. Only the browser download sink and compression timing are controlled. */
async function exportsOf(run: (s: ReturnType<typeof fixture> & { api: ModelExportController; downloads: { name: string; blob: Blob }[]; notices: { title: string; hint: string }[]; pause(): ReturnType<typeof hold> }) => Promise<void>, configure?: (s: ReturnType<typeof fixture>) => void, stl: EngineClient['stl'] = async () => null) {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const compressionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CompressionStream');
  const originalCreate = URL.createObjectURL, originalCompression = CompressionStream;
  const downloads: { name: string; blob: Blob }[] = [], notices: { title: string; hint: string }[] = [], blobs = new Map<string, Blob>();
  let api!: ModelExportController, pause: ReturnType<typeof hold> | null = null;
  const f = fixture(); configure?.(f);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() {
    return { href: '', download: '', click() { downloads.push({ name: this.download, blob: blobs.get(this.href)! }); } };
  } } });
  URL.createObjectURL = blob => { assert.ok(blob instanceof Blob); const url = `blob:three-mf-fixture-${blobs.size}`; blobs.set(url, blob); return url; };
  Object.defineProperty(globalThis, 'CompressionStream', { configurable: true, value: class {
    readonly writable: WritableStream<BufferSource>; readonly readable: ReadableStream<Uint8Array>;
    constructor(format: CompressionFormat) {
      const native = new originalCompression(format);
      this.writable = native.writable;
      this.readable = native.readable.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        async transform(chunk, controller) { const held = pause; pause = null; if (held) await held.wait(); controller.enqueue(chunk); },
      }));
    }
  } });
  function Probe() {
    api = useModelExports({ ...f, fileName: 'part', engine: { stl } as unknown as EngineClient, onNotice: notice => notices.push(notice) });
    return null;
  }
  try { renderToString(createElement(Probe)); await run({ ...f, api, downloads, notices, pause() { const held = hold(); pause = held; return held; } }); }
  finally {
    URL.createObjectURL = originalCreate;
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor); else Reflect.deleteProperty(globalThis, 'document');
    if (compressionDescriptor) Object.defineProperty(globalThis, 'CompressionStream', compressionDescriptor);
  }
}

for(const changed of [false,true])test(`Quote completion under ${changed?'replaced':'current'} document ownership`,async()=>{
 await exportsOf(async s=>{
  const before=JSON.stringify(s.model.doc),pause=s.pause(),pending=s.api.exportQuote();
  try{await pause.entered;if(changed){const next={...s.model.doc,parameters:{Replacement:1}};s.current.doc.current=next;s.current.evaluated.current=next;s.current.shown.current=next;}}
  finally{pause.release();}
  await pending;assert.equal(s.downloads.length,changed?0:1);assert.equal(s.notices.length,changed?0:1);assert.equal(JSON.stringify(s.model.doc),before);
 });
});
for(const state of ['shown','evaluated','name','fresh','busy','massReady'] as const)test(`Quote discards completion after ${state} changes`,async()=>{
 await exportsOf(async s=>{const pause=s.pause(),pending=s.api.exportQuote();try{await pause.entered;
 if(state==='shown'||state==='evaluated')s.current[state].current={...s.model.doc};
 else if(state==='name')s.current.name.current='renamed';
 else if(state==='busy')s.model.busy=true;
 else s.model[state]=false;
 }finally{pause.release();}await pending;assert.equal(s.downloads.length,0);assert.deepEqual(s.notices,[]);});
});
for(const changed of [false,true])test(`Quote compression error under ${changed?'replaced':'current'} ownership`,async()=>{
 await exportsOf(async s=>{const pause=s.pause(),pending=s.api.exportQuote();await pause.entered;if(changed)s.current.doc.current={...s.model.doc};pause.reject(new Error('Controlled quote compression failure'));await pending;assert.equal(s.downloads.length,0);assert.equal(s.notices.length,changed?0:1);if(!changed)assert.match(s.notices[0].hint,/Controlled quote compression failure/);});
});
test('Quote root-part scope does not require placed instance readiness',async()=>{
 await exportsOf(async s=>{await s.api.exportQuote();assert.equal(s.downloads.length,1);},s=>{s.model.instancesFresh=false;});
});
