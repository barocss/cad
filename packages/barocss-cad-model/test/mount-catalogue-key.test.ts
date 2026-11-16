import {defaultRender} from '../src/engine/render';
import test from 'node:test';
import assert from 'node:assert/strict';
import {contentKey} from '../src/engine/evalMemo';
import {rectanglePart,type StudioDoc} from '../src/engine/doc';
import type {StudioMountRow} from '../src/engine/mountRows';
const row:StudioMountRow={id:'test-motor',type:'motor',holes:{pattern:'square',spacing:30,diameter:3.4},shaft:5,shaftHeight:0,clearance:0.5,estimate:true};
test('Mount row loading, same-id replacement and removal refresh the command context key',()=>{
 const base=rectanglePart(160,100,10), loaded:StudioDoc={...base,mounts:{version:1,rows:[row]}};
 const replaced:StudioDoc={...loaded,mounts:{version:1,rows:[{...row,holes:{...row.holes,diameter:4}}]}};
 assert.equal(base.nodes,loaded.nodes);assert.equal(base.parameters,loaded.parameters);
 assert.notEqual(contentKey(base),contentKey(loaded));assert.notEqual(contentKey(loaded),contentKey(replaced));
 assert.equal(contentKey({...loaded,mounts:undefined}),contentKey(base));
 assert.equal(contentKey({...loaded,mounts:structuredClone(loaded.mounts)}),contentKey(loaded));
 assert.equal(contentKey({...loaded,render:defaultRender()}),contentKey(loaded));
});
