import assert from 'node:assert/strict';
import test from 'node:test';
import { renameIds } from '../src/chat/remap';

test('Sweep proposal replay remaps the sketch but keeps Direct path identity and revision', () => {
  const values = { sketch: 'n7', path: 'n7-line', pathRevision: 'a'.repeat(64), representation: 'exact-straight' };
  const one = { tool: 'run_command', args: { command: 'sweep-curve', values } };
  const two = { tool: 'features', args: { action: 'command', command: 'sweep-curve', values } };
  assert.deepEqual(renameIds([one, two], new Map([['n7', 'n12']])),
    [one, two].map(op => ({ ...op, args: { ...op.args, values: { ...values, sketch: 'n12' } } })));
});
