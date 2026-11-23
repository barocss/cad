export function holdOriginalFilletRefs() {
  const proto = Worker.prototype, post = proto.postMessage;
  const handler = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target, pending;
  proto.postMessage = function (request, ...rest) {
    if (armed && request?.type === 'part' && request.slot === 'refs') {
      armed = false;
      target = { worker: this, id: request.id, revision: request.revision };
    }
    return post.call(this, request, ...rest);
  };
  Object.defineProperty(proto, 'onmessage', {
    configurable: true, get: handler.get,
    set(callback) {
      handler.set.call(this, typeof callback === 'function' ? function (event) {
        if (target?.worker === this && event.data?.id === target.id && event.data.result) {
          pending = { result: event.data.result, revision: target.revision, release: () => callback.call(this, event) };
          target = undefined;
          return;
        }
        return callback.call(this, event);
      } : callback);
    },
  });
  window.__filletHistoryRefs = {
    arm() { if (armed || target || pending) throw Error('Already holding original refs'); armed = true; },
    read() {
      return pending && { ok: pending.result.ok, revision: pending.revision, resultRevision: pending.result.revision,
        key: pending.result.bodies?.[0]?.key };
    },
    release() { if (!pending) throw Error('Expected a real refs reply'); pending.release(); pending = undefined; },
  };
}
