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

  document.getElementById('profile-name').textContent  = name;
  document.getElementById('profile-role').textContent  = role;
  document.getElementById('info-name').textContent     = name;
  document.getElementById('info-email').textContent    = email;
  document.getElementById('info-phone').textContent    = phone;
  document.getElementById('avatar-letter').textContent = name.charAt(0).toUpperCase();

  document.getElementById('edit-name').value  = name;
  document.getElementById('edit-email').value = email;
  document.getElementById('edit-phone').value = phone === 'Не указан' ? '' : phone;

  if (typeof Achievements !== 'undefined') {
    Achievements.checkAchievements(user.email);
    Achievements.renderXPWidget('xp-widget-container');
    Achievements.renderAchievementsGrid('achievements-container', user.email);
  }
}

function enableEdit() {
  document.getElementById('view-mode').style.display = 'none';
  document.getElementById('edit-mode').style.display = 'block';
}

function disableEdit() {
  document.getElementById('edit-mode').style.display = 'none';
  document.getElementById('view-mode').style.display = 'block';
}

function saveProfile() {
  const user = getCurrentUser();
  if (!user) return;

  const newName  = document.getElementById('edit-name').value.trim();
  const newEmail = document.getElementById('edit-email').value.trim();
  const newPhone = document.getElementById('edit-phone').value.trim();

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