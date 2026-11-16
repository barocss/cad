// Local writer oracle for an actual reopened browser document. No browser/download/PDF actions.
// node test/detail-paper-export.mjs <06-reopened.json> <receipt.json> <output-directory>
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../..');
const [snapshotPath, receiptPath, output] = process.argv.slice(2);
assert.ok(snapshotPath && receiptPath && output, 'snapshot, browser receipt and output directory required');
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')), receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const observation = receipt.observations.filter(x => x.detail?.id === 'B').at(-1);
assert.ok(observation, 'browser detail observation required');
const native = root + '/packages/barocss-cad', model = root + '/packages/barocss-cad-model/src';
const exports = JSON.parse(readFileSync(native + '/package.json', 'utf8')).exports;
const alias = Object.fromEntries(Object.entries(exports).filter(([, v]) => v.types).map(([k, v]) => ['@barocss/cad' + k.slice(1), native + '/' + v.types]));
mkdirSync(output, { recursive: true });
const bundle = resolve(output, 'writer.mjs');
await build({ stdin: { contents: `
import {readFileSync} from 'node:fs';
import {drawingInputs} from ${JSON.stringify(model + '/chat/drawing.ts')};
import {issueContext} from ${JSON.stringify(model + '/drawing/issues.ts')};
import {forSheet} from ${JSON.stringify(model + '/drawing/sheets.ts')};
import {sheetSvg} from ${JSON.stringify(model + '/io/svg.ts')};
import {sheetDxf} from ${JSON.stringify(model + '/io/dxf.ts')};
const doc=JSON.parse(readFileSync(0,'utf8')),before=JSON.stringify(doc),sheets=[];
for(let k=0;k<2;k++){const input=drawingInputs(doc,forSheet(doc.drawing,k));if(typeof input==='string')throw Error(input);const c=issueContext(input);sheets.push({svg:sheetSvg(c.sheet,doc.drawing.title),dxf:sheetDxf(c.sheet,c.layout).text});}
if(JSON.stringify(doc)!==before)throw Error('writer mutated document');
process.stdout.write(JSON.stringify({doc,sheets}));`, resolveDir: root, sourcefile: 'detail-paper-export-inspector.ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22', alias, nodePaths: [root + '/apps/cad-studio/node_modules'], logLevel: 'warning' });
const generated = spawnSync(process.execPath, [bundle], { input: JSON.stringify(snapshot.doc), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
assert.equal(generated.status, 0, generated.stderr);
const payload = { ...JSON.parse(generated.stdout), observation: observation.detail, browserHtml: readFileSync(snapshotPath.replace(/\.json$/, '.html'), 'utf8') };
const checked = spawnSync('python3', [resolve(here, 'detail-paper-export-reader.py')], { input: JSON.stringify(payload), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
writeFileSync(resolve(output, 'writer-memory.json'), JSON.stringify(payload, null, 2));
writeFileSync(resolve(output, 'reader.log'), checked.stdout + checked.stderr);
assert.equal(checked.status, 0, checked.stdout + checked.stderr);
writeFileSync(resolve(output, 'receipt.json'), JSON.stringify({ snapshot: resolve(snapshotPath), browserReceipt: resolve(receiptPath), result: JSON.parse(checked.stdout), pdf: 'excluded', downloads: [] }, null, 2));
console.log(checked.stdout);
