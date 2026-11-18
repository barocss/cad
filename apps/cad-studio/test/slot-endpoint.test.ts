import test from 'node:test';
import assert from 'node:assert/strict';
import type { SketchShape } from '@barocss/cad-model/sketch/types';
import { slotEndpoint } from '../src/sketch/slotEndpoint';
type Slot = Extract<SketchShape, { kind: 'slot' }>;
const near = (a: number, b: number, tolerance = 1e-12) => assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`);
function retained(next: Slot, source: Slot) { assert.equal(next.a, source.a); assert.equal(next.r, source.r); assert.deepEqual({...next,b:source.b},source); }
test('fractional horizontal Length preserves requested distance without endpoint quantization', () => {
 const s: Slot = {kind:'slot',a:[10.123456789,15],b:[45.123456789,15],r:4,construction:true};
 const saved=structuredClone(s);Object.freeze(s.a);Object.freeze(s.b);Object.freeze(s);
 const n=slotEndpoint(s,40.123456789,0);near(n.b[0],50.246913578);assert.equal(n.b[1],15);near(Math.hypot(n.b[0]-s.a[0],n.b[1]-s.a[1]),40.123456789);retained(n,s);assert.deepEqual(s,saved);
});
test('oblique Length and repeated Angle changes retain first centre, radius and prior distance', () => {
 const s: Slot={kind:'slot',a:[-1.234567891,7.987654321],b:[10.765432109,12.987654321],r:2.123456789,construction:true};
 const saved=structuredClone(s),angle=Math.atan2(5,12)*180/Math.PI;
 let n=slotEndpoint(s,26.123456789,angle);near(n.b[0],s.a[0]+26.123456789*12/13);near(n.b[1],s.a[1]+26.123456789*5/13);retained(n,s);
 for(const deg of [30.123456789,-127.987654321,90,0]){
  const length=Math.hypot(n.b[0]-n.a[0],n.b[1]-n.a[1]);n=slotEndpoint(n,length,deg);retained(n,s);
  near(Math.hypot(n.b[0]-n.a[0],n.b[1]-n.a[1]),length);near(Math.atan2(n.b[1]-n.a[1],n.b[0]-n.a[0])*180/Math.PI,deg,1e-10);
  const newLength=length+.123456789;n=slotEndpoint(n,newLength,deg);near(Math.hypot(n.b[0]-n.a[0],n.b[1]-n.a[1]),newLength);retained(n,s);
 }
 assert.deepEqual(s,saved);
});
test('caller Length clamp remains .5; Angle may retain an existing zero-length pending Slot',()=>{
 const s:Slot={kind:'slot',a:[2.123456789,3],b:[7.123456789,3],r:4};
 for(const requested of [-1,0,.1,.5]){const n=slotEndpoint(s,Math.max(.5,requested),0);near(n.b[0]-n.a[0],.5);retained(n,s);}
 const zero={...s,b:s.a};assert.equal(slotEndpoint(zero,0,45),zero);
 const exact:Slot={...s,a:[2,3],b:[7,3]};assert.equal(slotEndpoint(exact,5,0),exact);
});
test('nonfinite input and overflowing endpoint return the original without mutation',()=>{
 const s:Slot={kind:'slot',a:[2,3],b:[7,3],r:4};
 for(const value of [NaN,Infinity,-Infinity]){assert.equal(slotEndpoint(s,value,0),s);assert.equal(slotEndpoint(s,5,value),s);}
 const large:Slot={...s,a:[Number.MAX_VALUE,3]};assert.equal(slotEndpoint(large,Number.MAX_VALUE,0),large);
 assert.equal(slotEndpoint(s,5,Number.MAX_VALUE),s);
});
