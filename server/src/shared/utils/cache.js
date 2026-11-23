/**
 * Tiny per-process memo cache with TTL, stale-while-revalidate, a size cap and in-flight
 * de-duplication: concurrent callers for the same key share one computation, and once a value
 * exists users never wait for a recompute (they get the previous value while it refreshes).
 */
const stores = new Map();

export function memo(namespace, key, ttlMs, compute, maxEntries = 5000, staleMs = 0) {
  let store = stores.get(namespace);
  if (!store) stores.set(namespace, (store = new Map()));
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return hit.value;

  const start = () =>
    Promise.resolve()
      .then(compute)
      .then((v) => {
        store.set(key, { exp: Date.now() + ttlMs, staleUntil: Date.now() + ttlMs + staleMs, value: Promise.resolve(v), settled: true });
        return v;
      })
      .catch((err) => {
        const cur = store.get(key);
        if (cur && !cur.settled) store.delete(key);
        else if (cur) cur.refreshing = null;
        throw err;
      });

  // Serve the stale value and refresh once in the background.
  if (hit?.settled && hit.staleUntil > now) {
    if (!hit.refreshing) hit.refreshing = start().catch(() => {});
    return hit.value;
  }
  if (hit && !hit.settled) return hit.value; // already computing

  const value = start();
  if (store.size >= maxEntries) store.delete(store.keys().next().value);
  store.set(key, { exp: Infinity, value, settled: false });
  return value;
}

/** Limit how many expensive jobs run at once (protects the DB connection pool). */
export function semaphore(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

/** Status counts -> total for the statuses currently filtered (or all). */
export function totalFromCounts(counts, statusFilter) {
  const wanted = statusFilter ? statusFilter.split(',') : Object.keys(counts);
  return wanted.reduce((a, s) => a + (counts[s] ?? 0), 0);
}
