import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const dir=process.argv[2];assert.ok(dir,'Pass the completed browser artifact directory');
const browser=JSON.parse(readFileSync(dir+'/receipt.json','utf8'));assert.equal(browser.status,'PASS');assert.ok(browser.cleanup.includes('BROWSER_CLOSED'));
const receipt={status:'RUNNING',qualification:'Standalone memory SVG/DXF writers after browser process exit; accepted UI and actual OPFS saved JSON. No export UI or download.',runs:[]};
for(const [label,expected]of[['symmetric',{kind:'symmetric',value:.254}],['saved',{kind:'deviation',upper:.254,lower:-.127}]]){
 const path=dir+'/'+label+'-accepted.json',doc=JSON.parse(readFileSync(path,'utf8'));
 const r=spawnSync(process.execPath,[dir+'/inspector.mjs',path,JSON.stringify({doc})],{encoding:'utf8',maxBuffer:24*1024*1024,timeout:120000});
 const row={label,status:r.status,signal:r.signal,error:r.error?.message,stderr:r.stderr};receipt.runs.push(row);writeFileSync(dir+'/standalone-'+label+'.stdout.json',r.stdout??'');
 if(r.status!==0){receipt.status='FAIL';break;}
 const o=spawnSync('python3',['-I',dir+'/tolerance-units-257-oracle.py'],{input:JSON.stringify({...JSON.parse(r.stdout),expected}),encoding:'utf8',timeout:30000});
 row.oracle={exit:o.status,stdout:o.stdout,stderr:o.stderr};if(o.status!==0){receipt.status='FAIL';break;}
}
if(receipt.status==='RUNNING')receipt.status='PASS';writeFileSync(dir+'/standalone-writer-receipt.json',JSON.stringify(receipt,null,2));
assert.equal(receipt.status,'PASS',JSON.stringify(receipt));
