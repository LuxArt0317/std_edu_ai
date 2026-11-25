/** Bounded worker pool. A failed case does not discard other in-flight work. */
export async function runParallelCases(items, { concurrency = 3, signal, run, onSettled = () => {} }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new RangeError('Concurrency must be 1–4');
  let cursor = 0, stopped = false;
  const errors = [];
  const control = { stop: () => { stopped = true; }, isStopped: () => stopped || Boolean(signal?.aborted) };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!control.isStopped()) {
      const index = cursor++;
      if (index >= items.length) break;
      try { await run(items[index], control); }
      catch (error) { errors.push({ index, error }); }
      finally { onSettled(items[index]); }
    }
  }));
  return { errors, stopped: control.isStopped() };
}

/** Serialize dispatch slots while allowing earlier requests to remain in flight. */
export function createPacedDispatch(intervalMs = 5200) {
  let tail = Promise.resolve(), lastDispatch = 0;
  return signal => {
    const slot = tail.then(async () => {
      if (signal?.aborted) return false;
      const delay = Math.max(0, lastDispatch + intervalMs - Date.now());
      if (delay) await new Promise(resolve => {
        const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, delay);
        signal?.addEventListener('abort', finish, { once: true });
      });
      if (signal?.aborted) return false;
      lastDispatch = Date.now();
      return true;
    });
    tail = slot.catch(() => {});
    return slot;
  };
}
