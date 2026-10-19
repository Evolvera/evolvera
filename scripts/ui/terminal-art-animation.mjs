const defaultClock = {
  now: () => performance.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle),
};

/** Drive an intro followed by continuous ambient frames; callers own cancellation lifecycle. */
export function startArtAnimation({ onFrame, onError, durationMs = 1500, intervalMs = 1000 / 12, clock = defaultClock } = {}) {
  if (typeof onFrame !== "function") throw new TypeError("onFrame must be a function");
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError("durationMs must be positive and finite");
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError("intervalMs must be positive and finite");
  if (typeof clock?.now !== "function" || typeof clock?.setInterval !== "function" || typeof clock?.clearInterval !== "function") {
    throw new TypeError("clock must provide now, setInterval, and clearInterval");
  }

  let stopped = false;
  let handle;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (handle !== undefined) {
      clock.clearInterval(handle);
      handle = undefined;
    }
  };
  const report = (error) => {
    stop();
    if (typeof onError === "function") {
      try { onError(error); } catch { /* error reporting must not escape the timer callback */ }
    }
  };
  const started = clock.now();
  let lastProgress = 0;
  let lastElapsed = 0;
  const frame = () => {
    if (stopped) return;
    const elapsedMs = lastElapsed = Math.max(lastElapsed, clock.now() - started);
    const progress = lastProgress = Math.max(lastProgress, Math.min(1, Math.max(0, elapsedMs / durationMs)));
    try { onFrame(progress, elapsedMs); } catch (error) { report(error); }
  };

  try { onFrame(0, 0); } catch (error) { report(error); return stop; }
  if (!stopped) {
    try { handle = clock.setInterval(frame, intervalMs); }
    catch (error) { report(error); }
    if (stopped && handle !== undefined) {
      clock.clearInterval(handle);
      handle = undefined;
    }
  }
  return stop;
}
