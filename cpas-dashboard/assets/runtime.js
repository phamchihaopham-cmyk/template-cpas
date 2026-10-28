// Minimal runtime: datasets, calculations, filters and redraws for the dashboard page.
// It exposes the same small `dash` API the page script (app.js) is written against.
window.dash = (() => {
  const sources = {};          // id -> {status, data, message}
  const calcs = [];            // [{id, inputs, fn}] in definition order
  const calcCache = {};        // id -> {status, data, message}
  const draws = [];            // [{name, fn}]
  const listeners = [];        // onData callbacks
  const DEFAULTS = { month: null, aud: 'all' };
  let params = { ...DEFAULTS, ...readHash() };
  let dirty = true;

  function readHash() {
    const out = {};
    new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { out[k] = v; });
    return out;
  }
  function writeHash() {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== DEFAULTS[k]) q.set(k, v); });
    history.replaceState(null, '', q.toString() ? '#' + q.toString() : location.pathname + location.search);
  }

  function computeCalcs() {
    calcs.forEach(({ id, inputs, fn }) => {
      const ins = inputs.map((i) => sources[i] || calcCache[i] || { status: 'loading', data: [] });
      const bad = ins.find((x) => x.status === 'error');
      if (bad) { calcCache[id] = { status: 'error', data: [], message: bad.message }; return; }
      if (ins.some((x) => x.status !== 'ok')) { calcCache[id] = { status: 'loading', data: [] }; return; }
      try { calcCache[id] = { status: 'ok', data: fn(...ins.map((x) => x.data)) }; }
      catch (e) { console.error('calc', id, e); calcCache[id] = { status: 'error', data: [], message: e.message }; }
    });
    dirty = false;
  }

  function render() {
    if (dirty) computeCalcs();
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    draws.forEach(({ name, fn }) => {
      document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => {
        try { fn(el); } catch (e) { console.error('draw', name, e); }
      });
    });
  }

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
  let lastW = 0;
  new ResizeObserver(() => { const w = document.body.clientWidth; if (Math.abs(w - lastW) > 4) { lastW = w; schedule(); } }).observe(document.body);

  return {
    colors: ['#2f6fdb', '#e8833a', '#2a9d8f', '#c44e9a', '#8a6bd1', '#d4a72c', '#5c8a3a', '#7a8194'],
    calc(id, { inputs, fn }) { calcs.push({ id, inputs, fn }); },
    loader() {},
    data(id) { return sources[id] || calcCache[id] || { status: 'loading', data: [] }; },
    draw(name, fn) { draws.push({ name, fn }); },
    onData(fn) { listeners.push(fn); },
    params() { return params; },
    setParams(p) { params = { ...params, ...p }; writeHash(); schedule(); },
    resetParams() { params = { ...DEFAULTS }; writeHash(); schedule(); },
    setLink() {},
    refresh() {},
    // used by data.js
    _setSource(id, value) { sources[id] = value; dirty = true; schedule(); },
    _render: schedule,
  };
})();
