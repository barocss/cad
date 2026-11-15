import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { newFilletActive } from '../src/app/filletFamily';
import { commandNumberRule, historyNumberRule, featureNumberInvalid, featureNumberBounds, featureNumberRange, filletSectionNumberProblem } from '../src/app/featureNumberInput';
const doc = rectanglePart(40,30,10), evaluated = evaluateDoc(doc,0); assert.ok(evaluated.ok);
const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
const ctx = { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{body:0,edge}], bodies: [] } };
const active = (shape: string, value: string | number) => newFilletActive('edge',ctx,{radius:4,shape,rho:value,tension:value});
const feature = (kind: 'conic' | 'g2', value: number): ModelNode => ({id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:4,section: kind === 'conic' ? {kind,rho:value} : {kind,tension:value}});
test('section open-unit admission is exact, finite, and has no epsilon cutoff', () => {
  assert.deepEqual(featureNumberBounds('open-unit'),{min:0,max:1});
  assert.equal(featureNumberRange('open-unit'),'Unitless section shape · greater than 0 and less than 1');
  for (const value of [Number.MIN_VALUE, 1e-12, .005, .65, .995, 1-Number.EPSILON/2, 0, -0, 1, -1, 2, NaN, Infinity, -Infinity, '', ' ', 'NaN', 'Infinity', '1e']) {
    const valid = Number.isFinite(Number(value)) && Number(value)>0 && Number(value)<1;
    assert.equal(!featureNumberInvalid(value,'open-unit'),valid,String(value));
    for (const kind of ['conic','g2']) assert.equal(!filletSectionNumberProblem(active(kind,value)),valid,kind+':'+String(value));
  }
});
test('rules apply only to the matching command and stored section key', () => {
  for (const key of ['rho','tension']) { assert.equal(commandNumberRule('fillet',key),'open-unit'); assert.equal(commandNumberRule('scale',key),undefined); }
  for (const [kind,key,other] of [['conic','rho','tension'],['g2','tension','rho']] as const) {
    const nodes = [...doc.nodes,feature(kind,.7)], before = structuredClone(nodes);
    assert.equal(historyNumberRule(nodes,2,key),'open-unit'); assert.equal(historyNumberRule(nodes,2,other),undefined);
    assert.deepEqual(nodes,before);
    const current = active(kind,.7); current.values[other]=0; assert.equal(filletSectionNumberProblem(current),undefined);
    current.values[key]=''; assert.equal(filletSectionNumberProblem(current)?.key,key);
  }
  assert.equal(historyNumberRule(doc.nodes,1,'rho'),undefined);
  const circular=active('circular',0); assert.equal(filletSectionNumberProblem(circular),undefined);
  const unrelated=active('conic',0); unrelated.cmd={...unrelated.cmd,id:'scale'}; assert.equal(filletSectionNumberProblem(unrelated),undefined);
  assert.equal(commandNumberRule('fillet','radius'),'positive'); assert.equal(featureNumberInvalid(0,'positive'),true);
});
for (const kind of ['conic','g2'] as const) test(`${kind} numeric acceptance is not a native geometry success claim`, () => {
  // Native input refusal remains the authoritative open interval. Very small positive
  // values may pass that admission yet fail a later geometric construction.
  for (const value of [0,1,-1,2,NaN,Infinity]) {
    const built = active(kind,value).cmd.build!(ctx,active(kind,value).values), result=evaluateDoc(built,1);
    assert.equal(result.ok,false); if (!result.ok) assert.match(result.error.detail ?? result.error.title,/between 0 and 1/);
  }
  for (const value of [.005,.65,.995]) {
    const current=active(kind,value); assert.equal(filletSectionNumberProblem(current),undefined);
    const metadata=current.cmd.fields!(ctx,current.values).find(field=>field.key===(kind==='conic'?'rho':'tension')); assert.ok(metadata && metadata.kind==='ratio'); assert.equal(metadata.min,0); assert.equal(metadata.max,1);
    const result=evaluateDoc(current.cmd.build!(ctx,current.values),1); assert.ok(result.ok,JSON.stringify(result));
  }
  const current=active(kind,.7); current.values.radius=100; assert.equal(filletSectionNumberProblem(current),undefined);
  assert.equal(evaluateDoc(current.cmd.build!(ctx,current.values),1).ok,false);
});
