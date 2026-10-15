const SCALE = [
  { value: 1, icon: '☀️', label: 'Masculine' },
  { value: 2, icon: '🌲', label: 'Mostly masculine' },
  { value: 3, icon: '⛰️', label: 'Slightly masculine' },
  { value: 4, icon: '⭐', label: 'Neutral' },
  { value: 5, icon: '🎀', label: 'Slightly feminine' },
  { value: 6, icon: '🌸', label: 'Mostly feminine' },
  { value: 7, icon: '🌙', label: 'Feminine' },
];

const COLORS = ['#1E4C7A', '#5580A8', '#A9C2D9', '#F1E9D6', '#E8B4CB', '#C1608F', '#7A2C54'];
const TEXT_COLORS = ['#FFFFFF', '#FFFFFF', '#2C3527', '#2C3527', '#2C3527', '#FFFFFF', '#FFFFFF'];

const API = '/.netlify/functions/entries';

let entries = [];
let calMonth = new Date();
calMonth.setDate(1);
let selectedKey = null; // calendar day currently open, as "year-month-day" (month is 0-based)
let addFormOpen = false;

function getEntries() {
  return entries;
}

function scaleFor(value) {
  return SCALE[value - 1];
}

function colorFor(value) {
  return COLORS[value - 1];
}

function textColorFor(value) {
  return TEXT_COLORS[value - 1];
}

// ---------- API ----------
async function apiGet() {
  const res = await fetch(API);
  if (!res.ok) throw new Error('request failed');
  return res.json();
}

async function apiPost(entry) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error('request failed');
  return res.json();
}

async function apiDelete(id) {
  const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error('request failed');
}

function renderLegend() {
  const legend = document.getElementById('cal-legend');
  legend.innerHTML = SCALE.map((s, i) => {
    return `<div class="legend-swatch" style="background:${COLORS[i]};color:${TEXT_COLORS[i]}" title="${s.label}">${s.icon}</div>`;
  }).join('');
}

// ---------- Startup ----------
async function loadApp() {
  try {
    entries = await apiGet();
  } catch (err) {
    entries = [];
  }
  refreshViews();
}

function refreshViews() {
  renderTable();
  renderCalendar();
  if (typeof renderTrends === 'function' && document.getElementById('view-trends').classList.contains('active')) {
    renderTrends();
  }
}

// ---------- Tabs ----------
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');

  if (name === 'table') renderTable();
  if (name === 'calendar') renderCalendar();
  if (name === 'trends' && typeof renderTrends === 'function') renderTrends();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.view));
});

// Used by the "past year" chart: jump to a day in the calendar.
function openCalendarDay(year, month, day) {
  calMonth = new Date(year, month, 1);
  selectedKey = `${year}-${month}-${day}`;
  addFormOpen = false;
  switchTab('calendar');
  const detail = document.getElementById('cal-day-detail');
  if (!detail.hidden) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------- Toast ----------
const toastEl = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const toastAction = document.getElementById('toast-action');
let toastTimer = null;
let toastHandler = null;

function showToast(message, actionLabel, onAction, ms = 6000) {
  clearTimeout(toastTimer);
  toastMsg.textContent = message;
  toastHandler = onAction || null;
  toastAction.hidden = !onAction;
  if (actionLabel) toastAction.textContent = actionLabel;
  toastEl.hidden = false;
  toastTimer = setTimeout(hideToast, ms);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastEl.hidden = true;
  toastHandler = null;
}

toastAction.addEventListener('click', () => {
  const handler = toastHandler;
  hideToast();
  if (handler) handler();
});

// ---------- Log view ----------
const slider = document.getElementById('slider');
const todayIcon = document.getElementById('today-icon');
const todayLabel = document.getElementById('today-label');
const noteInput = document.getElementById('note');
const logBtn = document.getElementById('log-btn');
const logConfirm = document.getElementById('log-confirm');

function updateSliderDisplay() {
  const s = scaleFor(Number(slider.value));
  todayIcon.textContent = s.icon;
  todayLabel.textContent = s.label;
}
slider.addEventListener('input', updateSliderDisplay);
updateSliderDisplay();

logBtn.addEventListener('click', async () => {
  const value = Number(slider.value);
  const note = noteInput.value.trim();
  logBtn.disabled = true;
  try {
    const saved = await apiPost({ value, note, timestamp: new Date().toISOString() });
    entries.unshift(saved);
    noteInput.value = '';
    logConfirm.hidden = false;
    setTimeout(() => (logConfirm.hidden = true), 1800);
    refreshViews();
  } catch (err) {
    alert("Couldn't save that entry. Check your connection and try again.");
  } finally {
    logBtn.disabled = false;
  }
});

// ---------- Delete ----------
async function deleteEntry(id) {
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return;
  const removed = entries[index];

  entries.splice(index, 1);
  refreshViews();

  try {
    await apiDelete(id);
  } catch (err) {
    entries.splice(index, 0, removed);
    refreshViews();
    alert("Couldn't delete that entry. Check your connection and try again.");
    return;
  }

  showToast('Entry deleted.', 'Undo', async () => {
    try {
      // Re-send with the original id so it comes back exactly as it was.
      const restored = await apiPost({
        id: removed.id,
        value: removed.value,
        note: removed.note,
        timestamp: removed.timestamp,
        backfilled: removed.backfilled === true,
      });
      entries.push(restored);
      refreshViews();
    } catch (err) {
      alert("Couldn't restore that entry. Check your connection and try again.");
    }
  });
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-delete-id]');
  if (btn) deleteEntry(btn.dataset.deleteId);
});

// ---------- Entry rows (shared by Table and Calendar day detail) ----------
function entryRowHtml(e, withDate) {
  const s = scaleFor(e.value);
  const d = new Date(e.timestamp);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const when = withDate ? `${dateStr} · ${timeStr}` : timeStr;
  return `
    <div class="entry-row">
      <div class="entry-icon">${s.icon}</div>
      <div class="entry-main">
        <p class="entry-label">${s.label}${e.backfilled ? ' <span class="tag">added later</span>' : ''}</p>
        <p class="entry-time">${when}</p>
        ${e.note ? `<p class="entry-note">${escapeHtml(e.note)}</p>` : ''}
      </div>
      <button class="del-btn" type="button" data-delete-id="${escapeHtml(e.id)}" aria-label="Delete the ${escapeHtml(s.label)} entry from ${dateStr} at ${timeStr}">Delete</button>
    </div>`;
}

// ---------- Table view ----------
function renderBreakdown() {
  const wrap = document.getElementById('table-breakdown');
  const bars = document.getElementById('breakdown-bars');
  const total = entries.length;

  if (!total) {
    wrap.hidden = true;
    bars.innerHTML = '';
    return;
  }
  wrap.hidden = false;

  bars.innerHTML = SCALE.map((s) => {
    const count = entries.filter((e) => e.value === s.value).length;
    const pct = Math.round((count / total) * 100);
    return `
      <div class="breakdown-row" aria-label="${s.label}: ${count} logs, ${pct}%">
        <span class="breakdown-icon" aria-hidden="true">${s.icon}</span>
        <span class="breakdown-label">${s.label}</span>
        <div class="breakdown-track">
          <div class="breakdown-fill" style="width:${pct}%;background:${colorFor(s.value)}"></div>
        </div>
        <span class="breakdown-stat">${count} · ${pct}%</span>
      </div>`;
  }).join('');
}

function renderTable() {
  renderBreakdown();
  const list = document.getElementById('table-list');
  const empty = document.getElementById('table-empty');
  const sorted = [...entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (sorted.length === 0) {
    empty.hidden = false;
    list.innerHTML = '';
    return;
  }
  empty.hidden = true;

  list.innerHTML = sorted.map((e) => entryRowHtml(e, true)).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML.replace(/"/g, '&quot;');
}

// ---------- Calendar view ----------
const calGrid = document.getElementById('cal-grid');
const calMonthLabel = document.getElementById('cal-month-label');
const calDayDetail = document.getElementById('cal-day-detail');

document.getElementById('cal-prev').addEventListener('click', () => {
  calMonth.setMonth(calMonth.getMonth() - 1);
  selectedKey = null;
  addFormOpen = false;
  renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calMonth.setMonth(calMonth.getMonth() + 1);
  selectedKey = null;
  addFormOpen = false;
  renderCalendar();
});

function entriesByDay() {
  const map = {};
  entries.forEach((e) => {
    const d = new Date(e.timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!map[key]) map[key] = [];
    map[key].push(e);
  });
  return map;
}

function renderCalendar() {
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  calMonthLabel.textContent = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const byDay = entriesByDay();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let html = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    .map((d) => `<div class="cal-dow">${d}</div>`)
    .join('');

  for (let i = 0; i < firstDow; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${month}-${day}`;
    const dayEntries = (byDay[key] || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const isFuture = new Date(year, month, day) > todayStart;
    let style = '';
    let cls = 'cal-cell';
    let inner = `<span class="cal-daynum">${day}</span>`;
    if (dayEntries.length) {
      cls += ' has-entry';
      const latest = dayEntries[0];
      const textColor = textColorFor(latest.value);
      style = `style="background:${colorFor(latest.value)}"`;
      inner = `<span class="cal-daynum" style="color:${textColor}">${day}</span>`;
      inner += `<span class="cal-emoji">${scaleFor(latest.value).icon}</span>`;
    }
    if (isToday) cls += ' today';
    if (isFuture) cls += ' future';
    if (key === selectedKey) cls += ' selected';
    const dateLabel = new Date(year, month, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const aria = `${dateLabel}${dayEntries.length ? `, ${scaleFor(dayEntries[0].value).label}` : ', no entry'}`;
    html += `<button class="${cls}" ${style} data-day-key="${key}" aria-label="${aria}" ${isFuture ? 'disabled' : ''}>${inner}</button>`;
  }

  calGrid.innerHTML = html;

  calGrid.querySelectorAll('.cal-cell[data-day-key]:not(.future)').forEach((cell) => {
    cell.addEventListener('click', () => {
      if (selectedKey !== cell.dataset.dayKey) addFormOpen = false;
      selectedKey = cell.dataset.dayKey;
      renderCalendar();
    });
  });

  renderDayDetail(byDay);
}

function renderDayDetail(byDay) {
  if (!selectedKey) {
    calDayDetail.hidden = true;
    return;
  }
  const dayEntries = (byDay || entriesByDay())[selectedKey] || [];
  const [y, m, d] = selectedKey.split('-').map(Number);
  const dateLabel = new Date(y, m, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const sorted = [...dayEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  calDayDetail.innerHTML = `
    <h3>${dateLabel}</h3>
    ${
      sorted.length
        ? `<div class="entry-list">${sorted.map((e) => entryRowHtml(e, false)).join('')}</div>`
        : `<p class="day-empty">Nothing logged this day.</p>`
    }
    ${addFormOpen ? addFormHtml() : `<button type="button" class="add-day-btn" id="add-day-btn">+ Add a log for this day</button>`}
  `;
  calDayDetail.hidden = false;

  if (addFormOpen) wireAddForm(y, m, d);
  else document.getElementById('add-day-btn').addEventListener('click', () => {
    addFormOpen = true;
    renderDayDetail();
    const noteBox = document.getElementById('bf-note');
    if (noteBox) noteBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function addFormHtml() {
  return `
    <div class="add-form">
      <div class="add-preview" aria-live="polite">
        <span class="add-preview-icon" id="bf-icon">⭐</span>
        <span class="add-preview-label" id="bf-label">Neutral</span>
      </div>
      <input type="range" class="mini-slider" id="bf-slider" min="1" max="7" step="1" value="4" aria-label="Masculine to feminine feeling" />
      <div class="slider-endcaps"><span>masculine</span><span>feminine</span></div>
      <div class="add-row">
        <label for="bf-time">Time</label>
        <input type="time" id="bf-time" />
      </div>
      <textarea id="bf-note" rows="2" placeholder="Note (optional)"></textarea>
      <p class="form-error" id="bf-error" hidden></p>
      <div class="add-actions">
        <button type="button" class="primary-btn" id="bf-save">Save log</button>
        <button type="button" class="ghost-btn" id="bf-cancel">Cancel</button>
      </div>
    </div>`;
}

function wireAddForm(y, m, d) {
  const bfSlider = document.getElementById('bf-slider');
  const bfIcon = document.getElementById('bf-icon');
  const bfLabel = document.getElementById('bf-label');
  const bfTime = document.getElementById('bf-time');
  const bfNote = document.getElementById('bf-note');
  const bfError = document.getElementById('bf-error');
  const bfSave = document.getElementById('bf-save');

  const now = new Date();
  const isToday = now.getFullYear() === y && now.getMonth() === m && now.getDate() === d;
  const pad = (n) => String(n).padStart(2, '0');
  bfTime.value = isToday ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : '12:00';

  const sync = () => {
    const s = scaleFor(Number(bfSlider.value));
    bfIcon.textContent = s.icon;
    bfLabel.textContent = s.label;
  };
  bfSlider.addEventListener('input', sync);
  sync();

  document.getElementById('bf-cancel').addEventListener('click', () => {
    addFormOpen = false;
    renderDayDetail();
  });

  bfSave.addEventListener('click', async () => {
    const [hh, mm] = (bfTime.value || '12:00').split(':').map(Number);
    const when = new Date(y, m, d, hh, mm);
    if (when > new Date()) {
      bfError.textContent = "That time hasn't happened yet.";
      bfError.hidden = false;
      return;
    }
    bfError.hidden = true;
    bfSave.disabled = true;
    try {
      const saved = await apiPost({
        value: Number(bfSlider.value),
        note: bfNote.value.trim(),
        timestamp: when.toISOString(),
        backfilled: true,
      });
      entries.push(saved);
      addFormOpen = false;
      refreshViews();
      showToast('Log added.', null, null, 2500);
    } catch (err) {
      bfSave.disabled = false;
      bfError.textContent = "Couldn't save that. Check your connection and try again.";
      bfError.hidden = false;
    }
  });
}

// ---------- Service worker (basic offline shell) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

loadApp();
renderLegend();
