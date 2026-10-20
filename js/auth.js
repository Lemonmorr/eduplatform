/* ============================================================
   AUTH — регистрация, вход, профиль, выход, админ-панель
   ============================================================ */

const ADMIN_ACCOUNT = {
  fio: "Администратор Системы",
  email: "admin",
  password: "admin123",
  role: "Администратор"
};

function getCurrentUser() {
  return Storage.get('currentUser', null);
}
function saveCurrentUser(user) {
  Storage.set('currentUser', user);
}
function clearCurrentUser() {
  Storage.remove('currentUser');
}
function getUserKey() {
  const u = getCurrentUser();
  return (u && u.email) ? u.email : 'guest';
}

/* ---------- Регистрация ---------- */
function handleRegister(event) {
  event.preventDefault();
  const fio   = document.getElementById('reg-fio').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const pass  = document.getElementById('reg-password').value;
  const role  = document.getElementById('reg-role').value;

  if (email === ADMIN_ACCOUNT.email || (Storage.get('usersDB', [])).some(u => u.email === email)) {
    showAuthError('Пользователь с таким email уже существует');
    return;
  }

  const newUser = { fio, email, phone, password: pass, role, createdAt: localTodayISO(), isBanned: false };

  const users = Storage.get('usersDB', []);
  users.push(newUser);
  Storage.set('usersDB', users);

  saveCurrentUser(newUser);
  closeModal('auth-modal');
  refreshAuthUI();
  if (typeof renderCatalog === 'function') renderCatalog();
}

/* ---------- Вход ---------- */
function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;

  if ((email === ADMIN_ACCOUNT.email || email === 'admin@edu.ru') && pass === ADMIN_ACCOUNT.password) {
    saveCurrentUser(ADMIN_ACCOUNT);
    closeModal('auth-modal');
    refreshAuthUI();
    if (typeof renderCatalog === 'function') renderCatalog();
    return;
  }

  const users = Storage.get('usersDB', []);
  const user = users.find(u => u.email === email && u.password === pass);
  if (!user) { showAuthError('Неверный логин/email или пароль'); return; }
  if (user.isBanned) { showAuthError('Ваш аккаунт заблокирован администратором.'); return; }

  saveCurrentUser(user);
  closeModal('auth-modal');
  refreshAuthUI();
  if (typeof renderCatalog === 'function') renderCatalog();
}

function logout() {
  clearCurrentUser();
  window.location.href = 'index.html';
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.style.display = msg ? 'block' : 'none';
  el.textContent = msg || '';
}

function switchAuthTab(tab) {
  showAuthError('');
  const isLogin = tab === 'login';
  document.getElementById('tab-login-btn').classList.toggle('active', isLogin);
  document.getElementById('tab-register-btn').classList.toggle('active', !isLogin);
  document.getElementById('form-login').style.display = isLogin ? 'block' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none' : 'block';
}

function openAuthModal() {
  showAuthError('');
  switchAuthTab('login');
  openModal('auth-modal');
}
function closeAuthModal() { closeModal('auth-modal'); }

/* ---------- Навбар: аватар + меню ---------- */
function refreshAuthUI() {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;
  const user = getCurrentUser();

  if (!user || !user.fio) {
    authArea.innerHTML = `<button onclick="openAuthModal()" class="btn-login">Войти / Регистрация</button>`;
    return;
  }

  const firstLetter = user.fio.trim().charAt(0).toUpperCase() || 'U';
  const isAdmin = user.role === 'Администратор';

  authArea.innerHTML = `
    <div class="profile-wrapper">
      <button class="profile-avatar" id="avatar-btn" onclick="toggleProfileMenu()">${escapeHtml(firstLetter)}</button>
      <div class="dropdown-menu" id="dropdown-menu">
        <div class="user-info">
          <div class="user-name">${escapeHtml(user.fio)}</div>
          <div class="user-role">${escapeHtml(user.role || 'Преподаватель')}</div>
        </div>
        ${isAdmin ? `<button class="menu-item admin-link" onclick="openAdminModal()">Панель админа</button>` : ''}
        <a href="index.html" class="menu-item">Главная</a>
        <a href="profile.html" class="menu-item">Мой профиль</a>
        <a href="my-lessons.html" class="menu-item">Мои лекции</a>
        <a href="stats.html" class="menu-item">Статистика</a>
        <a href="groups.html" class="menu-item">Группы</a>
        <a href="teacher.html" class="menu-item">Создать лекцию</a>
        <button class="menu-item logout" onclick="logout()">Выйти</button>
      </div>
    </div>
  `;
}

function toggleProfileMenu() {
  const dm = document.getElementById('dropdown-menu');
  if (dm) dm.classList.toggle('active');
}

/* ============================================================
   АДМИН-ПАНЕЛЬ
   ============================================================ */
function openAdminModal() {
  const si = document.getElementById('admin-search-user');
  if (si) si.value = '';
  const dateEl = document.getElementById('admin-date-filter');
  if (dateEl) dateEl.value = '';
  renderAdminUsersList();
  openModal('admin-modal');
  toggleProfileMenu();
}
function closeAdminModal() { closeModal('admin-modal'); }

function resetAdminDateFilter() {
  const dateEl = document.getElementById('admin-date-filter');
  if (dateEl) dateEl.value = '';
  const si = document.getElementById('admin-search-user');
  if (si) si.value = '';
  renderAdminUsersList();
}

function renderAdminUsersList() {
  const container = document.getElementById('users-admin-list');
  if (!container) return;

  const users = Storage.get('usersDB', []);
  const dateEl = document.getElementById('admin-date-filter');
  const dateFilter = dateEl ? dateEl.value : '';
  const searchEl = document.getElementById('admin-search-user');
  const searchQuery = (searchEl && searchEl.value ? searchEl.value : '').toLowerCase().trim();

  let filtered = users;
  if (dateFilter) filtered = filtered.filter(u => u.createdAt === dateFilter);
  if (searchQuery) filtered = filtered.filter(u =>
    (u.fio && u.fio.toLowerCase().includes(searchQuery)) ||
    (u.email && u.email.toLowerCase().includes(searchQuery)) ||
    (u.phone && u.phone.toLowerCase().includes(searchQuery))
  );

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color:#94a3b8; font-size:13px; text-align:center; padding:10px;">${(dateFilter || searchQuery) ? 'Не найдено' : 'Пользователей нет'}</p>`;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(u => {
    const realIndex = users.findIndex(orig => orig.email === u.email);
    const item = document.createElement('div');
    item.className = 'user-item';
    item.innerHTML = `
      <div>
        <div style="font-weight:600; font-size:14px;">
          ${escapeHtml(u.fio)} <span style="color:#818cf8; font-size:11px;">(${escapeHtml(u.role)})</span>
          ${u.isBanned ? '<span class="badge-banned">Заблокирован</span>' : ''}
        </div>
        <div style="font-size:12px; color:#94a3b8;">
          ${escapeHtml(u.email)} ${u.phone ? '| ' + escapeHtml(u.phone) : ''} ${u.createdAt ? '| Дата: ' + u.createdAt : ''}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn ${u.isBanned ? 'btn-warning' : 'btn-secondary'}" style="font-size:12px; padding:6px 10px;" onclick="toggleBanUser(${realIndex})">
          ${u.isBanned ? 'Разбанить' : 'Забанить'}
        </button>
        <button class="btn btn-danger" style="font-size:12px; padding:6px 10px;" onclick="confirmDeleteUser(${realIndex})">Удалить</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function toggleBanUser(index) {
  const users = Storage.get('usersDB', []);
  if (users[index]) {
    users[index].isBanned = !users[index].isBanned;
    Storage.set('usersDB', users);
    renderAdminUsersList();
  }
}

function confirmDeleteUser(index) {
  const users = Storage.get('usersDB', []);
  const name = users[index] ? users[index].fio : '';
  showConfirm(`Удалить пользователя "${name}"?`, () => {
    const list = Storage.get('usersDB', []);
    list.splice(index, 1);
    Storage.set('usersDB', list);
    renderAdminUsersList();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  refreshAuthUI();
});

// Обновляем данные, когда сервер просыпается и отдает данные
window.addEventListener('dataSynced', () => {
  refreshAuthUI();
  const adminModal = document.getElementById('admin-modal');
  if (adminModal && adminModal.style.display === 'flex') {
    renderAdminUsersList();
  }
});