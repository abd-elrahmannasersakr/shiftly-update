// Thin wrapper around window.api (exposed by preload.js)
// Each call returns the unwrapped data or throws on error.
(function () {
  function wrap(fn, label) {
    return async (payload) => {
      const res = await fn(payload);
      if (!res || res.ok !== true) {
        const msg = (res && res.error) || `فشل العملية (${label})`;
        throw new Error(msg);
      }
      return res.data;
    };
  }

  const raw = window.api || {};
  const out = {};
  Object.keys(raw).forEach((k) => { out[k] = wrap(raw[k], k); });
  window.API = out;
})();
