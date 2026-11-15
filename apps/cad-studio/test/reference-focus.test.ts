import test from 'node:test';
import assert from 'node:assert/strict';
import { handoffReferenceFocus } from '../src/ui/referenceFocus';

function fixture(next = false) {
  const doc = {}, scope = {}, body = {} as HTMLElement;
  const calls: string[] = [];
  const target = (name: string) => ({ isConnected: true, focus: () => calls.push(name), scrollIntoView: () => calls.push('scroll') }) as unknown as HTMLElement;
  const candidate = target('candidate'), fallback = target('browser');
  const browser = { querySelector: (selector: string) => selector === '[data-reference-next]' ? next ? candidate : null : fallback } as unknown as HTMLElement;
  const receipt = { doc, scope, button: { isConnected: false } as HTMLButtonElement };
  return { doc, scope, body, calls, candidate, fallback, browser, receipt, page: { body, activeElement: body } };
}
test('remaining candidate retains keyboard focus priority', () => {
  const f = fixture(true);
  assert.equal(handoffReferenceFocus(f.receipt, f.doc, f.scope, f.browser, f.page), true);
  assert.deepEqual(f.calls, ['candidate', 'scroll']);
});
for (const kind of ['model feature', 'drawing dimension']) test(`last ${kind} returns to the existing Browser control`, () => {
  const f = fixture();
  assert.equal(handoffReferenceFocus(f.receipt, f.doc, f.scope, f.browser, f.page), true);
  assert.deepEqual(f.calls, ['browser', 'scroll']);
});
test('changed document, Open scope, user focus, connected opener or absent Browser cannot steal focus', () => {
  for (const change of ['doc', 'scope', 'focus', 'connected', 'browser', 'detached']) {
    const f = fixture();
    if (change === 'connected') Object.assign(f.receipt.button, { isConnected: true });
    if (change === 'detached') Object.assign(f.fallback, { isConnected: false });
    assert.equal(handoffReferenceFocus(f.receipt, change === 'doc' ? {} : f.doc, change === 'scope' ? {} : f.scope,
      change === 'browser' ? null : f.browser, change === 'focus' ? { ...f.page, activeElement: {} as HTMLElement } : f.page), false);
    assert.deepEqual(f.calls, []);
  }
});


test('accepted document dispatch rotates Open scope; handoff owns the post-dispatch scope only', () => {
  const f = fixture();
  const beforeDispatch = f.scope;
  // App setDocState replaces both docNow and openIntent on an accepted document dispatch.
  const acceptedDoc = {}, afterDispatch = {};
  const staleReceipt = { ...f.receipt, doc: acceptedDoc, scope: beforeDispatch };
  assert.equal(handoffReferenceFocus(staleReceipt, acceptedDoc, afterDispatch, f.browser, f.page), false);
  const committedReceipt = { ...staleReceipt, scope: afterDispatch };
  assert.equal(handoffReferenceFocus(committedReceipt, acceptedDoc, afterDispatch, f.browser, f.page), true);
  assert.deepEqual(f.calls, ['browser', 'scroll']);
  f.calls.length = 0;
  assert.equal(handoffReferenceFocus(committedReceipt, acceptedDoc, {}, f.browser, f.page), false);
  assert.deepEqual(f.calls, []);
});
