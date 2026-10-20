/* ============================================================
   GROUPS — управление группами
   ============================================================ */

let groups = {};
let currentGroupId = null;
let currentGroupTab = 'lessons';
let tempAssignedLessons = [];
let groupQrCurrentUrl = '';

let __lessonsCache = null;
function getLessonsCached() {
  if (!__lessonsCache) __lessonsCache = Storage.get('my_lessons', {});
  return __lessonsCache;
}
function invalidateLessonsCache() { __lessonsCache = null; }

/* ---------- Генерация кода и id ---------- */
function generateGroupCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 3; i++) part1 += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 3; i++) part2 += digits[Math.floor(Math.random() * digits.length)];
  return part1 + '-' + part2;
}
function generateGroupId() {
  return 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function loadGroups() { groups = Storage.get('groups', {}); }
function saveGroups() { Storage.set('groups', groups); }

function isTeacher() {
  const user = getCurrentUser();
  return user && user.role === 'Преподаватель';
}
function isStudent() {
  const user = getCurrentUser();
  return user && user.role === 'Студент';
}
function isAdmin() {
  const user = getCurrentUser();
  return user && user.role === 'Администратор';
}

function cleanupBrokenLessonIds(group) {
  if (!group || !Array.isArray(group.lessonIds)) return false;
  const allLessons = getLessonsCached();
  const before = group.lessonIds.length;
  group.lessonIds = group.lessonIds.filter(id =>
    id && typeof id === 'string' && allLessons[id]
  );
  return group.lessonIds.length !== before;
}

/* ============================================================
   РЕНДЕР ГЛАВНОЙ СТРАНИЦЫ
   ============================================================ */
function renderGroupsPage() {
  const user = getCurrentUser();
  const listEl = document.getElementById('groups-list');
  const joinBox = document.getElementById('join-box');
  const headerActions = document.getElementById('header-actions');

  if (!user) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🔐</div>
      <h3>Войдите в систему</h3>
      <p>Чтобы просматривать группы, нужно авторизоваться.</p>
    </div>`;
    joinBox.style.display = 'none';
    headerActions.innerHTML = '';
    return;
  }

  joinBox.style.display = 'block';

  if (isTeacher() || isAdmin()) {
    headerActions.innerHTML = `<button class="btn-create" onclick="openCreateGroupModal()">+ Создать группу</button>`;
  } else {
    headerActions.innerHTML = '';
  }

  let myGroups = [];
  if (isAdmin()) {
    myGroups = Object.values(groups);
  } else if (isTeacher()) {
    myGroups = Object.values(groups).filter(g =>
      g.teacherEmail === user.email ||
      (Array.isArray(g.members) && g.members.some(m => m.email === user.email))
    );
  } else {
    myGroups = Object.values(groups).filter(g =>
      Array.isArray(g.members) && g.members.some(m => m.email === user.email)
    );
  }

  if (myGroups.length === 0) {
    let emptyMsg = '';
    if (isTeacher() || isAdmin()) {
      emptyMsg = `<div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <h3>У вас пока нет групп</h3>
        <p>Создайте первую группу и пригласите учеников по коду.</p>
      </div>`;
    } else {
      emptyMsg = `<div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <h3>У вас пока нет групп</h3>
        <p>Введите код группы, который выдал преподаватель, в поле выше.</p>
      </div>`;
    }
    listEl.innerHTML = emptyMsg;
    return;
  }

  myGroups.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  listEl.innerHTML = '';
  myGroups.forEach(g => {
    const card = document.createElement('div');
    card.className = 'group-card';

    const membersCount = Array.isArray(g.members) ? g.members.length : 0;
    const lessonsCount = Array.isArray(g.lessonIds) ? g.lessonIds.length : 0;

    const isOwner = (g.teacherEmail === user.email) || isAdmin();
    const isMember = Array.isArray(g.members) && g.members.some(m => m.email === user.email);

    let actionsHtml = '';
    if (isOwner) {
      actionsHtml = `
        <button class="btn-sm btn-sm-primary" onclick="openGroupDetails('${escapeAttr(g.id)}')">Открыть</button>
        <button class="btn-sm" onclick="openAssignLessons('${escapeAttr(g.id)}')">📚 Лекции</button>
        <button class="btn-sm" onclick="openGroupQrModal('${escapeAttr(g.id)}', event)" title="QR-код группы">📱 QR</button>
        <button class="btn-sm btn-sm-danger" onclick="askDeleteGroup('${escapeAttr(g.id)}')">Удалить</button>
      `;
    } else if (isMember) {
      actionsHtml = `
        <button class="btn-sm btn-sm-primary" onclick="openGroupDetails('${escapeAttr(g.id)}')">Открыть</button>
        <button class="btn-sm" onclick="leaveGroup('${escapeAttr(g.id)}')">Выйти из группы</button>
      `;
    } else {
      actionsHtml = `<button class="btn-sm" onclick="openGroupDetails('${escapeAttr(g.id)}')">Открыть</button>`;
    }

    card.innerHTML = `
      <div class="group-card-header">
        <div class="group-card-name">${escapeHtml(g.name || 'Без названия')}</div>
        <div class="group-card-code">${escapeHtml(g.code || '')}</div>
      </div>
      <div class="group-card-desc">${escapeHtml(g.description || 'Без описания')}</div>
      <div class="group-card-stats">
        <div class="group-stat">
          <span class="group-stat-value">${membersCount}</span>
          <span class="group-stat-label">Учеников</span>
        </div>
        <div class="group-stat">
          <span class="group-stat-value">${lessonsCount}</span>
          <span class="group-stat-label">Лекций</span>
        </div>
      </div>
      <div class="group-card-actions">${actionsHtml}</div>
    `;
    listEl.appendChild(card);
  });
}

/* ============================================================
   СОЗДАНИЕ ГРУППЫ
   ============================================================ */
function openCreateGroupModal() {
  document.getElementById('group-name').value = '';
  document.getElementById('group-desc').value = '';
  openModal('create-group-modal');
}
function createGroup() {
  const user = getCurrentUser();
  if (!user) return;
  const name = document.getElementById('group-name').value.trim();
  const description = document.getElementById('group-desc').value.trim();
  if (!name) { showToast('Введите название группы', true); return; }

  let code;
  let attempts = 0;
  do {
    code = generateGroupCode();
    attempts++;
  } while (Object.values(groups).some(g => g.code === code) && attempts < 100);

  const groupId = generateGroupId();
  const today = new Date().toISOString().split('T')[0];

  groups[groupId] = {
    id: groupId, name, description, code,
    teacherEmail: user.email || '',
    teacherName: user.fio || 'Не указан',
    createdAt: today, members: [], lessonIds: []
  };

  saveGroups();
  closeModal('create-group-modal');
  showToast('Группа создана! Код: ' + code);
  renderGroupsPage();
}

/* ============================================================
   ВСТУПЛЕНИЕ ПО КОДУ
   ============================================================ */
function joinGroupByCode() {
  const user = getCurrentUser();
  if (!user) { showToast('Войдите в систему', true); return; }
  const input = document.getElementById('join-code-input');
  const code = input.value.trim().toUpperCase();
  if (!code) { showToast('Введите код группы', true); return; }

  const group = Object.values(groups).find(g => g.code === code);
  if (!group) { showToast('Группа с таким кодом не найдена', true); return; }
  if (Array.isArray(group.members) && group.members.some(m => m.email === user.email)) {
    showToast('Вы уже состоите в этой группе', true);
    return;
  }

  group.members = group.members || [];
  group.members.push({
    email: user.email || '',
    fio: user.fio || 'Не указан',
    joinedAt: new Date().toISOString().split('T')[0]
  });

  saveGroups();

  // XP за вступление в группу
  if (typeof Achievements !== 'undefined' && user.email) {
    Achievements.addXP(15, user.email);
    Achievements.checkAchievements(user.email);
  }

  input.value = '';
  showToast('Вы вступили в группу «' + group.name + '»');
  renderGroupsPage();
}

function leaveGroup(groupId) {
  const user = getCurrentUser();
  if (!user) return;
  const group = groups[groupId];
  if (!group) return;

  showConfirm('Выйти из группы «' + group.name + '»?', () => {
    group.members = (group.members || []).filter(m => m.email !== user.email);
    saveGroups();
    showToast('Вы вышли из группы');
    renderGroupsPage();
  });
}

/* ============================================================
   ДЕТАЛИ ГРУППЫ
   ============================================================ */
function openGroupDetails(groupId) {
  const group = groups[groupId];
  if (!group) return;

  currentGroupId = groupId;
  currentGroupTab = 'lessons';
  invalidateLessonsCache();
  if (cleanupBrokenLessonIds(group)) saveGroups();

  document.getElementById('group-details-title').textContent = group.name;
  const membersCount = (group.members || []).length;
  const lessonsCount = (group.lessonIds || []).length;

  document.getElementById('group-details-info').innerHTML = `
    <div>
      <span class="label">Код группы</span>
      <span class="value" style="font-family: monospace; letter-spacing: 1px; color: #a5b4fc;">${escapeHtml(group.code)}</span>
    </div>
    <div>
      <span class="label">Преподаватель</span>
      <span class="value">${escapeHtml(group.teacherName || 'Не указан')}</span>
    </div>
    <div>
      <span class="label">Учеников</span>
      <span class="value">${membersCount}</span>
    </div>
    <div>
      <span class="label">Лекций</span>
      <span class="value">${lessonsCount}</span>
    </div>
    <div>
      <span class="label">Создана</span>
      <span class="value">${formatDate(group.createdAt)}</span>
    </div>
  `;

  setGroupTab('lessons');
  openModal('group-details-modal');
}

function setGroupTab(tab) {
  currentGroupTab = tab;
  document.getElementById('gtab-lessons').classList.toggle('active', tab === 'lessons');
  document.getElementById('gtab-members').classList.toggle('active', tab === 'members');
  document.getElementById('gtab-results').classList.toggle('active', tab === 'results');

  const group = groups[currentGroupId];
  if (!group) return;
  const content = document.getElementById('group-tab-content');

  if (tab === 'lessons') renderGroupLessonsTab(group, content);
  else if (tab === 'members') renderGroupMembersTab(group, content);
  else if (tab === 'results') renderGroupResultsTab(group, content);
}

/* ---------- Лекции ---------- */
function renderGroupLessonsTab(group, content) {
  const allLessons = getLessonsCached();
  const lessonIds = group.lessonIds || [];

  if (lessonIds.length === 0) {
    content.innerHTML = `<div class="modal-list-empty">Пока не назначено ни одной лекции</div>`;
    return;
  }

  const user = getCurrentUser();
  const isOwner = user && (group.teacherEmail === user.email || user.role === 'Администратор');
  const isMember = user && (group.members || []).some(m => m.email === user.email);

  content.innerHTML = '<div class="modal-list"></div>';
  const listEl = content.querySelector('.modal-list');

  lessonIds.forEach(id => {
    const lesson = allLessons[id];
    const item = document.createElement('div');
    item.className = 'modal-list-item';

    if (!lesson) {
      item.innerHTML = `
        <div>
          <div class="item-title" style="color: #f87171;">Лекция не найдена</div>
          <div class="item-meta">ID: ${escapeHtml(id)}</div>
        </div>
        <div class="item-actions">
          ${isOwner ? `<button class="btn-sm btn-sm-danger" onclick="removeLessonFromGroup('${escapeAttr(group.id)}', '${escapeAttr(id)}')">Убрать</button>` : ''}
        </div>
      `;
      listEl.appendChild(item);
      return;
    }

    let actions = '';
    if (isOwner || isMember) {
      actions += `<a href="lesson.html?id=${encodeURIComponent(id)}" class="btn-sm btn-sm-primary">Открыть</a>`;
    }
    if (isOwner) {
      actions += ` <button class="btn-sm btn-sm-danger" onclick="removeLessonFromGroup('${escapeAttr(group.id)}', '${escapeAttr(id)}')">Убрать</button>`;
    }
    item.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(lesson.title)}</div>
        <div class="item-meta">${escapeHtml(lesson.subject || 'Без предмета')} · ${formatDate(lesson.createdAt)}</div>
      </div>
      <div class="item-actions">${actions}</div>
    `;
    listEl.appendChild(item);
  });
}

function removeLessonFromGroup(groupId, lessonId) {
  const group = groups[groupId];
  if (!group) return;
  showConfirm('Убрать лекцию из группы?', () => {
    group.lessonIds = (group.lessonIds || []).filter(id => id !== lessonId);
    saveGroups();
    invalidateLessonsCache();
    showToast('Лекция убрана из группы');
    openGroupDetails(groupId);
    renderGroupsPage();
  });
}

/* ---------- Ученики с прогрессом ---------- */
function renderGroupMembersTab(group, content) {
  const members = group.members || [];
  const lessonIds = group.lessonIds || [];

  if (members.length === 0) {
    content.innerHTML = `<div class="modal-list-empty">В группе пока нет учеников</div>`;
    return;
  }

  const user = getCurrentUser();
  const isOwner = user && (group.teacherEmail === user.email || user.role === 'Администратор');

  content.innerHTML = '<div class="modal-list"></div>';
  const listEl = content.querySelector('.modal-list');

  members.forEach(m => {
    const item = document.createElement('div');
    item.className = 'modal-list-item';

    let progressHtml = '';
    if (lessonIds.length > 0) {
      let read = 0;
      lessonIds.forEach(id => {
        const p = getReadingProgress(id, m.email);
        const s = computeReadState(p);
        if (s.state === 'done') read++;
      });
      const percent = Math.round(read / lessonIds.length * 100);
      progressHtml = `
        <div class="member-progress" title="Прочитано ${read} из ${lessonIds.length}">
          <div class="member-progress-bar">
            <div class="member-progress-fill" style="width: ${percent}%"></div>
          </div>
          <span class="member-progress-text">${read}/${lessonIds.length}</span>
        </div>
      `;
    }

    let removeBtn = '';
    if (isOwner) {
      removeBtn = `<button class="btn-sm btn-sm-danger" onclick="kickMember('${escapeAttr(group.id)}', '${escapeAttr(m.email)}')">Исключить</button>`;
    }

    item.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div class="item-title">${escapeHtml(m.fio)}</div>
        <div class="item-meta">${escapeHtml(m.email)} · в группе с ${formatDate(m.joinedAt)}</div>
        ${progressHtml}
      </div>
      <div class="item-actions">${removeBtn}</div>
    `;
    listEl.appendChild(item);
  });
}

function kickMember(groupId, email) {
  const group = groups[groupId];
  if (!group) return;
  showConfirm('Исключить ученика из группы?', () => {
    group.members = (group.members || []).filter(m => m.email !== email);
    saveGroups();
    showToast('Ученик исключён');
    setGroupTab('members');
    renderGroupsPage();
  });
}

/* ---------- Результаты ---------- */
function renderGroupResultsTab(group, content) {
  const lessonIds = group.lessonIds || [];
  const members = group.members || [];

  if (lessonIds.length === 0 || members.length === 0) {
    content.innerHTML = `<div class="modal-list-empty">Недостаточно данных: нет лекций или учеников</div>`;
    return;
  }

  content.innerHTML = `
    <div class="filter-bar">
      <span style="font-size: 13px; color: var(--text-muted);">Фильтр по дате:</span>
      <input type="date" id="group-results-date-filter" onchange="applyGroupResultsFilter('${escapeAttr(group.id)}')">
      <button type="button" class="btn-sm" onclick="resetGroupResultsFilter('${escapeAttr(group.id)}')">Сбросить</button>
      <button type="button" class="btn-sm btn-sm-danger" style="margin-left:auto;" onclick="resetGroupProgress('${escapeAttr(group.id)}')">Сбросить прогресс</button>
    </div>
    <div id="group-results-table-container"></div>
  `;

  applyGroupResultsFilter(group.id);
}

function applyGroupResultsFilter(groupId) {
  const group = groups[groupId];
  if (!group) return;

  const container = document.getElementById('group-results-table-container');
  if (!container) return;

  const dateFilter = document.getElementById('group-results-date-filter')?.value || '';
  const allResults = Storage.get('test_results', []);
  const lessonIds = group.lessonIds || [];
  const members = group.members || [];

  const memberEmails = members.map(m => (m.email || '').toLowerCase().trim());
  const memberFios = members.map(m => (m.fio || '').toLowerCase().trim());

  let relevant = allResults.filter(r => {
    if (!lessonIds.includes(r.lessonId)) return false;
    const rEmail = (r.userEmail || '').toLowerCase().trim();
    const rFio = (r.fio || '').toLowerCase().trim();
    if (rEmail && memberEmails.includes(rEmail)) return true;
    if (rFio && memberFios.includes(rFio)) return true;
    return false;
  });

  if (dateFilter) {
    relevant = relevant.filter(r => r.isoDate === dateFilter || (r.date && r.date.includes(dateFilter)));
  }

  if (relevant.length === 0) {
    container.innerHTML = `<div class="modal-list-empty">${dateFilter ? 'На эту дату результатов нет.' : 'Ученики ещё не проходили тесты'}</div>`;
    return;
  }

  relevant.sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));

  let html = `
    <div style="max-height: 400px; overflow-y: auto;">
      <table class="results-table">
        <thead>
          <tr><th>Ученик</th><th>Лекция</th><th>Результат</th><th>Оценка</th><th>Дата</th></tr>
        </thead>
        <tbody>
  `;

  relevant.forEach(r => {
    const gradeClass = 'grade-' + r.grade;
    let studentHtml = escapeHtml(r.fio);
    if (r.userEmail) {
      const userExists = Storage.get('usersDB', []).some(u => u.email === r.userEmail);
      if (userExists) {
        studentHtml = `<span class="clickable-student" onclick="openStudentProfile('${escapeAttr(r.userEmail)}', '${escapeAttr(r.fio)}')">${escapeHtml(r.fio)}</span>`;
      }
    }
    html += `
      <tr>
        <td>${studentHtml}</td>
        <td>${escapeHtml(r.lessonTitle)}</td>
        <td>${r.score} (${r.percent}%)</td>
        <td class="grade ${gradeClass}">${r.grade}</td>
        <td style="font-size: 11px; color: #94a3b8;">${r.date}</td>
      </tr>
    `;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function resetGroupResultsFilter(groupId) {
  const dateInput = document.getElementById('group-results-date-filter');
  if (dateInput) dateInput.value = '';
  applyGroupResultsFilter(groupId);
}

function resetGroupProgress(groupId) {
  const group = groups[groupId];
  if (!group) return;
  const members = group.members || [];
  const lessonIds = group.lessonIds || [];
  if (members.length === 0 || lessonIds.length === 0) {
    showToast('Некуда сбрасывать', true);
    return;
  }

  showConfirm(
    `Сбросить прогресс чтения у ${members.length} учеников по ${lessonIds.length} лекциям?`,
    () => {
      const all = Storage.get('last_reading_progress', {});
      let changed = false;
      members.forEach(m => {
        const email = (m.email || '').toLowerCase().trim();
        if (!email || !all[email]) return;
        lessonIds.forEach(id => {
          if (all[email][id]) { delete all[email][id]; changed = true; }
        });
      });
      if (changed) Storage.set('last_reading_progress', all);
      showToast('Прогресс группы сброшен');
    }
  );
}

/* ---------- Профиль ученика ---------- */
function openStudentProfile(email, fallbackFio) {
  const usersDB = Storage.get('usersDB', []);
  const user = usersDB.find(u => u.email === email);
  const container = document.getElementById('student-profile-details');

  if (!user) {
    container.innerHTML = `
      <div><strong>ФИО:</strong> ${escapeHtml(fallbackFio)}</div>
      <div style="color: #94a3b8;">Учетная запись не найдена.</div>
    `;
  } else {
    container.innerHTML = `
      <div><strong>ФИО:</strong> ${escapeHtml(user.fio)}</div>
      <div><strong>Email:</strong> ${escapeHtml(user.email)}</div>
      <div><strong>Телефон:</strong> ${escapeHtml(user.phone || 'Не указан')}</div>
      <div><strong>Роль:</strong> ${escapeHtml(user.role)}</div>
      <div><strong>Дата регистрации:</strong> ${user.createdAt || 'Не указана'}</div>
    `;
  }
  openModal('student-profile-modal');
}

/* ============================================================
   НАЗНАЧЕНИЕ ЛЕКЦИЙ
   ============================================================ */
function openAssignLessons(groupId) {
  const group = groups[groupId];
  if (!group) { showToast('Группа не найдена', true); return; }

  currentGroupId = groupId;
  tempAssignedLessons = [...(group.lessonIds || [])];

  const user = getCurrentUser();
  const allLessons = getLessonsCached();

  let availableLessons = Object.entries(allLessons).map(([id, lesson]) => ({ id, ...lesson }));

  if (user && user.role !== 'Администратор') {
    availableLessons = availableLessons.filter(l =>
      l.authorEmail === user.email || l.author === user.fio
    );
  }

  if (availableLessons.length === 0) {
    document.getElementById('assign-lessons-list').innerHTML =
      `<div class="modal-list-empty">У вас пока нет созданных лекций</div>`;
    openModal('assign-lessons-modal');
    return;
  }

  availableLessons.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  let html = '';
  availableLessons.forEach(l => {
    const checked = tempAssignedLessons.includes(l.id) ? 'checked' : '';
    html += `
      <label class="assign-item" data-lesson-id="${escapeHtml(l.id)}">
        <input type="checkbox" value="${escapeHtml(l.id)}" ${checked}>
        <span class="assign-item-label">
          ${escapeHtml(l.title)}
          ${l.subject ? `<span class="assign-item-subject">${escapeHtml(l.subject)}</span>` : ''}
        </span>
      </label>
    `;
  });

  const listEl = document.getElementById('assign-lessons-list');
  listEl.innerHTML = html;
  listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', function () { toggleAssignedLesson(this.value, this.checked); });
  });

  openModal('assign-lessons-modal');
}

function toggleAssignedLesson(lessonId, checked) {
  if (checked) {
    if (!tempAssignedLessons.includes(lessonId)) tempAssignedLessons.push(lessonId);
  } else {
    tempAssignedLessons = tempAssignedLessons.filter(id => id !== lessonId);
  }
}

function saveAssignedLessons() {
  if (!currentGroupId) { showToast('Группа не выбрана', true); return; }
  const group = groups[currentGroupId];
  if (!group) { showToast('Группа не найдена', true); return; }

  group.lessonIds = [...tempAssignedLessons];
  saveGroups();
  closeModal('assign-lessons-modal');
  showToast('Лекции назначены: ' + group.lessonIds.length);
  renderGroupsPage();
}

/* ============================================================
   УДАЛЕНИЕ ГРУППЫ
   ============================================================ */
function askDeleteGroup(groupId) {
  const group = groups[groupId];
  if (!group) return;
  showConfirm('Удалить группу «' + group.name + '»? Это действие нельзя отменить.', () => {
    delete groups[groupId];
    saveGroups();
    showToast('Группа удалена');
    renderGroupsPage();
  });
}

/* ============================================================
   QR-КОД ГРУППЫ
   ============================================================ */
function openGroupQrModal(groupId, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const group = groups[groupId];
  if (!group) return;

  const url = `${window.location.origin}${window.location.pathname.replace('groups.html', '')}groups.html?join=${encodeURIComponent(group.code)}`;
  groupQrCurrentUrl = url;

  document.getElementById('group-qr-title').textContent = group.name;
  document.getElementById('group-qr-url').textContent = url;
  document.getElementById('group-qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;
  openModal('group-qr-modal');
}

function closeGroupQrModal() { closeModal('group-qr-modal'); }

function copyGroupQrLink() {
  if (!groupQrCurrentUrl) return;
  navigator.clipboard.writeText(groupQrCurrentUrl).then(() => showToast('Ссылка скопирована!'));
}

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadGroups();
  renderGroupsPage();

  const codeInput = document.getElementById('join-code-input');
  if (codeInput) {
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinGroupByCode();
    });
  }

  const joinParam = new URLSearchParams(window.location.search).get('join');
  if (joinParam && codeInput) {
    codeInput.value = joinParam.toUpperCase();
    setTimeout(() => codeInput.focus(), 200);
  }
});