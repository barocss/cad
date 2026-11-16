import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupFit} from '@barocss/cad';
import {emptyDoc,type StudioDoc} from '../src/engine/doc';
import {editFitTables} from '../src/engine/fits';
const table=(id:string,upper:number)=>({id,rows:[{class:'H7',over:10,upTo:18,upper,lower:0,estimate:true},{class:'H7',over:18,upTo:30,upper:upper+0.01,lower:0,estimate:true}]});
function edit(doc:StudioDoc,add:unknown[],remove:string[]=[]){const r=editFitTables(doc,add,remove);assert.ok('doc' in r);return r.doc;}
test('reimport preserves first-table priority and H7 boundary selection',()=>{
 const a=table('a',0.018),b=table('b',0.03),doc=edit(emptyDoc(),[a,b]);const before=JSON.stringify(doc);
 const same=edit(doc,[a]);assert.deepEqual(same.fits!.tables,doc.fits!.tables);
 const revised=edit(doc,[table('a',0.02)]);assert.deepEqual(revised.fits!.tables!.map(t=>t.id),['a','b']);
 assert.equal(lookupFit(revised.fits!.tables!,'H7',18).upper,0.02);
 assert.equal(lookupFit(revised.fits!.tables!,'H7',18.001).upper,0.03);
 assert.equal(lookupFit(revised.fits!.tables!,'H7',18).table,'a');
 const appended=edit(revised,[table('c',0.04)]);assert.deepEqual(appended.fits!.tables!.map(t=>t.id),['a','b','c']);
 const removed=edit(revised,[],['a']);assert.equal(lookupFit(removed.fits!.tables!,'H7',18).table,'b');
 assert.equal(JSON.stringify(doc),before);
});
