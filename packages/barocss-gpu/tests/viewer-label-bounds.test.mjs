// Source-only contracts; execution bundles source, no native/GPU/browser. Actual WebGPU evidence is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'label-bounds-'));
let Viewer,GlyphAtlas,layoutLabels,projectedGlyphBounds;
try {
 const outfile=join(temp,'source.mjs');
 await build({stdin:{contents:"export {Viewer} from './viewer.ts'; export {GlyphAtlas,layoutLabels} from './glyphs.ts'; export {projectedGlyphBounds} from './label-bounds.ts';",resolveDir:fileURLToPath(new URL('../src/viewer/',import.meta.url)),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 ({Viewer,GlyphAtlas,layoutLabels,projectedGlyphBounds}=await import(pathToFileURL(outfile).href));
} finally {await rm(temp,{recursive:true,force:true});}
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const raster=ch=>{if(ch==='?')return null;const coverage=new Uint8Array(4096);if(ch!==' ')coverage[100]=255;return {coverage,advance:ch==='W'?30:20};};
const packed=()=>0xffffffff;
const layout=(labels)=>layoutLabels(labels,new GlyphAtlas('test',raster),packed);
test('actual put indexes preserve background/newline/surrogate/blank/null layout; coverage does not change upload bytes',()=>{
 const labels=[{text:'W \n😀?',at:[0,0,.5],background:{color:[1,1,1]}},{text:'A',at:[0,0,.5]}];
 const a=layout(labels);
 assert.deepEqual(a.glyphs,[{labelIndex:0,instance:2},{labelIndex:0,instance:4},{labelIndex:1,instance:6}]);
 assert.equal(a.count,7);
 // Marking atlas glyphs empty only affects supplementary metadata, never the established vertex bytes.
 const atlas=new GlyphAtlas('test',raster);for(const ch of ['W',' ','😀','?','A'])atlas.glyph(ch);
 for(const g of atlas.glyphs.values())if(g)g.covered=false;
 const b=layoutLabels(labels,atlas,packed);
 assert.deepEqual(a.data,b.data);assert.equal(a.count,b.count);assert.deepEqual(b.glyphs,[]);
 assert.deepEqual(layout([{text:' \n?',at:[0,0,.5]}]).glyphs,[]);
});
test('billboard bounds use uploaded F32 rects and exact viewport CSS scaling including noninteger DPR ratios',()=>{
 const a=layout([{text:'W',at:[0,0,.5],align:[0,0],size:12}]),d=a.data;
 for(const [w,h,r,cw,ch] of [[200,100,1,200,100],[400,200,2,200,100],[301,151,1.5,200,100]]){
  const rect=projectedGlyphBounds(a,I,I,w,h,r,cw,ch)[0].rects[0];
  assert.equal(rect.left,cw/2+d[4]*r*cw/w);assert.equal(rect.top,ch/2+d[5]*r*ch/h);
  assert.equal(rect.right,cw/2+d[6]*r*cw/w);assert.equal(rect.bottom,ch/2+d[7]*r*ch/h);
 }
});
test('plane/model transform, viewport clipping and unsafe projections',()=>{
 const a=layout([{text:'A',at:[0,0,.5],size:.1,plane:{right:[1,0,0],up:[0,1,0]}}]);
 const moved=[...I];moved[12]=.5;
 const one=projectedGlyphBounds(a,I,I,200,100,1,200,100)[0].rects[0];
 const two=projectedGlyphBounds(a,moved,I,200,100,1,200,100)[0].rects[0];
 assert.equal(two.left-one.left,50);
 const behind=[...I];behind[15]=-1;assert.deepEqual(projectedGlyphBounds(a,I,behind,200,100,1,200,100),[]);
 const bad=[...I];bad[0]=NaN;assert.equal(projectedGlyphBounds(a,bad,I,200,100,1,200,100),null);
 assert.equal(projectedGlyphBounds(a,I,I,0,100,1,200,100),null);
 const edge=layout([{text:'A',at:[1,0,.5],size:12}]);
 const rect=projectedGlyphBounds(edge,I,I,200,100,1,200,100)[0].rects[0];assert.equal(rect.right,200);
 const crossing=layout([{text:'A',at:[0,0,.01],size:1,plane:{right:[1,0,0],up:[0,0,1]}}]);
 assert.deepEqual(projectedGlyphBounds(crossing,I,I,200,100,1,200,100),[]);
});
function proof(){
 const v=Object.create(Viewer.prototype),device={},upload={},mesh={visible:true,dirty:false,instances:null,material:{opacity:1},clipped:false,geometry:{gpu:upload,disposed:false},transform:[...I]};
 Object.assign(v,{device,atlasVersion:1,canvas:{width:200,height:100,clientWidth:200,clientHeight:100},pixelRatio:1,meshes:[mesh],camera:{viewProjection:()=>[...I]}});
 const epoch={},bounds=[{labelIndex:0,rects:[{left:10,top:20,right:30,bottom:40}]}];
 v.labelBoundsFrame={epoch,device,atlas:1,width:200,height:100,cssWidth:200,cssHeight:100,ratio:1,camera:[...I],vp:new Float32Array(I),meshes:new Map([[mesh,{model:new Float32Array(I),sourceModel:[...I],material:mesh.material,upload,bounds}]])};
 return {v,mesh,epoch};
}
test('public query is defensive and checks current device/font/camera/model/size/dispose/membership',()=>{
 const {v,mesh,epoch}=proof();const a=v.labelGlyphBounds(mesh);assert.equal(a.epoch,epoch);a.bounds[0].rects[0].left=-1;assert.equal(v.labelGlyphBounds(mesh).bounds[0].rects[0].left,10);
 for(const change of [x=>x.v.device={},x=>x.v.atlasVersion++,x=>x.v.canvas.clientWidth++,x=>x.v.canvas.width++,x=>x.v.pixelRatio=2,x=>x.v.disposed=true,x=>x.v.recovering={},x=>x.v.meshes=[],x=>x.mesh.visible=false,x=>x.mesh.dirty=true,x=>x.mesh.geometry.disposed=true,x=>x.mesh.geometry.gpu={},x=>x.mesh.transform[12]=1,x=>x.v.camera.viewProjection=()=>I.map((n,i)=>i===12?1:n)]){
  const x=proof();change(x);assert.equal(x.v.labelGlyphBounds(x.mesh),null);
 }
});
test('unrelated redraw request preserves submitted labels; dirty labels still refuse and relative capture is unavailable',()=>{
 const x=proof();x.v.options={onRequestRender(){}};const before=x.v.labelGlyphBounds(x.mesh);x.v.requestRender();assert.deepEqual(x.v.labelGlyphBounds(x.mesh),before);x.mesh.dirty=true;assert.equal(x.v.labelGlyphBounds(x.mesh),null);
 const y=proof();y.v.raster={};y.v.captureLabelBoundsFrame(I,[],200,100);assert.equal(y.v.labelGlyphBounds(y.mesh),null);
});
test('canvas submission alone authenticates bounds; offscreen and pick paths cannot publish',async()=>{
 const source=await readFile(new URL('../src/viewer/viewer.ts',import.meta.url),'utf8');
 assert.equal((source.match(/this\.captureLabelBoundsFrame\(/g)||[]).length,1);
 assert.match(source,/queue\.submit\(\[enc\.finish\(\)\]\);\s*if \(!output && !capture\) this\.captureLabelBoundsFrame/);
});

test('omitted material opacity follows renderer default one; explicit zero and colorWrite false refuse',()=>{
 const {v,mesh}=proof();delete mesh.material.opacity;assert.ok(v.labelGlyphBounds(mesh));
 mesh.material.opacity=0;assert.equal(v.labelGlyphBounds(mesh),null);
 delete mesh.material.opacity;mesh.material.colorWrite=false;assert.equal(v.labelGlyphBounds(mesh),null);
});

test('label material replacement remains stale after a pick-like uniform write clears dirty',()=>{
 const {v,mesh}=proof();mesh.material={opacity:1};mesh.dirty=false;assert.equal(v.labelGlyphBounds(mesh),null);
 const other=proof();other.v.options={onRequestRender(){}};other.v.requestRender();
 assert.equal(other.v.labelGlyphBounds(other.mesh).epoch,other.epoch);
 other.v.labelBoundsFrame.meshes.delete(other.mesh);assert.equal(other.v.labelGlyphBounds(other.mesh),null);
});
