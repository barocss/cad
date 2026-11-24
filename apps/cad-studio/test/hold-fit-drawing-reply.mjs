/** Delay one actual Drawing worker reply. Let newer replies reach Studio in their original form. */
export function holdFitDrawingReply() {
  const worker = Worker.prototype, post = worker.postMessage;
  const message = Object.getOwnPropertyDescriptor(worker, 'onmessage');
  let armed = false, target = null, pending = null;
  const sample = () => ({
    doc: structuredClone(window.__studioDoc),
    selection: structuredClone(window.__studioSelection),
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    text: [...document.querySelectorAll('svg[aria-label="Drawing sheet"] text')].map(node => node.textContent).join(' '),
    tables: window.__studioDrawing?.()?.tables?.map(table => ({ id: table.id, error: table.error })) ?? [],
  });
  worker.postMessage = function (request, ...args) {
    if (armed && request?.type === 'drawing') {
      armed = false;
      target = { worker: this, id: request.id, doc: structuredClone(window.__studioDoc) };
    }
    return post.call(this, request, ...args);
  };
  Object.defineProperty(worker, 'onmessage', {
    configurable: true,
    get: message.get,
    set(callback) {
      message.set.call(this, callback && function (event) {
        if (!pending && target?.worker === this && event.data?.id === target.id && event.data.drawing) {
          pending = { ok: event.data.drawing.ok, deliver: () => callback.call(this, event) };
          return;
        }
        callback.call(this, event);
      });
    },
  });
  window.__fitDrawingReply = {
    arm() {
      if (armed || target) throw Error('Already holding a Drawing reply');
      armed = true;
    },
    read() {
      return pending ? { id: target.id, doc: target.doc, ok: pending.ok } : null;
    },
    sample,
    async release() {
      if (!pending) throw Error('No Drawing reply arrived');
      const deliver = pending.deliver;
      pending = target = null;
      const samples = [sample()];
      deliver();
      samples.push(sample());
      for (let i = 0; i < 4; i++) {
        await new Promise(requestAnimationFrame);
        samples.push(sample());
      }
      return samples;
    },
  };
}
