/* ============================================================
   PROFILE — логика страницы профиля
   ============================================================ */

let usersDB = [];

function updateUI() {
  const user = getCurrentUser();
  if (!user) return;

  const name  = user.fio || user.name || 'Пользователь';
  const email = user.email || 'Не указан';
  const phone = user.phone || 'Не указан';
  const role  = user.role || 'Преподаватель';

  // Безопасное обновление элементов (проверяем, существует ли элемент)
  const elProfileName = document.getElementById('profile-name') || document.getElementById('profile-fio');
  if (elProfileName) elProfileName.textContent = name;

  const elProfileRole = document.getElementById('profile-role');
  if (elProfileRole) elProfileRole.textContent = role;

  const elInfoName = document.getElementById('info-name');
  if (elInfoName) elInfoName.textContent = name;

  const elInfoEmail = document.getElementById('info-email') || document.getElementById('profile-email');
  if (elInfoEmail) elInfoEmail.textContent = email;

  const elInfoPhone = document.getElementById('info-phone');
  if (elInfoPhone) elInfoPhone.textContent = phone;

  const elAvatarLetter = document.getElementById('avatar-letter') || document.getElementById('profile-avatar');
  if (elAvatarLetter) elAvatarLetter.textContent = name.charAt(0).toUpperCase();

  // Заполнение полей для редактирования (если они есть в HTML)
  const elEditName = document.getElementById('edit-name');
  if (elEditName) elEditName.value = name;

  const elEditEmail = document.getElementById('edit-email');
  if (elEditEmail) elEditEmail.value = email;

  const elEditPhone = document.getElementById('edit-phone');
  if (elEditPhone) elEditPhone.value = phone === 'Не указан' ? '' : phone;

  // Рендер достижений
  if (typeof Achievements !== 'undefined') {
    Achievements.checkAchievements(user.email);
    Achievements.renderXPWidget('xp-widget-container');
    Achievements.renderAchievementsGrid('achievements-container', user.email);
  }
}

// Безопасное переключение режимов (если вдруг их нет в HTML — ничего не сломается)
function enableEdit() {
  const view = document.getElementById('view-mode');
  const edit = document.getElementById('edit-mode');
  if (view) view.style.display = 'none';
  if (edit) edit.style.display = 'block';
}

function disableEdit() {
  const view = document.getElementById('view-mode');
  const edit = document.getElementById('edit-mode');
  if (edit) edit.style.display = 'none';
  if (view) view.style.display = 'block';
}

function saveProfile() {
  const user = getCurrentUser();
  if (!user) return;

  const newName  = document.getElementById('edit-name')?.value.trim();
  const newEmail = document.getElementById('edit-email')?.value.trim();
  const newPhone = document.getElementById('edit-phone')?.value.trim();

  if (!newName || !newEmail) {
    showToast('Имя и Email обязательны для заполнения!', true);
    return;
  }

  const oldEmail = user.email;
  user.fio   = newName;
  user.name  = newName;
  user.email = newEmail;
  user.phone = newPhone;
  saveCurrentUser(user);

  usersDB = Storage.get('usersDB', []);
  const idx = usersDB.findIndex(u => u.email === oldEmail || u.email === newEmail);
  if (idx !== -1) {
    usersDB[idx] = { ...usersDB[idx], fio: newName, email: newEmail, phone: newPhone };
    Storage.set('usersDB', usersDB);
  }

  updateUI();
  disableEdit();

  if (typeof refreshAuthUI === 'function') refreshAuthUI();

  showToast('Профиль сохранён');
}

document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  usersDB = Storage.get('usersDB', []);
  updateUI();
});

// Если данные долетели с сервера — обновляем страницу
window.addEventListener('dataSynced', () => {
  if (typeof refreshAuthUI === 'function') refreshAuthUI();
  if (typeof updateUI === 'function') updateUI();
});