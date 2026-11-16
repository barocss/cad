import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { editFields } from '../src/app/editFields';
const wheel = (x: number): Extract<ModelNode, { kind: 'sprocket' }> => ({ kind: 'sprocket', row: 'chain-a', teeth: 17, tip: 75, width: 7, center: [x, 0], generator: 'sprocket@0' });
const pulley = (row = 'chain-a'): ModelNode => ({ kind: 'pulley', row, diameter: 80, width: 40, center: [0, 0], generator: 'pulley@0' });
const chain = (): ModelNode[] => [wheel(0), wheel(200), { kind: 'belt', row: 'chain-a', wheels: [0, 1], rounding: 'even', generator: 'belt@0' }];
const links = (nodes: readonly ModelNode[], doc?: StudioDoc) => editFields(nodes, 2, undefined, undefined, doc ? { doc } : undefined).find(f => f.key === 'links');
const document = (nodes: ModelNode[]): StudioDoc => ({ ...emptyDoc(), nodes, drives: { version: 1, rows: [{ kind: 'chain', id: 'chain-a', pitch: 12.7, rollerDiameter: 8.51, estimate: true }] } });

test('matching sprockets retain chain Links with and without document scope and do not mutate input', () => {
 const nodes=chain(),snapshot=structuredClone(nodes);
 for(const doc of [undefined,document(nodes)]){
  const f=links(nodes,doc);assert.ok(f?.kind==='choice');assert.deepEqual(f.options.map(o=>o.value),['whole','even']);
  const changed=f.set(nodes,'whole');assert.deepEqual(changed[2],{...nodes[2],rounding:'whole'});assert.equal(changed[0],nodes[0]);assert.equal(changed[1],nodes[1]);
 }
 assert.deepEqual(nodes,snapshot);
});

test('pulley pairs, mixed or missing wheels, and mismatched row references have no chain Links',()=>{
 const nodes=chain(),belt=nodes[2];assert.ok(belt.kind==='belt');
 for(const row of ['v','timing','flat']){
  const pair:ModelNode[]=[pulley(row),pulley(row),{...belt,row}];const snapshot=structuredClone(pair);
  assert.equal(links(pair),undefined);assert.deepEqual(pair,snapshot,'legacy rounding is not stripped');
 }
 for(const bad of [[pulley(),nodes[1],belt],[nodes[0],{...wheel(200),row:'other'},belt],[nodes[0],nodes[1],{...belt,row:'other'}],[nodes[0],nodes[1],{...belt,wheels:[0,99]}],[nodes[0],nodes[1],{...belt,wheels:[0,0]}]] as ModelNode[][])assert.equal(links(bad),undefined);
});

test('document scope rejects missing, non-chain and duplicate row definitions',()=>{
 const nodes=chain(),doc=document(nodes);
 const variants:StudioDoc[]=[{...doc,drives:undefined},{...doc,drives:{version:1,rows:[]}},{...doc,drives:{version:1,rows:[{kind:'flat-belt',id:'chain-a',width:40,thickness:3,estimate:true}]}},{...doc,drives:{version:1,rows:[...doc.drives!.rows,...doc.drives!.rows]}}];
 for(const current of variants)assert.equal(links(nodes,current),undefined);
});

test('captured setter checks current nodes and never adds rounding to a non-chain',()=>{
 const nodes=chain(),field=links(nodes);assert.ok(field?.kind==='choice');const belt=nodes[2];assert.ok(belt.kind==='belt');
 for(const current of [[pulley(),pulley(),belt],[nodes[0],{...wheel(200),row:'other'},belt],[nodes[0],nodes[1],{...belt,wheels:[0,99]}]] as ModelNode[][]){const snapshot=structuredClone(current);assert.deepEqual(field.set(current,'whole'),current);assert.deepEqual(current,snapshot);}
 const other:ModelNode[]=[{...wheel(0),row:'new'},{...wheel(200),row:'new'},{...belt,row:'new'}];assert.equal(field.get(field.set(other,'whole')),'whole','scope-free fields follow a coherent current chain');
 const scoped=links(nodes,document(nodes));assert.ok(scoped?.kind==='choice');assert.deepEqual(scoped.set(other,'whole'),other,'a captured row table does not authorize an unknown current row');
});


test('malformed wheel counts cannot acquire or reuse chain Links', () => {
 const nodes = chain(), belt = nodes[2], field = links(nodes);
 assert.ok(belt.kind === 'belt' && field?.kind === 'choice');
 for (const wheels of [[], [0], [0, 1, 0]]) {
  const malformed = [nodes[0], nodes[1], { ...belt, wheels }] as unknown as ModelNode[];
  assert.equal(links(malformed), undefined);
  assert.deepEqual(field.set(malformed, 'whole'), malformed);
 }
});
