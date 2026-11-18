import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
function installCompressionHold() {
  const NativeCompressionStream = window.CompressionStream;
  const arrayBuffer = Response.prototype.arrayBuffer;
  const streams = new WeakMap();
  const runs = [];
  const notices = [];
  let armed;
  let previousNotice = '';
  new MutationObserver(() => {
    const notice = [...document.querySelectorAll('.toast')].map(node => node.textContent).join(' ');
    if (notice !== previousNotice && /Quote package written|No quote package|Not written yet/.test(notice)) notices.push(notice);
    previousNotice = notice;
  }).observe(document, { childList: true, subtree: true, characterData: true });

  window.__quoteHold = {
    arm() {
      if (armed || runs.some(run => !run.drained)) throw new Error('A compression hold is already active');
      const run = { held: 0, consumed: null, error: null, injectedFailure: false, drained: false };
      armed = run;
      runs.push(run);
    },
    finish(reject) {
      const run = runs.at(-1);
      if (!run?.release || run.drained) throw new Error('No held native chunk');
      run.release(reject);
    },
    snapshot() {
      return { runs: runs.map(({ held, consumed, error, injectedFailure, drained }) => ({ held, consumed, error, injectedFailure, drained })), notices: notices.slice() };
    },
  };

  window.CompressionStream = class {
    constructor(format) {
      const native = new NativeCompressionStream(format);
      this.writable = native.writable;
      const run = armed;
      this.readable = run ? native.readable.pipeThrough(new TransformStream({
        async transform(chunk, controller) {
          if (!run.held) {
            const reject = await new Promise(resolve => {
              run.release = resolve;
              run.held = chunk.byteLength;
            });
            if (reject) {
              run.injectedFailure = true;
              throw new Error('D695 controlled compression stream failure');
            }
          }
          controller.enqueue(chunk);
        },
      })) : native.readable;
      if (run) streams.set(this.readable, run);
    }
  };

  Response.prototype.arrayBuffer = function (...args) {
    const run = streams.get(this.body);
    const read = Reflect.apply(arrayBuffer, this, args);
    if (!run || run !== armed) return read;
    armed = null;
    const drained = () => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => { run.drained = true; })), 0);
    return read.then(buffer => {
      run.consumed = buffer.byteLength;
      drained();
      return buffer;
    }, error => {
      run.error = { name: error.name, message: error.message };
      drained();
      throw error;
    });
  };
}

const oracleSource=String.raw`import json,sys,zipfile,re
x=json.load(sys.stdin)
with zipfile.ZipFile(x['file']) as z:
 q=json.loads(z.read('quote.json'));s=z.read('part.step').decode()
 p=[tuple(map(float,m)) for m in re.findall(r"CARTESIAN_POINT\([^\n]*?\(([-+\d.Ee]+),([-+\d.Ee]+),([-+\d.Ee]+)\)\)",s)]
 assert p
 height=max(v[2] for v in p)-min(v[2] for v in p)
 result={'status':'PASS' if abs(height-x['height'])<1e-6 and abs(max(v[0] for v in p)-min(v[0] for v in p)-60)<1e-6 and abs(q['part']['volume']-60*40*x['height'])<1e-6 else 'FAIL','stepHeight':height,'request':q['part']}
 print(json.dumps(result))
`;
const f=await createFlow({name:'quote-export-ownership',output:process.argv[2],envFrozen:'QUOTE_EXPORT_OWNERSHIP_FROZEN',initialFiles:['apps/cad-studio/test/quote-export-ownership-browser.mjs','apps/cad-studio/src/files/useModelExports.ts'],qualification:'Old Quote completion must not deliver under a replaced same-name document.',limits:['Existing single-part injection quote package; no manufacturing certification or new export scope.'],oracleSource,inspectorSource:`import {emptyDoc,withNode} from '@barocss/cad-model/engine/doc';let doc={...withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[60,40]}),{kind:'extrude',sketch:0,height:{parameter:'Height'}}),parameters:{Height:10},process:'injection',mould:{version:1,pull:[0,0,1],finish:'pm-t1'},variability:{version:1,inputs:[{name:'height',type:'number',default:10,min:1,max:50,bindings:[{to:'parameter',part:'base',parameter:'Height'}]}],variants:[{name:'Tall',values:{height:20}}]}};console.log(JSON.stringify({doc}));`});
await f.run(async()=>{
 const make=f.browser.newContext.bind(f.browser);f.browser.newContext=async options=>{const ctx=await make(options);await ctx.addInitScript(installCompressionHold);return ctx;};
 const {doc}=await f.inspect('fixture',{});await f.newPage();
 const open=async d=>{await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'same-part.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await f.same(d);};
 await open(doc);await f.page.getByRole('button',{name:'Library',exact:true}).click();
 const downloads=[];f.page.on('download',d=>downloads.push(d.suggestedFilename()));
 await f.page.evaluate(()=>window.__quoteHold.arm());await f.page.getByRole('button',{name:'Quote package',exact:true}).click();await f.page.waitForFunction(()=>window.__quoteHold.snapshot().runs.at(-1)?.held>0);
 const next={...doc,parameters:{Height:30}};await open(next);assert.equal(await f.page.locator('.doc-tab input').inputValue(),'same-part');
 await f.page.evaluate(()=>window.__quoteHold.finish(false));await f.page.waitForFunction(()=>window.__quoteHold.snapshot().runs.at(-1)?.drained);await f.page.waitForTimeout(1500);
 f.report.observations.push({downloads:[...downloads],compression:await f.page.evaluate(()=>window.__quoteHold.snapshot())});await f.snapshot('replaced-after-compression');assert.deepEqual(await f.doc(),next);assert.deepEqual(downloads,[],'old Quote must not download for replacement');assert.deepEqual((await f.page.evaluate(()=>window.__quoteHold.snapshot())).notices,[]);
 const [download]=await Promise.all([f.page.waitForEvent('download'),f.page.getByRole('button',{name:'Quote package',exact:true}).click()]);const file=join(f.output,'current-quote.zip');await download.saveAs(file);await f.runOracle({file,height:30},'current');assert.deepEqual(await f.doc(),next);await f.snapshot('current-quote');
});
