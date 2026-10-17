// The browser's NN2: a worker that downloads the pinned model only when asked, then reads descriptions.
// Descriptions and drafts stay in this tab; model-file requests carry neither.
const READ_TIMEOUT_MS = 60_000;

export function makeNN2(vocabulary) {
  let worker = null;
  let loaded = false;
  let next = 0;
  // Request id -> { resolve, reject, onProgress }.
  const pending = new Map();

  // Ends the worker and every request on it; the next download starts a fresh one.
  function stop(error) {
    worker?.terminate();
    worker = null;
    loaded = false;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  function call(message, onProgress) {
    if (!worker) {
      worker = new Worker(new URL("./nn2-worker.js", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        const request = pending.get(data.id);
        if (!request) return;
        if (data.progress) return request.onProgress?.(data.progress);
        pending.delete(data.id);
        if (data.error) request.reject(new Error(data.error));
        else request.resolve(data);
      };
      worker.onerror = (event) => stop(new Error(event.message || "the on-device model stopped"));
    }
    const id = ++next;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ id, vocabulary, ...message });
    });
  }

  return {
    // Whether this browser can run the model: WebGPU with an adapter.
    async supported() {
      try {
        return Boolean(await navigator.gpu?.requestAdapter());
      } catch {
        return false;
      }
    },
    ready: () => loaded,
    // Downloads (or reloads from the browser's cache) and starts the model. `onProgress({ progress })`, 0 to 1.
    async download(onProgress, mode) {
      const timer = setTimeout(() => stop(new Error("the on-device model could not finish loading")), 300_000);
      try {
        await call({ action: "load", mode }, onProgress);
        loaded = true;
      } finally {
        clearTimeout(timer);
      }
    },
    cancel: () => stop(new Error("cancelled")),
    // The validated NN2 draft for `description`; rejects on a failed, invalid or slow reading.
    async read(description) {
      if (!loaded) throw new Error("the on-device model is not loaded");
      // A stuck model is stopped, so later answers go to the fallback until it is downloaded again.
      const timer = setTimeout(() => stop(new Error("the on-device model took too long")), READ_TIMEOUT_MS);
      try {
        return (await call({ action: "interpret", description })).draft;
      } finally {
        clearTimeout(timer);
      }
    },
    // The five-input candidate used by the product's free-text flow. Keep its
    // rent budget and place candidates alongside the validated restaurant draft.
    async readProfile(description, catalogue) {
      if (!loaded) throw new Error("the on-device model is not loaded");
      const timer = setTimeout(() => stop(new Error("the on-device model took too long")), READ_TIMEOUT_MS);
      try {
        return await call({ action: "interpret", description, catalogue, mode: "focused", clarifyInvalidPrice: true });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
