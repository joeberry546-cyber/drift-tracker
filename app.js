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
  renderTable();
  renderCalendar();
}

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById('view-' + tab.dataset.view).classList.add('active');

    if (tab.dataset.view === 'table') renderTable();
    if (tab.dataset.view === 'calendar') renderCalendar();
  });
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
    renderTable();
    renderCalendar();
  } catch (err) {
    alert("Couldn't save that entry. Check your connection and try again.");
  } finally {
    logBtn.disabled = false;
  }
});

// ---------- Table view ----------
function renderTable() {
  const list = document.getElementById('table-list');
  const empty = document.getElementById('table-empty');
  const sorted = [...entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (sorted.length === 0) {
    empty.hidden = false;
    list.innerHTML = '';
    return;
  }
  empty.hidden = true;

  list.innerHTML = sorted
    .map((e) => {
      const s = scaleFor(e.value);
      const d = new Date(e.timestamp);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `
        <div class="entry-row">
          <div class="entry-icon">${s.icon}</div>
          <div class="entry-main">
            <p class="entry-label">${s.label}</p>
            <p class="entry-time">${dateStr} · ${timeStr}</p>
            ${e.note ? `<p class="entry-note">${escapeHtml(e.note)}</p>` : ''}
          </div>
        </div>`;
    })
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Calendar view ----------
const calGrid = document.getElementById('cal-grid');
const calMonthLabel = document.getElementById('cal-month-label');
const calDayDetail = document.getElementById('cal-day-detail');

document.getElementById('cal-prev').addEventListener('click', () => {
  calMonth.setMonth(calMonth.getMonth() - 1);
  renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calMonth.setMonth(calMonth.getMonth() + 1);
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
    html += `<button class="${cls}" ${style} data-day-key="${key}">${inner}</button>`;
  }

  calGrid.innerHTML = html;
  calDayDetail.hidden = true;

  calGrid.querySelectorAll('.cal-cell.has-entry').forEach((cell) => {
    cell.addEventListener('click', () => showDayDetail(cell.dataset.dayKey, byDay[cell.dataset.dayKey]));
  });
}

function showDayDetail(key, dayEntries) {
  const [y, m, d] = key.split('-').map(Number);
  const dateLabel = new Date(y, m, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const sorted = [...dayEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  calDayDetail.innerHTML = `
    <h3>${dateLabel}</h3>
    <div class="entry-list">
      ${sorted
        .map((e) => {
          const s = scaleFor(e.value);
          const timeStr = new Date(e.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          return `
            <div class="entry-row">
              <div class="entry-icon">${s.icon}</div>
              <div class="entry-main">
                <p class="entry-label">${s.label}</p>
                <p class="entry-time">${timeStr}</p>
                ${e.note ? `<p class="entry-note">${escapeHtml(e.note)}</p>` : ''}
              </div>
            </div>`;
        })
        .join('')}
    </div>`;
  calDayDetail.hidden = false;
}

// ---------- Service worker (basic offline shell) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

loadApp();
renderLegend();
