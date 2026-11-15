import test from 'node:test';
import assert from 'node:assert/strict';
import { returnEditorFocus } from '../src/ui/editorReturnFocus';
function fixture() {
  const calls: string[] = [], scope = {}, body = {} as HTMLElement;
  const element = (name: string) => ({ isConnected: true, matches: () => false, closest: () => null,
    getClientRects: () => [1], focus: () => calls.push(name) }) as unknown as HTMLElement;
  return { calls, scope, body, page: { body, activeElement: body }, opener: element('opener'), fallback: element('browser') };
}
for (const origin of ['Extrude rail Cancel', 'History sketch Close editor', 'History E then Escape']) test(`${origin} returns teardown focus to its surviving opener`, () => {
  const f = fixture();
  assert.equal(returnEditorFocus(f.scope, f.scope, true, f.opener, f.fallback, f.page), true);
  assert.deepEqual(f.calls, ['opener']);
});
test('missing, hidden, inert, disabled or nonrendered opener uses Browser fallback', () => {
  for (const kind of ['missing', 'hidden', 'disabled', 'nonrendered']) {
    const f = fixture();
    Object.assign(f.opener, kind === 'missing' ? { isConnected: false } : kind === 'hidden' ? { closest: () => ({}) }
      : kind === 'disabled' ? { matches: () => true } : { getClientRects: () => [] });
    assert.equal(returnEditorFocus(f.scope, f.scope, true, f.opener, f.fallback, f.page), true);
    assert.deepEqual(f.calls, ['browser']);
  }
});
test('new document or Open scope, active editor, user focus, and unavailable fallback suppress handoff', () => {
  for (const kind of ['scope', 'active', 'focus', 'unavailable']) {
    const f = fixture();
    assert.equal(returnEditorFocus(f.scope, kind === 'scope' ? {} : f.scope, kind !== 'active',
      kind === 'unavailable' ? null : f.opener, kind === 'unavailable' ? null : f.fallback,
      kind === 'focus' ? { ...f.page, activeElement: {} as HTMLElement } : f.page), false);
    assert.deepEqual(f.calls, []);
  }
});
