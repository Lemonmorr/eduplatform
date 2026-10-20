/* ============================================================
   MY-LESSONS — логика страницы "Мои лекции"
   ============================================================ */

let currentActiveLessonId = null;
let lessonToDeleteId = null;

function getLessonCreatedAt(id, item) {
  if (item && item.createdAt) return item.createdAt;
  const m = String(id).match(/^lesson_(\d{10,})$/);
  if (m) {
    const d = new Date(parseInt(m[1], 10));
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return null;
}

function getLessonTestStats(lessonId) {
  const results = Storage.get('test_results', []).filter(r => r.lessonId === lessonId);
  const passed = results.length;

  const groups = Storage.get('groups', {});
  const memberEmails = new Set();
  Object.values(groups).forEach(g => {
    if ((g.lessonIds || []).includes(lessonId)) {
      (g.members || []).forEach(m => {
        if (m.email) memberEmails.add(m.email.toLowerCase());
      });
    }
  });
  return { passed, total: memberEmails.size };
}

function expandFilters() {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;
  panel.classList.add('expanded');
  document.getElementById('filter-search').focus();
}
function toggleFiltersPanel() {
  const panel = document.getElementById('filters-panel');
  panel.classList.toggle('expanded');
  if (panel.classList.contains('expanded')) document.getElementById('filter-search').focus();
}
function resetFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-subject').value = '';
  document.getElementById('filter-date').value = '';
  document.getElementById('filter-author').value = '';
  renderLessons();
}

function updateVisibility(id, value) {
  const lessons = Storage.get('my_lessons', {});
  if (lessons[id]) {
    lessons[id].visibility = value;
    Storage.set('my_lessons', lessons);
  }
}

function copyLink(id) {
  const base = window.location.href.replace(/[^/]*$/, '');
  const url = new URL('lesson.html?id=' + encodeURIComponent(id), base).href;
  navigator.clipboard.writeText(url).then(() => showToast('Ссылка скопирована!'));
}

function renderLessons() {
  const user = getCurrentUser() || {};
  const lessons = Storage.get('my_lessons', {});
  const keys = Object.keys(lessons);

  const myKeys = keys.filter(id => {
    const item = lessons[id];
    if (user.role === 'Администратор') return true;
    if (item.authorEmail) return item.authorEmail === user.email;
    if (item.author) return item.author === user.fio;
    return false;
  });

  const authorSelect = document.getElementById('filter-author');
  const prevAuthor = authorSelect.value;
  const authorSet = new Set();
  myKeys.forEach(id => authorSet.add(lessons[id].author || 'Не указан'));
  const authors = Array.from(authorSet).sort((a, b) => a.localeCompare(b, 'ru'));
  authorSelect.innerHTML = '<option value="">Все авторы</option>' +
    authors.map(a => `<option value="${escapeHtml(a)}"${a === prevAuthor ? ' selected' : ''}>${escapeHtml(a)}</option>`).join('');

  const subjectSelect = document.getElementById('filter-subject');
  const prevSubject = subjectSelect.value;
  const subjectSet = new Set();
  myKeys.forEach(id => {
    const s = lessons[id].subject && lessons[id].subject.trim();
    if (s) subjectSet.add(s);
  });
  const subjectsList = Array.from(subjectSet).sort((a, b) => a.localeCompare(b, 'ru'));
  subjectSelect.innerHTML = '<option value="">Все предметы</option>' +
    subjectsList.map(s => `<option value="${escapeHtml(s)}"${s === prevSubject ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');

  const searchQuery = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();
  const dateFilter = document.getElementById('filter-date')?.value || '';
  const authorFilter = authorSelect.value;
  const subjectFilter = subjectSelect.value;

  const filteredKeys = myKeys.filter(id => {
    const item = lessons[id];
    if (searchQuery) {
      const hay = (
        (item.title || '') + ' ' +
        (item.content || '') + ' ' +
        (item.subject || '') + ' ' +
        (item.tags || []).join(' ')
      ).toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    if (subjectFilter && (item.subject || '') !== subjectFilter) return false;
    if (dateFilter && getLessonCreatedAt(id, item) !== dateFilter) return false;
    if (authorFilter && (item.author || 'Не указан') !== authorFilter) return false;
    return true;
  });

  const activeFiltersCount = (dateFilter ? 1 : 0) + (authorFilter ? 1 : 0) + (subjectFilter ? 1 : 0);
  const badge = document.getElementById('filters-badge');
  if (activeFiltersCount > 0) {
    badge.textContent = activeFiltersCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }

  const infoEl = document.getElementById('results-info');
  const container = document.getElementById('lessons-list');
  const hasActiveFilter = !!(searchQuery || dateFilter || authorFilter || subjectFilter);

  if (myKeys.length === 0) {
    infoEl.textContent = '';
    container.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px 0;">У вас пока нет созданных лекций.</p>';
    return;
  }

  if (filteredKeys.length === 0) {
    infoEl.innerHTML = `Найдено: <strong>0</strong> из ${myKeys.length}`;
    container.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px 0;">Лекции по заданным критериям не найдены.</p>';
    return;
  }

  infoEl.innerHTML = hasActiveFilter
    ? `Найдено: <strong>${filteredKeys.length}</strong> из ${myKeys.length}`
    : `Всего лекций: <strong>${myKeys.length}</strong>`;

  filteredKeys.sort((a, b) => {
    const da = getLessonCreatedAt(a, lessons[a]) || '';
    const db = getLessonCreatedAt(b, lessons[b]) || '';
    return db.localeCompare(da);
  });

  container.innerHTML = '';
  filteredKeys.forEach(id => {
    const item = lessons[id];
    const createdAt = getLessonCreatedAt(id, item);
    const isFav = isFavorite(id);

    const testStats = getLessonTestStats(id);
    const hasTest = item.hasTest && item.questions && item.questions.length > 0;

    const userKey = user.email || 'guest';
    const progress = getReadingProgress(id, userKey);
    const { btnHtml: viewButtonHtml, badgeHtml: readBadgeHtml } = buildReadButtonHtml(id, progress, {
      baseClass: 'btn-sm',
      continueClass: 'btn-continue-lesson',
      defaultLabel: 'Просмотр'
    });

    let deadlineHtml = '';
    if (item.hasTest && item.deadline) {
      const today = localTodayISO();
      const expired = today > item.deadline;
      deadlineHtml = `<span class="lesson-deadline ${expired ? 'expired' : ''}">⏰ ${formatDate(item.deadline)}${expired ? ' (просрочен)' : ''}</span>`;
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="lesson-title-row">
        <div class="lesson-title">${escapeHtml(item.title)}</div>
        ${readBadgeHtml}
        ${isFav ? '<span class="lesson-fav-mark" title="В избранном">★</span>' : ''}
      </div>
      <div class="lesson-meta">
        <span>Автор: <b>${escapeHtml(item.author || 'Не указан')}</b></span>
        <span>Создана: <b>${formatDate(createdAt)}</b></span>
        ${item.subject ? `<span class="lesson-subject-tag">${escapeHtml(item.subject)}</span>` : ''}
        ${(item.tags || []).map(t => `<span class="lesson-tag">#${escapeHtml(t)}</span>`).join('')}
        <span class="lesson-views-tag">👁 ${item.views || 0}</span>
        ${hasTest ? `<span class="lesson-test-stat" title="Прошли тест${testStats.total > 0 ? ' из ' + testStats.total + ' учеников' : ''}">📝 Тест: ${testStats.passed}${testStats.total > 0 ? ' / ' + testStats.total : ''} прошли</span>` : ''}
        ${deadlineHtml}
      </div>
      <div class="actions">
        ${viewButtonHtml}
        <a href="teacher.html?edit=${encodeURIComponent(id)}" class="btn-sm">Редактировать</a>
        <button class="btn-sm" onclick="copyLink('${escapeHtml(id)}')">Ссылка</button>
        <button class="btn-sm" onclick="showResults('${escapeHtml(id)}', '${escapeHtml(item.title)}')">Результаты</button>
        <button class="btn-sm btn-pdf" onclick="exportLessonPDF('${escapeHtml(id)}')" title="Скачать в PDF">Экспорт PDF</button>
        <select class="visibility-select" onchange="updateVisibility('${escapeHtml(id)}', this.value)" title="Видимость лекции">
          <option value="public" ${item.visibility === 'public' ? 'selected' : ''}>Всем (Публичная)</option>
          <option value="link" ${item.visibility === 'link' ? 'selected' : ''}>По ссылке</option>
          <option value="private" ${item.visibility === 'private' ? 'selected' : ''}>Приватная</option>
        </select>
        <button class="btn-sm btn-danger" onclick="askDeleteLesson('${escapeHtml(id)}')">Удалить</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function exportSingleLesson(id) {
  const lessons = Storage.get('my_lessons', {});
  const lesson = lessons[id];
  if (!lesson) { showToast('Лекция не найдена', true); return; }

  const payload = {
    __format: 'eduplatform-lesson', __version: 1,
    exportedAt: new Date().toISOString(),
    lessonId: id, lesson
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safeTitle = (lesson.title || 'lesson').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 50);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeTitle}.lesson.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast('Файл лекции сохранён');
}

function showResults(id, title) {
  currentActiveLessonId = id;
  document.getElementById('modal-title').textContent = `Результаты: ${title}`;
  document.getElementById('date-filter').value = '';
  renderResultsTable(id);
  openModal('results-modal');
}
function closeResultsModal() { closeModal('results-modal'); }

function applyDateFilter() {
  if (currentActiveLessonId) renderResultsTable(currentActiveLessonId);
}
function resetDateFilter() {
  document.getElementById('date-filter').value = '';
  if (currentActiveLessonId) renderResultsTable(currentActiveLessonId);
}

function renderResultsTable(id) {
  const results = Storage.get('test_results', []);
  const dateVal = document.getElementById('date-filter').value;
  const container = document.getElementById('modal-table-container');

  let list = results.filter(r => r.lessonId === id);
  if (dateVal) {
    list = list.filter(r => r.isoDate === dateVal || (r.date && r.date.includes(dateVal)));
  }

  if (list.length === 0) {
    container.innerHTML = `<p style="color:#94a3b8; margin-top:15px; text-align:center;">${dateVal ? 'На эту дату результатов нет.' : 'Тест еще никто не проходил.'}</p>`;
    return;
  }

  const byUser = new Map();
  list.forEach(r => {
    const key = (r.userEmail || r.fio || '').toLowerCase();
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(r);
  });

  let html = `
    <table>
      <thead>
        <tr><th>ФИО</th><th>Результат</th><th>%</th><th>Оценка</th><th>Дата</th><th>Попытки</th></tr>
      </thead>
      <tbody>
  `;
  byUser.forEach(attempts => {
    attempts.sort((a, b) => b.percent - a.percent);
    const best = attempts[0];
    html += `
      <tr>
        <td>${escapeHtml(best.fio)}</td>
        <td>${best.score}</td>
        <td>${best.percent}%</td>
        <td><b style="color:#818cf8;">${best.grade}</b></td>
        <td style="font-size:12px; color:#94a3b8;">${best.date}</td>
        <td style="font-size:12px; color:#94a3b8;">${attempts.length}</td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function askDeleteLesson(id) {
  lessonToDeleteId = id;
  const lessons = Storage.get('my_lessons', {});
  const title = lessons[id] ? lessons[id].title : '';
  document.getElementById('delete-message').textContent = `Вы действительно хотите удалить лекцию "${title}"?`;
  openModal('delete-modal');
}
function closeDeleteModal() {
  closeModal('delete-modal');
  lessonToDeleteId = null;
}

function setupDeleteConfirm() {
  const btn = document.getElementById('confirm-delete-btn');
  if (!btn) return;
  btn.onclick = () => {
    if (lessonToDeleteId) {
      const id = lessonToDeleteId;

      const lessons = Storage.get('my_lessons', {});
      delete lessons[id];
      Storage.set('my_lessons', lessons);

      const groups = Storage.get('groups', {});
      let groupsChanged = false;
      Object.values(groups).forEach(g => {
        if (Array.isArray(g.lessonIds) && g.lessonIds.includes(id)) {
          g.lessonIds = g.lessonIds.filter(x => x !== id);
          groupsChanged = true;
        }
      });
      if (groupsChanged) Storage.set('groups', groups);

      const progress = Storage.get('last_reading_progress', {});
      let progressChanged = false;
      Object.keys(progress).forEach(userKey => {
        if (progress[userKey] && progress[userKey][id]) {
          delete progress[userKey][id];
          progressChanged = true;
        }
      });
      if (progressChanged) Storage.set('last_reading_progress', progress);

      const results = Storage.get('test_results', []);
      const filtered = results.filter(r => r.lessonId !== id);
      if (filtered.length !== results.length) Storage.set('test_results', filtered);

      const favorites = Storage.get('favorites', {});
      let favChanged = false;
      Object.keys(favorites).forEach(userKey => {
        if (Array.isArray(favorites[userKey])) {
          const before = favorites[userKey].length;
          favorites[userKey] = favorites[userKey].filter(x => x !== id);
          if (favorites[userKey].length !== before) favChanged = true;
        }
      });
      if (favChanged) Storage.set('favorites', favorites);

      renderLessons();
    }
    closeDeleteModal();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  setupDeleteConfirm();
  renderLessons();
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted && typeof renderLessons === 'function') renderLessons();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof renderLessons === 'function') renderLessons();
});

window.addEventListener('dataSynced', () => {
  if (typeof renderLessons === 'function') renderLessons();
});