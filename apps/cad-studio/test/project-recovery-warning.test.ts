import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The checkpoint has no persisted save-generation provenance. Do not promise recency.
test('project recovery explains unknown recency and the Restore/Save boundary', () => {
  const source = readFileSync(resolve('src/storage/VersionsPanel.tsx'), 'utf8');
  assert.ok(source.includes('It may be older or from another window.'));
  assert.ok(source.includes('Restore replaces the current document; the saved file stays unchanged until you Save.'));
  assert.ok(!source.includes('since its last save'));
  assert.ok(source.includes('aria-label="Restore autosaved work"'));
  assert.ok(source.includes('aria-label="Discard autosaved work"'));
});
