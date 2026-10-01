// Copy into your creation folder and import from a <script type="module">.
// One poller per display: combine fields and share each result with all widgets.
export function createAcePoller({ endpoint, onData, onError, intervalMs = 1000 }) {
  const interval = Number.isFinite(intervalMs) ? Math.max(1000, intervalMs) : 1000;
  let stopped = true;
  let pending = false;
  let nextAllowed = -Infinity;
  let timer;
  let failures = 0;
  let controller;

  async function refresh() {
    if (stopped || pending || performance.now() < nextAllowed) return false;
    clearTimeout(timer);
    pending = true;
    nextAllowed = performance.now() + interval;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let delay = interval;
    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) {
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After');
          const seconds = retry == null ? NaN : Number(retry);
          const retryMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now();
          if (Number.isFinite(retryMs)) delay = Math.max(delay, retryMs);
        }
        throw new Error(`ACE API returned HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!stopped) onData(data); // Validate fields and freshness in this callback.
      failures = 0;
    } catch (error) {
      failures += 1;
      delay = Math.max(delay, Math.min(60000, interval * 2 ** Math.min(failures, 6)));
      if (!stopped) onError(error);
    } finally {
      clearTimeout(timeout);
      pending = false;
      // Cooldown applies to manual refresh too, including Retry-After/backoff.
      nextAllowed = performance.now() + delay;
      if (!stopped) timer = setTimeout(refresh, delay);
    }
    return true;
  }
  return {
    start() {
      if (!stopped) return;
      stopped = false;
      const wait = Math.max(0, nextAllowed - performance.now());
      if (wait > 0) timer = setTimeout(refresh, wait); else refresh();
    },
    stop() { stopped = true; clearTimeout(timer); controller?.abort(); },
    refresh
  };
}
