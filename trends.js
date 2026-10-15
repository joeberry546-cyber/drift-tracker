/* Trends tab: charts that show how much the feeling moves.
   Hand-drawn SVG/HTML, no libraries. Depends on app.js (SCALE, COLORS, TEXT_COLORS,
   getEntries, openCalendarDay). */
(function () {
  'use strict';

  const DAY_MS = 86400000;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const RANGE_KEY = 'drift-range';

  // Chart colours. Value colours come from the app's own 7-step scale.
  const UP = COLORS[5]; // toward feminine
  const DOWN = COLORS[1]; // toward masculine
  const DOT = '#66795A'; // daily averages
  const LINE = '#2C3527'; // smoothed trend
  const MOVE = '#5C6B4E'; // volatility line

  let range = '30';
  try {
    const saved = localStorage.getItem(RANGE_KEY);
    if (['14', '30', '90', 'all'].includes(saved)) range = saved;
  } catch (e) {}

  // ---------- small helpers ----------
  const $ = (id) => document.getElementById(id);
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
  const keyOf = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const fmtShort = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtLong = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const one = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const signed = (n) => (n > 0.04 ? '+' : n < -0.04 ? '−' : '') + one(Math.abs(n));
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const levelLabel = (avg) => scaleFor(Math.min(7, Math.max(1, Math.round(avg)))).label;

  function el(name, attrs, parent, text) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function html(tag, cls, text, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function makeSvg(container, height, label) {
    const w = Math.max(280, Math.floor(container.clientWidth || 440));
    container.textContent = '';
    const svg = el(
      'svg',
      { width: w, height, viewBox: `0 0 ${w} ${height}`, role: 'img', 'aria-label': label, class: 'chart-svg tip-host' },
      container
    );
    return { svg, w, h: height };
  }

  function emptyNote(container, text) {
    container.textContent = '';
    html('p', 'chart-empty', text, container);
  }

  // ---------- tooltip ----------
  const tipEl = $('chart-tip');
  let tipCleanup = null;

  function showTip(content, cx, cy, cleanup) {
    if (tipCleanup && tipCleanup !== cleanup) tipCleanup();
    tipCleanup = cleanup || null;

    tipEl.textContent = '';
    html('div', 'tip-title', content.title, tipEl);
    (content.rows || []).forEach((r) => {
      const row = html('div', 'tip-row', null, tipEl);
      if (r.key) {
        const k = html('span', 'tip-key key-' + r.key, null, row);
        k.style.background = r.color;
      }
      html('strong', 'tip-value', r.value, row);
      if (r.label) html('span', 'tip-label', r.label, row);
    });
    if (content.note) html('div', 'tip-note', content.note, tipEl);

    tipEl.hidden = false;
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    let left = cx + 14;
    if (left + tw > window.innerWidth - 8) left = cx - tw - 14;
    left = Math.max(8, left);
    let top = cy - th - 14;
    if (top < 8) top = cy + 18;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }

  function hideTip() {
    tipEl.hidden = true;
    if (tipCleanup) {
      const c = tipCleanup;
      tipCleanup = null;
      c();
    }
  }

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.tip-host')) hideTip();
  });

  // Tooltip for a single mark (heatmap cell, strip square, grid cell).
  function bindCellTip(node, contentFn) {
    node.classList.add('tip-host');
    const go = (e) => showTip(contentFn(), e.clientX, e.clientY);
    node.addEventListener('pointerenter', go);
    node.addEventListener('pointermove', go);
    node.addEventListener('pointerdown', go);
    node.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hideTip();
    });
    node.addEventListener('focus', () => {
      const r = node.getBoundingClientRect();
      showTip(contentFn(), r.left + r.width / 2, r.top);
    });
    node.addEventListener('blur', hideTip);
  }

  // Crosshair that snaps to the nearest point (line / bar-over-time charts).
  function interactive(svg, plot, pts, makeTip) {
    if (!pts.length) return;
    const line = el('line', { x1: 0, x2: 0, y1: plot.t, y2: plot.t + plot.h, class: 'xhair' }, svg);
    line.style.display = 'none';
    const overlay = el('rect', { x: plot.l, y: plot.t, width: plot.w, height: plot.h, fill: 'transparent' }, svg);
    let current = -1;

    const cleanup = () => {
      line.style.display = 'none';
      current = -1;
    };

    const select = (i, cx, cy) => {
      current = i;
      line.setAttribute('x1', pts[i].x);
      line.setAttribute('x2', pts[i].x);
      line.style.display = '';
      const r = svg.getBoundingClientRect();
      showTip(makeTip(pts[i]), cx == null ? r.left + pts[i].x : cx, cy == null ? r.top + plot.t + 10 : cy, cleanup);
    };

    const nearest = (clientX) => {
      const x = clientX - svg.getBoundingClientRect().left;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const dist = Math.abs(pts[i].x - x);
        if (dist < bestDist) {
          best = i;
          bestDist = dist;
        }
      }
      return best;
    };

    const onPointer = (e) => select(nearest(e.clientX), e.clientX, e.clientY);
    overlay.addEventListener('pointermove', onPointer);
    overlay.addEventListener('pointerdown', onPointer);
    overlay.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hideTip();
    });

    svg.setAttribute('tabindex', '0');
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = current < 0 ? pts.length - 1 : Math.min(pts.length - 1, Math.max(0, current + (e.key === 'ArrowRight' ? 1 : -1)));
        select(next);
      } else if (e.key === 'Escape') {
        hideTip();
      }
    });
    svg.addEventListener('blur', hideTip);
  }

  // ---------- data ----------
  function buildDays() {
    const map = new Map();
    getEntries().forEach((e) => {
      const dt = new Date(e.timestamp);
      if (isNaN(dt)) return;
      const k = keyOf(dt);
      let day = map.get(k);
      if (!day) {
        day = { key: k, date: startOfDay(dt), values: [] };
        map.set(k, day);
      }
      day.values.push(e.value);
    });
    const days = [...map.values()].sort((a, b) => a.date - b.date);
    days.forEach((d) => {
      d.avg = mean(d.values);
      d.min = Math.min(...d.values);
      d.max = Math.max(...d.values);
      d.n = d.values.length;
      d.level = Math.min(7, Math.max(1, Math.round(d.avg)));
    });
    return days;
  }

  // Change between a logged day and the previous logged day (only when they're 3 or fewer days apart).
  function buildChanges(days) {
    const out = [];
    for (let i = 1; i < days.length; i++) {
      const gap = daysBetween(days[i - 1].date, days[i].date);
      if (gap <= 3) {
        out.push({
          date: days[i].date,
          prev: days[i - 1].date,
          gap,
          from: days[i - 1].avg,
          to: days[i].avg,
          delta: days[i].avg - days[i - 1].avg,
        });
      }
    }
    return out;
  }

  function buildDomain(days) {
    const end = startOfDay(new Date());
    let start = range === 'all' ? (days.length ? days[0].date : end) : addDays(end, -(Number(range) - 1));
    if (daysBetween(start, end) < 6) start = addDays(end, -6);
    const list = [];
    for (let d = start; d <= end; d = addDays(d, 1)) list.push(d);
    return { start, end, list, n: list.length };
  }

  // ---------- shared axis drawing ----------
  function makePlot(w, h, left) {
    const plot = { l: left, r: w - 12, t: 10, b: h - 24 };
    plot.w = plot.r - plot.l;
    plot.h = plot.b - plot.t;
    return plot;
  }

  function xScale(plot, domain) {
    return (i) => plot.l + ((i + 0.5) * plot.w) / domain.n;
  }

  function drawXAxis(svg, plot, domain, x, w) {
    const maxLabels = Math.max(2, Math.floor(plot.w / 70));
    const step = Math.max(1, Math.ceil(domain.n / maxLabels));
    for (let i = domain.n - 1; i >= 0; i -= step) {
      let px = x(i);
      let anchor = 'middle';
      if (px - 22 < 0) anchor = 'start';
      if (px + 22 > w) {
        anchor = 'end';
        px = w - 2;
      }
      el('text', { x: px, y: plot.b + 16, 'text-anchor': anchor, class: 'ax-text' }, svg, fmtShort(domain.list[i]));
    }
  }

  function legendInto(container, items) {
    container.textContent = '';
    items.forEach((it) => {
      const item = html('span', 'legend-item', null, container);
      const k = html('span', 'legend-key key-' + it.key, null, item);
      k.style.background = it.color;
      html('span', null, it.text, item);
    });
  }

  // 4px-rounded data end, square at the baseline.
  function barPath(x, w, yBase, yTip, r) {
    const h = Math.abs(yTip - yBase);
    const rr = Math.min(r, h, w / 2);
    if (yTip < yBase) {
      return `M${x} ${yBase}V${yTip + rr}Q${x} ${yTip} ${x + rr} ${yTip}H${x + w - rr}Q${x + w} ${yTip} ${x + w} ${yTip + rr}V${yBase}Z`;
    }
    return `M${x} ${yBase}V${yTip - rr}Q${x} ${yTip} ${x + rr} ${yTip}H${x + w - rr}Q${x + w} ${yTip} ${x + w} ${yTip - rr}V${yBase}Z`;
  }

  // ---------- 1. Day-to-day change ----------
  function renderChange(domain, changes) {
    const box = $('chart-change');
    const legend = $('legend-change');
    const inRange = changes.filter((c) => c.date >= domain.start && c.date <= domain.end);

    if (!inRange.length) {
      legend.hidden = true;
      emptyNote(box, 'Needs logs on back-to-back days to show change. Nothing to compare in this range yet.');
      return;
    }
    legend.hidden = false;
    legendInto(legend, [
      { key: 'box', color: UP, text: 'Toward feminine' },
      { key: 'box', color: DOWN, text: 'Toward masculine' },
    ]);

    const maxAbs = Math.max(...inRange.map((c) => Math.abs(c.delta)));
    const lim = Math.max(2, Math.ceil(maxAbs));
    const { svg, w, h } = makeSvg(box, 190, `Bar chart of day-to-day change, from ${fmtShort(domain.start)} to ${fmtShort(domain.end)}. Details are in the table below.`);
    const plot = makePlot(w, h, 34);
    const y = (v) => plot.t + plot.h * (1 - (v + lim) / (2 * lim));
    const x = xScale(plot, domain);
    const slot = plot.w / domain.n;

    const tickStep = lim > 3 ? 2 : 1;
    for (let v = -Math.floor(lim / tickStep) * tickStep; v <= lim; v += tickStep) {
      el('line', { x1: plot.l, x2: plot.r, y1: y(v), y2: y(v), class: v === 0 ? 'zero-line' : 'grid-line' }, svg);
      el('text', { x: plot.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ax-text' }, svg, v === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v));
    }
    drawXAxis(svg, plot, domain, x, w);

    const bw = Math.min(24, Math.max(2, slot - 2));
    const biggest = inRange.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
    const pts = [];
    inRange.forEach((c) => {
      const cx = x(daysBetween(domain.start, c.date));
      pts.push({ x: cx, c });
      if (Math.abs(c.delta) < 0.05) {
        el('circle', { cx, cy: y(0), r: 3, class: 'zero-dot' }, svg);
        return;
      }
      el('path', { d: barPath(cx - bw / 2, bw, y(0), y(c.delta), 4), fill: c.delta > 0 ? UP : DOWN }, svg);
    });

    // One direct label: the biggest swing.
    if (Math.abs(biggest.delta) >= 0.05) {
      const bx = x(daysBetween(domain.start, biggest.date));
      const up = biggest.delta > 0;
      el('text', { x: bx, y: y(biggest.delta) + (up ? -6 : 14), 'text-anchor': bx > w - 30 ? 'end' : bx < plot.l + 16 ? 'start' : 'middle', class: 'val-text' }, svg, signed(biggest.delta));
    }

    interactive(svg, plot, pts, ({ c }) => ({
      title: fmtLong(c.date),
      rows: [
        {
          key: 'box',
          color: c.delta > 0 ? UP : DOWN,
          value: Math.abs(c.delta) < 0.05 ? 'No change' : `${signed(c.delta)} steps`,
          label: Math.abs(c.delta) < 0.05 ? '' : c.delta > 0 ? 'toward feminine' : 'toward masculine',
        },
      ],
      note: `${one(c.from)} → ${one(c.to)} vs ${fmtShort(c.prev)}${c.gap > 1 ? ` (${c.gap} days earlier)` : ''}`,
    }));
  }

  // ---------- 2. Trend + daily range ----------
  function renderTrend(domain, days, rolling) {
    const box = $('chart-trend');
    const inRange = days.filter((d) => d.date >= domain.start && d.date <= domain.end);
    const legend = $('legend-trend');

    if (!inRange.length) {
      legend.hidden = true;
      emptyNote(box, 'No entries in this range.');
      return;
    }
    legend.hidden = false;
    legendInto(legend, [
      { key: 'dot', color: DOT, text: 'Daily average' },
      { key: 'line', color: LINE, text: '7-day average' },
      { key: 'bar', color: DOT, text: 'Highest to lowest in a day' },
    ]);
    legend.querySelector('.key-bar').style.opacity = '0.3';

    const { svg, w, h } = makeSvg(box, 230, `Line chart of daily average feeling from ${fmtShort(domain.start)} to ${fmtShort(domain.end)}, with each day's range. Details are in the table below.`);
    const plot = makePlot(w, h, 32);
    const yMin = 0.6;
    const yMax = 7.4;
    const y = (v) => plot.t + (plot.h * (yMax - v)) / (yMax - yMin);
    const x = xScale(plot, domain);
    const slot = plot.w / domain.n;

    for (let v = 1; v <= 7; v++) {
      el('line', { x1: plot.l, x2: plot.r, y1: y(v), y2: y(v), class: 'grid-line' }, svg);
      el('text', { x: plot.l - 6, y: y(v) + 5, 'text-anchor': 'end', class: 'ax-emoji' }, svg, scaleFor(v).icon);
    }
    drawXAxis(svg, plot, domain, x, w);

    // Range bars
    const rw = Math.min(10, Math.max(2, slot * 0.5));
    inRange.forEach((d) => {
      if (d.max === d.min) return;
      const cx = x(daysBetween(domain.start, d.date));
      el('rect', { x: cx - rw / 2, y: y(d.max), width: rw, height: y(d.min) - y(d.max), rx: Math.min(4, rw / 2), fill: DOT, opacity: 0.28 }, svg);
    });

    // 7-day average (breaks where there's too little data)
    let path = '';
    let pen = false;
    rolling.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    if (path) el('path', { d: path, class: 'smooth-line', fill: 'none' }, svg);

    // Daily averages
    const dense = domain.n > 45;
    inRange.forEach((d) => {
      const cx = x(daysBetween(domain.start, d.date));
      el('circle', { cx, cy: y(d.avg), r: dense ? 2.2 : 4, fill: DOT, class: dense ? '' : 'ringed' }, svg);
    });

    const pts = inRange.map((d) => ({ x: x(daysBetween(domain.start, d.date)), d, r: rolling[daysBetween(domain.start, d.date)] }));
    interactive(svg, plot, pts, ({ d, r }) => {
      const rows = [{ key: 'dot', color: DOT, value: one(d.avg), label: levelLabel(d.avg) }];
      if (d.n > 1) rows.push({ key: 'bar', color: DOT, value: `${scaleFor(d.min).label} to ${scaleFor(d.max).label}`, label: '' });
      if (r != null) rows.push({ key: 'line', color: LINE, value: one(r), label: '7-day average' });
      return { title: fmtLong(d.date), rows, note: `${d.n} ${d.n === 1 ? 'log' : 'logs'}` };
    });
  }

  // ---------- 3. Movement (rolling volatility) ----------
  function renderMovement(domain, movement) {
    const box = $('chart-volatility');
    const pts0 = [];
    movement.forEach((v, i) => {
      if (v != null) pts0.push({ i, v });
    });
    if (!pts0.length) {
      emptyNote(box, 'This needs a few back-to-back days of logs. It will show up as you keep logging.');
      return;
    }

    const maxV = Math.max(...pts0.map((p) => p.v));
    const yMax = Math.max(1, Math.ceil(maxV));
    const { svg, w, h } = makeSvg(box, 160, `Line chart of average daily movement over the previous 7 days, from ${fmtShort(domain.start)} to ${fmtShort(domain.end)}. Details are in the table below.`);
    const plot = makePlot(w, h, 34);
    const y = (v) => plot.t + plot.h * (1 - v / yMax);
    const x = xScale(plot, domain);

    const tickStep = yMax > 4 ? 2 : 1;
    for (let v = 0; v <= yMax; v += tickStep) {
      el('line', { x1: plot.l, x2: plot.r, y1: y(v), y2: y(v), class: v === 0 ? 'zero-line' : 'grid-line' }, svg);
      el('text', { x: plot.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ax-text' }, svg, String(v));
    }
    drawXAxis(svg, plot, domain, x, w);

    // line + 10% area wash, per unbroken run
    let run = [];
    const runs = [];
    movement.forEach((v, i) => {
      if (v == null) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push({ i, v });
    });
    if (run.length) runs.push(run);
    runs.forEach((r) => {
      if (r.length < 2) return;
      const line = r.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
      el('path', { d: `${line}L${x(r[r.length - 1].i).toFixed(1)} ${y(0)}L${x(r[0].i).toFixed(1)} ${y(0)}Z`, fill: MOVE, opacity: 0.1 }, svg);
      el('path', { d: line, class: 'move-line', fill: 'none' }, svg);
    });

    // end dot + label
    const last = pts0[pts0.length - 1];
    el('circle', { cx: x(last.i), cy: y(last.v), r: 4, fill: MOVE, class: 'ringed' }, svg);
    el('text', { x: Math.min(x(last.i), w - 4), y: y(last.v) - 10, 'text-anchor': x(last.i) > w - 30 ? 'end' : 'middle', class: 'val-text' }, svg, one(last.v));

    interactive(
      svg,
      plot,
      pts0.map((p) => ({ x: x(p.i), date: domain.list[p.i], v: p.v })),
      ({ date, v }) => ({
        title: `7 days to ${fmtLong(date)}`,
        rows: [{ key: 'line', color: MOVE, value: `${one(v)} steps`, label: 'average daily change' }],
      })
    );
  }

  // ---------- Stat tiles ----------
  function renderStats(domain, days, changes) {
    const grid = $('stat-grid');
    grid.textContent = '';
    const dIn = days.filter((d) => d.date >= domain.start && d.date <= domain.end);
    const cIn = changes.filter((c) => c.date >= domain.start && c.date <= domain.end);

    function tile(label, value, sub) {
      const t = html('div', 'stat-tile', null, grid);
      html('p', 'stat-label', label, t);
      html('p', 'stat-value', value, t);
      html('p', 'stat-sub', sub, t);
    }

    // Typical daily shift
    if (cIn.length) tile('Typical daily shift', one(mean(cIn.map((c) => Math.abs(c.delta)))), `steps between logged days · ${cIn.length} compared`);
    else tile('Typical daily shift', '—', 'needs back-to-back days');

    // Biggest swing
    if (cIn.length) {
      const b = cIn.reduce((a, c) => (Math.abs(c.delta) > Math.abs(a.delta) ? c : a));
      tile('Biggest swing', Math.abs(b.delta) < 0.05 ? '0.0' : signed(b.delta), `${fmtShort(b.date)}${Math.abs(b.delta) < 0.05 ? '' : b.delta > 0 ? ' · toward feminine' : ' · toward masculine'}`);
    } else tile('Biggest swing', '—', 'needs back-to-back days');

    // Longest steady stretch (consecutive days at the same level)
    let best = null;
    let run = null;
    dIn.forEach((d) => {
      if (run && daysBetween(run.last, d.date) === 1 && run.level === d.level) {
        run.len++;
        run.last = d.date;
      } else run = { level: d.level, len: 1, last: d.date };
      if (!best || run.len >= best.len) best = { ...run };
    });
    if (best) tile('Longest steady stretch', `${best.len} ${best.len === 1 ? 'day' : 'days'}`, `${scaleFor(best.level).icon} ${scaleFor(best.level).label}`);
    else tile('Longest steady stretch', '—', '');

    // Within-day range
    const multi = dIn.filter((d) => d.n > 1);
    if (multi.length) tile('Typical range within a day', one(mean(multi.map((d) => d.max - d.min))), `steps, on days with 2+ logs · ${multi.length} ${multi.length === 1 ? 'day' : 'days'}`);
    else tile('Typical range within a day', '—', 'shows up when you log twice in a day');
  }

  // ---------- Table of the numbers ----------
  function renderDailyTable(domain, days, changeByKey, rolling, movement) {
    const body = $('daily-table-body');
    body.textContent = '';
    const rows = days.filter((d) => d.date >= domain.start && d.date <= domain.end).reverse();
    const table = html('table', 'num-table', null, body);
    const head = html('tr', null, null, html('thead', null, null, table));
    ['Date', 'Average', 'Low–high', 'Logs', 'Change', '7-day avg', 'Movement'].forEach((t) => html('th', null, t, head));
    const tb = html('tbody', null, null, table);
    rows.forEach((d) => {
      const i = daysBetween(domain.start, d.date);
      const c = changeByKey.get(keyOf(d.date));
      const tr = html('tr', null, null, tb);
      html('td', null, fmtShort(d.date), tr);
      html('td', null, one(d.avg), tr);
      html('td', null, d.max === d.min ? String(d.min) : `${d.min}–${d.max}`, tr);
      html('td', null, String(d.n), tr);
      html('td', null, c ? signed(c.delta) : '—', tr);
      html('td', null, rolling[i] == null ? '—' : one(rolling[i]), tr);
      html('td', null, movement[i] == null ? '—' : one(movement[i]), tr);
    });
  }

  // ---------- 4. Weekday x time of day heatmap ----------
  const BANDS = [
    { name: 'Morning', hours: '5a–12p', test: (h) => h >= 5 && h < 12 },
    { name: 'Afternoon', hours: '12–5p', test: (h) => h >= 12 && h < 17 },
    { name: 'Evening', hours: '5–10p', test: (h) => h >= 17 && h < 22 },
    { name: 'Night', hours: '10p–5a', test: (h) => h >= 22 || h < 5 },
  ];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function renderHeatmap() {
    const box = $('chart-heatmap');
    box.textContent = '';
    const cells = WEEKDAYS.map(() => BANDS.map(() => []));
    getEntries().forEach((e) => {
      const d = new Date(e.timestamp);
      if (isNaN(d)) return;
      const band = BANDS.findIndex((b) => b.test(d.getHours()));
      cells[d.getDay()][band].push(e.value);
    });

    const grid = html('div', 'hm-grid', null, box);
    html('div', 'hm-corner', null, grid);
    BANDS.forEach((b) => {
      const head = html('div', 'hm-head', null, grid);
      html('span', null, b.name, head);
      html('small', null, b.hours, head);
    });
    WEEKDAYS.forEach((name, di) => {
      html('div', 'hm-rowlabel', name.slice(0, 3), grid);
      BANDS.forEach((b, bi) => {
        const vals = cells[di][bi];
        const cell = html('div', 'hm-cell', null, grid);
        if (!vals.length) {
          cell.classList.add('hm-none');
          cell.textContent = '·';
          cell.setAttribute('aria-label', `${name} ${b.name.toLowerCase()}: no logs`);
          return;
        }
        const avg = mean(vals);
        const lvl = Math.min(7, Math.max(1, Math.round(avg)));
        cell.style.background = colorFor(lvl);
        cell.style.color = textColorFor(lvl);
        cell.textContent = one(avg);
        if (vals.length < 3) cell.classList.add('hm-faded');
        cell.tabIndex = 0;
        cell.setAttribute('aria-label', `${name} ${b.name.toLowerCase()}: average ${one(avg)}, ${levelLabel(avg)}, ${vals.length} logs`);
        bindCellTip(cell, () => ({
          title: `${name} ${b.name.toLowerCase()}s`,
          rows: [{ key: 'box', color: colorFor(lvl), value: one(avg), label: levelLabel(avg) }],
          note: `${vals.length} ${vals.length === 1 ? 'log' : 'logs'}${vals.length < 3 ? ' (still early)' : ''}`,
        }));
      });
    });
  }

  // ---------- 5. The past year ----------
  function renderStrip(days) {
    const box = $('chart-strip');
    const byKey = new Map(days.map((d) => [d.key, d]));
    const today = startOfDay(new Date());
    const labelW = 40;
    const topH = 16;
    const cellH = 15;
    const rows = 12;
    const w = Math.max(280, Math.floor(box.clientWidth || 440));
    const cellW = (w - labelW - 2) / 31;
    const h = topH + rows * cellH;

    box.textContent = '';
    const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'One square for each day of the past year, colored by that day\'s average. Details are in the Calendar tab.', class: 'chart-svg' }, box);

    [1, 5, 10, 15, 20, 25, 30].forEach((dn) => {
      el('text', { x: labelW + (dn - 1) * cellW + (cellW - 2) / 2, y: 10, 'text-anchor': 'middle', class: 'ax-text small' }, svg, String(dn));
    });

    for (let r = 0; r < rows; r++) {
      const first = new Date(today.getFullYear(), today.getMonth() - (rows - 1) + r, 1);
      const y = topH + r * cellH;
      const label = first.toLocaleDateString(undefined, { month: 'short' }) + (first.getMonth() === 0 || r === 0 ? ` ’${String(first.getFullYear()).slice(2)}` : '');
      el('text', { x: 0, y: y + 11, class: 'ax-text small' }, svg, label);
      const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      for (let dn = 1; dn <= dim; dn++) {
        const date = new Date(first.getFullYear(), first.getMonth(), dn);
        if (date > today) break;
        const day = byKey.get(keyOf(date));
        const rect = el(
          'rect',
          {
            x: labelW + (dn - 1) * cellW,
            y,
            width: cellW - 2,
            height: cellH - 2,
            rx: 3,
            class: day ? 'strip-cell logged' : 'strip-cell',
            fill: day ? colorFor(day.level) : 'var(--panel)',
          },
          svg
        );
        rect.style.cursor = 'pointer';
        bindCellTip(rect, () =>
          day
            ? {
                title: fmtLong(date),
                rows: [{ key: 'box', color: colorFor(day.level), value: one(day.avg), label: levelLabel(day.avg) }],
                note: `${day.n} ${day.n === 1 ? 'log' : 'logs'}`,
              }
            : { title: fmtLong(date), rows: [], note: 'No log. Tap to add one.' }
        );
        rect.addEventListener('click', () => {
          hideTip();
          openCalendarDay(date.getFullYear(), date.getMonth(), date.getDate());
        });
      }
    }

    const leg = $('strip-legend');
    leg.textContent = '';
    html('span', null, 'masculine', leg);
    SCALE.forEach((s, i) => {
      const sw = html('span', 'strip-swatch', null, leg);
      sw.style.background = COLORS[i];
    });
    html('span', null, 'feminine', leg);
    const none = html('span', 'strip-swatch none', null, leg);
    none.style.background = 'var(--panel)';
    html('span', null, 'no log', leg);
  }

  // ---------- 6. Stickiness grid ----------
  function renderSticky(days) {
    const box = $('chart-sticky');
    const sub = $('sticky-sub');
    box.textContent = '';

    const counts = Array.from({ length: 7 }, () => Array(7).fill(0));
    let pairs = 0;
    let same = 0;
    let near = 0;
    for (let i = 1; i < days.length; i++) {
      if (daysBetween(days[i - 1].date, days[i].date) !== 1) continue;
      const a = days[i - 1].level;
      const b = days[i].level;
      counts[a - 1][b - 1]++;
      pairs++;
      if (a === b) same++;
      if (Math.abs(a - b) <= 1) near++;
    }

    const base = 'Given how you felt one day, how you felt the next.';
    if (pairs < 5) sub.textContent = `${base} Only ${pairs} back-to-back ${pairs === 1 ? 'pair' : 'pairs'} of days so far, so this fills in as you keep logging.`;
    else sub.textContent = `${base} Out of ${pairs} back-to-back pairs, the next day matched ${Math.round((same / pairs) * 100)}% of the time and landed within one step ${Math.round((near / pairs) * 100)}% of the time. The outlined diagonal is "stayed the same".`;

    const grid = html('div', 'st-grid', null, box);
    html('div', 'st-cap', 'Before', grid);
    html('div', 'st-cap st-cap-wide', 'Next day →', grid);
    html('div', 'st-cap st-n', 'Days', grid);
    html('div', 'st-corner', null, grid);
    SCALE.forEach((s) => html('div', 'st-head', s.icon, grid));
    html('div', 'st-corner', null, grid);

    for (let a = 0; a < 7; a++) {
      const total = counts[a].reduce((s, x) => s + x, 0);
      html('div', 'st-rowlabel', SCALE[a].icon, grid);
      for (let b = 0; b < 7; b++) {
        const cell = html('div', 'st-cell', null, grid);
        if (a === b) cell.classList.add('st-diag');
        if (!total) {
          cell.classList.add('st-none');
          continue;
        }
        const pct = counts[a][b] / total;
        const alpha = counts[a][b] ? 0.1 + 0.8 * pct : 0;
        cell.style.background = counts[a][b] ? `rgba(92, 107, 78, ${alpha.toFixed(2)})` : 'var(--panel)';
        cell.style.color = alpha > 0.65 ? '#fff' : 'var(--ink)';
        if (counts[a][b]) cell.textContent = Math.round(pct * 100) + '%';
        if (total < 3) cell.classList.add('st-faded');
        cell.tabIndex = 0;
        cell.setAttribute('aria-label', `After a ${SCALE[a].label} day, ${SCALE[b].label} the next day: ${counts[a][b]} of ${total}`);
        bindCellTip(cell, () => ({
          title: `After a ${SCALE[a].label.toLowerCase()} day`,
          rows: [{ key: 'box', color: colorFor(b + 1), value: `${Math.round(pct * 100)}%`, label: `${SCALE[b].label.toLowerCase()} next day` }],
          note: `${counts[a][b]} of ${total} ${total === 1 ? 'time' : 'times'}${total < 3 ? ' (still early)' : ''}`,
        }));
      }
      html('div', 'st-count', total ? String(total) : '', grid);
    }
  }

  // ---------- Controller ----------
  function renderTrends() {
    const days = buildDays();
    const notEnough = days.length < 2;
    $('trends-empty').hidden = !notEnough;
    $('trends-body').hidden = notEnough;
    hideTip();
    if (notEnough) return;

    document.querySelectorAll('.range-btn').forEach((b) => {
      const on = b.dataset.range === range;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    const domain = buildDomain(days);
    const changes = buildChanges(days);
    const dayByKey = new Map(days.map((d) => [d.key, d]));
    const changeByKey = new Map(changes.map((c) => [keyOf(c.date), c]));

    // 7-day rolling values for every day in the range
    const rolling = domain.list.map((date) => {
      const vals = [];
      for (let k = 0; k < 7; k++) {
        const d = dayByKey.get(keyOf(addDays(date, -k)));
        if (d) vals.push(d.avg);
      }
      return vals.length >= 2 ? mean(vals) : null;
    });
    const movement = domain.list.map((date) => {
      const vals = [];
      for (let k = 0; k < 7; k++) {
        const c = changeByKey.get(keyOf(addDays(date, -k)));
        if (c) vals.push(Math.abs(c.delta));
      }
      return vals.length >= 2 ? mean(vals) : null;
    });

    renderStats(domain, days, changes);
    renderChange(domain, changes);
    renderTrend(domain, days, rolling);
    renderMovement(domain, movement);
    renderDailyTable(domain, days, changeByKey, rolling, movement);
    renderHeatmap();
    renderStrip(days);
    renderSticky(days);
  }

  document.querySelectorAll('.range-btn').forEach((b) => {
    b.addEventListener('click', () => {
      range = b.dataset.range;
      try {
        localStorage.setItem(RANGE_KEY, range);
      } catch (e) {}
      renderTrends();
    });
  });

  let lastWidth = 0;
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const view = $('view-trends');
      if (!view.classList.contains('active')) return;
      const w = $('trends-body').clientWidth;
      if (w !== lastWidth) {
        lastWidth = w;
        renderTrends();
      }
    }, 150);
  });

  window.renderTrends = renderTrends;
})();
