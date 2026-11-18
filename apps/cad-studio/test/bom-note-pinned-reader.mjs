// #274 bounded compatibility: a pinned pre-BOM-notes reader, never old sources with current product dependencies.
// Run only with the parent's gate: node test/bom-note-pinned-reader.mjs /ABS/NEW/EXTERNAL/OUTPUT
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire, isBuiltin } from 'node:module';
import { mkdir, readFile, writeFile, realpath, statfs } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'),'new external output directory required');
const OLD='0bf3aa254ae2857d2affc42da15295ba1af501ed';
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const CURRENT=git('rev-parse','HEAD');
assert.equal(git('diff','HEAD','--','packages/barocss-cad-model','packages/barocss-cad'),'','product sources must equal current HEAD');
assert.equal(git('rev-parse','951fe302f2ea9e11a028f1ea008eed114a255e79^'),OLD);
const hostRequire=createRequire(join(repo,'apps/cad-studio/package.json'));
const {build}=hostRequire('esbuild'),ts=hostRequire('typescript');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output); // Never overwrite an earlier run or receipt.
const receipt={status:'RUNNING',oldCommit:OLD,currentCommit:CURRENT,typeParserVersion:ts.version,driverSha256:hash(await readFile(import.meta.filename)),builds:[],cases:[],reserves:[],limits:['Synthetic schema3 ordinary shared/independent parts and schema4 root-only route bundle generated through existing APIs. No mesh blobs, route evaluation, browser or manufacturing qualification.','Old Brief semantic consumer is readBrief; old BOM notes UI/export does not exist and is not claimed compatible.','A single pinned pre-feature reader is not all historical versions. Invalid Field coercion/unknown metadata are outside the valid-Field matrix.']};
// Both complete product source trees at one commit; not a whole repository/evidence archive.
const archivePaths=['packages/barocss-cad/src','packages/barocss-cad/package.json','packages/barocss-cad-model/src','packages/barocss-cad-model/package.json'];
async function reserve(label){const disk=await statfs(output),available=disk.bavail*disk.bsize;receipt.reserves.push({label,availableBytes:available});assert.ok(available>=2*1024**3,'At least 2 GiB free required: '+label);}
async function bundle(label,commit){
 const archive=join(output,label+'.tar'),root=join(output,label+'-source');await mkdir(root);
 await reserve(label+'-before-archive');
 execFileSync('git',['archive','--format=tar','--output',archive,commit,...archivePaths],{cwd:repo});
 await reserve(label+'-after-archive');
 execFileSync('tar',['-xf',archive,'-C',root]);
 await reserve(label+'-after-extraction');
 const actualRoot=await realpath(root);assert.ok(relative(repo,actualRoot).startsWith('../'));
 const packageDirs=new Map([['@barocss/cad','packages/barocss-cad'],['@barocss/cad-model','packages/barocss-cad-model']]);
 const entry=join(root,'packages/barocss-cad-model/src/engine/container.ts'),brief=join(root,'packages/barocss-cad-model/src/chat/brief.ts');
 const outfile=join(output,label+'-codec.mjs');
 const result=await build({stdin:{contents:`export {readStudioFile,encodeStudioFile} from ${JSON.stringify(entry)}; export {readBrief} from ${JSON.stringify(brief)}; export {emptyDoc,withNode} from ${JSON.stringify(join(root,'packages/barocss-cad-model/src/engine/doc.ts'))}; export {emptyDirect,importSource,geometryOf} from ${JSON.stringify(join(root,'packages/barocss-cad-model/src/engine/direct.ts'))}; export {createRouteBundle,routeBundleDocumentIdentity} from ${JSON.stringify(join(root,'packages/barocss-cad-model/src/engine/routeBundle.ts'))};`,resolveDir:root,sourcefile:'pinned-reader-entry.ts'},absWorkingDir:root,outfile,bundle:true,platform:'node',format:'esm',metafile:true,logLevel:'silent',plugins:[{name:'pinned-workspace-only',setup(b){
  b.onResolve({filter:/^[^./]|^@/},async args=>{
   if(isBuiltin(args.path))return {path:args.path,external:true};
   if(isAbsolute(args.path))return undefined;
   const name=[...packageDirs.keys()].find(name=>args.path===name||args.path.startsWith(name+'/'));
   if(!name)throw Error('Unpinned external dependency: '+args.path);
   const dir=join(root,packageDirs.get(name)),pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
   const sub=args.path===name?'.':'./'+args.path.slice(name.length+1);let target=pkg.exports?.[sub];
   if(!target&&pkg.exports)for(const [key,value] of Object.entries(pkg.exports)){if(key.includes('*')&&sub.startsWith(key.split('*')[0])&&sub.endsWith(key.split('*')[1])){const middle=sub.slice(key.split('*')[0].length,sub.length-key.split('*')[1].length||undefined);target=typeof value==='string'?value.replace('*',middle):value;break;}}
   if(target&&typeof target==='object')target=target.import??target.default??target.types;
   if(!target&&sub==='.')target=pkg.main;
   assert.equal(typeof target,'string','explicit pinned package export: '+args.path);
   const path=resolve(dir,target);assert.ok(!relative(root,path).startsWith('../'));return {path};
  });
 }}]});
 await writeFile(join(output,label+'-metafile.json'),JSON.stringify(result.metafile,null,2)); // Preserve diagnostics even when provenance validation refuses.
 const tree=new Map(git('ls-tree','-r',commit).split('\n').map(line=>{const [info,path]=line.split('\t');return[path,info.split(' ')[2]];}));
 const sources=[],erasedTypeImports=[];
 async function erasedTypeImport(path,imported){
  assert.equal(imported.kind,'import-statement','only a static erased type import may be external');
  assert.ok(imported.path.startsWith('./')||imported.path.startsWith('../'),'type import must be archive-relative');
  const text=await readFile(path,'utf8'),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,'type import source must parse without errors');
  const matches=ast.statements.filter(node=>(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text===imported.path);
  assert.ok(matches.length>0,'external path has no matching declaration');
  for(const declaration of matches){
   assert.ok(ts.isImportDeclaration(declaration),'re-export is not an erased type import');
   const clause=declaration.importClause,bindings=clause?.namedBindings;
   assert.ok(clause&&(clause.isTypeOnly||(!clause.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.length>0&&bindings.elements.every(element=>element.isTypeOnly))),'external declaration contains a runtime binding: '+imported.path);
  }
  const visit=node=>{
   if(ts.isCallExpression(node)&&node.arguments.length&&ts.isStringLiteralLike(node.arguments[0])&&node.arguments[0].text===imported.path)
    assert.ok(!(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require')),'same external path also has a runtime load');
   ts.forEachChild(node,visit);
  };visit(ast);
  const base=resolve(dirname(path),imported.path);
  const candidates=imported.path.endsWith('.js')?[base.slice(0,-3)+'.ts']:imported.path.endsWith('.ts')?[base]:[base+'.ts',join(base,'index.ts')];
  const found=candidates.filter(candidate=>tree.has(relative(root,candidate)));
  assert.equal(found.length,1,'type target must resolve uniquely in pinned source: '+imported.path);
  const target=found[0],rel=relative(root,target);assert.ok(!rel.startsWith('../')&&!isAbsolute(rel),'type target escaped pinned archive');
  assert.equal(await realpath(target),target,'type target symlink forbidden');
  const blob=execFileSync('git',['hash-object',target],{cwd:repo,encoding:'utf8'}).trim();assert.equal(blob,tree.get(rel),'type target blob mismatch');
  erasedTypeImports.push({source:relative(root,path),specifier:imported.path,kind:imported.kind,declarations:matches.length,target:rel,gitBlob:blob,classification:'AST-explicit-type-only'});
 }

 for(const [name,meta] of Object.entries(result.metafile.inputs)){
  if(name==='<stdin>' || resolve(root,name)===join(root,'pinned-reader-entry.ts'))continue; // Generated export-only harness, not product source.
  const path=resolve(root,name),rel=relative(root,path);assert.ok(!rel.startsWith('../')&&!isAbsolute(rel),'dependency escaped pinned archive: '+name);
  assert.equal(await realpath(path),path,'no dependency symlink');assert.ok(tree.has(rel),'dependency absent from pinned tree: '+rel);
  const blob=execFileSync('git',['hash-object',path],{cwd:repo,encoding:'utf8'}).trim();assert.equal(blob,tree.get(rel),'pinned source blob mismatch: '+rel);
  for(const imported of meta.imports)if(imported.external&&!isBuiltin(imported.path))await erasedTypeImport(path,imported);
  sources.push({path:rel,gitBlob:blob});
 }
 for(const out of Object.values(result.metafile.outputs))for(const imported of out.imports)if(imported.external)assert.ok(isBuiltin(imported.path),'external output import rejected: '+imported.path+' ('+imported.kind+')');
 assert.ok(sources.some(s=>s.path.endsWith('/engine/container.ts'))&&sources.some(s=>s.path.endsWith('/chat/brief.ts')));
 await writeFile(join(output,label+'-metafile.json'),JSON.stringify(result.metafile,null,2));
 receipt.builds.push({label,commit,archivePaths,sourceScope:'Full transitive product source pin, not whole repository',archiveSha256:hash(await readFile(archive)),bundleSha256:hash(await readFile(outfile)),sourceCount:sources.length,sources,erasedTypeImports});
 return import(pathToFileURL(outfile).href);
}
function part(schema){return {format:'barocss-cad-model',schema,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[10,10]},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};}
const fields=[
 {value:'설명, "quoted"\nsecond line',basis:'stated',source:'Synthetic owner quote',said:'verified',confirmed:{by:'user',at:'2026-11-17T00:00:00.000Z'}},
 {value:'Assumed note',basis:'assumed',why:'Synthetic assumption',said:'unverified'},
 {value:'Ambiguous note',basis:'ambiguous',why:'Synthetic alternative readings'},
];
function routeRoot(api){
 const curve=(id,x)=>'@curve #'+id+' { type: nurbs; degree: 3; knots: [0,0,0,0,1,1,1,1]; control-points: [['+x+',0,0],['+x+',0,10],['+x+',0,20],['+x+',0,30]]; weights: [1,1,1,1]; }';
 const direct=api.importSource(api.emptyDirect(),'@model routesA { version: 0; length-unit: mm; '+[curve('a',-2),curve('b',2),curve('witness',20)].join(' ')+' }','routes');
 const objects=['a','b'].map(id=>{const object=direct.objects.find(o=>o.geometry===id);assert.ok(object);return object;});
 let doc={...api.emptyDoc(),direct};
 for(const [i,object] of objects.entries()){
  const g=api.geometryOf(direct,object);assert.equal(g.kind,'curve');
  doc=api.withNode(doc,{kind:'sketch',profile:'circle',center:[0,0],radius:0.5});
  doc=api.withNode(doc,{kind:'sweep-curve',sketch:2*i,name:'route '+i,path:{degree:g.degree,knots:[...g.knots],controlPoints:g.controlPoints.map(p=>[...p]),weights:[...g.weights]}});
 }
 const original=structuredClone(doc),input={id:'bundle1',tieId:'tie1',anchorMM:[0,0,10],members:objects.map((object,i)=>({id:i?'memberB':'memberA',curveObjectId:object.id,handleKey:'1',sweepFeatureId:'n'+(2*i+1),profileFeatureId:'n'+(2*i)})),expectedDocumentIdentity:api.routeBundleDocumentIdentity(doc)};
 const result=api.createRouteBundle(doc,input);assert.deepEqual(doc,original);assert.equal(result.schema,4);assert.equal(result.routeBundles.length,1);return result;
}
function fixture(schema,kind,api){
 if(schema===4){const root=routeRoot(api);if(kind!=='absentBrief')root.brief={version:1,purpose:{value:'Unrelated route purpose',basis:'stated',source:'Synthetic purpose'},...(kind==='fullFields'?{notes:structuredClone(fields[0])}:{})};return root;}

 const root=part(schema),shared=part(schema),independent=part(schema);
 if(kind!=='absentBrief')for(const [index,doc] of [root,shared,independent].entries())doc.brief={version:1,purpose:{value:'Unrelated purpose '+index,basis:'stated',source:'Synthetic purpose'},...(kind==='fullFields'?{notes:structuredClone(fields[index])}:{})};
 root.instances=[{id:'p1',name:'Shared A',doc:shared,position:[20,0,0],rotation:[0,0,0],part:{id:'definition-a',rev:'A'}},{id:'p2',name:'Shared B',doc:shared,position:[40,0,0],rotation:[0,0,0],part:{id:'definition-a',rev:'A'}},{id:'p3',name:'Independent',doc:independent,position:[60,0,0],rotation:[0,0,0],part:{id:'definition-independent',rev:'A'}}];
 return root;
}
function semantic(reader,doc,kind){
 for(const part of [doc,...(doc.instances??[]).map(i=>i.doc)]){
  const brief=reader.readBrief(part.brief);
  if(kind==='absentBrief'){assert.equal(brief,undefined);assert.equal(Object.hasOwn(part,'brief'),false);}
  else {assert.deepEqual(brief,part.brief);assert.equal(Object.hasOwn(brief,'notes'),kind==='fullFields');}
 }
 if(doc.schema===3){assert.deepEqual(doc.instances[0].doc,doc.instances[1].doc);assert.notEqual(doc.instances[0].part.id,doc.instances[2].part.id);}else{assert.equal(doc.instances?.length??0,0);assert.equal(doc.routeBundles.length,1);}
}
try{
 await reserve('start');
 const old=await bundle('old',OLD),current=await bundle('current',CURRENT);
 for(const schema of [3,4])for(const kind of ['absentBrief','absentNotes','fullFields']){
  const doc=fixture(schema,kind,current),original=structuredClone(doc),label=`schema${schema}-${kind}`;
  const bytes=current.encodeStudioFile(doc);assert.deepEqual(doc,original);const originalBytes=Buffer.from(bytes);
  const read=await old.readStudioFile(bytes);assert.ok('doc'in read,JSON.stringify(read));assert.deepEqual(read.doc,original);semantic(old,read.doc,kind);assert.deepEqual(doc,original);assert.deepEqual(Buffer.from(bytes),originalBytes);
  const oldBefore=structuredClone(read.doc),backBytes=old.encodeStudioFile(read.doc);assert.deepEqual(read.doc,oldBefore);
  const back=await current.readStudioFile(backBytes);assert.ok('doc'in back,JSON.stringify(back));assert.deepEqual(back.doc,original);semantic(current,back.doc,kind);
  await writeFile(join(output,label+'-current.bcad'),bytes);await writeFile(join(output,label+'-old-resaved.bcad'),backBytes);
  receipt.cases.push({label,schema,kind,status:'PASS',currentBytesSha256:hash(bytes),oldResavedSha256:hash(backBytes),exactDocument:true,oldBriefConsumer:true,sourceUnchanged:true});
 }
 receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.error=error.stack??String(error);process.exitCode=1;}
finally{await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,receipt:join(output,'receipt.json')}));}
