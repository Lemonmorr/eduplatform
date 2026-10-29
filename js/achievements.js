/* ============================================================
   ACHIEVEMENTS — значки и XP
   ============================================================ */

const ACHIEVEMENTS_KEY = 'user_achievements';
const XP_KEY = 'user_xp';

/* ---------- Хранилище ---------- */
function getAchievementsData() {
  return Storage.get(ACHIEVEMENTS_KEY, {});
}
function saveAchievementsData(data) {
  Storage.set(ACHIEVEMENTS_KEY, data);
}
function getXPData() {
  return Storage.get(XP_KEY, {});
}
function saveXPData(data) {
  Storage.set(XP_KEY, data);
}

/* ---------- XP и уровни ---------- */
function getUserXP(email) {
  const key = email || (typeof getUserKey === 'function' ? getUserKey() : 'guest');
  const data = getXPData();
  return data[key] || { xp: 0, level: 1 };
}

function addXP(amount, email) {
  const key = email || (typeof getUserKey === 'function' ? getUserKey() : 'guest');
  const data = getXPData();
  const cur = data[key] || { xp: 0, level: 1 };

  const oldLevel = cur.level;
  cur.xp += amount;
  cur.level = xpToLevel(cur.xp);
  data[key] = cur;
  saveXPData(data);

  if (cur.level > oldLevel) {
    if (typeof showToast === 'function') {
      showToast(`🎉 Уровень ${cur.level}! +${amount} XP`);
    }
  }
  return cur;
}

/* Формула: уровень 1 — 0 XP; до N-го уровня нужно 100 * (N-1) * N / 2 XP */
function xpToLevel(xp) {
  let level = 1;
  let need = 100;
  let total = 0;
  while (xp >= total + need) {
    total += need;
    level++;
    need += 100;
  }
  return level;
}

function xpToNextLevel(xp) {
  let total = 0;
  let need = 100;
  while (xp >= total + need) {
    total += need;
    need += 100;
  }
  return { current: xp - total, needed: need, totalNeeded: total + need };
}

/* ---------- Определения значков ---------- */
const ACHIEVEMENTS_LIST = [
  { id: 'first_lesson', icon: '📖', title: 'Первый шаг', desc: 'Прочитать первую лекцию', xp: 10 },
  { id: 'ten_lessons', icon: '📚', title: 'Книголюб', desc: 'Прочитать 10 лекций', xp: 50 },
  { id: 'fifty_lessons', icon: '🎓', title: 'Эрудит', desc: 'Прочитать 50 лекций', xp: 200 },
  { id: 'perfect_test', icon: '💯', title: 'Идеально', desc: 'Сдать тест на 100%', xp: 30 },
  { id: 'five_perfect', icon: '🌟', title: 'Перфекционист', desc: '5 тестов на 100%', xp: 100 },
  { id: 'first_author', icon: '✏️', title: 'Автор', desc: 'Опубликовать первую лекцию', xp: 40 },
  { id: 'ten_authors', icon: '🏆', title: 'Мастер', desc: 'Опубликовать 10 лекций', xp: 300 },
  { id: 'collector', icon: '⭐', title: 'Коллекционер', desc: 'Добавить 5 лекций в избранное', xp: 20 },
  { id: 'streak_3', icon: '🔥', title: 'На волне', desc: '3 дня подряд активности', xp: 60 },
  { id: 'first_group', icon: '👥', title: 'Командный игрок', desc: 'Вступить в группу', xp: 15 }
];

function getAchievementsList() {
  return ACHIEVEMENTS_LIST;
}

function getUserAchievements(email) {
  const key = email || (typeof getUserKey === 'function' ? getUserKey() : 'guest');
  const data = getAchievementsData();
  return data[key] || {};
}

function unlockAchievement(id, email) {
  const key = email || (typeof getUserKey === 'function' ? getUserKey() : 'guest');
  const data = getAchievementsData();
  if (!data[key]) data[key] = {};
  if (data[key][id]) return false;

  const def = ACHIEVEMENTS_LIST.find(a => a.id === id);
  if (!def) return false;

  data[key][id] = { unlockedAt: new Date().toISOString() };
  saveAchievementsData(data);
  addXP(def.xp, key);

  if (typeof showToast === 'function') {
    showToast(`${def.icon} Значок: ${def.title} (+${def.xp} XP)`);
  }
  return true;
}

/* ---------- Проверка условий ---------- */
function checkAchievements(email) {
  const key = email || (typeof getUserKey === 'function' ? getUserKey() : 'guest');
  const unlocked = getUserAchievements(key);

  // 1. Прочитанные лекции
  const progress = Storage.get('last_reading_progress', {});
  const userProgress = progress[key] || {};
  const readCount = Object.values(userProgress).filter(p => {
    if (!p || !p.total) return false;
    if (p.completedAt) return true;
    if (typeof p.scrollPercent === 'number' && p.scrollPercent >= 100) return true;
    return Array.isArray(p.read) && p.read.length >= p.total;
  }).length;

  if (readCount >= 1 && !unlocked.first_lesson) unlockAchievement('first_lesson', key);
  if (readCount >= 10 && !unlocked.ten_lessons) unlockAchievement('ten_lessons', key);
  if (readCount >= 50 && !unlocked.fifty_lessons) unlockAchievement('fifty_lessons', key);

  // 2. Тесты
  const results = Storage.get('test_results', []).filter(r =>
    r.userEmail === key || (!r.userEmail && key === 'guest')
  );
  const perfects = results.filter(r => r.percent === 100).length;
  if (perfects >= 1 && !unlocked.perfect_test) unlockAchievement('perfect_test', key);
  if (perfects >= 5 && !unlocked.five_perfect) unlockAchievement('five_perfect', key);

  // 3. Авторство
  const allLessons = Storage.get('my_lessons', {});
  const myCount = Object.values(allLessons).filter(l =>
    l.authorEmail === key
  ).length;
  if (myCount >= 1 && !unlocked.first_author) unlockAchievement('first_author', key);
  if (myCount >= 10 && !unlocked.ten_authors) unlockAchievement('ten_authors', key);

  // 4. Избранное
  const favs = Storage.get('favorites', {});
  const myFavs = (favs[key] || []).length;
  if (myFavs >= 5 && !unlocked.collector) unlockAchievement('collector', key);

  // 5. Группы
  const groups = Storage.get('groups', {});
  const inGroup = Object.values(groups).some(g =>
    (g.members || []).some(m => m.email === key)
  );
  if (inGroup && !unlocked.first_group) unlockAchievement('first_group', key);
}

/* ---------- Прогресс-бар XP ---------- */
function renderXPWidget(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const user = getCurrentUser();
  if (!user) { container.innerHTML = ''; return; }

  const xp = getUserXP(user.email);
  const next = xpToNextLevel(xp.xp);
  const percent = Math.round((next.current / next.needed) * 100);

  container.innerHTML = `
    <div class="xp-widget">
      <div class="xp-widget-row">
        <span class="xp-level-badge">Ур. ${xp.level}</span>
        <span class="xp-value">${xp.xp} XP</span>
      </div>
      <div class="xp-bar-track">
        <div class="xp-bar-fill" style="width: ${percent}%"></div>
      </div>
      <div class="xp-widget-label">${next.current} / ${next.needed} до ур. ${xp.level + 1}</div>
    </div>
  `;
}

/* ---------- Отрисовка значков ---------- */
function renderAchievementsGrid(containerId, email) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const unlocked = getUserAchievements(email);

  let html = '<div class="achievements-grid">';
  ACHIEVEMENTS_LIST.forEach(a => {
    const isUnlocked = !!unlocked[a.id];
    const date = isUnlocked ? new Date(unlocked[a.id].unlockedAt).toLocaleDateString('ru-RU') : '';

    html += `
      <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}" title="${escapeHtml(a.desc)}">
        <div class="achievement-icon-wrapper">
          <span class="achievement-icon">${a.icon}</span>
          ${!isUnlocked ? '<div class="achievement-lock">🔒</div>' : ''}
        </div>
        <div class="achievement-title">${escapeHtml(a.title)}</div>
        <div class="achievement-desc">${escapeHtml(a.desc)}</div>
        <div class="achievement-footer">
          <span class="achievement-xp">+${a.xp} XP</span>
          ${isUnlocked ? `<span class="achievement-date">${date}</span>` : ''}
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

/* ---------- Публичный API ---------- */
window.Achievements = {
  getUserXP,
  addXP,
  xpToLevel,
  xpToNextLevel,
  getUserAchievements,
  unlockAchievement,
  checkAchievements,
  renderXPWidget,
  renderAchievementsGrid,
  getAchievementsList
};