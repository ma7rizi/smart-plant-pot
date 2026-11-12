// Small dependency-free line charts with a shared crosshair.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  function niceTicks(min, max, count = 4) {
    const span = max - min || 1;
    const raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(6));
    return ticks;
  }

  const fmtNum = (v, dec) => v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : v.toFixed(dec);
  const hhmm = ts => ts.slice(11, 16);

  // cfg: { points:[{ts, v}], color, unit, dec, band:[lo,hi], onHover(i|null) }
  function lineChart(host, cfg) {
    const W = host.clientWidth || 400, H = 190;
    const m = { l: 44, r: 14, t: 12, b: 24 };
    const pts = cfg.points, n = pts.length;
    host.innerHTML = '';
    host.style.position = 'relative';
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' }, host);
    if (n < 2) {
      const tx = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'ch-empty' }, svg);
      tx.textContent = 'Waiting for readings…';
      return { setHover() { } };
    }

    let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
    if (cfg.band) { lo = Math.min(lo, cfg.band[0]); hi = Math.max(hi, cfg.band[1]); }
    const pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad;
    if (cfg.min != null) lo = Math.max(cfg.min, lo);
    if (cfg.max != null) hi = Math.min(cfg.max, hi);
    const x = i => m.l + (W - m.l - m.r) * i / (n - 1);
    const y = v => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));

    // ideal band
    if (cfg.band) {
      const y1 = y(Math.min(hi, cfg.band[1])), y2 = y(Math.max(lo, cfg.band[0]));
      el('rect', { x: m.l, y: y1, width: W - m.l - m.r, height: Math.max(0, y2 - y1), class: 'ch-band' }, svg);
      const lab = el('text', { x: m.l + 6, y: y1 + 13, class: 'ch-bandlabel' }, svg);
      lab.textContent = 'ideal range';
    }
    // grid + y labels
    for (const tv of niceTicks(lo, hi)) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: 'ch-grid' }, svg);
      const tx = el('text', { x: m.l - 8, y: y(tv) + 4, 'text-anchor': 'end', class: 'ch-tick' }, svg);
      tx.textContent = fmtNum(tv, tv % 1 ? 1 : 0);
    }
    // x labels (pot clock)
    for (const f of [0, 0.33, 0.66, 1]) {
      const i = Math.round(f * (n - 1));
      const tx = el('text', { x: x(i), y: H - 6, 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle', class: 'ch-tick' }, svg);
      tx.textContent = hhmm(pts[i].ts);
    }
    // area + line
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    const defs = el('defs', {}, svg);
    const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': cfg.color, 'stop-opacity': 0.26 }, grad);
    el('stop', { offset: 1, 'stop-color': cfg.color, 'stop-opacity': 0 }, grad);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    el('path', { d: `${d}L${x(n - 1)},${H - m.b}L${x(0)},${H - m.b}Z`, fill: `url(#${id})` }, svg);
    el('path', { d, fill: 'none', stroke: cfg.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    el('circle', { cx: x(n - 1), cy: y(pts[n - 1].v), r: 4.5, fill: cfg.color, class: 'ch-dot' }, svg);

    // hover layer
    const cross = el('line', { y1: m.t, y2: H - m.b, class: 'ch-cross', visibility: 'hidden' }, svg);
    const dot = el('circle', { r: 5, fill: cfg.color, class: 'ch-dot', visibility: 'hidden' }, svg);
    const tip = document.createElement('div');
    tip.className = 'ch-tip'; tip.hidden = true; host.appendChild(tip);
    const hit = el('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - m.l) / (W - m.l - m.r) * (n - 1))));
      cfg.onHover && cfg.onHover(i);
    });
    hit.addEventListener('pointerleave', () => cfg.onHover && cfg.onHover(null));

    return {
      setHover(i) {
        const show = i != null && i < n;
        cross.setAttribute('visibility', show ? 'visible' : 'hidden');
        dot.setAttribute('visibility', show ? 'visible' : 'hidden');
        tip.hidden = !show;
        if (!show) return;
        const px = x(i), py = y(pts[i].v);
        cross.setAttribute('x1', px); cross.setAttribute('x2', px);
        dot.setAttribute('cx', px); dot.setAttribute('cy', py);
        tip.innerHTML = `<b>${pts[i].v.toLocaleString(undefined, { maximumFractionDigits: cfg.dec })} ${cfg.unit}</b><span>${hhmm(pts[i].ts)}</span>`;
        tip.style.left = Math.min(W - 110, Math.max(m.l, px + 10)) + 'px';
        tip.style.top = Math.max(0, py - 44) + 'px';
      },
    };
  }

  function sparkline(values, color) {
    if (values.length < 2) return '';
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1) * 100).toFixed(1)},${(26 - (v - lo) / span * 22).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  window.Charts = { lineChart, sparkline };
})();
