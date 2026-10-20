/* ============================================================
   STATS — статистика автора
   ============================================================ */

function getMyLessons() {
  const user = getCurrentUser() || {};
  const lessons = Storage.get('my_lessons', {});
  if (user.role === 'Администратор') return lessons;

  const mine = {};
  Object.entries(lessons).forEach(([id, item]) => {
    if (item.authorEmail === user.email || item.author === user.fio) {
      mine[id] = item;
    }
  });
  return mine;
}

function getMyLessonIds(lessons) {
  return Object.keys(lessons);
}

/* ---------- Метрики ---------- */
function computeTopMetrics(lessons) {
  const ids = getMyLessonIds(lessons);
  let totalViews = 0;
  let totalTests = 0;
  let totalPublished = 0;
  let totalFavorites = 0;

  ids.forEach(id => {
    const l = lessons[id];
    totalViews += l.views || 0;
    if (l.hasTest && Array.isArray(l.questions) && l.questions.length > 0) totalTests++;
    if (l.status === 'approved' || !l.status) totalPublished++;
  });

  const favorites = Storage.get('favorites', {});
  Object.values(favorites).forEach(arr => {
    if (!Array.isArray(arr)) return;
    arr.forEach(id => { if (ids.includes(id)) totalFavorites++; });
  });

  return {
    totalLessons: ids.length,
    totalViews,
    totalTests,
    totalPublished,
    totalFavorites
  };
}

function renderTopMetrics(lessons) {
  const m = computeTopMetrics(lessons);
  const container = document.getElementById('stats-top');
  if (!container) return;

  container.innerHTML = `
    <div class="stat-card">
      <span class="stat-card-value">${m.totalLessons}</span>
      <span class="stat-card-label">Всего лекций</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-value">${m.totalPublished}</span>
      <span class="stat-card-label">Опубликовано</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-value">${m.totalViews}</span>
      <span class="stat-card-label">Просмотров</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-value">${m.totalTests}</span>
      <span class="stat-card-label">С тестами</span>
    </div>
    <div class="stat-card">
      <span class="stat-card-value">${m.totalFavorites}</span>
      <span class="stat-card-label">В избранном</span>
    </div>
  `;
}

/* ---------- График просмотров по дням ----------
   Считаем по test_results (дата сдачи) — приближение.
   Если есть viewLog в будущем, использовать его.
   Здесь: количество сдач тестов в день + бонус за уникальных пользователей.
*/
function computeViewTimeline(lessons, days = 14) {
  const ids = getMyLessonIds(lessons);
  const results = Storage.get('test_results', []).filter(r => ids.includes(r.lessonId));

  const today = new Date();
  const timeline = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    const count = results.filter(r => r.isoDate === iso).length;
    // Плюс просмотры (грубая оценка — реальные счётчики чистятся)
    const viewsCount = Object.keys(localStorage)
      .filter(k => k.startsWith('view_counted_') && k.endsWith('_' + iso))
      .length;
    timeline.push({ date: iso, count: count + viewsCount });
  }
  return timeline;
}

function renderViewChart(lessons) {
  const container = document.getElementById('chart-views');
  if (!container) return;

  const timeline = computeViewTimeline(lessons, 14);
  const maxCount = Math.max(1, ...timeline.map(t => t.count));

  if (timeline.every(t => t.count === 0)) {
    container.innerHTML = `<div class="empty-chart">Пока нет данных. Просмотры и сдачи тестов появятся здесь.</div>`;
    return;
  }

  const barsHtml = timeline.map(t => {
    const h = Math.round((t.count / maxCount) * 100);
    return `<div class="chart-bar" style="height: ${Math.max(4, h)}%;" data-count="${t.count}" title="${formatDate(t.date)}: ${t.count}"></div>`;
  }).join('');

  const labelsHtml = timeline.map(t => {
    const parts = t.date.split('-');
    return `<span>${parts[2]}.${parts[1]}</span>`;
  }).join('');

  container.innerHTML = `
    <div style="flex:1;">
      <div class="chart-container">${barsHtml}</div>
      <div class="chart-labels">${labelsHtml}</div>
    </div>
  `;
}

/* ---------- Топ лекций ---------- */
function renderTopLessons(lessons) {
  const container = document.getElementById('top-lessons');
  if (!container) return;

  const arr = Object.entries(lessons)
    .map(([id, l]) => ({ id, ...l }))
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);

  if (arr.length === 0) {
    container.innerHTML = `<div class="empty-chart">У вас пока нет лекций.</div>`;
    return;
  }

  let html = '<div class="top-list">';
  arr.forEach((l, i) => {
    let rankClass = '';
    if (i === 0) rankClass = 'gold';
    else if (i === 1) rankClass = 'silver';
    else if (i === 2) rankClass = 'bronze';

    html += `
      <div class="top-item">
        <div class="top-item-rank ${rankClass}">${i + 1}</div>
        <div class="top-item-info">
          <div class="top-item-title">${escapeHtml(l.title)}</div>
          <div class="top-item-meta">
            ${l.subject ? escapeHtml(l.subject) + ' · ' : ''}${formatDate(l.createdAt)}
          </div>
        </div>
        <div class="top-item-value">👁 ${l.views || 0}</div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

/* ---------- Статистика тестов ---------- */
function renderTestStats(lessons) {
  const container = document.getElementById('test-stats');
  if (!container) return;

  const ids = getMyLessonIds(lessons);
  const results = Storage.get('test_results', []).filter(r => ids.includes(r.lessonId));

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-chart">Тесты ещё никто не проходил.</div>`;
    return;
  }

  // Группируем по лекции
  const byLesson = {};
  results.forEach(r => {
    if (!byLesson[r.lessonId]) byLesson[r.lessonId] = [];
    byLesson[r.lessonId].push(r);
  });

  let html = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Лекция</th>
          <th>Попыток</th>
          <th>Средний %</th>
          <th>Оценки</th>
        </tr>
      </thead>
      <tbody>
  `;

  Object.entries(byLesson).forEach(([lessonId, attempts]) => {
    const l = lessons[lessonId];
    if (!l) return;

    const avg = Math.round(attempts.reduce((s, r) => s + r.percent, 0) / attempts.length);
    const grades = { 5: 0, 4: 0, 3: 0, 2: 0 };
    attempts.forEach(r => { if (grades[r.grade] !== undefined) grades[r.grade]++; });

    const gradesHtml = [5, 4, 3, 2]
      .filter(g => grades[g] > 0)
      .map(g => `<span class="stats-grade g${g}">${g}: ${grades[g]}</span>`)
      .join(' ');

    html += `
      <tr>
        <td>${escapeHtml(l.title)}</td>
        <td>${attempts.length}</td>
        <td><b style="color:#a5b4fc;">${avg}%</b></td>
        <td>${gradesHtml}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/* ---------- Активность учеников ---------- */
function renderStudentActivity(lessons) {
  const container = document.getElementById('student-activity');
  if (!container) return;

  const ids = getMyLessonIds(lessons);
  const results = Storage.get('test_results', []).filter(r => ids.includes(r.lessonId));

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-chart">Пока нет активности.</div>`;
    return;
  }

  // Группируем по пользователю
  const byUser = {};
  results.forEach(r => {
    const key = r.userEmail || r.fio;
    if (!byUser[key]) byUser[key] = { fio: r.fio, email: r.userEmail, attempts: 0, avg: 0, lastDate: '' };
    byUser[key].attempts++;
    byUser[key].avg += r.percent;
    if (!byUser[key].lastDate || r.isoDate > byUser[key].lastDate) byUser[key].lastDate = r.isoDate;
  });

  const arr = Object.values(byUser).map(u => ({
    ...u,
    avg: Math.round(u.avg / u.attempts)
  })).sort((a, b) => b.attempts - a.attempts);

  let html = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Ученик</th>
          <th>Попыток</th>
          <th>Средний %</th>
          <th>Последняя активность</th>
        </tr>
      </thead>
      <tbody>
  `;

  arr.forEach(u => {
    html += `
      <tr>
        <td>${escapeHtml(u.fio)}</td>
        <td>${u.attempts}</td>
        <td><b style="color:#a5b4fc;">${u.avg}%</b></td>
        <td style="font-size: 12px; color: #94a3b8;">${formatDate(u.lastDate)}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/* ---------- Инициализация ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const lessons = getMyLessons();
  renderTopMetrics(lessons);
  renderViewChart(lessons);
  renderTopLessons(lessons);
  renderTestStats(lessons);
  renderStudentActivity(lessons);
});