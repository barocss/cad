import test from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps, ReactElement } from 'react';
import { rectanglePart, type PartInstance, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { InstanceInspector } from '../src/ui/InstanceInspector';
import { InstancePanel } from '../src/ui/InstancePanel';

function fixture() {
  const inst: PartInstance = { id: 'cube', name: 'Cube', doc: rectanglePart(10, 10, 10), position: [1, 2, 3], rotation: [0, 0, 0] };
  const doc: StudioDoc = { ...rectanglePart(30, 20, 4), instances: [inst] };
  const changes: PartInstance[][] = [], selections: (string[] | undefined)[] = [], events: string[] = [];
  let accept = true;
  const props: ComponentProps<typeof InstanceInspector> = {
    model: { doc, selectedId: inst.id, entry: undefined },
    bearing: { selected: null, blocked: false, pending: false, close: () => {}, apply: async () => {} },
    assembly: { ground: () => null, without: () => { events.push('without'); return []; } },
    changes: { commitInstances: (next, select) => { changes.push(next); selections.push(select); return accept; },
      commitParts: () => true, commitAssembly: next => { changes.push(next); events.push('commit'); return accept; },
      patternEdit: () => undefined, startInPlace: () => {}, clearSelection: () => { events.push('clear'); } },
    onNotice: () => {},
  };
  const panel = () => {
    const result = InstanceInspector(props); assert.ok(result); assert.equal(result.type, InstancePanel);
    return (result as ReactElement<ComponentProps<typeof InstancePanel>>).props;
  };
  return { inst, doc, props, panel, changes, selections, events, refuse: () => { accept = false; } };
}
test('instance inspector hides missing selection and blocked bearing editor', () => {
  const f = fixture(); f.props.model.selectedId = 'missing'; assert.equal(InstanceInspector(f.props), null);
  f.props.model.selectedId = f.inst.id;
  f.props.bearing = { ...f.props.bearing, selected: { session: null, error: 'Unavailable' }, blocked: true };
  assert.equal(InstanceInspector(f.props), null);
});
test('duplicate routes a free offset copy and selection through the central commit', () => {
  const f = fixture(); f.inst.pattern = { id: 'pattern', k: 1 }; f.inst.grounded = true;
  const original = structuredClone(f.doc); f.panel().onDuplicate();
  const copy = f.changes[0][1]; assert.equal(f.changes[0][0], f.inst);
  assert.notEqual(copy.id, f.inst.id); assert.equal(copy.name, 'Cube copy');
  assert.deepEqual(copy.position, [21, 22, 3]); assert.equal(copy.pattern, undefined); assert.equal(copy.grounded, undefined);
  assert.deepEqual(f.selections[0], [copy.id]); assert.deepEqual(f.doc, original);
});
test('remove clears selection only after the central assembly commit accepts', () => {
  const accepted = fixture(); accepted.panel().onRemove();
  assert.deepEqual(accepted.events, ['without', 'commit', 'clear']); assert.deepEqual(accepted.changes, [[]]);
  const refused = fixture(); refused.refuse(); refused.panel().onRemove(); assert.deepEqual(refused.events, ['without', 'commit']);
});
