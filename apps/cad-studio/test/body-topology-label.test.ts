import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyTopologyCounts, bodyTopologyLabel, nativeBoundaryLabel } from '../src/ui/bodyTopologyLabel';
const solid = { topology: { kind: 'solid' as const, openShells: 0, boundaryEdges: 0 }, volume: null, massRef: 2 };
const open = { topology: { kind: 'sheet' as const, openShells: 1, boundaryEdges: 4 } };
test('native topology, not pending/null mass, controls labels', () => {
  assert.equal(bodyTopologyLabel(solid), 'Solid');
  assert.equal(bodyTopologyLabel(open), 'Open surface');
  assert.equal(bodyTopologyLabel({}), 'Body · topology unknown');
  assert.equal(nativeBoundaryLabel(open), '4 native boundary edges');
  assert.equal(nativeBoundaryLabel({}), 'Native boundary count unknown');
});
test('mixed visible results keep exact solid/surface/unknown counts without mutation', () => {
  const bodies=[solid,open,{},{}], before=structuredClone(bodies);
  assert.equal(bodyTopologyCounts(bodies), '1 solid · 1 open surface · 2 bodies · topology unknown');
  assert.equal(bodyTopologyCounts([]), '0 bodies');
  assert.deepEqual(bodies,before);
});
