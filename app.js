// FYB Week Attendance - main app logic
// NOTE: top-level vars are declared with `var` (not const/let) so they
// attach to `window` - this is relied on by test.js for headless testing.
//
// Identity rule: every student is identified by `student.id` (their unique
// payment transaction reference) everywhere in this file and in db.js/sync.js.
// Matric number is shown for display/search only - it is NOT used as a
// lookup key, because 4 pairs of students in the source data share a matric
// number (apparent typos), and using matric as the key would mean marking
// one of them present also marks the other present.

var EVENT_DAYS = [
  { key: 'mon', label: 'MON', event: 'Seminar Day' },
  { key: 'tue', label: 'TUE', event: 'Sport / Jersey Day' },
  { key: 'wed', label: 'WED', event: 'Old School / Costume Day' },
  { key: 'thu', label: 'THU', event: 'Picnic' },
  { key: 'fri', label: 'FRI', event: 'Cultural Day' },
  { key: 'sat', label: 'SAT', event: 'Dinner (Old Money)' },
  { key: 'sun', label: 'SUN', event: 'Thanksgiving' }
];

var STUDENTS = window.FYB_STUDENTS || [];
var byId = {};
var matricCounts = {};

for (const s of STUDENTS) {
  byId[s.id] = s;
  const mk = window.FybDB.normKey(s.matric);
  matricCounts[mk] = (matricCounts[mk] || 0) + 1;
}

// Flag students whose matric number is shared with someone else, so the
// registration desk knows to double check the name before marking them in.
for (const s of STUDENTS) {
  s.matricShared = matricCounts[window.FybDB.normKey(s.matric)] > 1;
}

var state = {
  view: 'search',
  query: '',
  activeDay: EVENT_DAYS[0].key,
  openStudentId: null,
  attendanceCache: {} // studentId -> {day: record}
};

const $main = document.getElementById('main');
const $sheet = document.getElementById('sheet');
const $sheetBackdrop = document.getElementById('sheetBackdrop');
const $sheetContent = document.getElementById('sheetContent');
const $syncPill = document.getElementById('syncPill');
const $syncLabel = document.getElementById('syncLabel');

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function normSearch(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------- Search ----------
function searchStudents(query) {
  const q = normSearch(query);
  if (!q) return [];
  const results = [];
  for (const s of STUDENTS) {
    if (s.searchBlob.includes(q)) results.push(s);
    if (results.length >= 60) break;
  }
  return results;
}

async function getAttendanceSummary(studentId) {
  if (!state.attendanceCache[studentId]) {
    state.attendanceCache[studentId] = await window.FybDB.getForStudent(studentId);
  }
  return state.attendanceCache[studentId];
}

function invalidateCache(studentId) {
  delete state.attendanceCache[studentId];
}

// ---------- Render: Search view ----------
async function renderSearchView() {
  const results = searchStudents(state.query);

  let html = `
    <div class="search-wrap">
      <input type="text" id="searchInput" class="search-input"
        placeholder="Search name or matric number..."
        value="${escapeHtml(state.query)}" autocomplete="off" />
      <span class="search-icon">🔍</span>
    </div>
  `;

  if (!state.query) {
    html += `
      <div class="empty-state">
        <div class="icon">🎓</div>
        <div class="msg">Start typing a student's name or matric number<br/>to find their record and mark attendance.</div>
      </div>
    `;
    $main.innerHTML = html;
    wireSearchInput();
    return;
  }

  if (results.length === 0) {
    html += `
      <div class="empty-state">
        <div class="icon">😕</div>
        <div class="msg">No match found for "<strong>${escapeHtml(state.query)}</strong>".<br/>Check the spelling of the name or matric number.</div>
      </div>
    `;
    $main.innerHTML = html;
    wireSearchInput();
    return;
  }

  html += `<div class="result-count">${results.length} match${results.length === 1 ? '' : 'es'}</div>`;
  html += '<div id="resultsList">';
  for (const s of results) {
    html += renderStudentCardSkeleton(s);
  }
  html += '</div>';

  $main.innerHTML = html;
  wireSearchInput();

  // fill in attendance dots async (from IndexedDB)
  for (const s of results) {
    const att = await getAttendanceSummary(s.id);
    const el = document.querySelector(`[data-card-id="${s.id}"] .attend-strip`);
    if (el) el.innerHTML = renderAttendDots(att);
  }
}

function renderStudentCardSkeleton(s) {
  return `
    <div class="student-card" data-card-id="${s.id}" data-student-id="${escapeHtml(s.id)}">
      <div class="name">${escapeHtml(s.fullname)}</div>
      <div class="meta">
        <span class="matric">${escapeHtml(s.matric)}</span>
        <span>${escapeHtml(s.department)}</span>
        <span>${escapeHtml(s.level)}</span>
      </div>
      ${s.matricShared ? '<div class="shared-matric-badge">⚠ Matric number also used by another student — confirm this is the right person</div>' : ''}
      <div class="attend-strip"></div>
    </div>
  `;
}

function renderAttendDots(attendanceMap) {
  return EVENT_DAYS.map((d) => {
    const present = attendanceMap[d.key] && attendanceMap[d.key].present;
    return `<div class="attend-dot ${present ? 'present' : ''}" title="${d.label}"></div>`;
  }).join('');
}

function wireSearchInput() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderSearchView();
  });
  // restore focus + cursor position if user was typing
  if (document.activeElement !== input && state.query) {
    const len = input.value.length;
    input.focus();
    input.setSelectionRange(len, len);
  }

  document.querySelectorAll('.student-card').forEach((card) => {
    card.addEventListener('click', () => openStudentSheet(card.dataset.studentId));
  });
}

// ---------- Student detail sheet ----------
async function openStudentSheet(studentId) {
  const student = byId[studentId];
  if (!student) return;

  state.openStudentId = student.id;
  const attendance = await getAttendanceSummary(student.id);

  $sheetContent.innerHTML = `
    <div class="sheet-header">
      <div class="name">${escapeHtml(student.fullname)}</div>
      <button class="sheet-close" id="sheetCloseBtn">✕</button>
    </div>

    ${student.matricShared ? `
      <div class="shared-matric-warning">
        ⚠ This matric number is also used by another student in the records (likely a typo
        by one of them). Double-check the name and department before marking attendance.
      </div>
    ` : ''}

    <div class="sheet-detail-grid">
      <div class="field">
        <div class="label">Matric Number</div>
        <div class="value matric">${escapeHtml(student.matric)}</div>
      </div>
      <div class="field">
        <div class="label">Level</div>
        <div class="value">${escapeHtml(student.level)}</div>
      </div>
      <div class="field">
        <div class="label">Department</div>
        <div class="value">${escapeHtml(student.department)}</div>
      </div>
      <div class="field">
        <div class="label">Paid</div>
        <div class="value">₦${Number(student.amount).toLocaleString()}</div>
      </div>
      <div class="field" style="grid-column: 1 / -1;">
        <div class="label">Email</div>
        <div class="value">${escapeHtml(student.email)}</div>
      </div>
    </div>

    <div class="attendance-section-title">Mark Attendance</div>
    <div id="dayRows"></div>
  `;

  renderDayRows(student, attendance);

  document.getElementById('sheetCloseBtn').addEventListener('click', closeSheet);
  $sheetBackdrop.classList.add('open');
  $sheet.classList.add('open');
}

function renderDayRows(student, attendance) {
  const $rows = document.getElementById('dayRows');
  $rows.innerHTML = EVENT_DAYS.map((d) => {
    const rec = attendance[d.key];
    const present = rec && rec.present;
    return `
      <div class="day-row">
        <div class="day-info">
          <div class="day-ribbon">${d.label}</div>
          <div>
            <div class="day-event">${escapeHtml(d.event)}</div>
            ${present && rec.markedBy ? `<div class="day-marked-by">✓ by ${escapeHtml(rec.markedBy)}</div>` : ''}
          </div>
        </div>
        <button class="attend-toggle ${present ? 'on' : ''}" data-day="${d.key}">
          <span class="knob"></span>
        </button>
      </div>
    `;
  }).join('');

  $rows.querySelectorAll('.attend-toggle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const day = btn.dataset.day;
      const willBePresent = !btn.classList.contains('on');
      const marker = window.FybSync.getDeviceName() || 'Registration';

      // optimistic UI update
      btn.classList.toggle('on', willBePresent);

      const record = await window.FybDB.setAttendance(student.id, day, willBePresent, marker);
      invalidateCache(student.id);

      // re-render marked-by line
      const fresh = await getAttendanceSummary(student.id);
      renderDayRows(student, fresh);

      // attempt immediate cloud push (non-blocking)
      window.FybSync.pushRecord(record).then((ok) => {
        if (ok) window.FybDB.markSynced([record.key]);
      });

      // update card dots in background list if visible
      const cardStrip = document.querySelector(`[data-card-id="${student.id}"] .attend-strip`);
      if (cardStrip) cardStrip.innerHTML = renderAttendDots(fresh);
    });
  });
}

function closeSheet() {
  $sheet.classList.remove('open');
  $sheetBackdrop.classList.remove('open');
  state.openStudentId = null;
}

$sheetBackdrop.addEventListener('click', closeSheet);

// ---------- Render: Days view ----------
async function renderDaysView() {
  const day = EVENT_DAYS.find((d) => d.key === state.activeDay) || EVENT_DAYS[0];
  const allAttendance = await window.FybDB.getAll();
  const presentToday = allAttendance.filter((r) => r.day === day.key && r.present).length;

  let html = `
    <div class="day-chip-row">
      ${EVENT_DAYS.map((d) => `
        <button class="day-chip ${d.key === state.activeDay ? 'active' : ''}" data-day="${d.key}">${d.label}</button>
      `).join('')}
    </div>

    <div class="day-summary-card">
      <div class="event-name">${escapeHtml(day.event)}</div>
      <div class="stat-row">
        <div class="stat present">
          <div class="num">${presentToday}</div>
          <div class="lbl">Checked In</div>
        </div>
        <div class="stat">
          <div class="num">${STUDENTS.length}</div>
          <div class="lbl">Total Paid</div>
        </div>
      </div>
    </div>

    <div class="search-wrap">
      <input type="text" id="daysSearchInput" class="search-input"
        placeholder="Search to mark attendance for ${escapeHtml(day.label)}..."
        value="${escapeHtml(state.query)}" autocomplete="off" />
      <span class="search-icon">🔍</span>
    </div>
  `;

  const results = state.query ? searchStudents(state.query) : [];
  if (state.query && results.length) {
    html += `<div class="result-count">${results.length} match${results.length === 1 ? '' : 'es'}</div>`;
    html += '<div id="dayResultsList">';
    for (const s of results) {
      const att = await getAttendanceSummary(s.id);
      const present = att[day.key] && att[day.key].present;
      html += `
        <div class="student-card" data-student-id="${escapeHtml(s.id)}">
          <div class="name">${escapeHtml(s.fullname)}</div>
          <div class="meta">
            <span class="matric">${escapeHtml(s.matric)}</span>
            <span>${escapeHtml(s.department)}</span>
          </div>
          ${s.matricShared ? '<div class="shared-matric-badge">⚠ Matric number also used by another student — confirm this is the right person</div>' : ''}
          <div class="day-row" style="margin-top:10px; margin-bottom:0;">
            <div class="day-event">${present ? '✅ Present' : 'Not checked in'}</div>
            <button class="attend-toggle ${present ? 'on' : ''}" data-day="${day.key}" data-student-id="${escapeHtml(s.id)}">
              <span class="knob"></span>
            </button>
          </div>
        </div>
      `;
    }
    html += '</div>';
  } else if (state.query) {
    html += `<div class="empty-state"><div class="icon">😕</div><div class="msg">No match found.</div></div>`;
  }

  $main.innerHTML = html;

  document.querySelectorAll('.day-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.activeDay = chip.dataset.day;
      renderDaysView();
    });
  });

  const daysInput = document.getElementById('daysSearchInput');
  if (daysInput) {
    daysInput.addEventListener('input', (e) => {
      state.query = e.target.value;
      renderDaysView();
    });
    if (state.query) {
      const len = daysInput.value.length;
      daysInput.focus();
      daysInput.setSelectionRange(len, len);
    }
  }

  document.querySelectorAll('#dayResultsList .attend-toggle').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const studentId = btn.dataset.studentId;
      const dayKey = btn.dataset.day;
      const willBePresent = !btn.classList.contains('on');
      const marker = window.FybSync.getDeviceName() || 'Registration';

      btn.classList.toggle('on', willBePresent);
      const eventLabel = btn.closest('.day-row').querySelector('.day-event');
      if (eventLabel) eventLabel.textContent = willBePresent ? '✅ Present' : 'Not checked in';

      const record = await window.FybDB.setAttendance(studentId, dayKey, willBePresent, marker);
      invalidateCache(studentId);

      window.FybSync.pushRecord(record).then((ok) => {
        if (ok) window.FybDB.markSynced([record.key]);
      });
    });
  });

  // allow tapping the card (not the toggle) to open full sheet
  document.querySelectorAll('#dayResultsList .student-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.attend-toggle')) return;
      openStudentSheet(card.dataset.studentId);
    });
  });
}

// ---------- Render: Stats view ----------
async function renderStatsView() {
  const allAttendance = await window.FybDB.getAll();
  const totalStudents = STUDENTS.length;

  const perDay = {};
  for (const d of EVENT_DAYS) perDay[d.key] = 0;
  for (const r of allAttendance) {
    if (r.present) perDay[r.day] = (perDay[r.day] || 0) + 1;
  }

  // unique students with at least one day attended
  const everAttended = new Set(allAttendance.filter((r) => r.present).map((r) => r.studentId));

  let html = `
    <div class="stats-grid">
      <div class="stat-tile">
        <div class="num">${totalStudents}</div>
        <div class="lbl">Total Registered (Paid)</div>
      </div>
      <div class="stat-tile">
        <div class="num">${everAttended.size}</div>
        <div class="lbl">Attended ≥1 Day</div>
      </div>
    </div>

    <div class="section-label">Attendance by day</div>
  `;

  for (const d of EVENT_DAYS) {
    const count = perDay[d.key] || 0;
    const pct = totalStudents ? Math.round((count / totalStudents) * 100) : 0;
    html += `
      <div class="day-stat-bar-row">
        <div class="bar-label">
          <span>${d.label} · ${escapeHtml(d.event)}</span>
          <span>${count} (${pct}%)</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  }

  $main.innerHTML = html;
}

// ---------- Render: Settings view ----------
function renderSettingsView() {
  const configured = window.FybSync.isConfigured();
  const deviceName = window.FybSync.getDeviceName();
  const sharedCount = Object.values(matricCounts).filter((c) => c > 1).length;

  let html = `
    <div class="section-label">Sync setup</div>
    <div class="setup-banner">
      ${configured
        ? '<strong>Cloud sync is configured.</strong> Attendance marks made on this device will sync to all other devices automatically whenever you\'re online.'
        : '<strong>Cloud sync is not set up yet.</strong> The app fully works offline on this device right now, but attendance won\'t sync to other devices until Firebase is configured. Open <code>firebase-config.js</code> in the project files and follow the setup instructions at the top of that file (about 5 minutes, completely free).'
      }
    </div>

    <div class="section-label">This device's name</div>
    <div class="setup-banner">
      Shown next to attendance marks so your team knows who checked someone in (e.g. "Main Gate", "Sarah's phone").
      <div class="name-prompt-row">
        <input type="text" id="deviceNameInput" placeholder="e.g. Main Gate Tablet" value="${escapeHtml(deviceName)}" />
        <button id="saveDeviceName">Save</button>
      </div>
    </div>

    <div class="section-label">Data</div>
    <div class="setup-banner">
      <strong>${STUDENTS.length}</strong> students loaded from the FYB Week payment records, ready to search fully offline.
      ${sharedCount ? `<br/><br/>⚠ ${sharedCount} matric number${sharedCount === 1 ? ' is' : 's are'} shared by two different students in the source sheet (likely a typo by one of them). Those records show a warning in search so the desk can confirm by name before marking attendance.` : ''}
    </div>
  `;

  $main.innerHTML = html;

  document.getElementById('saveDeviceName').addEventListener('click', () => {
    const val = document.getElementById('deviceNameInput').value.trim();
    if (val) {
      window.FybSync.setDeviceName(val);
      updateSyncPill({ state: configured ? 'online' : 'unconfigured' });
    }
  });
}

// ---------- Nav ----------
function renderView() {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === state.view);
  });
  if (state.view === 'search') renderSearchView();
  else if (state.view === 'days') renderDaysView();
  else if (state.view === 'stats') renderStatsView();
  else if (state.view === 'settings') renderSettingsView();
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.view = btn.dataset.view;
    if (state.view !== 'days') state.query = state.view === 'search' ? state.query : '';
    renderView();
  });
});

// ---------- Sync status pill ----------
function updateSyncPill(status) {
  $syncPill.className = 'sync-pill';
  if (status.state === 'unconfigured') {
    $syncPill.classList.add('unconfigured');
    $syncLabel.textContent = 'Local only';
  } else if (status.state === 'connecting' || status.state === 'syncing') {
    $syncPill.classList.add('syncing');
    $syncLabel.textContent = 'Syncing...';
  } else if (status.state === 'offline') {
    $syncPill.classList.add('offline');
    $syncLabel.textContent = 'Offline';
  } else if (status.state === 'online') {
    $syncPill.classList.add('online');
    $syncLabel.textContent = 'Synced';
  } else if (status.state === 'error') {
    $syncPill.classList.add('offline');
    $syncLabel.textContent = 'Sync error';
  }
}

window.addEventListener('fyb-remote-update', () => {
  // a remote device pushed a change - invalidate caches and re-render current view
  state.attendanceCache = {};
  renderView();
});

window.addEventListener('online', () => {
  if (window.FybSync.isConfigured()) window.FybSync.flushUnsynced();
});

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// ---------- Boot ----------
(async function boot() {
  renderView();
  const ok = await window.FybSync.init(updateSyncPill);
  if (ok) {
    window.FybSync.flushUnsynced();
  }
})();

// Expose internals for headless testing (test.js) - no effect on normal usage.
window.searchStudents = searchStudents;
window.escapeHtml = escapeHtml;
window.renderSearchView = renderSearchView;
window.renderDaysView = renderDaysView;
window.renderStatsView = renderStatsView;
window.renderSettingsView = renderSettingsView;
window.state = state;
window.byId = byId;
