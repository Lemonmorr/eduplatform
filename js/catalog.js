/* ============================================================
   CATALOG — логика index.html
   ============================================================ */

let lessons = {};
let catalogTab = 'all';
let subjectFilter = '';
let tagFilter = '';
let qrCurrentUrl = '';

const debouncedRenderCatalog = debounce(() => renderCatalog(), 150);

function getMyGroupLessonIds() {
  const user = getCurrentUser();
  if (!user) return [];
  const groups = Storage.get('groups', {});
  const ids = new Set();
  Object.values(groups).forEach(g => {
    const isMember  = Array.isArray(g.members) && g.members.some(m => m.email === user.email);
    const isTeacher = g.teacherEmail && g.teacherEmail === user.email;
    if (isMember || isTeacher) {
      (g.lessonIds || []).forEach(id => {
        if (id && typeof id === 'string') ids.add(id);
      });
    }
  });
  return Array.from(ids);
}

function isLessonInMyGroups(lessonId) {
  return getMyGroupLessonIds().includes(lessonId);
}

function setCatalogTab(tab) {
  catalogTab = tab;
  document.getElementById('tab-all').classList.toggle('active', tab === 'all');
  document.getElementById('tab-fav').classList.toggle('active', tab === 'fav');
  const groupsTab = document.getElementById('tab-groups');
  if (groupsTab) groupsTab.classList.toggle('active', tab === 'groups');

  const filtersPanel = document.getElementById('filters-panel');
  const subjectsBar = document.getElementById('subjects-bar');
  const tagsBar = document.getElementById('tags-bar');
  if (tab === 'groups') {
    if (filtersPanel) filtersPanel.style.display = 'none';
    if (subjectsBar) subjectsBar.style.display = 'none';
    if (tagsBar) tagsBar.style.display = 'none';
  } else {
    if (filtersPanel) filtersPanel.style.display = '';
    if (subjectsBar) subjectsBar.style.display = '';
    if (tagsBar) tagsBar.style.display = '';
  }
  renderCatalog();
}

function setSubjectFilter(s) {
  subjectFilter = (subjectFilter === s) ? '' : s;
  const sel = document.getElementById('filter-subject');
  if (sel) sel.value = subjectFilter;
  renderCatalog();
}
function onSubjectSelectChange() {
  subjectFilter = document.getElementById('filter-subject').value;
  renderCatalog();
}
function setTagFilter(t) {
  tagFilter = (tagFilter === t) ? '' : t;
  renderCatalog();
}

function expandFilters() {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;
  panel.classList.add('expanded');
  const input = document.getElementById('search-input');
  if (input) input.focus();
}
function toggleFiltersPanel() {
  const panel = document.getElementById('filters-panel');
  panel.classList.toggle('expanded');
  if (panel.classList.contains('expanded')) {
    const input = document.getElementById('search-input');
    if (input) input.focus();
  }
}
document.addEventListener('click', (e) => {
  const panel = document.getElementById('filters-panel');
  if (!panel) return;
  if (!panel.contains(e.target)) {
    const searchEl = document.getElementById('search-input');
    const subjEl   = document.getElementById('filter-subject');
    const dateEl   = document.getElementById('filter-date');
    const authEl   = document.getElementById('filter-author');
    const hasActive =
      (searchEl && searchEl.value) ||
      (subjEl && subjEl.value) ||
      (dateEl && dateEl.value) ||
      (authEl && authEl.value);
    if (!hasActive) panel.classList.remove('expanded');
  }
});
function resetFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-subject').value = '';
  document.getElementById('filter-date').value = '';
  document.getElementById('filter-author').value = '';
  subjectFilter = '';
  tagFilter = '';
  renderCatalog();
}

function approveLesson(id) {
  lessons = Storage.get('my_lessons', {});
  if (lessons[id]) {
    lessons[id].status = 'approved';
    Storage.set('my_lessons', lessons);
    renderCatalog();
  }
}
function rejectLesson(id) {
  lessons = Storage.get('my_lessons', {});
  if (lessons[id]) {
    lessons[id].status = 'rejected';
    Storage.set('my_lessons', lessons);
    renderCatalog();
  }
}

function copyLessonLink(lessonId) {
  const base = window.location.href.replace(/[^/]*$/, '');
  const url = new URL('lesson.html?id=' + encodeURIComponent(lessonId), base).href;
  navigator.clipboard.writeText(url).then(() => showToast('Ссылка скопирована!'));
}
function openQrModal(lessonId, lessonTitle) {
  const base = window.location.href.replace(/[^/]*$/, '');
  const url = new URL('lesson.html?id=' + encodeURIComponent(lessonId), base).href;
  qrCurrentUrl = url;
  document.getElementById('qr-lesson-title').textContent = lessonTitle;
  document.getElementById('qr-url-text').textContent = url;
  document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;
  openModal('qr-modal');
}
function closeQrModal() { closeModal('qr-modal'); }
function copyQrLink() {
  if (!qrCurrentUrl) return;
  navigator.clipboard.writeText(qrCurrentUrl).then(() => showToast('Ссылка скопирована!'));
}

function getUniqueSubjects(validKeys) {
  const subjects = new Map();
  validKeys.forEach(id => {
    const s = lessons[id].subject && lessons[id].subject.trim();
    if (s) subjects.set(s, (subjects.get(s) || 0) + 1);
  });
  return subjects;
}
function renderSubjectsBar(validKeys) {
  const bar = document.getElementById('subjects-bar');
  if (!bar) return;
  const subjects = getUniqueSubjects(validKeys);
  if (subjects.size === 0) { bar.innerHTML = ''; return; }
  const arr = Array.from(subjects.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  
  // Используем data-атрибуты вместо inline onclick
  let html = `<span class="subject-chip ${subjectFilter === '' ? 'active' : ''}" data-subject="">Все предметы <span class="chip-count">${validKeys.length}</span></span>`;
  arr.forEach(([subj, count]) => {
    html += `<span class="subject-chip ${subjectFilter === subj ? 'active' : ''}" data-subject="${escapeHtml(subj)}">${escapeHtml(subj)} <span class="chip-count">${count}</span></span>`;
  });
  bar.innerHTML = html;
}

function renderTagsBar(validKeys) {
  const bar = document.getElementById('tags-bar');
  if (!bar) return;

  const tagCounts = new Map();
  validKeys.forEach(id => {
    (lessons[id].tags || []).forEach(t => {
      if (t) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    });
  });

  if (tagCounts.size === 0 && !tagFilter) { bar.innerHTML = ''; return; }

  const arr = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  let html = `<span class="tag-label">Теги:</span>`;
  if (tagFilter) {
    html = `<span class="subject-chip active" data-tag="${escapeHtml(tagFilter)}">#${escapeHtml(tagFilter)} ✕</span>`;
  }
  arr.forEach(([tag, count]) => {
    if (tag === tagFilter) return;
    html += `<span class="subject-chip" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)} <span class="chip-count">${count}</span></span>`;
  });
  bar.innerHTML = html;
}

function renderCatalog() {
  lessons = Storage.get('my_lessons', {});
  const searchInput = document.getElementById('search-input');
  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const dateFilter = document.getElementById('filter-date')?.value || '';
  const keys = Object.keys(lessons);
  const user = getCurrentUser();
  const isAdmin = user && user.role === 'Администратор';
  const isGroupsTab = (catalogTab === 'groups');

  const validKeys = keys.filter(id => {
    const item = lessons[id];
    if (item.status === 'rejected') return false;
    const isApproved = !item.status || item.status === 'approved' || isAdmin;
    const isPublic = !item.visibility || item.visibility === 'public';
    return isApproved && isPublic;
  });

  if (!isGroupsTab) {
    renderSubjectsBar(validKeys);
    renderTagsBar(validKeys);
  }

  const authorSelect = document.getElementById('filter-author');
  let authorFilter = '';
  if (authorSelect) {
    const prevAuthor = authorSelect.value;
    const authorSet = new Set();
    validKeys.forEach(id => authorSet.add(lessons[id].author || 'Не указан'));
    const authors = Array.from(authorSet).sort((a, b) => a.localeCompare(b, 'ru'));
    authorSelect.innerHTML = '<option value="">Все авторы</option>' +
      authors.map(a => `<option value="${escapeHtml(a)}"${a === prevAuthor ? ' selected' : ''}>${escapeHtml(a)}</option>`).join('');
    authorFilter = authorSelect.value;
  }

  const subjectSelect = document.getElementById('filter-subject');
  if (subjectSelect) {
    const prevSubject = subjectSelect.value;
    const subjectSet = new Set();
    validKeys.forEach(id => {
      const s = lessons[id].subject && lessons[id].subject.trim();
      if (s) subjectSet.add(s);
    });
    const subjectsList = Array.from(subjectSet).sort((a, b) => a.localeCompare(b, 'ru'));
    subjectSelect.innerHTML = '<option value="">Все предметы</option>' +
      subjectsList.map(s => `<option value="${escapeHtml(s)}"${s === prevSubject ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
    const selectedSubjectValue = subjectSelect.value;
    if (selectedSubjectValue !== subjectFilter) subjectFilter = selectedSubjectValue;
  }

  const activeFiltersCount = (dateFilter ? 1 : 0) + (authorFilter ? 1 : 0) + (subjectFilter ? 1 : 0) + (tagFilter ? 1 : 0);
  const badge = document.getElementById('filters-badge');
  if (badge) {
    if (activeFiltersCount > 0) {
      badge.textContent = activeFiltersCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  const favCount = getMyFavCount();
  const favBadge = document.getElementById('fav-tab-count');
  if (favBadge) {
    if (favCount > 0) { favBadge.textContent = favCount; favBadge.style.display = 'inline-block'; }
    else { favBadge.style.display = 'none'; }
  }

  const groupLessonCount = getMyGroupLessonIds().length;
  const groupsBadge = document.getElementById('groups-tab-count');
  if (groupsBadge) {
    if (groupLessonCount > 0) {
      groupsBadge.textContent = groupLessonCount;
      groupsBadge.style.display = 'inline-block';
    } else {
      groupsBadge.style.display = 'none';
    }
  }

  const filteredKeys = validKeys.filter(id => {
    const item = lessons[id];

    if (isGroupsTab) return isLessonInMyGroups(id);

    if (searchQuery) {
      const hay = (
        (item.title || '') + ' ' +
        (item.content || '') + ' ' +
        (item.subject || '') + ' ' +
        (item.author || '') + ' ' +
        (item.tags || []).join(' ')
      ).toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    if (subjectFilter && (item.subject || '') !== subjectFilter) return false;
    if (tagFilter && !(item.tags || []).includes(tagFilter)) return false;
    if (authorFilter && (item.author || 'Не указан') !== authorFilter) return false;
    if (dateFilter && (item.createdAt || null) !== dateFilter) return false;
    if (catalogTab === 'fav' && !isFavorite(id)) return false;
    return true;
  });

  filteredKeys.sort((a, b) => {
    const da = lessons[a].createdAt || '';
    const db = lessons[b].createdAt || '';
    return db.localeCompare(da);
  });

  const container = document.getElementById('catalog-container');

  if (filteredKeys.length === 0) {
    let emptyMsg = 'Публичных лекций не найдено.';
    if (catalogTab === 'fav') emptyMsg = 'В избранном пока ничего нет. Добавляйте лекции звёздочкой ★.';
    else if (catalogTab === 'groups') emptyMsg = 'У вас пока нет лекций, назначенных группам. Вступите в группу по коду на странице «Группы».';
    else if (subjectFilter) emptyMsg = `По предмету «${escapeHtml(subjectFilter)}» ничего не найдено.`;
    else if (tagFilter) emptyMsg = `По тегу «#${escapeHtml(tagFilter)}» ничего не найдено.`;
    else if (searchQuery) emptyMsg = 'По вашему запросу ничего не найдено.';
    else if (dateFilter || authorFilter) emptyMsg = 'По заданным фильтрам ничего не найдено.';
    container.innerHTML = `<p style="color:#94a3b8; text-align:center; padding:30px 0;">${emptyMsg}</p>`;
    return;
  }

  container.innerHTML = '';
  filteredKeys.forEach(id => {
    const item = lessons[id];
    const authorName = item.author || item.authorName || item.creator || 'Не указан';
    const authorEmail = item.authorEmail || '';
    const isPending = item.status === 'pending';
    const isFav = isFavorite(id);

    const userKey = (user && user.email) ? user.email : 'guest';
    const progress = getReadingProgress(id, userKey);
    const { btnHtml: readButtonHtml, badgeHtml: readBadgeHtml } = buildReadButtonHtml(id, progress, {
      baseClass: 'btn-read',
      continueClass: 'btn-continue',
      defaultLabel: 'Читать'
    });

    const tagsHtml = (item.tags || []).slice(0, 3).map(t =>
      `<span class="card-tag" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`
    ).join('');

    // Безопасное описание
    const descText = item.desc || stripHtmlToPlain(item.content) || 'Без описания...';

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-body">
        <div class="card-header">
          <span class="card-title">${escapeHtml(item.title)}</span>
          ${readBadgeHtml}
          ${isPending ? '<span class="badge-pending">На модерации</span>' : ''}
          <span class="card-author ${isAdmin ? 'admin-clickable' : ''}" 
                ${isAdmin ? `data-author-email="${escapeHtml(authorEmail)}" data-author-name="${escapeHtml(authorName)}"` : ''}>
            Автор: ${escapeHtml(authorName)}
          </span>
        </div>
        <div class="card-meta-row">
          ${item.subject ? `<span class="card-subject">${escapeHtml(item.subject)}</span>` : ''}
          ${tagsHtml}
          <span class="card-views">👁 ${item.views || 0}</span>
        </div>
        <div class="card-desc">${escapeHtml(descText)}</div>
      </div>
      <div class="card-actions-vertical" data-id="${escapeHtml(id)}">
        ${isAdmin && isPending ? `
          <button class="btn-approve" data-action="approve">Одобрить</button>
          <button class="btn-reject" data-action="reject">Отклонить</button>
        ` : ''}
        ${readButtonHtml}
        <button class="btn-icon-sm ${isFav ? 'btn-fav-active' : ''}" data-action="fav" title="${isFav ? 'Удалить из избранного' : 'Добавить в избранное'}">
          ${isFav ? '★ Из избранного' : '☆ В избранное'}
        </button>
        <button class="btn-icon-sm" data-action="copy" title="Скопировать ссылку">🔗 Ссылка</button>
        <button class="btn-icon-sm" data-action="qr" data-title="${escapeHtml(item.title)}" title="QR-код">QR-код</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Делегирование событий каталога
document.addEventListener('DOMContentLoaded', () => {
  renderCatalog();

  const catalogContainer = document.getElementById('catalog-container');
  if (catalogContainer) {
    catalogContainer.addEventListener('click', (e) => {
      // Клик по автору (для админа)
      const authorEl = e.target.closest('[data-author-email]');
      if (authorEl) {
        viewAuthorDetails(authorEl.dataset.authorEmail, authorEl.dataset.authorName);
        return;
      }
      
      // Клик по тегу
      const tagEl = e.target.closest('.card-tag');
      if (tagEl) {
        setTagFilter(tagEl.dataset.tag);
        return;
      }

      // Клик по кнопкам действий
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      
      const action = actionBtn.dataset.action;
      const id = actionBtn.closest('[data-id]').dataset.id;
      
      if (action === 'approve') approveLesson(id);
      else if (action === 'reject') rejectLesson(id);
      else if (action === 'fav') toggleFavoriteFromCatalog(id, e);
      else if (action === 'copy') copyLessonLink(id);
      else if (action === 'qr') openQrModal(id, actionBtn.dataset.title);
    });
  }

  const subjectsBar = document.getElementById('subjects-bar');
  if (subjectsBar) {
    subjectsBar.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-subject]');
      if (chip) setSubjectFilter(chip.dataset.subject);
    });
  }

  const tagsBar = document.getElementById('tags-bar');
  if (tagsBar) {
    tagsBar.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-tag]');
      if (chip) setTagFilter(chip.dataset.tag);
    });
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted && typeof renderCatalog === 'function') renderCatalog();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof renderCatalog === 'function') renderCatalog();
});