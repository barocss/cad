import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRangeHint } from '../src/ui/renderRangeHint';
test('stable range help distinguishes cutoff from attenuation throughout editing', () => {
 assert.match(renderRangeHint, /0 mm disables the distance cutoff, not distance attenuation/);
 assert.match(renderRangeHint, /Positive values.*fades to zero/);
 assert.ok(!renderRangeHint.includes('85'));
});
