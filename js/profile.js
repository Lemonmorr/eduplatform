/* ============================================================
   PROFILE — логика страницы профиля
   ============================================================ */

let currentProfileUser = null;

// 1. Отрисовка данных профиля
function renderProfile() {
  currentProfileUser = getCurrentUser();
  if (!currentProfileUser) {
    window.location.href = 'index.html';
    return;
  }

  const user = currentProfileUser;
  const firstLetter = (user.fio || 'U').trim().charAt(0).toUpperCase();

  document.getElementById('avatar-letter').textContent = firstLetter;
  document.getElementById('profile-name').textContent = user.fio || 'Пользователь';
  document.getElementById('profile-role').textContent = user.role || 'Студент';

  document.getElementById('info-name').textContent = user.fio || '—';
  document.getElementById('info-email').textContent = user.email || '—';
  document.getElementById('info-phone').textContent = user.phone || 'Не указан';
}

// 2. Включение режима редактирования
function enableEdit() {
  if (!currentProfileUser) return;
  
  document.getElementById('edit-name').value = currentProfileUser.fio || '';
  document.getElementById('edit-email').value = currentProfileUser.email || '';
  document.getElementById('edit-phone').value = currentProfileUser.phone || '';

  document.getElementById('view-mode').style.display = 'none';
  document.getElementById('edit-mode').style.display = 'block';
}

// 3. Отмена редактирования
function disableEdit() {
  document.getElementById('edit-mode').style.display = 'none';
  document.getElementById('view-mode').style.display = 'block';
}

// 4. Сохранение профиля
function saveProfile() {
  if (!currentProfileUser) return;

  const newFio = document.getElementById('edit-name').value.trim();
  const newEmail = document.getElementById('edit-email').value.trim();
  const newPhone = document.getElementById('edit-phone').value.trim();

  if (!newFio || !newEmail) {
    showToast('Имя и Email не могут быть пустыми', true);
    return;
  }

  const oldEmail = currentProfileUser.email;

  // Проверка, не занят ли email другим пользователем
  const usersDB = Storage.get('usersDB', []);
  const emailExists = usersDB.some(u => u.email === newEmail && u.email !== oldEmail);
  
  if (emailExists) {
    showToast('Пользователь с таким Email уже существует', true);
    return;
  }

  // Обновляем данные в базе пользователей
  const userIndex = usersDB.findIndex(u => u.email === oldEmail);
  if (userIndex !== -1) {
    usersDB[userIndex].fio = newFio;
    usersDB[userIndex].email = newEmail;
    usersDB[userIndex].phone = newPhone;
    Storage.set('usersDB', usersDB);
  }

  // Если email изменился, переносим все данные (XP, достижения, прогресс)
  if (oldEmail !== newEmail) {
    // Перенос XP
    const xpData = getXPData();
    if (xpData[oldEmail]) {
      xpData[newEmail] = xpData[oldEmail];
      delete xpData[oldEmail];
      saveXPData(xpData);
    }
    
    // Перенос ачивок
    const achData = getAchievementsData();
    if (achData[oldEmail]) {
      achData[newEmail] = achData[oldEmail];
      delete achData[oldEmail];
      saveAchievementsData(achData);
    }

    // Перенос прогресса чтения
    const progress = Storage.get('last_reading_progress', {});
    if (progress[oldEmail]) {
      progress[newEmail] = progress[oldEmail];
      delete progress[oldEmail];
      Storage.set('last_reading_progress', progress);
    }
    
    // Перенос избранного
    const favs = Storage.get('favorites', {});
    if (favs[oldEmail]) {
      favs[newEmail] = favs[oldEmail];
      delete favs[oldEmail];
      Storage.set('favorites', favs);
    }
  }

  // Обновляем текущую сессию пользователя
  currentProfileUser.fio = newFio;
  currentProfileUser.email = newEmail;
  currentProfileUser.phone = newPhone;
  saveCurrentUser(currentProfileUser);

  showToast('Профиль успешно обновлён!');
  disableEdit();
  renderProfile();
  
  if (typeof refreshAuthUI === 'function') refreshAuthUI();
  
  // Перерисовываем виджеты (так как email мог измениться)
  renderWidgets();
}

// 5. Отрисовка всех виджетов (XP, Достижения, Топ)
function renderWidgets() {
  if (typeof Achievements !== 'undefined') {
    // Рисуем прогресс-бар уровня
    Achievements.renderXPWidget('xp-widget-container');
    
    // Рисуем плитки достижений
    Achievements.renderAchievementsGrid('achievements-container', getUserKey());
    
    // Рисуем ТОП пользователей
    Achievements.renderLeaderboard('leaderboard-container');
  }
}

// 6. Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  renderProfile();
  
  // Небольшая задержка, чтобы common.js и achievements.js успели подгрузить данные из Storage
  setTimeout(() => {
    renderWidgets();
  }, 100);
});