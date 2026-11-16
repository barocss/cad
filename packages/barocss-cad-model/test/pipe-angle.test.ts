import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,withNode} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {pipeCommand} from '../src/app/profileCommands';
test('Pipe command angle bounds agree with evaluated kernel path',()=>{
 const doc=withNode(emptyDoc(),{kind:'sketch',profile:'circle',center:[0,0],radius:5});
 const ctx={doc,bodies:[],selection:{faces:[],edges:[],bodies:[],sketches:[0]}};
 const fields=typeof pipeCommand.fields==='function'?pipeCommand.fields(ctx):pipeCommand.fields;
 const field=fields?.find(f=>f.key==='bendAngle');assert.ok(field && 'max' in field);assert.equal(field.max,180);
 for(const angle of [0,0.5,90,180,180.01,270]) {
  const d=pipeCommand.build!(ctx,{h:8,bend:20,bendAngle:angle,toward:'x'}),r=evaluateDoc(d,1);
  assert.equal(r.ok,angle>0&&angle<=180,`${angle}: ${!r.ok?r.error.detail:'accepted'}`);
 }
});
