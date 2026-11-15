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

const BACKUP_KEYS = [
  'my_lessons',
  'test_results',
  'groups',
  'usersDB',
  'favorites',
  'last_reading_progress',
  'glossary',
  'user_achievements',
  'user_xp'
];

function exportAllData() {
  const payload = {
    __format: 'eduplatform-backup',
    __version: 1,
    exportedAt: new Date().toISOString(),
    data: {}
  };

  BACKUP_KEYS.forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try { payload.data[key] = JSON.parse(raw); }
      catch (e) { payload.data[key] = raw; }
    }
  });

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  const stamp = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `eduplatform-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast('Файл сохранён');
}

function handleImportFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch (err) {
      showToast('Некорректный JSON-файл', true);
      input.value = '';
      return;
    }

    if (!parsed || parsed.__format !== 'eduplatform-backup' || !parsed.data) {
      showToast('Это не файл бэкапа EduPlatform', true);
      input.value = '';
      return;
    }

    const stat = [];
    BACKUP_KEYS.forEach(key => {
      const v = parsed.data[key];
      if (v === undefined) return;
      if (Array.isArray(v)) stat.push(`${key}: ${v.length}`);
      else if (v && typeof v === 'object') stat.push(`${key}: ${Object.keys(v).length}`);
    });

    const summary = stat.length ? stat.join(', ') : 'нет данных';
    const msg =
      `Импортировать бэкап от ${new Date(parsed.exportedAt || Date.now()).toLocaleString('ru-RU')}? ` +
      `Текущие данные в браузере будут перезаписаны. ` +
      `Содержимое: ${summary}`;

    showConfirm(msg, () => {
      try {
        BACKUP_KEYS.forEach(key => {
          if (parsed.data[key] === undefined) return;
          localStorage.setItem(key, JSON.stringify(parsed.data[key]));
        });
        showToast('Данные импортированы. Перезагрузка...');
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        showToast('Не удалось записать данные: возможно, превышен лимит хранилища', true);
      }
    });

    input.value = '';
  };
  reader.onerror = () => {
    showToast('Не удалось прочитать файл', true);
    input.value = '';
  };
  reader.readAsText(file);
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