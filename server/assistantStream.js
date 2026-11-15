/** Send observed assistant work as SSE, while retaining JSON for older clients. */
export function createAssistantStream(requested, response) {
  const enabled = requested === true && typeof response.write === 'function' && typeof response.end === 'function';
  if (enabled) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.status(200);
    response.flushHeaders?.();
  }
  let finished = false;
  function event(name, payload) {
    if (!enabled || finished) return;
    response.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
  return {
    enabled,
    progress(kind, label, detail, status = 'running') {
      event('progress', {kind, label, detail, status});
    },
    observation(kind, receipt) {
      if(typeof kind==='string'&&/^evaluation-[a-z-]{1,48}$/u.test(kind)&&typeof receipt==='string'&&receipt.length<=8192)
        event(kind,{receipt});
    },
    send(status, payload) {
      if (finished) return;
      if (!enabled) { response.status(status).json(payload); finished = true; return; }
      event(status >= 400 ? 'error' : 'result', payload);
      finished = true;
      response.end();
    },
  };
}
