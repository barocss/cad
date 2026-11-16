import test from 'node:test';
import assert from 'node:assert/strict';
import {hasInlineFilletRadiusError} from '../src/app/filletRadiusNotice';
import type {Active} from '../src/app/commandState';
test('only the owned invalid Radius duplicate is hidden',()=>{
 const active={cmd:{id:'fillet',label:'Fillet',icon:'cad-fillet',group:'modify',available:()=>({ok:true})},values:{radius:0},error:{title:'Enter a valid Radius',hint:'Greater than 0 mm.',detail:''}} as Pick<Active,'cmd'|'values'|'error'>;
 assert.equal(hasInlineFilletRadiusError(active),true);
 for(const radius of [-1,-.01])assert.equal(hasInlineFilletRadiusError({...active,values:{radius}}),true);
 for(const radius of [1.5,''])assert.equal(hasInlineFilletRadiusError({...active,values:{radius}}),false);
 assert.equal(hasInlineFilletRadiusError({...active,error:{...active.error!,detail:'geometry failure'}}),false);
 assert.equal(hasInlineFilletRadiusError({...active,error:{...active.error!,title:'Cannot build fillet'}}),false);
 assert.equal(hasInlineFilletRadiusError({...active,cmd:{...active.cmd,id:'chamfer'}}),false);
});
