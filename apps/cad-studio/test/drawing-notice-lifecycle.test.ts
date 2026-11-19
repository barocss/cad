import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retireStudioNotice, type StudioNotice } from '../src/app/studioNotice';
const make = (): StudioNotice => ({ title: 'Could not draw the part', hint: 'fix', detail: 'scope' });
test('retires only the exact drawing notice', () => { const owned = make(); assert.equal(retireStudioNotice(owned, owned), null); });
test('preserves newer identical-text and unrelated notices', () => { const owned = make(), newer = make(), foreign = { title: 'Save failed', hint: 'retry', detail: '' }; assert.equal(retireStudioNotice(newer, owned), newer); assert.equal(retireStudioNotice(foreign, owned), foreign); });
test('dismissed notice stays dismissed and repeated cleanup is safe', () => { const owned = make(); assert.equal(retireStudioNotice(null, owned), null); assert.equal(retireStudioNotice(retireStudioNotice(owned, owned), owned), null); });
test('old cleanup cannot retire replacement after setup-cleanup-setup', () => { const first = make(), second = make(); let current: StudioNotice | null = first; current = retireStudioNotice(current, first); current = second; current = retireStudioNotice(current, first); assert.equal(current, second); assert.equal(retireStudioNotice(current, second), null); });
